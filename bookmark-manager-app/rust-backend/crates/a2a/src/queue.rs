use anyhow::Result;
use redis::aio::ConnectionManager;
use redis::{AsyncCommands, Client};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{error, info};

/// Task queue item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueTask {
    pub task_id: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub priority: i32,
    pub attempts: u32,
    pub data: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Queue service for Redis-based task management
pub struct QueueService {
    client: Client,
    connection: Option<ConnectionManager>,
}

impl QueueService {
    /// Create new queue service
    pub fn new(redis_url: &str) -> Result<Self> {
        let client = Client::open(redis_url)?;
        Ok(Self {
            client,
            connection: None,
        })
    }
    
    /// Connect to Redis
    pub async fn connect(&mut self) -> Result<()> {
        let connection = self.client.get_connection_manager().await?;
        self.connection = Some(connection);
        info!("Connected to Redis queue");
        Ok(())
    }
    
    /// Enqueue a task
    pub async fn enqueue(&mut self, queue_name: &str, task: &QueueTask) -> Result<()> {
        let conn = self.connection.as_mut()
            .ok_or_else(|| anyhow::anyhow!("Not connected to Redis"))?;
        
        let task_json = serde_json::to_string(task)?;
        
        // Use sorted set for priority queue
        let score = -task.priority; // Negative for high priority first
        conn.zadd::<_, _, _, ()>(queue_name, task_json, score).await?;
        
        info!("Enqueued task {} to {}", task.task_id, queue_name);
        Ok(())
    }
    
    /// Dequeue a task (blocking)
    pub async fn dequeue(&mut self, queue_name: &str, timeout: Duration) -> Result<Option<QueueTask>> {
        let conn = self.connection.as_mut()
            .ok_or_else(|| anyhow::anyhow!("Not connected to Redis"))?;
        
        // Use BZPOPMIN for blocking priority dequeue
        let result: Option<(String, String, f64)> = conn
            .bzpopmin(queue_name, timeout.as_secs() as f64)
            .await?;
        
        if let Some((_, task_json, _)) = result {
            let task: QueueTask = serde_json::from_str(&task_json)?;
            info!("Dequeued task {} from {}", task.task_id, queue_name);
            Ok(Some(task))
        } else {
            Ok(None)
        }
    }
    
    /// Acknowledge task completion
    pub async fn ack(&mut self, queue_name: &str, task_id: &str) -> Result<()> {
        let conn = self.connection.as_mut()
            .ok_or_else(|| anyhow::anyhow!("Not connected to Redis"))?;
        
        // Store completion in a hash
        let key = format!("{}:completed", queue_name);
        conn.hset::<_, _, _, ()>(&key, task_id, chrono::Utc::now().to_rfc3339()).await?;
        
        info!("Acknowledged task {} in {}", task_id, queue_name);
        Ok(())
    }
    
    /// Requeue failed task
    pub async fn requeue(&mut self, queue_name: &str, mut task: QueueTask) -> Result<()> {
        task.attempts += 1;
        
        if task.attempts > 3 {
            // Move to dead letter queue
            let dlq_name = format!("{}:dead", queue_name);
            self.enqueue(&dlq_name, &task).await?;
            error!("Task {} moved to dead letter queue after {} attempts", 
                task.task_id, task.attempts);
        } else {
            // Requeue with lower priority
            task.priority = task.priority.saturating_sub(10);
            self.enqueue(queue_name, &task).await?;
            info!("Requeued task {} (attempt {})", task.task_id, task.attempts);
        }
        
        Ok(())
    }
    
    /// Get queue length
    pub async fn queue_length(&mut self, queue_name: &str) -> Result<usize> {
        let conn = self.connection.as_mut()
            .ok_or_else(|| anyhow::anyhow!("Not connected to Redis"))?;
        
        let len: usize = conn.zcard(queue_name).await?;
        Ok(len)
    }
}

/// Task queue names
pub struct TaskQueue;

impl TaskQueue {
    pub const IMPORT: &'static str = "a2a:queue:import";
    pub const VALIDATION: &'static str = "a2a:queue:validation";
    pub const ENRICHMENT: &'static str = "a2a:queue:enrichment";
    pub const CATEGORIZATION: &'static str = "a2a:queue:categorization";
    pub const EMBEDDING: &'static str = "a2a:queue:embedding";
}

/// Bull-compatible job structure (for Node.js interop)
#[derive(Debug, Serialize, Deserialize)]
pub struct BullJob {
    pub id: String,
    pub name: String,
    pub data: serde_json::Value,
    pub opts: BullJobOptions,
    pub timestamp: i64,
    pub attempts: u32,
    pub delay: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BullJobOptions {
    pub priority: i32,
    pub attempts: u32,
    pub backoff: BullBackoff,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BullBackoff {
    #[serde(rename = "type")]
    pub backoff_type: String,
    pub delay: u64,
}