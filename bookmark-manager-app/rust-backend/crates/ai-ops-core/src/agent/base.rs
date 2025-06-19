//! Base implementation for agents

use super::*;
use tokio::sync::RwLock;
use std::sync::Arc;

/// Base agent implementation with common functionality
pub struct BaseAgent {
    pub id: AgentId,
    pub name: String,
    pub agent_type: AgentType,
    pub capabilities: Vec<Capability>,
    pub subscriptions: Vec<EventPattern>,
    pub status: Arc<RwLock<AgentStatus>>,
    pub knowledge_store: Arc<RwLock<Vec<Knowledge>>>,
}

impl BaseAgent {
    pub fn new(name: String, agent_type: AgentType) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            agent_type,
            capabilities: Vec::new(),
            subscriptions: Vec::new(),
            status: Arc::new(RwLock::new(AgentStatus {
                state: AgentState::Starting,
                health: Health::Unknown,
                current_load: 0.0,
                active_tasks: 0,
                last_activity: Utc::now(),
                metrics: HashMap::new(),
            })),
            knowledge_store: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    pub fn with_capabilities(mut self, capabilities: Vec<Capability>) -> Self {
        self.capabilities = capabilities;
        self
    }
    
    pub fn with_subscriptions(mut self, subscriptions: Vec<EventPattern>) -> Self {
        self.subscriptions = subscriptions;
        self
    }
    
    /// Update agent state
    pub async fn set_state(&self, state: AgentState) {
        let mut status = self.status.write().await;
        status.state = state;
        status.last_activity = Utc::now();
    }
    
    /// Update health status
    pub async fn set_health(&self, health: Health) {
        let mut status = self.status.write().await;
        status.health = health;
    }
    
    /// Increment active tasks
    pub async fn task_started(&self) {
        let mut status = self.status.write().await;
        status.active_tasks += 1;
        status.current_load = (status.active_tasks as f64) / 10.0; // Simple load calculation
        status.state = AgentState::Processing;
    }
    
    /// Decrement active tasks
    pub async fn task_completed(&self) {
        let mut status = self.status.write().await;
        if status.active_tasks > 0 {
            status.active_tasks -= 1;
        }
        status.current_load = (status.active_tasks as f64) / 10.0;
        if status.active_tasks == 0 {
            status.state = AgentState::Idle;
        }
    }
    
    /// Store learned knowledge
    pub async fn store_knowledge(&self, knowledge: Knowledge) {
        let mut store = self.knowledge_store.write().await;
        store.push(knowledge);
        
        // Keep only recent knowledge (last 1000 items)
        if store.len() > 1000 {
            let drain_count = store.len() - 1000;
            store.drain(0..drain_count);
        }
    }
    
    /// Retrieve relevant knowledge
    pub async fn retrieve_knowledge(&self, context: &Context) -> Vec<Knowledge> {
        let store = self.knowledge_store.read().await;
        store.iter()
            .filter(|k| k.applicable_contexts.iter().any(|c| Self::context_matches(c, context)))
            .cloned()
            .collect()
    }
    
    fn context_matches(k_ctx: &Context, q_ctx: &Context) -> bool {
        // Simple context matching - can be made more sophisticated
        for (key, value) in &q_ctx.environment {
            if let Some(k_value) = k_ctx.environment.get(key) {
                if k_value != value {
                    return false;
                }
            }
        }
        true
    }
}