use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::artifact::{Artifact, Message};

/// A2A Task Status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, sqlx::Type)]
#[sqlx(type_name = "text")]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TaskStatus::Pending => write!(f, "pending"),
            TaskStatus::Running => write!(f, "running"),
            TaskStatus::Completed => write!(f, "completed"),
            TaskStatus::Failed => write!(f, "failed"),
            TaskStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// Workflow state tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowState {
    #[serde(rename = "type")]
    pub workflow_type: String,
    pub agents: Vec<String>,
    #[serde(rename = "currentAgent")]
    pub current_agent: Option<String>,
    #[serde(rename = "currentStep")]
    pub current_step: usize,
    #[serde(rename = "totalSteps")]
    pub total_steps: usize,
}

/// A2A Task representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2ATask {
    pub id: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub status: TaskStatus,
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    pub artifacts: Vec<Artifact>,
    pub messages: Vec<Message>,
    pub workflow: WorkflowState,
    pub context: serde_json::Value,
    pub metadata: Option<serde_json::Value>,
}

impl A2ATask {
    /// Create a new task
    pub fn new(task_type: &str, workflow_type: &str, agents: Vec<String>, context: serde_json::Value) -> Self {
        let task_id = format!("task_{}_{}", 
            Utc::now().timestamp_millis(),
            Uuid::new_v4().to_string().split('-').next().unwrap_or("unknown")
        );
        
        let total_steps = agents.len();
        
        Self {
            id: task_id,
            task_type: task_type.to_string(),
            status: TaskStatus::Pending,
            created: Utc::now(),
            updated: Utc::now(),
            artifacts: Vec::new(),
            messages: Vec::new(),
            workflow: WorkflowState {
                workflow_type: workflow_type.to_string(),
                agents,
                current_agent: None,
                current_step: 0,
                total_steps,
            },
            context,
            metadata: None,
        }
    }
    
    /// Add an artifact to the task
    pub fn add_artifact(&mut self, artifact: Artifact) {
        self.artifacts.push(artifact);
        self.updated = Utc::now();
    }
    
    /// Add a message to the task
    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
        self.updated = Utc::now();
    }
    
    /// Update task status
    pub fn update_status(&mut self, status: TaskStatus) {
        self.status = status;
        self.updated = Utc::now();
    }
    
    /// Move to next agent in workflow
    pub fn next_agent(&mut self) -> Option<String> {
        if self.workflow.current_step < self.workflow.total_steps {
            let next_agent = self.workflow.agents.get(self.workflow.current_step).cloned();
            if let Some(ref agent) = next_agent {
                self.workflow.current_agent = Some(agent.clone());
                self.workflow.current_step += 1;
            }
            next_agent
        } else {
            None
        }
    }
    
    /// Get progress percentage
    pub fn progress_percentage(&self) -> u8 {
        if self.workflow.total_steps == 0 {
            return 100;
        }
        ((self.workflow.current_step as f64 / self.workflow.total_steps as f64) * 100.0) as u8
    }
}

/// Task creation request
#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub workflow_type: String,
    pub context: serde_json::Value,
    pub options: Option<serde_json::Value>,
}

/// Task response
#[derive(Debug, Serialize)]
pub struct TaskResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub status: TaskStatus,
    pub progress: u8,
    pub stream_url: Option<String>,
}