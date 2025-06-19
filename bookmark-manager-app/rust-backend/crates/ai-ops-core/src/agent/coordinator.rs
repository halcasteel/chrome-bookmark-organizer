//! Agent Coordinator
//! 
//! Manages coordination between multiple agents for complex tasks

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

use crate::{
    Result, Error, AgentId, Event, EventType,
    agent::{UniversalAgent, CollaborationType, CollaborationRequest, CollaborationResponse},
    registry::ServiceRegistry,
};

/// Coordinates multiple agents for complex tasks
pub struct AgentCoordinator {
    /// Registry for discovering agents
    registry: Arc<ServiceRegistry>,
    /// Active coordination sessions
    sessions: Arc<RwLock<HashMap<Uuid, CoordinationSession>>>,
    /// Coordination strategies
    strategies: HashMap<String, Box<dyn CoordinationStrategy>>,
}

impl AgentCoordinator {
    /// Create a new coordinator
    pub fn new(registry: Arc<ServiceRegistry>) -> Self {
        let mut strategies = HashMap::new();
        
        // Add default strategies
        strategies.insert("consensus".to_string(), 
            Box::new(ConsensusStrategy::default()) as Box<dyn CoordinationStrategy>);
        strategies.insert("delegation".to_string(), 
            Box::new(DelegationStrategy::default()) as Box<dyn CoordinationStrategy>);
        strategies.insert("parallel".to_string(), 
            Box::new(ParallelStrategy::default()) as Box<dyn CoordinationStrategy>);
        
        Self {
            registry,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            strategies,
        }
    }
    
    /// Start a new coordination session
    pub async fn start_session(&self, request: CoordinationRequest) -> Result<Uuid> {
        let session_id = Uuid::new_v4();
        
        // Find suitable agents
        let agents = self.find_suitable_agents(&request).await?;
        
        if agents.is_empty() {
            return Err(Error::NotFound("No suitable agents found".to_string()));
        }
        
        let session = CoordinationSession {
            id: session_id,
            request: request.clone(),
            participants: agents,
            status: SessionStatus::Initiated,
            started_at: Utc::now(),
            results: HashMap::new(),
        };
        
        self.sessions.write().await.insert(session_id, session);
        
        // Start coordination
        self.execute_coordination(session_id).await?;
        
        Ok(session_id)
    }
    
    /// Get session status
    pub async fn get_session_status(&self, session_id: Uuid) -> Result<CoordinationStatus> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(&session_id)
            .ok_or_else(|| Error::NotFound("Session not found".to_string()))?;
        
        Ok(CoordinationStatus {
            session_id,
            status: session.status,
            participants: session.participants.len(),
            progress: self.calculate_progress(session),
            results_available: !session.results.is_empty(),
        })
    }
    
    /// Get session results
    pub async fn get_session_results(&self, session_id: Uuid) -> Result<CoordinationResult> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(&session_id)
            .ok_or_else(|| Error::NotFound("Session not found".to_string()))?;
        
        if session.status != SessionStatus::Completed {
            return Err(Error::InvalidState("Session not completed".to_string()));
        }
        
        Ok(CoordinationResult {
            session_id,
            success: true,
            aggregated_result: self.aggregate_results(&session.results),
            individual_results: session.results.clone(),
            duration: Utc::now() - session.started_at,
        })
    }
    
    async fn find_suitable_agents(&self, request: &CoordinationRequest) -> Result<Vec<AgentId>> {
        // Query registry for agents with required capabilities
        let mut suitable_agents = Vec::new();
        
        // Stub implementation - in reality would query the registry
        // For now, generate some dummy agent IDs
        for _ in 0..3 {
            suitable_agents.push(Uuid::new_v4());
        }
        
        Ok(suitable_agents)
    }
    
    async fn execute_coordination(&self, session_id: Uuid) -> Result<()> {
        let session = {
            let sessions = self.sessions.read().await;
            sessions.get(&session_id).cloned()
        };
        
        if let Some(mut session) = session {
            // Get the appropriate strategy
            let strategy_name = session.request.strategy.clone();
            
            if let Some(strategy) = self.strategies.get(&strategy_name) {
                // Update status
                session.status = SessionStatus::InProgress;
                self.sessions.write().await.insert(session_id, session.clone());
                
                // Execute strategy
                let results = strategy.coordinate(&session).await?;
                
                // Update session with results
                session.status = SessionStatus::Completed;
                session.results = results;
                self.sessions.write().await.insert(session_id, session);
            } else {
                return Err(Error::NotFound(format!("Strategy '{}' not found", strategy_name)));
            }
        }
        
        Ok(())
    }
    
    fn calculate_progress(&self, session: &CoordinationSession) -> f64 {
        match session.status {
            SessionStatus::Initiated => 0.0,
            SessionStatus::InProgress => 0.5,
            SessionStatus::Completed => 1.0,
            SessionStatus::Failed => 1.0,
            SessionStatus::Cancelled => 1.0,
        }
    }
    
    fn aggregate_results(&self, results: &HashMap<AgentId, serde_json::Value>) -> serde_json::Value {
        // Simple aggregation - in reality would be more sophisticated
        serde_json::json!({
            "participant_count": results.len(),
            "results": results.values().collect::<Vec<_>>(),
        })
    }
}

/// Coordination request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoordinationRequest {
    pub task_type: String,
    pub strategy: String,
    pub required_capabilities: Vec<crate::agent::Capability>,
    pub payload: serde_json::Value,
    pub timeout: Option<std::time::Duration>,
    pub min_participants: usize,
    pub max_participants: Option<usize>,
}

/// Coordination session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoordinationSession {
    pub id: Uuid,
    pub request: CoordinationRequest,
    pub participants: Vec<AgentId>,
    pub status: SessionStatus,
    pub started_at: DateTime<Utc>,
    pub results: HashMap<AgentId, serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum SessionStatus {
    Initiated,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

/// Coordination status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoordinationStatus {
    pub session_id: Uuid,
    pub status: SessionStatus,
    pub participants: usize,
    pub progress: f64,
    pub results_available: bool,
}

/// Coordination result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoordinationResult {
    pub session_id: Uuid,
    pub success: bool,
    pub aggregated_result: serde_json::Value,
    pub individual_results: HashMap<AgentId, serde_json::Value>,
    pub duration: chrono::Duration,
}

/// Trait for coordination strategies
#[async_trait::async_trait]
pub trait CoordinationStrategy: Send + Sync {
    /// Execute the coordination strategy
    async fn coordinate(&self, session: &CoordinationSession) -> Result<HashMap<AgentId, serde_json::Value>>;
}

/// Consensus-based coordination
#[derive(Default)]
pub struct ConsensusStrategy;

#[async_trait::async_trait]
impl CoordinationStrategy for ConsensusStrategy {
    async fn coordinate(&self, session: &CoordinationSession) -> Result<HashMap<AgentId, serde_json::Value>> {
        // Stub implementation
        let mut results = HashMap::new();
        
        for agent_id in &session.participants {
            results.insert(*agent_id, serde_json::json!({
                "vote": "agree",
                "confidence": 0.8,
            }));
        }
        
        Ok(results)
    }
}

/// Delegation-based coordination
#[derive(Default)]
pub struct DelegationStrategy;

#[async_trait::async_trait]
impl CoordinationStrategy for DelegationStrategy {
    async fn coordinate(&self, session: &CoordinationSession) -> Result<HashMap<AgentId, serde_json::Value>> {
        // Stub implementation - delegate to most capable agent
        let mut results = HashMap::new();
        
        if let Some(leader) = session.participants.first() {
            results.insert(*leader, serde_json::json!({
                "role": "leader",
                "result": "task completed",
            }));
            
            for follower in session.participants.iter().skip(1) {
                results.insert(*follower, serde_json::json!({
                    "role": "follower",
                    "delegated_to": leader,
                }));
            }
        }
        
        Ok(results)
    }
}

/// Parallel execution strategy
#[derive(Default)]
pub struct ParallelStrategy;

#[async_trait::async_trait]
impl CoordinationStrategy for ParallelStrategy {
    async fn coordinate(&self, session: &CoordinationSession) -> Result<HashMap<AgentId, serde_json::Value>> {
        // Stub implementation - all agents work in parallel
        let mut results = HashMap::new();
        
        for agent_id in &session.participants {
            results.insert(*agent_id, serde_json::json!({
                "status": "completed",
                "partial_result": format!("Result from agent {}", agent_id),
            }));
        }
        
        Ok(results)
    }
}