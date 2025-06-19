use anyhow::Result;
use std::sync::Arc;
use tokio;
use tracing::info;
use tracing_subscriber;

use a2a::{TaskManager, task::CreateTaskRequest};
use import_agent::ImportAgent;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("info")
        .init();
    
    info!("Starting A2A Import Test");
    
    // Configuration
    let database_url = "postgresql://admin:admin@localhost:5434/bookmark_manager";
    let redis_url = "redis://localhost:6382";
    
    // Create task manager
    let task_manager = Arc::new(TaskManager::new(redis_url, database_url)?);
    task_manager.initialize().await?;
    
    // Create and register import agent
    let import_agent = Arc::new(ImportAgent::new(database_url).await?);
    task_manager.register_agent(import_agent).await?;
    
    info!("Task manager initialized with import agent");
    
    // Sample bookmark HTML content
    let sample_bookmarks = r#"
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>

<DL><p>
    <DT><H3 ADD_DATE="1709745833" LAST_MODIFIED="1709745833">Development</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1709745833" ICON="data:image/png;base64,iVBORw0KGgo=">GitHub</A>
        <DD>Where software is built
        <DT><A HREF="https://docs.rust-lang.org" ADD_DATE="1709745833">Rust Documentation</A>
        <DT><A HREF="https://doc.rust-lang.org/book/" ADD_DATE="1709745833" TAGS="rust,tutorial">The Rust Programming Language Book</A>
    </DL><p>
    
    <DT><H3 ADD_DATE="1709745833" LAST_MODIFIED="1709745833">AI & Machine Learning</H3>
    <DL><p>
        <DT><A HREF="https://openai.com" ADD_DATE="1709745833">OpenAI</A>
        <DD>Creating safe AGI that benefits all of humanity
        <DT><A HREF="https://www.anthropic.com" ADD_DATE="1709745833" ICON="data:image/png;base64,iVBORw0KGgo=">Anthropic</A>
        <DD>AI safety company
        <DT><A HREF="https://huggingface.co" ADD_DATE="1709745833" TAGS="ai,ml,models">Hugging Face</A>
    </DL><p>
    
    <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1709745833">Hacker News</A>
    <DD>Social news website focusing on computer science and entrepreneurship
</DL><p>
    "#;
    
    // Create import task
    let request = CreateTaskRequest {
        workflow_type: "import_only".to_string(),
        context: serde_json::json!({
            "file_content": sample_bookmarks,
            "file_name": "test_bookmarks.html",
            "user_id": "550e8400-e29b-41d4-a716-446655440000" // Test user ID
        }),
        options: None,
    };
    
    let response = task_manager.create_task(request).await?;
    info!("Created task: {} (status: {:?})", response.id, response.status);
    
    // Start task processor (in production this would run as a separate service)
    let processor = Arc::clone(&task_manager);
    tokio::spawn(async move {
        processor.start_processor().await;
    });
    
    // Wait a bit for processing
    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    
    // Check task status
    let task = task_manager.get_task(&response.id).await?;
    info!("Task status: {:?}", task.status);
    info!("Task progress: {}%", task.progress_percentage());
    info!("Artifacts created: {}", task.artifacts.len());
    
    if !task.artifacts.is_empty() {
        info!("First artifact: {:?}", task.artifacts[0]);
    }
    
    if !task.messages.is_empty() {
        info!("Messages:");
        for msg in &task.messages {
            info!("  [{}] {}", msg.message_type, msg.content);
        }
    }
    
    info!("Test completed");
    Ok(())
}