//! Event Mesh Architecture
//! 
//! Distributed event system for agent communication using Redis Streams

use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use redis::Client as RedisClient;
use tokio::sync::{RwLock, broadcast};
use async_trait::async_trait;

use crate::{Result, Error, AgentId};

pub mod mesh;
pub mod processor;
pub mod router;
pub mod store;

pub use mesh::EventMesh;
pub use processor::{EventProcessor, ProcessorPipeline};
pub use router::{EventRouter, RoutingRule};
pub use store::EventStore;

/// Unique event identifier
pub type EventId = Uuid;

/// Universal event structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: EventId,
    pub timestamp: DateTime<Utc>,
    pub event_type: EventType,
    pub source: AgentId,
    pub payload: EventPayload,
    pub correlation_id: Option<EventId>,
    pub causation_id: Option<EventId>,
    pub metadata: EventMetadata,
}

impl Event {
    /// Create a new event
    pub fn new(event_type: EventType, source: AgentId, payload: EventPayload) -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            event_type,
            source,
            payload,
            correlation_id: None,
            causation_id: None,
            metadata: EventMetadata::default(),
        }
    }
    
    /// Create a correlated event
    pub fn correlated(mut self, correlation_id: EventId) -> Self {
        self.correlation_id = Some(correlation_id);
        self
    }
    
    /// Create a caused event
    pub fn caused_by(mut self, causation_id: EventId) -> Self {
        self.causation_id = Some(causation_id);
        self
    }
    
    /// Add metadata
    pub fn with_metadata(mut self, key: String, value: serde_json::Value) -> Self {
        self.metadata.custom.insert(key, value);
        self
    }
}

/// Event types in the system
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum EventType {
    // Lifecycle events
    ServiceStarted,
    ServiceStopped,
    ServiceFailed,
    ServiceRecovered,
    ServiceHealthChanged,
    
    // Operational events
    TaskCreated,
    TaskAssigned,
    TaskStarted,
    TaskCompleted,
    TaskFailed,
    TaskCancelled,
    
    // Learning events
    PatternDetected,
    AnomalyDetected,
    KnowledgeAcquired,
    InsightGenerated,
    PredictionMade,
    
    // Collaboration events
    HelpRequested,
    SolutionProposed,
    CollaborationStarted,
    CollaborationCompleted,
    ConsensusReached,
    
    // System events
    ConfigurationChanged,
    PerformanceDegraded,
    SecurityThreatDetected,
    ResourceThresholdReached,
    
    // Knowledge events
    ProblemIdentified,
    SolutionApplied,
    OutcomeRecorded,
    
    // Custom events
    Custom(String),
}

/// Event payload variants
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum EventPayload {
    ServiceStatus {
        service_id: String,
        status: ServiceStatus,
        health: Health,
        metrics: HashMap<String, f64>,
    },
    
    Task {
        task_id: Uuid,
        task_type: String,
        data: serde_json::Value,
        priority: Priority,
    },
    
    Pattern {
        pattern_id: Uuid,
        pattern_type: String,
        confidence: f64,
        matches: Vec<serde_json::Value>,
    },
    
    Anomaly {
        anomaly_type: String,
        severity: Severity,
        description: String,
        metrics: HashMap<String, f64>,
    },
    
    Knowledge {
        knowledge_type: String,
        content: serde_json::Value,
        confidence: f64,
        source_events: Vec<EventId>,
    },
    
    Collaboration {
        collaboration_id: Uuid,
        participants: Vec<AgentId>,
        topic: String,
        status: CollaborationStatus,
    },
    
    Problem {
        problem_id: Uuid,
        category: String,
        description: String,
        severity: Severity,
        context: HashMap<String, serde_json::Value>,
    },
    
    Solution {
        solution_id: Uuid,
        problem_id: Uuid,
        actions: Vec<serde_json::Value>,
        confidence: f64,
    },
    
    Generic(serde_json::Value),
}

/// Event metadata
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EventMetadata {
    pub version: String,
    pub source_version: String,
    pub environment: String,
    pub region: String,
    pub custom: HashMap<String, serde_json::Value>,
}

/// Service status
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum ServiceStatus {
    Starting,
    Running,
    Stopping,
    Stopped,
    Failed,
    Recovering,
}

/// Health status
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Health {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

/// Task priority
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Priority {
    Low,
    Normal,
    High,
    Critical,
}

/// Severity levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

/// Collaboration status
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum CollaborationStatus {
    Initiated,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

/// Event handler trait
#[async_trait]
pub trait EventHandler: Send + Sync {
    /// Handle an event
    async fn handle(&self, event: &Event) -> Result<()>;
    
    /// Get event types this handler is interested in
    fn event_types(&self) -> Vec<EventType>;
}

/// Event filter for subscriptions
#[derive(Debug, Clone)]
pub struct EventFilter {
    pub event_types: Option<Vec<EventType>>,
    pub sources: Option<Vec<AgentId>>,
    pub metadata_filters: HashMap<String, String>,
}

impl EventFilter {
    /// Create a filter for specific event types
    pub fn by_types(event_types: Vec<EventType>) -> Self {
        Self {
            event_types: Some(event_types),
            sources: None,
            metadata_filters: HashMap::new(),
        }
    }
    
    /// Create a filter for specific sources
    pub fn by_sources(sources: Vec<AgentId>) -> Self {
        Self {
            event_types: None,
            sources: Some(sources),
            metadata_filters: HashMap::new(),
        }
    }
    
    /// Check if an event matches this filter
    pub fn matches(&self, event: &Event) -> bool {
        // Check event type
        if let Some(ref types) = self.event_types {
            if !types.contains(&event.event_type) {
                return false;
            }
        }
        
        // Check source
        if let Some(ref sources) = self.sources {
            if !sources.contains(&event.source) {
                return false;
            }
        }
        
        // Check metadata
        for (key, value) in &self.metadata_filters {
            if let Some(event_value) = event.metadata.custom.get(key) {
                if event_value.as_str() != Some(value) {
                    return false;
                }
            } else {
                return false;
            }
        }
        
        true
    }
}