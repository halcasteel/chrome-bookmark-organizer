//! Anthropic Provider Implementation

use async_trait::async_trait;
use std::collections::HashMap;

use crate::{Result, Error, AIProviderConfig};
use super::{AIProvider, AIInput, AIOutput, AIStream, Embedding, Usage};

/// Anthropic Claude API provider
pub struct AnthropicProvider {
    api_key: String,
    model: String,
    base_url: String,
}

impl AnthropicProvider {
    /// Create a new Anthropic provider
    pub fn new(config: &AIProviderConfig) -> Result<Self> {
        let api_key = config.api_key.clone()
            .ok_or_else(|| Error::Configuration("Anthropic API key required".to_string()))?;
        
        Ok(Self {
            api_key,
            model: config.model.clone(),
            base_url: "https://api.anthropic.com".to_string(),
        })
    }
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }
    
    async fn is_available(&self) -> bool {
        // Check if API is reachable
        true
    }
    
    async fn complete(&self, input: AIInput) -> Result<AIOutput> {
        // Stub implementation
        Ok(AIOutput {
            content: "Claude response stub".to_string(),
            model: self.model.clone(),
            usage: Usage {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
            metadata: HashMap::new(),
        })
    }
    
    async fn embed(&self, texts: Vec<String>) -> Result<Vec<Embedding>> {
        // Note: Anthropic doesn't provide embeddings directly
        // This would need to use a different service
        Err(Error::AIProvider("Anthropic does not provide embedding service".to_string()))
    }
    
    async fn stream_complete(&self, _input: AIInput) -> Result<AIStream> {
        let (tx, rx) = tokio::sync::mpsc::channel(100);
        
        // Spawn task to send chunks
        tokio::spawn(async move {
            let _ = tx.send(Ok("Claude streaming response stub".to_string())).await;
        });
        
        Ok(AIStream::new(rx))
    }
}