//! Service Registry
//! 
//! Service discovery and management for agents and tools

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

use crate::{
    Result, Error, AgentId,
    agent::{AgentType, Capability},
    knowledge::KnowledgeGraph,
};

/// Service registry for agent and tool discovery
#[derive(Clone)]
pub struct ServiceRegistry {
    /// Registered services
    services: Arc<RwLock<HashMap<ServiceId, ServiceDefinition>>>,
    /// Service capabilities index
    capabilities_index: Arc<RwLock<HashMap<Capability, Vec<ServiceId>>>>,
    /// Service health tracking
    health_tracker: Arc<RwLock<HashMap<ServiceId, ServiceHealth>>>,
    /// Knowledge graph integration
    knowledge_graph: KnowledgeGraph,
}

pub type ServiceId = Uuid;

impl ServiceRegistry {
    /// Create a new service registry
    pub async fn new(knowledge_graph: KnowledgeGraph) -> Result<Self> {
        Ok(Self {
            services: Arc::new(RwLock::new(HashMap::new())),
            capabilities_index: Arc::new(RwLock::new(HashMap::new())),
            health_tracker: Arc::new(RwLock::new(HashMap::new())),
            knowledge_graph,
        })
    }
    
    /// Register a new service
    pub async fn register(&self, definition: ServiceDefinition) -> Result<ServiceId> {
        let service_id = definition.id;
        
        // Store service definition
        self.services.write().await.insert(service_id, definition.clone());
        
        // Update capabilities index
        let mut cap_index = self.capabilities_index.write().await;
        for capability in &definition.capabilities {
            cap_index.entry(capability.clone())
                .or_insert_with(Vec::new)
                .push(service_id);
        }
        
        // Initialize health tracking
        self.health_tracker.write().await.insert(service_id, ServiceHealth {
            status: HealthStatus::Healthy,
            last_heartbeat: Utc::now(),
            metrics: HashMap::new(),
        });
        
        // Add to knowledge graph
        self.record_service_registration(&definition).await?;
        
        Ok(service_id)
    }
    
    /// Deregister a service
    pub async fn deregister(&self, service_id: ServiceId) -> Result<()> {
        // Remove from services
        let definition = self.services.write().await.remove(&service_id)
            .ok_or_else(|| Error::NotFound("Service not found".to_string()))?;
        
        // Remove from capabilities index
        let mut cap_index = self.capabilities_index.write().await;
        for capability in &definition.capabilities {
            if let Some(services) = cap_index.get_mut(capability) {
                services.retain(|&id| id != service_id);
            }
        }
        
        // Remove health tracking
        self.health_tracker.write().await.remove(&service_id);
        
        Ok(())
    }
    
    /// Find services by capability
    pub async fn find_by_capability(&self, capability: &Capability) -> Result<Vec<ServiceInfo>> {
        let cap_index = self.capabilities_index.read().await;
        let service_ids = cap_index.get(capability).cloned().unwrap_or_default();
        
        let services = self.services.read().await;
        let health_tracker = self.health_tracker.read().await;
        
        let mut results = Vec::new();
        for service_id in service_ids {
            if let Some(definition) = services.get(&service_id) {
                if let Some(health) = health_tracker.get(&service_id) {
                    results.push(ServiceInfo {
                        definition: definition.clone(),
                        health: health.clone(),
                    });
                }
            }
        }
        
        // Sort by health status and load
        results.sort_by(|a, b| {
            match (&a.health.status, &b.health.status) {
                (HealthStatus::Healthy, HealthStatus::Healthy) => {
                    // Compare by load
                    let load_a = a.health.metrics.get("load").unwrap_or(&0.0);
                    let load_b = b.health.metrics.get("load").unwrap_or(&0.0);
                    load_a.partial_cmp(load_b).unwrap()
                }
                (HealthStatus::Healthy, _) => std::cmp::Ordering::Less,
                (_, HealthStatus::Healthy) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            }
        });
        
        Ok(results)
    }
    
    /// Find services by type
    pub async fn find_by_type(&self, service_type: &ServiceType) -> Result<Vec<ServiceInfo>> {
        let services = self.services.read().await;
        let health_tracker = self.health_tracker.read().await;
        
        let mut results = Vec::new();
        for (service_id, definition) in services.iter() {
            if &definition.service_type == service_type {
                if let Some(health) = health_tracker.get(service_id) {
                    results.push(ServiceInfo {
                        definition: definition.clone(),
                        health: health.clone(),
                    });
                }
            }
        }
        
        Ok(results)
    }
    
    /// Update service health
    pub async fn update_health(&self, service_id: ServiceId, health_update: HealthUpdate) -> Result<()> {
        let mut health_tracker = self.health_tracker.write().await;
        
        if let Some(health) = health_tracker.get_mut(&service_id) {
            health.status = health_update.status;
            health.last_heartbeat = Utc::now();
            
            // Update metrics
            for (key, value) in health_update.metrics {
                health.metrics.insert(key, value);
            }
            
            Ok(())
        } else {
            Err(Error::NotFound("Service not found".to_string()))
        }
    }
    
    /// Get service info
    pub async fn get_service(&self, service_id: ServiceId) -> Result<ServiceInfo> {
        let services = self.services.read().await;
        let health_tracker = self.health_tracker.read().await;
        
        let definition = services.get(&service_id)
            .ok_or_else(|| Error::NotFound("Service not found".to_string()))?;
        let health = health_tracker.get(&service_id)
            .ok_or_else(|| Error::NotFound("Service health not found".to_string()))?;
        
        Ok(ServiceInfo {
            definition: definition.clone(),
            health: health.clone(),
        })
    }
    
    /// List all services
    pub async fn list_all(&self) -> Result<Vec<ServiceInfo>> {
        let services = self.services.read().await;
        let health_tracker = self.health_tracker.read().await;
        
        let mut results = Vec::new();
        for (service_id, definition) in services.iter() {
            if let Some(health) = health_tracker.get(service_id) {
                results.push(ServiceInfo {
                    definition: definition.clone(),
                    health: health.clone(),
                });
            }
        }
        
        Ok(results)
    }
    
    /// Check for unhealthy services
    pub async fn check_health(&self) -> Result<HealthReport> {
        let health_tracker = self.health_tracker.read().await;
        let now = Utc::now();
        
        let mut healthy = 0;
        let mut degraded = 0;
        let mut unhealthy = 0;
        let mut stale = Vec::new();
        
        for (service_id, health) in health_tracker.iter() {
            // Check for stale heartbeats
            let time_since_heartbeat = now - health.last_heartbeat;
            if time_since_heartbeat.num_seconds() > 60 {
                stale.push(*service_id);
            }
            
            match health.status {
                HealthStatus::Healthy => healthy += 1,
                HealthStatus::Degraded => degraded += 1,
                HealthStatus::Unhealthy => unhealthy += 1,
            }
        }
        
        Ok(HealthReport {
            total_services: health_tracker.len(),
            healthy,
            degraded,
            unhealthy,
            stale_services: stale,
            timestamp: now,
        })
    }
    
    async fn record_service_registration(&self, definition: &ServiceDefinition) -> Result<()> {
        // Record in knowledge graph for analysis
        // Stub implementation
        Ok(())
    }
}

/// Service definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceDefinition {
    pub id: ServiceId,
    pub name: String,
    pub service_type: ServiceType,
    pub agent_type: Option<AgentType>,
    pub capabilities: Vec<Capability>,
    pub endpoint: ServiceEndpoint,
    pub metadata: HashMap<String, serde_json::Value>,
    pub registered_at: DateTime<Utc>,
}

/// Service type
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ServiceType {
    Agent,
    Tool,
    Gateway,
    Storage,
    Processor,
    Custom(String),
}

/// Service endpoint information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceEndpoint {
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Protocol {
    Http,
    Https,
    Grpc,
    WebSocket,
    Custom(String),
}

/// Service health information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceHealth {
    pub status: HealthStatus,
    pub last_heartbeat: DateTime<Utc>,
    pub metrics: HashMap<String, f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

/// Health update
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthUpdate {
    pub status: HealthStatus,
    pub metrics: HashMap<String, f64>,
}

/// Service information with health
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub definition: ServiceDefinition,
    pub health: ServiceHealth,
}

/// Health report for all services
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthReport {
    pub total_services: usize,
    pub healthy: usize,
    pub degraded: usize,
    pub unhealthy: usize,
    pub stale_services: Vec<ServiceId>,
    pub timestamp: DateTime<Utc>,
}

/// Query builder for finding services
pub struct ServiceQuery {
    capabilities: Vec<Capability>,
    service_type: Option<ServiceType>,
    health_status: Option<HealthStatus>,
    metadata_filters: HashMap<String, serde_json::Value>,
}

impl ServiceQuery {
    pub fn new() -> Self {
        Self {
            capabilities: Vec::new(),
            service_type: None,
            health_status: None,
            metadata_filters: HashMap::new(),
        }
    }
    
    pub fn with_capability(mut self, capability: Capability) -> Self {
        self.capabilities.push(capability);
        self
    }
    
    pub fn with_type(mut self, service_type: ServiceType) -> Self {
        self.service_type = Some(service_type);
        self
    }
    
    pub fn with_health(mut self, status: HealthStatus) -> Self {
        self.health_status = Some(status);
        self
    }
    
    pub fn with_metadata(mut self, key: String, value: serde_json::Value) -> Self {
        self.metadata_filters.insert(key, value);
        self
    }
}