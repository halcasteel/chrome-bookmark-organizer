//! Event Mesh implementation using Redis Streams

use super::*;
use redis::{aio::ConnectionManager, AsyncCommands, streams::{StreamReadOptions, StreamReadReply}};
use tokio::task::JoinHandle;
use std::time::Duration;

/// Event Mesh for distributed event processing
#[derive(Clone)]
pub struct EventMesh {
    redis_client: redis::Client,
    event_store: Arc<EventStore>,
    router: Arc<EventRouter>,
    processors: Arc<RwLock<Vec<Box<dyn EventProcessor>>>>,
    subscriptions: Arc<RwLock<HashMap<String, EventSubscription>>>,
    shutdown_tx: broadcast::Sender<()>,
}

struct EventSubscription {
    stream_key: String,
    filter: EventFilter,
    handler: Box<dyn EventHandler>,
    task_handle: Option<JoinHandle<()>>,
}

impl EventMesh {
    /// Create a new event mesh
    pub async fn new(redis_url: &str) -> Result<Self> {
        let redis_client = redis::Client::open(redis_url)
            .map_err(|e| Error::Redis(e))?;
        
        // Test connection
        let mut conn = ConnectionManager::new(redis_client.clone()).await
            .map_err(|e| Error::Redis(e))?;
        let _: String = redis::cmd("PING").query_async(&mut conn).await
            .map_err(|e| Error::Redis(e))?;
        
        let event_store = Arc::new(EventStore::new());
        let router = Arc::new(EventRouter::new());
        let (shutdown_tx, _) = broadcast::channel(1);
        
        Ok(Self {
            redis_client,
            event_store,
            router,
            processors: Arc::new(RwLock::new(Vec::new())),
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
            shutdown_tx,
        })
    }
    
    /// Publish an event to the mesh
    pub async fn publish(&self, event: Event) -> Result<()> {
        let mut conn = self.get_connection().await?;
        
        // Store event
        self.event_store.store(&event).await?;
        
        // Serialize event
        let event_data = serde_json::to_string(&event)?;
        
        // Determine stream key based on event type
        let stream_key = self.get_stream_key(&event.event_type);
        
        // Add to Redis stream
        let _: String = conn.xadd(
            &stream_key,
            "*", // Auto-generate ID
            &[
                ("event_id", event.id.to_string()),
                ("event_type", format!("{:?}", event.event_type)),
                ("source", event.source.to_string()),
                ("data", event_data),
            ],
        ).await
        .map_err(|e| Error::Redis(e))?;
        
        // Route to local processors
        self.route_to_processors(&event).await?;
        
        Ok(())
    }
    
    /// Subscribe to events with a filter
    pub async fn subscribe(
        &self,
        name: &str,
        filter: EventFilter,
        handler: Box<dyn EventHandler>,
    ) -> Result<()> {
        let stream_key = "events:*"; // Subscribe to all event streams
        
        let subscription = EventSubscription {
            stream_key: stream_key.to_string(),
            filter,
            handler,
            task_handle: None,
        };
        
        // Start consumer task
        let task_handle = self.start_consumer(name, subscription.stream_key.clone()).await?;
        
        let mut subscriptions = self.subscriptions.write().await;
        subscriptions.insert(name.to_string(), EventSubscription {
            task_handle: Some(task_handle),
            ..subscription
        });
        
        Ok(())
    }
    
    /// Add an event processor
    pub async fn add_processor(&self, processor: Box<dyn EventProcessor>) -> Result<()> {
        let mut processors = self.processors.write().await;
        processors.push(processor);
        Ok(())
    }
    
    /// Get event history
    pub async fn get_events(
        &self,
        filter: Option<EventFilter>,
        limit: usize,
    ) -> Result<Vec<Event>> {
        self.event_store.query(filter, limit).await
    }
    
    /// Get event by ID
    pub async fn get_event(&self, event_id: EventId) -> Result<Option<Event>> {
        self.event_store.get(event_id).await
    }
    
    /// Shutdown the event mesh
    pub async fn shutdown(&self) -> Result<()> {
        // Send shutdown signal
        let _ = self.shutdown_tx.send(());
        
        // Wait for all subscription tasks to complete
        let mut subscriptions = self.subscriptions.write().await;
        for (_, mut sub) in subscriptions.drain() {
            if let Some(handle) = sub.task_handle.take() {
                handle.abort();
            }
        }
        
        Ok(())
    }
    
    async fn get_connection(&self) -> Result<ConnectionManager> {
        ConnectionManager::new(self.redis_client.clone())
            .await
            .map_err(|e| Error::Redis(e))
    }
    
    fn get_stream_key(&self, event_type: &EventType) -> String {
        match event_type {
            EventType::ServiceStarted | EventType::ServiceStopped | 
            EventType::ServiceFailed | EventType::ServiceRecovered => "events:service",
            
            EventType::TaskCreated | EventType::TaskCompleted | 
            EventType::TaskFailed => "events:task",
            
            EventType::PatternDetected | EventType::AnomalyDetected |
            EventType::KnowledgeAcquired => "events:learning",
            
            EventType::HelpRequested | EventType::SolutionProposed |
            EventType::CollaborationStarted => "events:collaboration",
            
            _ => "events:system",
        }.to_string()
    }
    
    async fn route_to_processors(&self, event: &Event) -> Result<()> {
        let processors = self.processors.read().await;
        
        for processor in processors.iter() {
            if processor.can_process(event) {
                // Clone event for processor
                let event_clone = event.clone();
                let processor_clone = processor.clone_box();
                
                // Process async without blocking
                tokio::spawn(async move {
                    if let Err(e) = processor_clone.process(event_clone).await {
                        tracing::error!("Processor error: {}", e);
                    }
                });
            }
        }
        
        Ok(())
    }
    
    async fn start_consumer(&self, name: &str, stream_key: String) -> Result<JoinHandle<()>> {
        let redis_client = self.redis_client.clone();
        let subscriptions = self.subscriptions.clone();
        let mut shutdown_rx = self.shutdown_tx.subscribe();
        let consumer_group = format!("ai-ops-{}", name);
        let name_owned = name.to_string();
        
        let handle = tokio::spawn(async move {
            let mut conn = match ConnectionManager::new(redis_client).await {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Failed to get Redis connection: {}", e);
                    return;
                }
            };
            
            // Create consumer group
            let _: std::result::Result<String, redis::RedisError> = conn.xgroup_create_mkstream(
                &stream_key,
                &consumer_group,
                "$",
            ).await;
            
            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        tracing::info!("Shutting down consumer {}", name_owned);
                        break;
                    }
                    
                    result = Self::read_stream(&mut conn, &stream_key, &consumer_group, &name_owned) => {
                        match result {
                            Ok(events) => {
                                for event in events {
                                    if let Err(e) = Self::handle_stream_event(
                                        &subscriptions,
                                        &name_owned,
                                        event
                                    ).await {
                                        tracing::error!("Error handling event: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Error reading stream: {}", e);
                                tokio::time::sleep(Duration::from_secs(1)).await;
                            }
                        }
                    }
                }
            }
        });
        
        Ok(handle)
    }
    
    async fn read_stream(
        conn: &mut ConnectionManager,
        stream_key: &str,
        group: &str,
        consumer: &str,
    ) -> Result<Vec<Event>> {
        let options = StreamReadOptions::default()
            .group(group, consumer)
            .block(1000) // Block for 1 second
            .count(10);  // Read up to 10 messages
        
        let reply: StreamReadReply = conn.xread_options(
            &[stream_key],
            &[">"], // Read new messages
            &options,
        ).await?;
        
        let mut events = Vec::new();
        
        for stream in reply.keys {
            for message in stream.ids {
                if let Some(event_data) = message.map.get("data") {
                    if let redis::Value::BulkString(data) = event_data {
                        if let Ok(event_str) = std::str::from_utf8(data) {
                            if let Ok(event) = serde_json::from_str::<Event>(event_str) {
                                events.push(event);
                                
                                // Acknowledge message
                                let _: std::result::Result<u32, redis::RedisError> = conn.xack(
                                    stream_key,
                                    group,
                                    &[&message.id],
                                ).await;
                            }
                        }
                    }
                }
            }
        }
        
        Ok(events)
    }
    
    async fn handle_stream_event(
        subscriptions: &Arc<RwLock<HashMap<String, EventSubscription>>>,
        name: &str,
        event: Event,
    ) -> Result<()> {
        let subs = subscriptions.read().await;
        
        if let Some(subscription) = subs.get(name) {
            if subscription.filter.matches(&event) {
                subscription.handler.handle(&event).await?;
            }
        }
        
        Ok(())
    }
}