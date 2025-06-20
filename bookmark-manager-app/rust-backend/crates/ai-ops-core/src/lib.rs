//! AI-Ops Core: Universal infrastructure for agent-driven tool construction
//! 
//! This crate provides the foundational framework for building self-managing,
//! self-improving, multi-agent applications. It includes:
//! 
//! - Universal agent trait system
//! - Knowledge graph for shared learning
//! - Event mesh for agent communication
//! - Service registry and discovery
//! - AI provider interfaces
//! - Pattern library for reusable solutions

// Common imports
use uuid::Uuid;
pub use async_trait::async_trait;

/// Agent identifier type
pub type AgentId = Uuid;

pub mod agent;
pub mod knowledge;
pub mod events;
pub mod registry;
pub mod ai;
pub mod patterns;
pub mod construction;
pub mod error;
pub mod logging_integration;

// Re-export main types
pub use agent::{UniversalAgent, AgentType, Capability};
pub use knowledge::{KnowledgeGraph, KnowledgeNode, KnowledgeEdge};
pub use events::{Event, EventMesh, EventType};
pub use registry::{ServiceRegistry, ServiceDefinition};
pub use ai::{AIProvider, AIInput, AIOutput};
pub use patterns::{UniversalPattern, PatternLibrary};
pub use construction::{ToolBuilder, ToolSpecification};
pub use error::{Error, Result};
pub use logging_integration::{LogEventAdapter, LogMonitoringAgent, LogEvent};

/// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Initialize the AI-Ops core system
pub async fn initialize(config: CoreConfig) -> Result<CoreSystem> {
    // Initialize tracing
    tracing::info!("Initializing AI-Ops Core v{}", VERSION);
    
    // Create core components
    let knowledge_graph = KnowledgeGraph::new(&config.database_url).await?;
    let event_mesh = EventMesh::new(&config.redis_url).await?;
    let service_registry = ServiceRegistry::new(knowledge_graph.clone()).await?;
    
    Ok(CoreSystem {
        knowledge_graph,
        event_mesh,
        service_registry,
        config,
    })
}

/// Core system that ties everything together
#[derive(Clone)]
pub struct CoreSystem {
    pub knowledge_graph: KnowledgeGraph,
    pub event_mesh: EventMesh,
    pub service_registry: ServiceRegistry,
    pub config: CoreConfig,
}

/// Configuration for the core system
#[derive(Clone, Debug, serde::Deserialize)]
pub struct CoreConfig {
    pub database_url: String,
    pub redis_url: String,
    pub ai_provider: AIProviderConfig,
    pub event_retention_days: u32,
    pub knowledge_graph_settings: KnowledgeGraphSettings,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub struct AIProviderConfig {
    pub provider_type: String,
    pub api_key: Option<String>,
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub struct KnowledgeGraphSettings {
    pub max_embedding_dimensions: usize,
    pub similarity_threshold: f32,
    pub pattern_confidence_threshold: f32,
}