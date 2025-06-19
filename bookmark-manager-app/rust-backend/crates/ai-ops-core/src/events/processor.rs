//! Event processors for handling different event types

use super::*;
use std::sync::Arc;
use tokio::time::Duration;
use tracing::{info, warn, error};

/// Event processor trait
#[async_trait]
pub trait EventProcessor: Send + Sync {
    /// Check if this processor can handle the event
    fn can_process(&self, event: &Event) -> bool;
    
    /// Process the event
    async fn process(&self, event: Event) -> Result<()>;
    
    /// Clone the processor
    fn clone_box(&self) -> Box<dyn EventProcessor>;
}

/// Pipeline of event processors
pub struct ProcessorPipeline {
    processors: Vec<Box<dyn EventProcessor>>,
}

impl ProcessorPipeline {
    pub fn new() -> Self {
        Self {
            processors: Vec::new(),
        }
    }
    
    pub fn add(&mut self, processor: Box<dyn EventProcessor>) -> &mut Self {
        self.processors.push(processor);
        self
    }
    
    pub async fn process(&self, event: Event) -> Result<()> {
        for processor in &self.processors {
            if processor.can_process(&event) {
                processor.process(event.clone()).await?;
            }
        }
        Ok(())
    }
}

/// Logging processor that logs all events
pub struct LoggingProcessor {
    log_level: tracing::Level,
}

impl LoggingProcessor {
    pub fn new(log_level: tracing::Level) -> Self {
        Self { log_level }
    }
}

#[async_trait]
impl EventProcessor for LoggingProcessor {
    fn can_process(&self, _event: &Event) -> bool {
        true // Log all events
    }
    
    async fn process(&self, event: Event) -> Result<()> {
        match self.log_level {
            tracing::Level::INFO => {
                info!(
                    event_id = %event.id,
                    event_type = ?event.event_type,
                    source = %event.source,
                    "Event processed"
                );
            }
            _ => {
                info!(
                    event_id = %event.id,
                    event_type = ?event.event_type,
                    source = %event.source,
                    payload = ?event.payload,
                    "Event processed"
                );
            }
        }
        Ok(())
    }
    
    fn clone_box(&self) -> Box<dyn EventProcessor> {
        Box::new(Self {
            log_level: self.log_level.clone(),
        })
    }
}

/// Metrics processor that tracks event metrics
pub struct MetricsProcessor {
    metrics: Arc<RwLock<EventMetrics>>,
}

#[derive(Default, Clone)]
struct EventMetrics {
    total_events: u64,
    events_by_type: HashMap<EventType, u64>,
    events_by_source: HashMap<AgentId, u64>,
    processing_times: Vec<Duration>,
}

impl MetricsProcessor {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(EventMetrics::default())),
        }
    }
    
    pub async fn get_metrics(&self) -> EventMetrics {
        self.metrics.read().await.clone()
    }
}

#[async_trait]
impl EventProcessor for MetricsProcessor {
    fn can_process(&self, _event: &Event) -> bool {
        true // Track all events
    }
    
    async fn process(&self, event: Event) -> Result<()> {
        let start = tokio::time::Instant::now();
        
        let mut metrics = self.metrics.write().await;
        metrics.total_events += 1;
        
        *metrics.events_by_type
            .entry(event.event_type.clone())
            .or_insert(0) += 1;
            
        *metrics.events_by_source
            .entry(event.source.clone())
            .or_insert(0) += 1;
            
        metrics.processing_times.push(start.elapsed());
        
        // Keep only last 1000 processing times
        if metrics.processing_times.len() > 1000 {
            metrics.processing_times.remove(0);
        }
        
        Ok(())
    }
    
    fn clone_box(&self) -> Box<dyn EventProcessor> {
        Box::new(Self {
            metrics: self.metrics.clone(),
        })
    }
}

/// Error handling processor that handles failed events
pub struct ErrorHandlingProcessor {
    retry_attempts: u32,
    retry_delay: Duration,
    dead_letter_handler: Option<Box<dyn EventProcessor>>,
}

impl ErrorHandlingProcessor {
    pub fn new(retry_attempts: u32, retry_delay: Duration) -> Self {
        Self {
            retry_attempts,
            retry_delay,
            dead_letter_handler: None,
        }
    }
    
    pub fn with_dead_letter_handler(mut self, handler: Box<dyn EventProcessor>) -> Self {
        self.dead_letter_handler = Some(handler);
        self
    }
}

#[async_trait]
impl EventProcessor for ErrorHandlingProcessor {
    fn can_process(&self, event: &Event) -> bool {
        // Only process events marked as failed
        event.metadata.custom.get("failed").is_some()
    }
    
    async fn process(&self, mut event: Event) -> Result<()> {
        let attempts = event.metadata.custom
            .get("retry_attempts")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
            
        if attempts < self.retry_attempts {
            // Retry the event
            warn!(
                event_id = %event.id,
                attempts = attempts + 1,
                max_attempts = self.retry_attempts,
                "Retrying failed event"
            );
            
            tokio::time::sleep(self.retry_delay).await;
            
            // Update retry count
            event.metadata.custom.insert(
                "retry_attempts".to_string(),
                serde_json::json!(attempts + 1),
            );
            
            // Remove failed marker for retry
            event.metadata.custom.remove("failed");
            
            // Re-emit event for processing
            // TODO: Re-emit through event mesh
            
            Ok(())
        } else if let Some(ref handler) = self.dead_letter_handler {
            // Send to dead letter queue
            error!(
                event_id = %event.id,
                attempts = attempts,
                "Event failed after max retries, sending to dead letter queue"
            );
            
            handler.process(event).await
        } else {
            error!(
                event_id = %event.id,
                attempts = attempts,
                "Event failed after max retries"
            );
            Ok(())
        }
    }
    
    fn clone_box(&self) -> Box<dyn EventProcessor> {
        Box::new(Self {
            retry_attempts: self.retry_attempts,
            retry_delay: self.retry_delay,
            dead_letter_handler: self.dead_letter_handler.as_ref().map(|h| h.clone_box()),
        })
    }
}

/// Filtering processor that filters events based on criteria
pub struct FilteringProcessor<P> {
    filter: EventFilter,
    inner_processor: P,
}

impl<P: EventProcessor + Clone + 'static> FilteringProcessor<P> {
    pub fn new(filter: EventFilter, inner_processor: P) -> Self {
        Self {
            filter,
            inner_processor,
        }
    }
}

#[async_trait]
impl<P: EventProcessor + Clone + 'static> EventProcessor for FilteringProcessor<P> {
    fn can_process(&self, event: &Event) -> bool {
        self.filter.matches(event) && self.inner_processor.can_process(event)
    }
    
    async fn process(&self, event: Event) -> Result<()> {
        self.inner_processor.process(event).await
    }
    
    fn clone_box(&self) -> Box<dyn EventProcessor> {
        Box::new(Self {
            filter: self.filter.clone(),
            inner_processor: self.inner_processor.clone(),
        })
    }
}

/// Batching processor that batches events before processing
pub struct BatchingProcessor {
    batch_size: usize,
    batch_timeout: Duration,
    buffer: Arc<RwLock<Vec<Event>>>,
    processor: Box<dyn BatchEventProcessor>,
}

#[async_trait]
pub trait BatchEventProcessor: Send + Sync {
    async fn process_batch(&self, events: Vec<Event>) -> Result<()>;
    fn clone_box(&self) -> Box<dyn BatchEventProcessor>;
}

impl BatchingProcessor {
    pub fn new(
        batch_size: usize,
        batch_timeout: Duration,
        processor: Box<dyn BatchEventProcessor>,
    ) -> Self {
        let buffer = Arc::new(RwLock::new(Vec::new()));
        
        // Start batch timeout task
        let buffer_clone = buffer.clone();
        let processor_clone = processor.clone_box();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(batch_timeout);
            loop {
                interval.tick().await;
                
                let mut events = buffer_clone.write().await;
                if !events.is_empty() {
                    let batch = std::mem::take(&mut *events);
                    drop(events); // Release lock
                    
                    if let Err(e) = processor_clone.process_batch(batch).await {
                        error!("Batch processing failed: {}", e);
                    }
                }
            }
        });
        
        Self {
            batch_size,
            batch_timeout,
            buffer,
            processor,
        }
    }
}

#[async_trait]
impl EventProcessor for BatchingProcessor {
    fn can_process(&self, _event: &Event) -> bool {
        true
    }
    
    async fn process(&self, event: Event) -> Result<()> {
        let mut buffer = self.buffer.write().await;
        buffer.push(event);
        
        if buffer.len() >= self.batch_size {
            let batch = std::mem::take(&mut *buffer);
            drop(buffer); // Release lock
            
            self.processor.process_batch(batch).await?;
        }
        
        Ok(())
    }
    
    fn clone_box(&self) -> Box<dyn EventProcessor> {
        Box::new(Self {
            batch_size: self.batch_size,
            batch_timeout: self.batch_timeout,
            buffer: Arc::new(RwLock::new(Vec::new())),
            processor: self.processor.clone_box(),
        })
    }
}