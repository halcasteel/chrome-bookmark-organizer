//! AI Provider Interfaces
//! 
//! Unified interface for different AI providers (OpenAI, Anthropic, local models, etc.)

use async_trait::async_trait;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

use crate::{Result, Error};

pub mod openai;
pub mod anthropic;
pub mod local;
pub mod embedding;

/// Trait for AI providers
#[async_trait]
pub trait AIProvider: Send + Sync {
    /// Get the provider name
    fn name(&self) -> &str;
    
    /// Check if the provider is available
    async fn is_available(&self) -> bool;
    
    /// Generate a completion
    async fn complete(&self, input: AIInput) -> Result<AIOutput>;
    
    /// Generate embeddings
    async fn embed(&self, texts: Vec<String>) -> Result<Vec<Embedding>>;
    
    /// Stream a completion
    async fn stream_complete(&self, input: AIInput) -> Result<AIStream>;
}

/// Input to AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIInput {
    pub messages: Vec<Message>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stop_sequences: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl AIInput {
    /// Create a simple prompt input
    pub fn from_prompt(prompt: String) -> Self {
        Self {
            messages: vec![Message {
                role: Role::User,
                content: prompt,
            }],
            model: None,
            temperature: None,
            max_tokens: None,
            stop_sequences: Vec::new(),
            metadata: HashMap::new(),
        }
    }
    
    /// Add a system message
    pub fn with_system(mut self, content: String) -> Self {
        self.messages.insert(0, Message {
            role: Role::System,
            content,
        });
        self
    }
    
    /// Set temperature
    pub fn with_temperature(mut self, temperature: f32) -> Self {
        self.temperature = Some(temperature);
        self
    }
    
    /// Set max tokens
    pub fn with_max_tokens(mut self, max_tokens: u32) -> Self {
        self.max_tokens = Some(max_tokens);
        self
    }
}

/// Message in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Role {
    System,
    User,
    Assistant,
}

/// Output from AI provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIOutput {
    pub content: String,
    pub model: String,
    pub usage: Usage,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Token usage information
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// Embedding vector
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embedding {
    pub vector: Vec<f32>,
    pub dimensions: usize,
}

impl Embedding {
    /// Create a new embedding
    pub fn new(vector: Vec<f32>) -> Self {
        let dimensions = vector.len();
        Self { vector, dimensions }
    }
    
    /// Calculate cosine similarity with another embedding
    pub fn cosine_similarity(&self, other: &Embedding) -> f32 {
        if self.dimensions != other.dimensions {
            return 0.0;
        }
        
        let dot_product: f32 = self.vector.iter()
            .zip(other.vector.iter())
            .map(|(a, b)| a * b)
            .sum();
        
        let norm_a: f32 = self.vector.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = other.vector.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if norm_a == 0.0 || norm_b == 0.0 {
            0.0
        } else {
            dot_product / (norm_a * norm_b)
        }
    }
    
    /// Convert to PostgreSQL pgvector format
    pub fn as_slice(&self) -> &[f32] {
        &self.vector
    }
}

/// Stream of AI responses
pub struct AIStream {
    receiver: tokio::sync::mpsc::Receiver<Result<String>>,
}

impl AIStream {
    /// Create a new stream
    pub fn new(receiver: tokio::sync::mpsc::Receiver<Result<String>>) -> Self {
        Self { receiver }
    }
    
    /// Get the next chunk
    pub async fn next(&mut self) -> Option<Result<String>> {
        self.receiver.recv().await
    }
}

/// Factory for creating AI providers
pub struct AIProviderFactory;

impl AIProviderFactory {
    /// Create a provider from configuration
    pub async fn create(config: &crate::AIProviderConfig) -> Result<Box<dyn AIProvider>> {
        match config.provider_type.as_str() {
            "openai" => Ok(Box::new(openai::OpenAIProvider::new(config)?)),
            "anthropic" => Ok(Box::new(anthropic::AnthropicProvider::new(config)?)),
            "local" => Ok(Box::new(local::LocalProvider::new(config)?)),
            _ => Err(Error::Configuration(format!(
                "Unknown AI provider type: {}",
                config.provider_type
            ))),
        }
    }
}

/// Manager for multiple AI providers
pub struct AIProviderManager {
    providers: HashMap<String, Box<dyn AIProvider>>,
    default_provider: String,
}

impl AIProviderManager {
    /// Create a new manager
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
            default_provider: String::new(),
        }
    }
    
    /// Add a provider
    pub fn add_provider(&mut self, name: String, provider: Box<dyn AIProvider>) {
        if self.default_provider.is_empty() {
            self.default_provider = name.clone();
        }
        self.providers.insert(name, provider);
    }
    
    /// Set default provider
    pub fn set_default(&mut self, name: String) -> Result<()> {
        if self.providers.contains_key(&name) {
            self.default_provider = name;
            Ok(())
        } else {
            Err(Error::NotFound(format!("Provider '{}' not found", name)))
        }
    }
    
    /// Get a provider by name
    pub fn get(&self, name: &str) -> Result<&dyn AIProvider> {
        self.providers
            .get(name)
            .map(|p| p.as_ref())
            .ok_or_else(|| Error::NotFound(format!("Provider '{}' not found", name)))
    }
    
    /// Get the default provider
    pub fn default(&self) -> Result<&dyn AIProvider> {
        self.get(&self.default_provider)
    }
    
    /// Complete using the default provider
    pub async fn complete(&self, input: AIInput) -> Result<AIOutput> {
        self.default()?.complete(input).await
    }
    
    /// Complete using a specific provider
    pub async fn complete_with(&self, provider: &str, input: AIInput) -> Result<AIOutput> {
        self.get(provider)?.complete(input).await
    }
}