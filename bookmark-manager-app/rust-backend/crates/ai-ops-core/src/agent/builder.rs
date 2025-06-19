//! Builder Agent implementation
//! 
//! Agent responsible for constructing new tools and components

use async_trait::async_trait;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

use crate::{
    Result, Error, Event, EventType, AgentId,
    agent::{
        UniversalAgent, AgentType, Capability, EventPattern, Experience, 
        Knowledge, CollaborationRequest, CollaborationResponse, AgentStatus,
        AgentState, Health
    },
    construction::ToolSpecification,
};

/// Builder agent that can construct new tools and components
pub struct BuilderAgent {
    id: AgentId,
    name: String,
    state: AgentState,
    active_builds: HashMap<Uuid, BuildTask>,
    completed_builds: Vec<CompletedBuild>,
    metrics: HashMap<String, f64>,
    last_activity: DateTime<Utc>,
}

impl BuilderAgent {
    /// Create a new builder agent
    pub fn new(name: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            name,
            state: AgentState::Starting,
            active_builds: HashMap::new(),
            completed_builds: Vec::new(),
            metrics: HashMap::new(),
            last_activity: Utc::now(),
        }
    }
    
    /// Build a new tool from specification
    pub async fn build_tool(&mut self, spec: ToolSpecification) -> Result<BuildResult> {
        let build_id = Uuid::new_v4();
        let build_task = BuildTask {
            id: build_id,
            specification: spec.clone(),
            status: BuildStatus::Planning,
            started_at: Utc::now(),
            progress: 0.0,
        };
        
        self.active_builds.insert(build_id, build_task);
        self.state = AgentState::Processing;
        
        // Stub implementation - simulate build process
        let result = self.execute_build(build_id).await?;
        
        // Move to completed
        if let Some(task) = self.active_builds.remove(&build_id) {
            self.completed_builds.push(CompletedBuild {
                task,
                result: result.clone(),
                completed_at: Utc::now(),
            });
        }
        
        if self.active_builds.is_empty() {
            self.state = AgentState::Idle;
        }
        
        Ok(result)
    }
    
    async fn execute_build(&mut self, build_id: Uuid) -> Result<BuildResult> {
        // Update progress
        if let Some(task) = self.active_builds.get_mut(&build_id) {
            task.status = BuildStatus::Analyzing;
            task.progress = 0.2;
            
            // Simulate analysis phase
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            task.status = BuildStatus::Generating;
            task.progress = 0.5;
            
            // Simulate generation phase
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            task.status = BuildStatus::Testing;
            task.progress = 0.8;
            
            // Simulate testing phase
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            
            task.status = BuildStatus::Completed;
            task.progress = 1.0;
        }
        
        // Return stub result
        Ok(BuildResult {
            build_id,
            success: true,
            artifact: BuildArtifact {
                artifact_type: ArtifactType::Service,
                name: "generated-service".to_string(),
                code: "// Generated code stub".to_string(),
                dependencies: vec![],
                metadata: HashMap::new(),
            },
            test_results: TestResults {
                passed: true,
                test_count: 5,
                coverage: 0.85,
                details: vec![],
            },
        })
    }
}

#[async_trait]
impl UniversalAgent for BuilderAgent {
    fn id(&self) -> AgentId {
        self.id
    }
    
    fn agent_type(&self) -> AgentType {
        AgentType::Builder
    }
    
    fn name(&self) -> &str {
        &self.name
    }
    
    fn capabilities(&self) -> Vec<Capability> {
        vec![
            Capability::Custom("ToolConstruction".to_string()),
            Capability::Custom("CodeGeneration".to_string()),
            Capability::Custom("Testing".to_string()),
        ]
    }
    
    fn subscriptions(&self) -> Vec<EventPattern> {
        vec![EventPattern {
            event_types: vec![
                EventType::TaskCreated,
                EventType::Custom("BuildRequested".to_string()),
            ],
            source_filter: None,
            metadata_filters: HashMap::new(),
        }]
    }
    
    async fn process(&mut self, event: Event) -> Result<Vec<Event>> {
        self.last_activity = Utc::now();
        
        match event.event_type {
            EventType::TaskCreated => {
                // Check if this is a build task
                if let crate::events::EventPayload::Task { task_type, data, .. } = &event.payload {
                    if task_type == "build" {
                        // Extract tool specification and build
                        if let Ok(spec) = serde_json::from_value::<ToolSpecification>(data.clone()) {
                            let result = self.build_tool(spec).await?;
                            
                            // Generate completion event
                            return Ok(vec![Event::new(
                                EventType::TaskCompleted,
                                self.id,
                                crate::events::EventPayload::Generic(serde_json::to_value(result)?),
                            ).caused_by(event.id)]);
                        }
                    }
                }
                Ok(vec![])
            }
            _ => Ok(vec![]),
        }
    }
    
    async fn learn(&mut self, _experience: Experience) -> Result<Knowledge> {
        // Learn from build experiences
        Ok(Knowledge {
            knowledge_type: crate::agent::KnowledgeType::Solution,
            content: serde_json::json!({
                "learned": "build patterns"
            }),
            confidence: 0.8,
            applicable_contexts: vec![],
        })
    }
    
    async fn collaborate(&mut self, request: CollaborationRequest) -> Result<CollaborationResponse> {
        // Collaborate on complex builds
        Ok(CollaborationResponse {
            request_id: request.request_id,
            responder: self.id,
            response_type: crate::agent::ResponseType::Accepted,
            content: serde_json::json!({
                "capability": "can help with build"
            }),
        })
    }
    
    async fn status(&self) -> AgentStatus {
        AgentStatus {
            state: self.state,
            health: Health::Healthy,
            current_load: self.active_builds.len() as f64 / 10.0, // Assume max 10 concurrent builds
            active_tasks: self.active_builds.len(),
            last_activity: self.last_activity,
            metrics: self.metrics.clone(),
        }
    }
    
    async fn shutdown(&mut self) -> Result<()> {
        self.state = AgentState::Shutting;
        
        // Wait for active builds to complete
        while !self.active_builds.is_empty() {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
        
        self.state = AgentState::Stopped;
        Ok(())
    }
}

/// Build task tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildTask {
    pub id: Uuid,
    pub specification: ToolSpecification,
    pub status: BuildStatus,
    pub started_at: DateTime<Utc>,
    pub progress: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum BuildStatus {
    Planning,
    Analyzing,
    Generating,
    Testing,
    Completed,
    Failed,
}

/// Completed build record
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletedBuild {
    pub task: BuildTask,
    pub result: BuildResult,
    pub completed_at: DateTime<Utc>,
}

/// Build result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildResult {
    pub build_id: Uuid,
    pub success: bool,
    pub artifact: BuildArtifact,
    pub test_results: TestResults,
}

/// Built artifact
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildArtifact {
    pub artifact_type: ArtifactType,
    pub name: String,
    pub code: String,
    pub dependencies: Vec<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ArtifactType {
    Service,
    Agent,
    Tool,
    Library,
    Configuration,
}

/// Test results for the built artifact
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResults {
    pub passed: bool,
    pub test_count: usize,
    pub coverage: f64,
    pub details: Vec<TestDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestDetail {
    pub test_name: String,
    pub passed: bool,
    pub duration: std::time::Duration,
    pub error: Option<String>,
}