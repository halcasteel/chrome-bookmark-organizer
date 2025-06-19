use anyhow::Result;
use async_trait::async_trait;
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::sync::Arc;
use tracing::{error, info, warn};
use uuid::Uuid;

use a2a::{
    agent::{A2AAgent, AgentCard, BaseAgent},
    artifact::{Artifact, Message},
    task::A2ATask,
};

use crate::parser::{BookmarkParser, RawBookmark};

/// Import agent - parses HTML bookmark files and loads into PostgreSQL
pub struct ImportAgent {
    pool: PgPool,
    base: BaseAgent,
}

impl ImportAgent {
    /// Create new import agent
    pub async fn new(database_url: &str) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;
        
        let base = BaseAgent::new("import", "Parses HTML bookmark files and loads raw data into PostgreSQL")
            .with_input("file_content", "string", true)
            .with_input("file_name", "string", false)
            .with_input("user_id", "string", true)
            .with_output("bookmark_list", "artifact/bookmark_list");
        
        Ok(Self { pool, base })
    }
    
    /// Parse and import bookmarks
    async fn import_bookmarks(&self, content: &str, user_id: &Uuid) -> Result<(Vec<String>, usize)> {
        // Parse HTML content
        let bookmarks = BookmarkParser::parse_html(content)?;
        let total_count = bookmarks.len();
        
        if total_count == 0 {
            warn!("No bookmarks found in HTML content");
            return Ok((vec![], 0));
        }
        
        info!("Parsed {} bookmarks, beginning import", total_count);
        
        // Prepare batch insert
        let mut bookmark_ids = Vec::new();
        let mut tx = self.pool.begin().await?;
        
        // Insert bookmarks in batches of 100
        const BATCH_SIZE: usize = 100;
        for (batch_idx, chunk) in bookmarks.chunks(BATCH_SIZE).enumerate() {
            let batch_start = batch_idx * BATCH_SIZE;
            info!("Importing batch {} ({}-{})", batch_idx + 1, batch_start, batch_start + chunk.len());
            
            for (idx, bookmark) in chunk.iter().enumerate() {
                let bookmark_id = self.insert_bookmark(&mut tx, bookmark, user_id).await?;
                bookmark_ids.push(bookmark_id);
                
                // Log progress every 10 bookmarks
                if (batch_start + idx + 1) % 10 == 0 {
                    info!("Imported {}/{} bookmarks", batch_start + idx + 1, total_count);
                }
            }
        }
        
        // Commit transaction
        tx.commit().await?;
        
        info!("Successfully imported {} bookmarks", bookmark_ids.len());
        Ok((bookmark_ids, total_count))
    }
    
    /// Insert single bookmark
    async fn insert_bookmark(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        bookmark: &RawBookmark,
        user_id: &Uuid,
    ) -> Result<String> {
        // Skip invalid URLs
        if !bookmark.is_valid_url() {
            warn!("Skipping invalid URL: {}", bookmark.url);
            return Ok(String::new());
        }
        
        let bookmark_id = Uuid::new_v4();
        
        // Insert bookmark
        let query = r#"
            INSERT INTO bookmarks (
                id, user_id, url, title, description, 
                hash, status, created_at, updated_at,
                add_date, last_modified, icon
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (user_id, hash) DO UPDATE SET
                title = EXCLUDED.title,
                description = COALESCE(EXCLUDED.description, bookmarks.description),
                updated_at = EXCLUDED.updated_at,
                add_date = COALESCE(EXCLUDED.add_date, bookmarks.add_date),
                last_modified = COALESCE(EXCLUDED.last_modified, bookmarks.last_modified),
                icon = COALESCE(EXCLUDED.icon, bookmarks.icon)
            RETURNING id
        "#;
        
        let row = sqlx::query_as::<_, (Uuid,)>(query)
            .bind(&bookmark_id)
            .bind(user_id)
            .bind(&bookmark.url)
            .bind(&bookmark.title)
            .bind(&bookmark.description)
            .bind(&bookmark.hash)
            .bind("pending") // Initial status
            .bind(chrono::Utc::now())
            .bind(chrono::Utc::now())
            .bind(&bookmark.add_date)
            .bind(&bookmark.last_modified)
            .bind(&bookmark.icon)
            .fetch_one(&mut **tx)
            .await?;
        
        let final_id = row.0;
        
        // Insert tags if any
        if !bookmark.tags.is_empty() {
            for tag in &bookmark.tags {
                let tag_query = r#"
                    INSERT INTO bookmark_tags (bookmark_id, tag)
                    VALUES ($1, $2)
                    ON CONFLICT (bookmark_id, tag) DO NOTHING
                "#;
                
                sqlx::query(tag_query)
                    .bind(&final_id)
                    .bind(tag)
                    .execute(&mut **tx)
                    .await?;
            }
        }
        
        // Insert folder path if any
        if !bookmark.folder_path.is_empty() {
            let folder_path = bookmark.folder_path.join("/");
            let folder_query = r#"
                INSERT INTO bookmark_folders (bookmark_id, folder_path)
                VALUES ($1, $2)
                ON CONFLICT (bookmark_id) DO UPDATE SET
                    folder_path = EXCLUDED.folder_path
            "#;
            
            sqlx::query(folder_query)
                .bind(&final_id)
                .bind(&folder_path)
                .execute(&mut **tx)
                .await?;
        }
        
        Ok(final_id.to_string())
    }
}

#[async_trait]
impl A2AAgent for ImportAgent {
    fn get_agent_card(&self) -> AgentCard {
        self.base.build_agent_card("http://localhost:8010")
    }
    
    fn agent_type(&self) -> &str {
        &self.base.agent_type
    }
    
    async fn execute_task(&self, task: &A2ATask) -> Result<Vec<Artifact>> {
        info!("Import agent executing task: {}", task.id);
        
        // Extract inputs from context
        let file_content = task.context.get("file_content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing file_content in task context"))?;
        
        let user_id_str = task.context.get("user_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("Missing user_id in task context"))?;
        
        let user_id = Uuid::parse_str(user_id_str)?;
        
        // Log file info
        if let Some(file_name) = task.context.get("file_name").and_then(|v| v.as_str()) {
            info!("Processing file: {}", file_name);
        }
        
        // Import bookmarks
        match self.import_bookmarks(file_content, &user_id).await {
            Ok((bookmark_ids, total_count)) => {
                info!("Import completed: {} bookmarks", total_count);
                
                // Create artifact with results
                let artifact = Artifact::bookmark_list(bookmark_ids, total_count);
                
                Ok(vec![artifact])
            }
            Err(e) => {
                error!("Import failed: {}", e);
                Err(e)
            }
        }
    }
    
    fn supports_streaming(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_import_agent_creation() {
        // This would use a test database in real tests
        let database_url = "postgresql://admin:admin@localhost:5434/test_bookmarks";
        
        // Try to create agent (will fail if DB not available)
        match ImportAgent::new(database_url).await {
            Ok(agent) => {
                let card = agent.get_agent_card();
                assert_eq!(card.name, "import");
                assert_eq!(agent.agent_type(), "import");
                assert!(agent.supports_streaming());
            }
            Err(_) => {
                // Skip test if database not available
                println!("Skipping test - database not available");
            }
        }
    }
}