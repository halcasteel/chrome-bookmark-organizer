//! Event storage and retrieval

use super::*;
use std::collections::VecDeque;
use chrono::Duration as ChronoDuration;

/// Event store for persistence and querying
#[derive(Clone)]
pub struct EventStore {
    events: Arc<RwLock<VecDeque<Event>>>,
    max_events: usize,
    indexes: Arc<RwLock<EventIndexes>>,
}

#[derive(Default)]
struct EventIndexes {
    by_type: HashMap<EventType, Vec<EventId>>,
    by_source: HashMap<AgentId, Vec<EventId>>,
    by_correlation: HashMap<EventId, Vec<EventId>>,
    by_causation: HashMap<EventId, Vec<EventId>>,
}

impl EventStore {
    /// Create a new in-memory event store
    pub fn new() -> Self {
        Self::with_capacity(10_000)
    }
    
    /// Create event store with specified capacity
    pub fn with_capacity(max_events: usize) -> Self {
        Self {
            events: Arc::new(RwLock::new(VecDeque::with_capacity(max_events))),
            max_events,
            indexes: Arc::new(RwLock::new(EventIndexes::default())),
        }
    }
    
    /// Store an event
    pub async fn store(&self, event: &Event) -> Result<()> {
        let mut events = self.events.write().await;
        let mut indexes = self.indexes.write().await;
        
        // Add to main store
        events.push_back(event.clone());
        
        // Update indexes
        indexes.by_type
            .entry(event.event_type.clone())
            .or_insert_with(Vec::new)
            .push(event.id);
            
        indexes.by_source
            .entry(event.source.clone())
            .or_insert_with(Vec::new)
            .push(event.id);
            
        if let Some(correlation_id) = event.correlation_id {
            indexes.by_correlation
                .entry(correlation_id)
                .or_insert_with(Vec::new)
                .push(event.id);
        }
        
        if let Some(causation_id) = event.causation_id {
            indexes.by_causation
                .entry(causation_id)
                .or_insert_with(Vec::new)
                .push(event.id);
        }
        
        // Evict old events if at capacity
        if events.len() > self.max_events {
            if let Some(old_event) = events.pop_front() {
                self.remove_from_indexes(&mut indexes, &old_event);
            }
        }
        
        Ok(())
    }
    
    /// Get event by ID
    pub async fn get(&self, event_id: EventId) -> Result<Option<Event>> {
        let events = self.events.read().await;
        Ok(events.iter().find(|e| e.id == event_id).cloned())
    }
    
    /// Query events with optional filter
    pub async fn query(
        &self,
        filter: Option<EventFilter>,
        limit: usize,
    ) -> Result<Vec<Event>> {
        let events = self.events.read().await;
        
        let filtered: Vec<Event> = if let Some(filter) = filter {
            events.iter()
                .filter(|e| filter.matches(e))
                .take(limit)
                .cloned()
                .collect()
        } else {
            events.iter()
                .rev() // Most recent first
                .take(limit)
                .cloned()
                .collect()
        };
        
        Ok(filtered)
    }
    
    /// Get events by type
    pub async fn get_by_type(&self, event_type: &EventType) -> Result<Vec<Event>> {
        let events = self.events.read().await;
        let indexes = self.indexes.read().await;
        
        if let Some(event_ids) = indexes.by_type.get(event_type) {
            let result: Vec<Event> = events.iter()
                .filter(|e| event_ids.contains(&e.id))
                .cloned()
                .collect();
            Ok(result)
        } else {
            Ok(Vec::new())
        }
    }
    
    /// Get events by source
    pub async fn get_by_source(&self, source: &AgentId) -> Result<Vec<Event>> {
        let events = self.events.read().await;
        let indexes = self.indexes.read().await;
        
        if let Some(event_ids) = indexes.by_source.get(source) {
            let result: Vec<Event> = events.iter()
                .filter(|e| event_ids.contains(&e.id))
                .cloned()
                .collect();
            Ok(result)
        } else {
            Ok(Vec::new())
        }
    }
    
    /// Get correlated events
    pub async fn get_correlated(&self, correlation_id: EventId) -> Result<Vec<Event>> {
        let events = self.events.read().await;
        let indexes = self.indexes.read().await;
        
        if let Some(event_ids) = indexes.by_correlation.get(&correlation_id) {
            let result: Vec<Event> = events.iter()
                .filter(|e| event_ids.contains(&e.id))
                .cloned()
                .collect();
            Ok(result)
        } else {
            Ok(Vec::new())
        }
    }
    
    /// Get events caused by another event
    pub async fn get_caused_by(&self, causation_id: EventId) -> Result<Vec<Event>> {
        let events = self.events.read().await;
        let indexes = self.indexes.read().await;
        
        if let Some(event_ids) = indexes.by_causation.get(&causation_id) {
            let result: Vec<Event> = events.iter()
                .filter(|e| event_ids.contains(&e.id))
                .cloned()
                .collect();
            Ok(result)
        } else {
            Ok(Vec::new())
        }
    }
    
    /// Get events in time range
    pub async fn get_in_range(
        &self,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<Event>> {
        let events = self.events.read().await;
        
        let result: Vec<Event> = events.iter()
            .filter(|e| e.timestamp >= start && e.timestamp <= end)
            .cloned()
            .collect();
            
        Ok(result)
    }
    
    /// Get event statistics
    pub async fn get_stats(&self) -> EventStats {
        let events = self.events.read().await;
        let indexes = self.indexes.read().await;
        
        let total_events = events.len();
        let event_types = indexes.by_type.len();
        let active_sources = indexes.by_source.len();
        
        let oldest_event = events.front().map(|e| e.timestamp);
        let newest_event = events.back().map(|e| e.timestamp);
        
        let events_by_type: HashMap<EventType, usize> = indexes.by_type.iter()
            .map(|(k, v)| (k.clone(), v.len()))
            .collect();
            
        let events_by_source: HashMap<AgentId, usize> = indexes.by_source.iter()
            .map(|(k, v)| (k.clone(), v.len()))
            .collect();
        
        EventStats {
            total_events,
            event_types,
            active_sources,
            oldest_event,
            newest_event,
            events_by_type,
            events_by_source,
        }
    }
    
    /// Clear all events
    pub async fn clear(&self) -> Result<()> {
        let mut events = self.events.write().await;
        let mut indexes = self.indexes.write().await;
        
        events.clear();
        indexes.by_type.clear();
        indexes.by_source.clear();
        indexes.by_correlation.clear();
        indexes.by_causation.clear();
        
        Ok(())
    }
    
    /// Export events to JSON
    pub async fn export_json(&self) -> Result<String> {
        let events = self.events.read().await;
        let all_events: Vec<&Event> = events.iter().collect();
        Ok(serde_json::to_string_pretty(&all_events)?)
    }
    
    /// Import events from JSON
    pub async fn import_json(&self, json: &str) -> Result<usize> {
        let imported_events: Vec<Event> = serde_json::from_str(json)?;
            
        let count = imported_events.len();
        
        for event in imported_events {
            self.store(&event).await?;
        }
        
        Ok(count)
    }
    
    fn remove_from_indexes(&self, indexes: &mut EventIndexes, event: &Event) {
        // Remove from type index
        if let Some(ids) = indexes.by_type.get_mut(&event.event_type) {
            ids.retain(|id| *id != event.id);
        }
        
        // Remove from source index
        if let Some(ids) = indexes.by_source.get_mut(&event.source) {
            ids.retain(|id| *id != event.id);
        }
        
        // Remove from correlation index
        if let Some(correlation_id) = event.correlation_id {
            if let Some(ids) = indexes.by_correlation.get_mut(&correlation_id) {
                ids.retain(|id| *id != event.id);
            }
        }
        
        // Remove from causation index
        if let Some(causation_id) = event.causation_id {
            if let Some(ids) = indexes.by_causation.get_mut(&causation_id) {
                ids.retain(|id| *id != event.id);
            }
        }
    }
}

/// Event statistics
#[derive(Debug, Clone)]
pub struct EventStats {
    pub total_events: usize,
    pub event_types: usize,
    pub active_sources: usize,
    pub oldest_event: Option<DateTime<Utc>>,
    pub newest_event: Option<DateTime<Utc>>,
    pub events_by_type: HashMap<EventType, usize>,
    pub events_by_source: HashMap<AgentId, usize>,
}

/// Persistent event store using PostgreSQL
pub struct PersistentEventStore {
    db: sqlx::PgPool,
    cache: EventStore,
}

impl PersistentEventStore {
    pub async fn new(db: sqlx::PgPool) -> Result<Self> {
        Ok(Self {
            db,
            cache: EventStore::new(),
        })
    }
    
    pub async fn store(&self, event: &Event) -> Result<()> {
        // Store in cache
        self.cache.store(event).await?;
        
        // Store in database
        let _event_json = serde_json::to_value(event)?;
        
        sqlx::query(
            r#"
            INSERT INTO events (
                id, timestamp, event_type, source, payload,
                correlation_id, causation_id, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#
        )
        .bind(event.id)
        .bind(event.timestamp)
        .bind(format!("{:?}", event.event_type))
        .bind(event.source)
        .bind(serde_json::to_value(&event.payload)?)
        .bind(event.correlation_id)
        .bind(event.causation_id)
        .bind(serde_json::to_value(&event.metadata)?)
        .execute(&self.db)
        .await?;
        
        Ok(())
    }
    
    pub async fn query_persistent(
        &self,
        filter: Option<EventFilter>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Event>> {
        // Build dynamic query based on filter
        let mut query = String::from("SELECT * FROM events WHERE 1=1");
        let mut params: Vec<String> = Vec::new();
        
        if let Some(ref f) = filter {
            if let Some(ref types) = f.event_types {
                let type_list: Vec<String> = types.iter()
                    .map(|t| format!("'{:?}'", t))
                    .collect();
                query.push_str(&format!(" AND event_type IN ({})", type_list.join(",")));
            }
            
            if let Some(ref sources) = f.sources {
                let source_list: Vec<String> = sources.iter()
                    .map(|s| format!("'{}'", s))
                    .collect();
                query.push_str(&format!(" AND source IN ({})", source_list.join(",")));
            }
        }
        
        query.push_str(&format!(" ORDER BY timestamp DESC LIMIT {} OFFSET {}", limit, offset));
        
        // Execute query
        let rows = sqlx::query(&query)
            .fetch_all(&self.db)
            .await?;
        
        // Convert rows to events
        let events = Vec::new(); // TODO: Implement row mapping
        
        Ok(events)
    }
    
    pub async fn cleanup_old_events(&self, retention_days: i64) -> Result<u64> {
        let cutoff = Utc::now() - ChronoDuration::days(retention_days);
        
        let result = sqlx::query(
            "DELETE FROM events WHERE timestamp < $1"
        )
        .bind(cutoff)
        .execute(&self.db)
        .await?;
        
        Ok(result.rows_affected())
    }
}