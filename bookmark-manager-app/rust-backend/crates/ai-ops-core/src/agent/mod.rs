//! Universal Agent Framework
//! 
//! This module defines the base traits and types for all agents in the ecosystem.
//! Agents are autonomous components that can observe, analyze, act, and learn.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::collections::HashMap;

use crate::{Event, Result};

pub mod base;
pub mod service;
pub mod analysis;
pub mod builder;
pub mod coordinator;
pub mod root_cause;
pub mod fix_executor;
pub mod learning;

pub use base::BaseAgent;
pub use service::ServiceAgent;
pub use analysis::AnalysisAgent;
pub use builder::BuilderAgent;
pub use coordinator::AgentCoordinator;
pub use root_cause::RootCauseAnalysisAgent;
pub use fix_executor::FixExecutorAgent;
pub use learning::LearningAgent;

/// Unique identifier for an agent instance
pub type AgentId = Uuid;

/// Type of agent (extensible enum pattern for custom types)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgentType {
    // Core agent types
    Monitor,
    Diagnostic,
    Healing,
    Learning,
    Builder,
    
    // Service management
    ServiceManager,
    LoadBalancer,
    Orchestrator,
    
    // Analysis
    LogAnalyzer,
    PatternDetector,
    AnomalyDetector,
    
    // Application-specific (extensible)
    ApplicationSpecific(String),
}

/// Capabilities that agents can provide
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Capability {
    // Monitoring capabilities
    HealthCheck,
    MetricsCollection,
    LogAnalysis,
    TraceCollection,
    
    // Diagnostic capabilities
    RootCauseAnalysis,
    PatternRecognition,
    AnomalyDetection,
    PredictiveAnalysis,
    
    // Action capabilities
    ServiceRestart,
    ConfigurationUpdate,
    ResourceScaling,
    FailoverManagement,
    
    // Learning capabilities
    PatternExtraction,
    KnowledgeAcquisition,
    ModelTraining,
    FeedbackProcessing,
    
    // Collaboration capabilities
    TaskDelegation,
    ConsensusBuilding,
    KnowledgeSharing,
    
    // Custom capabilities
    Custom(String),
}

/// Base trait for all agents in the ecosystem
#[async_trait]
pub trait UniversalAgent: Send + Sync {
    /// Unique identifier for this agent instance
    fn id(&self) -> AgentId;
    
    /// Type of agent
    fn agent_type(&self) -> AgentType;
    
    /// Human-readable name
    fn name(&self) -> &str;
    
    /// Capabilities this agent provides
    fn capabilities(&self) -> Vec<Capability>;
    
    /// Event patterns this agent is interested in
    fn subscriptions(&self) -> Vec<EventPattern>;
    
    /// Process an event and potentially produce new events
    async fn process(&mut self, event: Event) -> Result<Vec<Event>>;
    
    /// Learn from an experience
    async fn learn(&mut self, experience: Experience) -> Result<Knowledge>;
    
    /// Collaborate with other agents
    async fn collaborate(&mut self, request: CollaborationRequest) -> Result<CollaborationResponse>;
    
    /// Get current status
    async fn status(&self) -> AgentStatus;
    
    /// Shutdown gracefully
    async fn shutdown(&mut self) -> Result<()>;
}

/// Pattern for matching events
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventPattern {
    pub event_types: Vec<crate::EventType>,
    pub source_filter: Option<AgentId>,
    pub metadata_filters: HashMap<String, String>,
}

/// Experience from processing an event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experience {
    pub event: Event,
    pub action_taken: Action,
    pub outcome: Outcome,
    pub duration: std::time::Duration,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Decision made by an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    pub action: Option<Action>,
    pub delegate_to: Option<AgentId>,
    pub confidence: f64,
    pub reasoning: String,
}

/// Action taken by an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub action_type: ActionType,
    pub target: Option<String>,
    pub parameters: HashMap<String, serde_json::Value>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    NoAction,
    ServiceRestart,
    ConfigChange,
    ResourceScale,
    Alert,
    Delegate,
    Custom(String),
}

/// Outcome of an action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Outcome {
    pub success: bool,
    pub error: Option<String>,
    pub metrics: HashMap<String, f64>,
    pub side_effects: Vec<String>,
}

/// Knowledge gained from experience
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Knowledge {
    pub knowledge_type: KnowledgeType,
    pub content: serde_json::Value,
    pub confidence: f64,
    pub applicable_contexts: Vec<Context>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum KnowledgeType {
    Pattern,
    Solution,
    Correlation,
    Prediction,
    Optimization,
}

/// Context in which knowledge applies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Context {
    pub environment: HashMap<String, String>,
    pub constraints: Vec<String>,
    pub requirements: Vec<String>,
}

/// Request for collaboration between agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollaborationRequest {
    pub request_id: Uuid,
    pub requester: AgentId,
    pub collaboration_type: CollaborationType,
    pub context: Context,
    pub deadline: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CollaborationType {
    HelpRequest,
    ConsensusBuilding,
    TaskDelegation,
    KnowledgeSharing,
    JointAnalysis,
}

/// Response to collaboration request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollaborationResponse {
    pub request_id: Uuid,
    pub responder: AgentId,
    pub response_type: ResponseType,
    pub content: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResponseType {
    Accepted,
    Rejected,
    Delegated,
    PartialResponse,
}

/// Current status of an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub state: AgentState,
    pub health: Health,
    pub current_load: f64,
    pub active_tasks: usize,
    pub last_activity: DateTime<Utc>,
    pub metrics: HashMap<String, f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum AgentState {
    Starting,
    Idle,
    Processing,
    Learning,
    Collaborating,
    Overloaded,
    Shutting,
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Health {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}