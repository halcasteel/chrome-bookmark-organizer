use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::artifact::Artifact;
use crate::task::A2ATask;

/// A2A Agent capabilities definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCapabilities {
    pub inputs: HashMap<String, InputSpec>,
    pub outputs: HashMap<String, OutputSpec>,
    #[serde(rename = "estimatedDuration")]
    pub estimated_duration: String,
    #[serde(rename = "maxConcurrency")]
    pub max_concurrency: u32,
    #[serde(rename = "supportsStreaming")]
    pub supports_streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputSpec {
    #[serde(rename = "type")]
    pub spec_type: String,
    pub required: bool,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputSpec {
    #[serde(rename = "type")]
    pub spec_type: String,
    pub description: Option<String>,
}

/// A2A AgentCard for service discovery
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCard {
    pub name: String,
    pub version: String,
    pub description: String,
    pub capabilities: AgentCapabilities,
    pub endpoints: AgentEndpoints,
    pub authentication: Vec<String>,
    pub protocols: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentEndpoints {
    pub execute: String,
    pub status: String,
    pub health: String,
    pub stream: Option<String>,
}

/// A2A-compliant agent trait
#[async_trait]
pub trait A2AAgent: Send + Sync {
    /// Get the agent's capability card
    fn get_agent_card(&self) -> AgentCard;
    
    /// Get agent type identifier
    fn agent_type(&self) -> &str;
    
    /// Execute a task and return artifacts
    async fn execute_task(&self, task: &A2ATask) -> anyhow::Result<Vec<Artifact>>;
    
    /// Check if agent supports streaming
    fn supports_streaming(&self) -> bool {
        false
    }
    
    /// Stream task progress (optional)
    async fn stream_progress(&self, _task_id: &str) -> anyhow::Result<()> {
        Ok(())
    }
    
    /// Validate task inputs
    fn validate_inputs(&self, _inputs: &serde_json::Value) -> anyhow::Result<()> {
        // Default implementation - can be overridden
        Ok(())
    }
    
    /// Get agent health status
    async fn health_check(&self) -> anyhow::Result<HealthStatus> {
        Ok(HealthStatus {
            status: "healthy".to_string(),
            version: self.get_agent_card().version,
            uptime: 0,
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub version: String,
    pub uptime: u64,
}

/// Base implementation helper for agents
pub struct BaseAgent {
    pub agent_type: String,
    pub version: String,
    pub description: String,
    pub capabilities: AgentCapabilities,
}

impl BaseAgent {
    pub fn new(agent_type: &str, description: &str) -> Self {
        Self {
            agent_type: agent_type.to_string(),
            version: "1.0.0".to_string(),
            description: description.to_string(),
            capabilities: AgentCapabilities {
                inputs: HashMap::new(),
                outputs: HashMap::new(),
                estimated_duration: "30-300s".to_string(),
                max_concurrency: 1,
                supports_streaming: true,
            },
        }
    }
    
    pub fn with_input(mut self, name: &str, spec_type: &str, required: bool) -> Self {
        self.capabilities.inputs.insert(
            name.to_string(),
            InputSpec {
                spec_type: spec_type.to_string(),
                required,
                description: None,
            },
        );
        self
    }
    
    pub fn with_output(mut self, name: &str, spec_type: &str) -> Self {
        self.capabilities.outputs.insert(
            name.to_string(),
            OutputSpec {
                spec_type: spec_type.to_string(),
                description: None,
            },
        );
        self
    }
    
    pub fn build_agent_card(&self, base_url: &str) -> AgentCard {
        AgentCard {
            name: self.agent_type.clone(),
            version: self.version.clone(),
            description: self.description.clone(),
            capabilities: self.capabilities.clone(),
            endpoints: AgentEndpoints {
                execute: format!("{}/execute", base_url),
                status: format!("{}/status/{{taskId}}", base_url),
                health: format!("{}/health", base_url),
                stream: Some(format!("{}/stream/{{taskId}}", base_url)),
            },
            authentication: vec!["bearer".to_string()],
            protocols: vec!["a2a".to_string(), "http".to_string()],
        }
    }
}