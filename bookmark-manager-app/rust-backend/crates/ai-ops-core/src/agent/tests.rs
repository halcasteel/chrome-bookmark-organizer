//! Unit tests for agent module

use super::*;
use std::sync::Arc;
use tokio::sync::Mutex;

// Mock agent for testing
#[derive(Clone)]
struct MockAgent {
    id: AgentId,
    observations: Arc<Mutex<Vec<Observation>>>,
    actions_taken: Arc<Mutex<Vec<Action>>>,
}

impl MockAgent {
    fn new() -> Self {
        Self {
            id: Uuid::new_v4(),
            observations: Arc::new(Mutex::new(Vec::new())),
            actions_taken: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[async_trait]
impl UniversalAgent for MockAgent {
    fn id(&self) -> &AgentId {
        &self.id
    }
    
    fn capabilities(&self) -> &[Capability] {
        &[Capability {
            name: "test".to_string(),
            description: "Test capability".to_string(),
            version: "1.0".to_string(),
            constraints: vec![],
        }]
    }
    
    async fn observe(&mut self, observation: Observation) -> Result<()> {
        self.observations.lock().await.push(observation);
        Ok(())
    }
    
    async fn analyze(&self, context: &Context) -> Result<Vec<Insight>> {
        let _ = context;
        Ok(vec![Insight {
            id: Uuid::new_v4(),
            insight_type: InsightType::Pattern,
            description: "Test insight".to_string(),
            confidence: 0.9,
            evidence: vec![],
            recommendations: vec![],
            timestamp: Utc::now(),
        }])
    }
    
    async fn act(&mut self, action: Action) -> Result<ActionResult> {
        self.actions_taken.lock().await.push(action.clone());
        Ok(ActionResult {
            action_id: action.id,
            success: true,
            output: Some(serde_json::json!({"result": "success"})),
            error: None,
            duration: std::time::Duration::from_secs(1),
            side_effects: vec![],
        })
    }
    
    async fn learn(&mut self, experience: Experience) -> Result<()> {
        let _ = experience;
        Ok(())
    }
    
    async fn collaborate(&self, request: CollaborationRequest) -> Result<CollaborationResponse> {
        match request.collaboration_type {
            CollaborationType::RequestHelp => {
                Ok(CollaborationResponse {
                    request_id: request.id,
                    accepted: true,
                    response_data: Some(serde_json::json!({"help": "provided"})),
                    constraints: vec![],
                })
            }
            _ => Ok(CollaborationResponse {
                request_id: request.id,
                accepted: false,
                response_data: None,
                constraints: vec![],
            }),
        }
    }
    
    async fn health_check(&self) -> Result<HealthStatus> {
        Ok(HealthStatus {
            healthy: true,
            metrics: std::collections::HashMap::new(),
            issues: vec![],
        })
    }
}

#[tokio::test]
async fn test_agent_observe_and_analyze() {
    let mut agent = MockAgent::new();
    
    let observation = Observation {
        id: Uuid::new_v4(),
        timestamp: Utc::now(),
        source: "test".to_string(),
        data: serde_json::json!({"metric": "cpu", "value": 85}),
        tags: vec!["performance".to_string()],
    };
    
    // Observe
    agent.observe(observation.clone()).await.unwrap();
    
    // Verify observation was stored
    let observations = agent.observations.lock().await;
    assert_eq!(observations.len(), 1);
    assert_eq!(observations[0].id, observation.id);
    drop(observations);
    
    // Analyze
    let context = Context {
        agent_id: agent.id,
        environment: std::collections::HashMap::new(),
        history: vec![],
        constraints: vec![],
    };
    
    let insights = agent.analyze(&context).await.unwrap();
    assert_eq!(insights.len(), 1);
    assert_eq!(insights[0].insight_type, InsightType::Pattern);
}

#[tokio::test]
async fn test_agent_act() {
    let mut agent = MockAgent::new();
    
    let action = Action {
        id: Uuid::new_v4(),
        action_type: ActionType::Execute,
        target: "test-target".to_string(),
        parameters: std::collections::HashMap::new(),
        priority: Priority::Medium,
        timeout: Some(std::time::Duration::from_secs(30)),
    };
    
    let result = agent.act(action.clone()).await.unwrap();
    assert!(result.success);
    assert_eq!(result.action_id, action.id);
    
    // Verify action was recorded
    let actions = agent.actions_taken.lock().await;
    assert_eq!(actions.len(), 1);
    assert_eq!(actions[0].id, action.id);
}

#[tokio::test]
async fn test_agent_collaboration() {
    let agent = MockAgent::new();
    
    let request = CollaborationRequest {
        id: Uuid::new_v4(),
        from_agent: Uuid::new_v4(),
        to_agent: agent.id,
        collaboration_type: CollaborationType::RequestHelp,
        context: serde_json::json!({"problem": "high memory usage"}),
        priority: Priority::High,
    };
    
    let response = agent.collaborate(request.clone()).await.unwrap();
    assert!(response.accepted);
    assert_eq!(response.request_id, request.id);
    assert!(response.response_data.is_some());
}

#[tokio::test]
async fn test_agent_health() {
    let agent = MockAgent::new();
    let health = agent.health_check().await.unwrap();
    assert!(health.healthy);
    assert!(health.issues.is_empty());
}

#[cfg(test)]
mod monitor_agent_tests {
    use super::*;
    use crate::agent::agents::MonitorAgent;
    
    #[tokio::test]
    async fn test_monitor_agent_creation() {
        let config = MonitorConfig {
            check_interval: std::time::Duration::from_secs(60),
            metrics_retention: std::time::Duration::from_secs(3600),
            alert_thresholds: std::collections::HashMap::new(),
        };
        
        let kg = KnowledgeGraph::new("postgres://admin:admin@localhost:5434/bookmark_manager_test")
            .await
            .unwrap();
        let mesh = EventMesh::new("redis://localhost:6382").await.unwrap();
        
        let agent = MonitorAgent::new(config, kg, mesh);
        assert_eq!(agent.agent_type(), "monitor");
        assert!(!agent.capabilities().is_empty());
    }
}

#[cfg(test)]
mod coordinator_tests {
    use super::*;
    use crate::agent::coordinator::AgentCoordinator;
    
    #[tokio::test]
    async fn test_coordinator_agent_registration() {
        let kg = KnowledgeGraph::new("postgres://admin:admin@localhost:5434/bookmark_manager_test")
            .await
            .unwrap();
        let mesh = EventMesh::new("redis://localhost:6382").await.unwrap();
        
        let mut coordinator = AgentCoordinator::new(kg, mesh);
        let agent = Box::new(MockAgent::new());
        let agent_id = *agent.id();
        
        coordinator.register_agent(agent).await.unwrap();
        
        let agents = coordinator.list_agents().await;
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0], agent_id);
    }
    
    #[tokio::test]
    async fn test_coordinator_broadcast() {
        let kg = KnowledgeGraph::new("postgres://admin:admin@localhost:5434/bookmark_manager_test")
            .await
            .unwrap();
        let mesh = EventMesh::new("redis://localhost:6382").await.unwrap();
        
        let mut coordinator = AgentCoordinator::new(kg, mesh);
        
        // Register multiple agents
        for _ in 0..3 {
            coordinator.register_agent(Box::new(MockAgent::new())).await.unwrap();
        }
        
        let observation = Observation {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            source: "test".to_string(),
            data: serde_json::json!({"event": "test"}),
            tags: vec![],
        };
        
        coordinator.broadcast_observation(observation).await.unwrap();
        // In a real test, we would verify all agents received the observation
    }
}