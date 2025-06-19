//! Embedding-specific utilities and providers

use crate::{Result, Error};
use super::Embedding;

/// Embedding model types
#[derive(Debug, Clone, Copy)]
pub enum EmbeddingModel {
    OpenAIAda002,
    OpenAI3Small,
    OpenAI3Large,
    SentenceTransformers,
    Custom,
}

impl EmbeddingModel {
    /// Get the dimension size for this model
    pub fn dimensions(&self) -> usize {
        match self {
            Self::OpenAIAda002 => 1536,
            Self::OpenAI3Small => 1536,
            Self::OpenAI3Large => 3072,
            Self::SentenceTransformers => 384,
            Self::Custom => 768, // Default
        }
    }
}

/// Embedding similarity calculator
pub struct EmbeddingSimilarity;

impl EmbeddingSimilarity {
    /// Calculate cosine similarity between two embeddings
    pub fn cosine(a: &Embedding, b: &Embedding) -> f32 {
        a.cosine_similarity(b)
    }
    
    /// Calculate Euclidean distance between two embeddings
    pub fn euclidean_distance(a: &Embedding, b: &Embedding) -> f32 {
        if a.dimensions != b.dimensions {
            return f32::MAX;
        }
        
        let sum: f32 = a.vector.iter()
            .zip(b.vector.iter())
            .map(|(x, y)| (x - y).powi(2))
            .sum();
        
        sum.sqrt()
    }
    
    /// Calculate Manhattan distance between two embeddings
    pub fn manhattan_distance(a: &Embedding, b: &Embedding) -> f32 {
        if a.dimensions != b.dimensions {
            return f32::MAX;
        }
        
        a.vector.iter()
            .zip(b.vector.iter())
            .map(|(x, y)| (x - y).abs())
            .sum()
    }
}

/// Embedding cache for performance optimization
pub struct EmbeddingCache {
    cache: std::collections::HashMap<String, Embedding>,
    max_size: usize,
}

impl EmbeddingCache {
    /// Create a new embedding cache
    pub fn new(max_size: usize) -> Self {
        Self {
            cache: std::collections::HashMap::new(),
            max_size,
        }
    }
    
    /// Get an embedding from cache
    pub fn get(&self, text: &str) -> Option<&Embedding> {
        self.cache.get(text)
    }
    
    /// Store an embedding in cache
    pub fn insert(&mut self, text: String, embedding: Embedding) {
        if self.cache.len() >= self.max_size {
            // Simple eviction - remove first item
            if let Some(key) = self.cache.keys().next().cloned() {
                self.cache.remove(&key);
            }
        }
        self.cache.insert(text, embedding);
    }
    
    /// Clear the cache
    pub fn clear(&mut self) {
        self.cache.clear();
    }
}

/// Batch embedding processor
pub struct BatchEmbedder {
    batch_size: usize,
}

impl BatchEmbedder {
    /// Create a new batch embedder
    pub fn new(batch_size: usize) -> Self {
        Self { batch_size }
    }
    
    /// Process texts in batches
    pub async fn process_batch<F>(
        &self,
        texts: Vec<String>,
        embed_fn: F,
    ) -> Result<Vec<Embedding>>
    where
        F: Fn(Vec<String>) -> futures::future::BoxFuture<'static, Result<Vec<Embedding>>>,
    {
        let mut all_embeddings = Vec::new();
        
        for chunk in texts.chunks(self.batch_size) {
            let batch_embeddings = embed_fn(chunk.to_vec()).await?;
            all_embeddings.extend(batch_embeddings);
        }
        
        Ok(all_embeddings)
    }
}