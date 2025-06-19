//! Example integration with the bookmark manager application
//! 
//! This demonstrates how to use AI-Ops Core to monitor and manage
//! the bookmark manager services autonomously.

use ai_ops_core::*;
use std::time::Duration;
use tokio::time::interval;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();
    
    tracing::info!("🚀 Starting Bookmark Manager AI-Ops Integration");
    
    // Initialize core components
    let kg = knowledge::KnowledgeGraph::new(
        "postgres://admin:admin@localhost:5434/bookmark_manager"
    ).await?;
    
    let mesh = events::EventMesh::new("redis://localhost:6382").await?;
    
    let registry = registry::ServiceRegistry::new(
        "postgres://admin:admin@localhost:5434/bookmark_manager",
        "redis://localhost:6382"
    ).await?;
    
    // Seed knowledge with common bookmark problems
    seed_bookmark_knowledge(&kg).await?;
    
    // Register bookmark services
    register_bookmark_services(&registry).await?;
    
    // Create bookmark-specific monitor
    let monitor = BookmarkMonitor::new(mesh.clone(), kg.clone());
    
    // Start monitoring
    tokio::spawn(async move {
        monitor.run().await;
    });
    
    // Simulate bookmark events
    simulate_bookmark_events(&mesh).await?;
    
    // Keep running
    tokio::signal::ctrl_c().await?;
    tracing::info!("Shutting down AI-Ops integration");
    
    Ok(())
}

/// Seed the knowledge graph with common bookmark problems and solutions
async fn seed_bookmark_knowledge(kg: &knowledge::KnowledgeGraph) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("📚 Seeding bookmark knowledge...");
    
    // Problem: Import timeout
    let import_timeout = knowledge::Problem {
        fingerprint: "bookmark-import-timeout".to_string(),
        category: "import".to_string(),
        description: "Bookmark import operation times out with large files".to_string(),
        error_patterns: vec![
            "timeout".to_string(),
            "operation timed out".to_string(),
            "import failed".to_string(),
        ],
        context: std::collections::HashMap::from([
            ("service".to_string(), serde_json::json!("import-service")),
            ("typical_file_size".to_string(), serde_json::json!("10MB+")),
        ]),
        severity: knowledge::Severity::High,
        occurrence_count: 1,
        first_seen: chrono::Utc::now(),
        last_seen: chrono::Utc::now(),
    };
    
    let timeout_problem_id = kg.add_problem(import_timeout).await?;
    
    // Solution: Batch processing
    let batch_solution = knowledge::Solution {
        description: "Process imports in smaller batches to avoid timeouts".to_string(),
        actions: vec![
            knowledge::Action {
                action_type: "configure".to_string(),
                target: Some("import-service".to_string()),
                parameters: std::collections::HashMap::from([
                    ("batch_size".to_string(), serde_json::json!(100)),
                    ("batch_delay_ms".to_string(), serde_json::json!(500)),
                ]),
                order: 1,
            },
        ],
        prerequisites: vec!["import service access".to_string()],
        side_effects: vec!["import will take longer but be more reliable".to_string()],
        success_rate: 0.95,
        attempt_count: 20,
        success_count: 19,
        avg_resolution_time: Some(Duration::from_secs(60)),
    };
    
    kg.add_solution(batch_solution, timeout_problem_id).await?;
    
    // Problem: Duplicate bookmarks
    let duplicate_problem = knowledge::Problem {
        fingerprint: "bookmark-duplicates".to_string(),
        category: "data-integrity".to_string(),
        description: "Duplicate bookmarks created during import".to_string(),
        error_patterns: vec![
            "duplicate key".to_string(),
            "constraint violation".to_string(),
        ],
        context: std::collections::HashMap::from([
            ("service".to_string(), serde_json::json!("bookmarks-service")),
        ]),
        severity: knowledge::Severity::Medium,
        occurrence_count: 1,
        first_seen: chrono::Utc::now(),
        last_seen: chrono::Utc::now(),
    };
    
    let dup_problem_id = kg.add_problem(duplicate_problem).await?;
    
    // Solution: Deduplication
    let dedup_solution = knowledge::Solution {
        description: "Enable deduplication by URL during import".to_string(),
        actions: vec![
            knowledge::Action {
                action_type: "enable_feature".to_string(),
                target: Some("import-service".to_string()),
                parameters: std::collections::HashMap::from([
                    ("dedup_enabled".to_string(), serde_json::json!(true)),
                    ("dedup_field".to_string(), serde_json::json!("url")),
                ]),
                order: 1,
            },
        ],
        prerequisites: vec![],
        side_effects: vec!["import may skip some bookmarks".to_string()],
        success_rate: 1.0,
        attempt_count: 15,
        success_count: 15,
        avg_resolution_time: Some(Duration::from_secs(5)),
    };
    
    kg.add_solution(dedup_solution, dup_problem_id).await?;
    
    tracing::info!("✅ Knowledge seeding complete");
    Ok(())
}

/// Register bookmark manager services with the registry
async fn register_bookmark_services(registry: &registry::ServiceRegistry) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("📍 Registering bookmark services...");
    
    let services = vec![
        registry::ServiceDefinition {
            id: Uuid::new_v4(),
            name: "bookmarks-service".to_string(),
            service_type: registry::ServiceType::API,
            version: "1.0.0".to_string(),
            endpoint: "http://localhost:8002".to_string(),
            health_check: Some("http://localhost:8002/health".to_string()),
            capabilities: vec!["crud".to_string(), "search".to_string()],
            metadata: std::collections::HashMap::new(),
            tags: vec!["production".to_string(), "rust".to_string()],
        },
        registry::ServiceDefinition {
            id: Uuid::new_v4(),
            name: "import-service".to_string(),
            service_type: registry::ServiceType::Worker,
            version: "1.0.0".to_string(),
            endpoint: "http://localhost:8003".to_string(),
            health_check: Some("http://localhost:8003/health".to_string()),
            capabilities: vec!["import".to_string(), "validation".to_string()],
            metadata: std::collections::HashMap::new(),
            tags: vec!["production".to_string(), "rust".to_string()],
        },
    ];
    
    for service in services {
        registry.register(service).await?;
    }
    
    tracing::info!("✅ Service registration complete");
    Ok(())
}

/// Simulate bookmark-related events
async fn simulate_bookmark_events(mesh: &events::EventMesh) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("📡 Simulating bookmark events...");
    
    // Simulate import started
    mesh.publish(events::Event {
        id: Uuid::new_v4(),
        timestamp: chrono::Utc::now(),
        event_type: events::EventType::Custom("ImportStarted".to_string()),
        source: Uuid::new_v4(),
        payload: serde_json::json!({
            "user_id": "user123",
            "source": "chrome",
            "file_size": 15_000_000, // 15MB
            "bookmark_count": 5000
        }),
        correlation_id: Some(Uuid::new_v4()),
        causation_id: None,
        metadata: std::collections::HashMap::new(),
    }).await?;
    
    // Wait a bit
    tokio::time::sleep(Duration::from_secs(2)).await;
    
    // Simulate import timeout
    mesh.publish(events::Event {
        id: Uuid::new_v4(),
        timestamp: chrono::Utc::now(),
        event_type: events::EventType::ServiceFailed,
        source: Uuid::new_v4(),
        payload: serde_json::json!({
            "service": "import-service",
            "error": "Operation timed out after 30s",
            "context": {
                "file_size": 15_000_000,
                "processed": 2500,
                "remaining": 2500
            }
        }),
        correlation_id: Some(Uuid::new_v4()),
        causation_id: None,
        metadata: std::collections::HashMap::new(),
    }).await?;
    
    tracing::info!("✅ Event simulation complete");
    Ok(())
}

/// Custom bookmark monitor agent
struct BookmarkMonitor {
    mesh: events::EventMesh,
    kg: knowledge::KnowledgeGraph,
}

impl BookmarkMonitor {
    fn new(mesh: events::EventMesh, kg: knowledge::KnowledgeGraph) -> Self {
        Self { mesh, kg }
    }
    
    async fn run(&self) {
        let mut ticker = interval(Duration::from_secs(5));
        
        loop {
            ticker.tick().await;
            
            // Check for recent failures
            if let Ok(events) = self.mesh.get_events(
                Some(events::EventFilter {
                    event_types: Some(vec![events::EventType::ServiceFailed]),
                    time_range: Some((
                        chrono::Utc::now() - chrono::Duration::seconds(10),
                        chrono::Utc::now()
                    )),
                    ..Default::default()
                }),
                10
            ).await {
                for event in events {
                    self.handle_failure(event).await;
                }
            }
        }
    }
    
    async fn handle_failure(&self, event: events::Event) {
        tracing::warn!("🚨 Detected failure: {:?}", event.payload);
        
        // Extract error description
        let error_desc = event.payload.get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("Unknown error");
        
        // Find solutions
        match self.kg.find_solutions(error_desc).await {
            Ok(solutions) if !solutions.is_empty() => {
                tracing::info!("💡 Found {} potential solutions", solutions.len());
                
                for (i, candidate) in solutions.iter().enumerate() {
                    tracing::info!(
                        "  {}. {} (confidence: {:.2})",
                        i + 1,
                        candidate.solution.description,
                        candidate.confidence
                    );
                    
                    // In a real system, we would execute the solution here
                    if candidate.confidence > 0.8 {
                        tracing::info!("🔧 Would apply solution: {}", candidate.solution.description);
                        
                        // Publish solution applied event
                        let _ = self.mesh.publish(events::Event {
                            id: Uuid::new_v4(),
                            timestamp: chrono::Utc::now(),
                            event_type: events::EventType::Custom("SolutionApplied".to_string()),
                            source: Uuid::new_v4(),
                            payload: serde_json::json!({
                                "problem_id": event.id,
                                "solution": candidate.solution.description,
                                "confidence": candidate.confidence
                            }),
                            correlation_id: event.correlation_id,
                            causation_id: Some(event.id),
                            metadata: std::collections::HashMap::new(),
                        }).await;
                    }
                }
            }
            Ok(_) => {
                tracing::info!("❓ No solutions found for: {}", error_desc);
                // Record as new problem for learning
            }
            Err(e) => {
                tracing::error!("Failed to find solutions: {}", e);
            }
        }
    }
}