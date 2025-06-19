use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A2A Artifact - Immutable data produced by agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub id: String,
    #[serde(rename = "type")]
    pub artifact_type: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub data: serde_json::Value,
    pub created: DateTime<Utc>,
    pub immutable: bool,
    pub metadata: Option<serde_json::Value>,
}

impl Artifact {
    /// Create a new artifact
    pub fn new(artifact_type: &str, mime_type: &str, data: serde_json::Value) -> Self {
        Self {
            id: format!("artifact_{}", Uuid::new_v4()),
            artifact_type: artifact_type.to_string(),
            mime_type: mime_type.to_string(),
            data,
            created: Utc::now(),
            immutable: true,
            metadata: None,
        }
    }
    
    /// Create a bookmark list artifact
    pub fn bookmark_list(bookmark_ids: Vec<String>, total_count: usize) -> Self {
        Self::new(
            "bookmark_list",
            "application/json",
            serde_json::json!({
                "bookmarkIds": bookmark_ids,
                "totalBookmarks": total_count,
            }),
        )
    }
    
    /// Create a validation report artifact
    pub fn validation_report(results: Vec<ValidationResult>) -> Self {
        Self::new(
            "validation_report",
            "application/json",
            serde_json::json!({
                "results": results,
                "summary": {
                    "total": results.len(),
                    "valid": results.iter().filter(|r| r.is_valid).count(),
                    "invalid": results.iter().filter(|r| !r.is_valid).count(),
                }
            }),
        )
    }
    
    /// Create an enrichment report artifact
    pub fn enrichment_report(enriched_count: usize, metadata_extracted: Vec<String>) -> Self {
        Self::new(
            "enrichment_report",
            "application/json",
            serde_json::json!({
                "enrichedCount": enriched_count,
                "metadataExtracted": metadata_extracted,
            }),
        )
    }
}

/// A2A Message - Communication between agents and task manager
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    #[serde(rename = "type")]
    pub message_type: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub metadata: Option<serde_json::Value>,
}

impl Message {
    /// Create a new message
    pub fn new(message_type: &str, content: &str) -> Self {
        Self {
            id: format!("msg_{}", Uuid::new_v4()),
            message_type: message_type.to_string(),
            content: content.to_string(),
            timestamp: Utc::now(),
            metadata: None,
        }
    }
    
    /// Create a progress message
    pub fn progress(current: usize, total: usize, description: &str) -> Self {
        let mut msg = Self::new("progress", description);
        msg.metadata = Some(serde_json::json!({
            "current": current,
            "total": total,
            "percentage": (current as f64 / total as f64 * 100.0) as u8,
        }));
        msg
    }
    
    /// Create an info message
    pub fn info(content: &str) -> Self {
        Self::new("info", content)
    }
    
    /// Create an error message
    pub fn error(content: &str) -> Self {
        Self::new("error", content)
    }
    
    /// Create a warning message
    pub fn warning(content: &str) -> Self {
        Self::new("warning", content)
    }
}

/// Validation result for validation artifacts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub bookmark_id: String,
    pub url: String,
    pub is_valid: bool,
    pub status_code: Option<u16>,
    pub error: Option<String>,
    pub redirect_url: Option<String>,
}