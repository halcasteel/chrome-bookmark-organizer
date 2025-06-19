//! Error types for AI-Ops Core

use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    
    #[error("Migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),
    
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
    
    #[error("AI provider error: {0}")]
    AIProvider(String),
    
    #[error("Agent error: {source}")]
    Agent {
        agent_id: uuid::Uuid,
        agent_type: String,
        source: Box<dyn std::error::Error + Send + Sync>,
    },
    
    #[error("Knowledge graph error: {0}")]
    KnowledgeGraph(String),
    
    #[error("Event processing error: {0}")]
    EventProcessing(String),
    
    #[error("Service registry error: {0}")]
    ServiceRegistry(String),
    
    #[error("Pattern matching error: {0}")]
    PatternMatching(String),
    
    #[error("Configuration error: {0}")]
    Configuration(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Invalid state: {0}")]
    InvalidState(String),
    
    #[error("Timeout: operation timed out after {0:?}")]
    Timeout(std::time::Duration),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("Other error: {0}")]
    Other(#[from] anyhow::Error),
}