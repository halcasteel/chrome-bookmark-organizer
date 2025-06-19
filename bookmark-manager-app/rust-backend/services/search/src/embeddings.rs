use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingResponse {
    pub embedding: Vec<f32>,
}

pub struct EmbeddingsService {
    api_key: Option<String>,
    api_url: String,
}

impl EmbeddingsService {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            api_url: "https://api.openai.com/v1/embeddings".to_string(),
        }
    }

    pub fn is_available(&self) -> bool {
        self.api_key.is_some()
    }

    pub async fn generate_embedding(&self, text: &str) -> Result<Vec<f32>> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Embeddings API key not configured"))?;

        let client = reqwest::Client::new();
        
        let request_body = serde_json::json!({
            "input": text,
            "model": "text-embedding-ada-002"
        });

        let response = client
            .post(&self.api_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("Embeddings API error: {}", error_text);
            return Err(anyhow::anyhow!("Failed to generate embedding"));
        }

        let response_json: serde_json::Value = response.json().await?;
        
        let embedding = response_json["data"][0]["embedding"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid embedding response format"))?
            .iter()
            .map(|v| v.as_f64().unwrap_or(0.0) as f32)
            .collect();

        info!("Generated embedding for text of length {}", text.len());
        
        Ok(embedding)
    }

    /// Generate embeddings for multiple texts in a batch
    pub async fn generate_embeddings_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Embeddings API key not configured"))?;

        let client = reqwest::Client::new();
        
        let request_body = serde_json::json!({
            "input": texts,
            "model": "text-embedding-ada-002"
        });

        let response = client
            .post(&self.api_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("Embeddings API error: {}", error_text);
            return Err(anyhow::anyhow!("Failed to generate embeddings"));
        }

        let response_json: serde_json::Value = response.json().await?;
        
        let embeddings = response_json["data"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid embeddings response format"))?
            .iter()
            .map(|item| {
                item["embedding"]
                    .as_array()
                    .ok_or_else(|| anyhow::anyhow!("Invalid embedding format"))
                    .map(|arr| {
                        arr.iter()
                            .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                            .collect()
                    })
            })
            .collect::<Result<Vec<Vec<f32>>>>()?;

        info!("Generated {} embeddings", embeddings.len());
        
        Ok(embeddings)
    }
}

impl Default for EmbeddingsService {
    fn default() -> Self {
        Self::new(None)
    }
}