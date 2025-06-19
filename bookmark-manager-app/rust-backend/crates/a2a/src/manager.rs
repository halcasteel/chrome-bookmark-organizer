use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::{
    agent::{A2AAgent, AgentCard},
    artifact::Message,
    queue::{QueueService, QueueTask, TaskQueue},
    task::{A2ATask, TaskStatus, CreateTaskRequest, TaskResponse},
};

/// A2A Task Manager - Orchestrates agent workflows
pub struct TaskManager {
    agents: Arc<RwLock<HashMap<String, Arc<dyn A2AAgent>>>>,
    tasks: Arc<RwLock<HashMap<String, A2ATask>>>,
    workflows: Arc<RwLock<HashMap<String, WorkflowDefinition>>>,
    queue_service: Arc<RwLock<QueueService>>,
    database_url: String,
}

/// Workflow definition
#[derive(Debug, Clone)]
struct WorkflowDefinition {
    name: String,
    agents: Vec<String>,
    description: String,
}

impl TaskManager {
    /// Create new task manager
    pub fn new(redis_url: &str, database_url: &str) -> Result<Self> {
        let queue_service = QueueService::new(redis_url)?;
        
        Ok(Self {
            agents: Arc::new(RwLock::new(HashMap::new())),
            tasks: Arc::new(RwLock::new(HashMap::new())),
            workflows: Arc::new(RwLock::new(HashMap::new())),
            queue_service: Arc::new(RwLock::new(queue_service)),
            database_url: database_url.to_string(),
        })
    }
    
    /// Initialize the task manager
    pub async fn initialize(&self) -> Result<()> {
        // Connect to Redis
        let mut queue = self.queue_service.write().await;
        queue.connect().await?;
        drop(queue);
        
        // Register built-in workflows
        self.register_builtin_workflows().await?;
        
        info!("Task Manager initialized");
        Ok(())
    }
    
    /// Register an agent
    pub async fn register_agent(&self, agent: Arc<dyn A2AAgent>) -> Result<()> {
        let agent_type = agent.agent_type().to_string();
        let card = agent.get_agent_card();
        
        info!("Registering agent: {} v{}", card.name, card.version);
        
        let mut agents = self.agents.write().await;
        agents.insert(agent_type.clone(), agent);
        
        info!("Agent registered: {}", agent_type);
        Ok(())
    }
    
    /// Get registered agents
    pub async fn get_agents(&self) -> Vec<AgentCard> {
        let agents = self.agents.read().await;
        agents.values()
            .map(|agent| agent.get_agent_card())
            .collect()
    }
    
    /// Create a new task
    pub async fn create_task(&self, request: CreateTaskRequest) -> Result<TaskResponse> {
        let workflows = self.workflows.read().await;
        let workflow = workflows.get(&request.workflow_type)
            .ok_or_else(|| anyhow::anyhow!("Unknown workflow type: {}", request.workflow_type))?;
        
        // Create task
        let task = A2ATask::new(
            &request.workflow_type,
            &workflow.name,
            workflow.agents.clone(),
            request.context,
        );
        
        let task_id = task.id.clone();
        let response = TaskResponse {
            id: task_id.clone(),
            task_type: task.task_type.clone(),
            status: task.status.clone(),
            progress: task.progress_percentage(),
            stream_url: Some(format!("/api/tasks/{}/stream", task_id)),
        };
        
        // Store task
        let mut tasks = self.tasks.write().await;
        tasks.insert(task_id.clone(), task);
        drop(tasks);
        
        // Queue first agent
        self.queue_next_agent(&task_id).await?;
        
        info!("Created task: {} ({})", task_id, request.workflow_type);
        Ok(response)
    }
    
    /// Get task by ID
    pub async fn get_task(&self, task_id: &str) -> Result<A2ATask> {
        let tasks = self.tasks.read().await;
        tasks.get(task_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Task not found: {}", task_id))
    }
    
    /// Update task status
    pub async fn update_task_status(&self, task_id: &str, status: TaskStatus) -> Result<()> {
        let mut tasks = self.tasks.write().await;
        if let Some(task) = tasks.get_mut(task_id) {
            task.update_status(status);
            Ok(())
        } else {
            Err(anyhow::anyhow!("Task not found: {}", task_id))
        }
    }
    
    /// Process task with agent
    pub async fn process_task(&self, task_id: &str, agent_type: &str) -> Result<()> {
        info!("Processing task {} with agent {}", task_id, agent_type);
        
        // Get task
        let task = self.get_task(task_id).await?;
        
        // Get agent
        let agents = self.agents.read().await;
        let agent = agents.get(agent_type)
            .ok_or_else(|| anyhow::anyhow!("Agent not found: {}", agent_type))?;
        let agent = Arc::clone(agent);
        drop(agents);
        
        // Update task status
        self.update_task_status(task_id, TaskStatus::Running).await?;
        
        // Execute agent
        match agent.execute_task(&task).await {
            Ok(artifacts) => {
                // Add artifacts to task
                let mut tasks = self.tasks.write().await;
                if let Some(task) = tasks.get_mut(task_id) {
                    for artifact in artifacts {
                        task.add_artifact(artifact);
                    }
                    task.add_message(Message::info(&format!(
                        "Agent {} completed successfully", agent_type
                    )));
                }
                drop(tasks);
                
                // Queue next agent
                self.queue_next_agent(task_id).await?;
            }
            Err(e) => {
                error!("Agent {} failed for task {}: {}", agent_type, task_id, e);
                
                // Update task with error
                let mut tasks = self.tasks.write().await;
                if let Some(task) = tasks.get_mut(task_id) {
                    task.add_message(Message::error(&format!(
                        "Agent {} failed: {}", agent_type, e
                    )));
                    task.update_status(TaskStatus::Failed);
                }
            }
        }
        
        Ok(())
    }
    
    /// Queue next agent in workflow
    async fn queue_next_agent(&self, task_id: &str) -> Result<()> {
        let mut tasks = self.tasks.write().await;
        let task = tasks.get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task not found: {}", task_id))?;
        
        if let Some(next_agent) = task.next_agent() {
            // Create queue task
            let queue_task = QueueTask {
                task_id: task_id.to_string(),
                task_type: next_agent.clone(),
                priority: 10,
                attempts: 0,
                data: serde_json::json!({
                    "taskId": task_id,
                    "agentType": next_agent,
                }),
                created_at: chrono::Utc::now(),
            };
            
            // Get queue name for agent
            let queue_name = match next_agent.as_str() {
                "import" => TaskQueue::IMPORT,
                "validation" => TaskQueue::VALIDATION,
                "enrichment" => TaskQueue::ENRICHMENT,
                "categorization" => TaskQueue::CATEGORIZATION,
                "embedding" => TaskQueue::EMBEDDING,
                _ => return Err(anyhow::anyhow!("Unknown agent type: {}", next_agent)),
            };
            
            drop(tasks);
            
            // Enqueue task
            let mut queue = self.queue_service.write().await;
            queue.enqueue(queue_name, &queue_task).await?;
            
            info!("Queued agent {} for task {}", next_agent, task_id);
        } else {
            // No more agents - mark as completed
            task.update_status(TaskStatus::Completed);
            task.add_message(Message::info("Workflow completed successfully"));
            info!("Task {} completed all agents", task_id);
        }
        
        Ok(())
    }
    
    /// Register built-in workflows
    async fn register_builtin_workflows(&self) -> Result<()> {
        let mut workflows = self.workflows.write().await;
        
        // Full bookmark processing workflow
        workflows.insert(
            "bookmark_processing".to_string(),
            WorkflowDefinition {
                name: "Bookmark Processing".to_string(),
                agents: vec![
                    "import".to_string(),
                    "validation".to_string(),
                    "enrichment".to_string(),
                    "categorization".to_string(),
                    "embedding".to_string(),
                ],
                description: "Complete bookmark processing pipeline".to_string(),
            },
        );
        
        // Import only workflow
        workflows.insert(
            "import_only".to_string(),
            WorkflowDefinition {
                name: "Import Only".to_string(),
                agents: vec!["import".to_string()],
                description: "Import bookmarks without processing".to_string(),
            },
        );
        
        // Validation and enrichment workflow
        workflows.insert(
            "validate_enrich".to_string(),
            WorkflowDefinition {
                name: "Validate and Enrich".to_string(),
                agents: vec![
                    "validation".to_string(),
                    "enrichment".to_string(),
                ],
                description: "Validate URLs and enrich with metadata".to_string(),
            },
        );
        
        info!("Registered {} built-in workflows", workflows.len());
        Ok(())
    }
    
    /// Start background task processor
    pub async fn start_processor(self: Arc<Self>) {
        info!("Starting task processor");
        
        // Spawn processors for each queue
        let queues = vec![
            (TaskQueue::IMPORT, "import"),
            (TaskQueue::VALIDATION, "validation"),
            (TaskQueue::ENRICHMENT, "enrichment"),
            (TaskQueue::CATEGORIZATION, "categorization"),
            (TaskQueue::EMBEDDING, "embedding"),
        ];
        
        for (queue_name, agent_type) in queues {
            let manager = Arc::clone(&self);
            let agent_type = agent_type.to_string();
            
            tokio::spawn(async move {
                loop {
                    if let Err(e) = manager.process_queue(queue_name, &agent_type).await {
                        error!("Queue processor error for {}: {}", agent_type, e);
                    }
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }
                #[allow(unreachable_code)]
                Ok::<(), anyhow::Error>(())
            });
        }
    }
    
    /// Process tasks from queue
    async fn process_queue(&self, queue_name: &str, agent_type: &str) -> Result<()> {
        let mut queue = self.queue_service.write().await;
        
        // Dequeue with 5 second timeout
        if let Some(task) = queue.dequeue(queue_name, std::time::Duration::from_secs(5)).await? {
            drop(queue);
            
            // Process the task
            if let Err(e) = self.process_task(&task.task_id, agent_type).await {
                error!("Failed to process task {}: {}", task.task_id, e);
                
                // Requeue on failure
                let mut queue = self.queue_service.write().await;
                queue.requeue(queue_name, task).await?;
            }
        }
        
        Ok(())
    }
}