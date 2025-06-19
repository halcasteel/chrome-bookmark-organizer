//! Basic usage example for AI-Ops Core
//! 
//! This example demonstrates how to:
//! 1. Create a knowledge graph
//! 2. Set up an event mesh
//! 3. Create and register agents
//! 4. Process events and learn from experiences

use ai_ops_core::*;
use uuid::Uuid;
use std::time::Duration;
use std::collections::HashMap;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    tracing_subscriber::fmt::init();
    
    println!("🚀 AI-Ops Core Example - Starting...\n");
    
    // 1. Create Knowledge Graph
    println!("📊 Creating Knowledge Graph...");
    let kg = knowledge::KnowledgeGraph::new(
        "postgres://admin:admin@localhost:5434/bookmark_manager"
    ).await?;
    
    // 2. Create Event Mesh
    println!("🔗 Creating Event Mesh...");
    let mesh = events::EventMesh::new("redis://localhost:6382").await?;
    
    // 3. Create Service Registry
    println!("📍 Creating Service Registry...");
    let registry = registry::ServiceRegistry::new(
        "postgres://admin:admin@localhost:5434/bookmark_manager",
        "redis://localhost:6382"
    ).await?;
    
    // 4. Register a problem and solution in the knowledge graph
    println!("\n🧠 Adding knowledge to the graph...");
    
    // Add a common problem
    let problem = knowledge::Problem {
        fingerprint: "slow-response-001".to_string(),
        category: "performance".to_string(),
        description: "Service responding slowly to HTTP requests".to_string(),
        error_patterns: vec![
            "timeout".to_string(),
            "slow response".to_string(),
            "high latency".to_string(),
        ],
        context: HashMap::from([
            ("service".to_string(), serde_json::json!("api-gateway")),
            ("avg_response_time".to_string(), serde_json::json!(5000)),
        ]),
        severity: knowledge::Severity::High,
        occurrence_count: 1,
        first_seen: chrono::Utc::now(),
        last_seen: chrono::Utc::now(),
    };
    
    let problem_id = kg.add_problem(problem).await?;
    println!("✅ Added problem: {}", problem_id);
    
    // Add a solution
    let solution = knowledge::Solution {
        description: "Scale up service instances and optimize database queries".to_string(),
        actions: vec![
            knowledge::Action {
                action_type: "scale".to_string(),
                target: Some("api-gateway".to_string()),
                parameters: HashMap::from([
                    ("replicas".to_string(), serde_json::json!(5)),
                ]),
                order: 1,
            },
            knowledge::Action {
                action_type: "optimize".to_string(),
                target: Some("database".to_string()),
                parameters: HashMap::from([
                    ("index".to_string(), serde_json::json!("user_id")),
                ]),
                order: 2,
            },
        ],
        prerequisites: vec!["kubernetes access".to_string()],
        side_effects: vec!["increased resource usage".to_string()],
        success_rate: 0.9,
        attempt_count: 10,
        success_count: 9,
        avg_resolution_time: Some(Duration::from_secs(180)),
    };
    
    let solution_id = kg.add_solution(solution, problem_id).await?;
    println!("✅ Added solution: {}", solution_id);
    
    // 5. Publish and subscribe to events
    println!("\n📡 Setting up event processing...");
    
    // Create a test event
    let event = events::Event {
        id: Uuid::new_v4(),
        timestamp: chrono::Utc::now(),
        event_type: events::EventType::ServiceFailed,
        source: Uuid::new_v4(),
        payload: serde_json::json!({
            "service": "api-gateway",
            "error": "Response time exceeded 5s threshold",
            "metrics": {
                "response_time": 5200,
                "error_rate": 0.15,
                "cpu_usage": 85
            }
        }),
        correlation_id: Some(Uuid::new_v4()),
        causation_id: None,
        metadata: HashMap::new(),
    };
    
    // Publish the event
    mesh.publish(event.clone()).await?;
    println!("✅ Published event: {:?}", event.event_type);
    
    // 6. Query for solutions
    println!("\n🔍 Finding solutions for performance issues...");
    let solutions = kg.find_solutions("Service experiencing slow response times").await?;
    
    println!("Found {} potential solutions:", solutions.len());
    for (i, candidate) in solutions.iter().enumerate() {
        println!("  {}. {} (confidence: {:.2})", 
            i + 1, 
            candidate.solution.description,
            candidate.confidence
        );
    }
    
    // 7. Create and test a pattern
    println!("\n🎯 Creating detection pattern...");
    let pattern = knowledge::Pattern {
        pattern_type: knowledge::PatternType::Performance,
        description: "High latency pattern".to_string(),
        matching_rules: vec![
            knowledge::MatchingRule {
                field: "metrics.response_time".to_string(),
                operator: knowledge::MatchOperator::GreaterThan,
                value: serde_json::json!(3000),
            },
            knowledge::MatchingRule {
                field: "service".to_string(),
                operator: knowledge::MatchOperator::Equals,
                value: serde_json::json!("api-gateway"),
            },
        ],
        confidence: 0.95,
        occurrences: 1,
        last_updated: chrono::Utc::now(),
    };
    
    let pattern_id = kg.add_pattern(pattern).await?;
    println!("✅ Added pattern: {}", pattern_id);
    
    // 8. Register a test service
    println!("\n📝 Registering service...");
    let service = registry::ServiceDefinition {
        id: Uuid::new_v4(),
        name: "performance-monitor".to_string(),
        service_type: registry::ServiceType::Agent,
        version: "1.0.0".to_string(),
        endpoint: "http://localhost:9001".to_string(),
        health_check: Some("http://localhost:9001/health".to_string()),
        capabilities: vec![
            "monitoring".to_string(),
            "alerting".to_string(),
            "auto-scaling".to_string(),
        ],
        metadata: HashMap::new(),
        tags: vec!["production".to_string(), "critical".to_string()],
    };
    
    registry.register(service.clone()).await?;
    println!("✅ Registered service: {}", service.name);
    
    // 9. Discover services
    println!("\n🔎 Discovering services with monitoring capability...");
    let filter = registry::ServiceFilter {
        service_type: Some(registry::ServiceType::Agent),
        capabilities: Some(vec!["monitoring".to_string()]),
        tags: None,
        healthy_only: false,
    };
    
    let services = registry.discover(filter).await?;
    println!("Found {} services:", services.len());
    for svc in services {
        println!("  - {} ({})", svc.name, svc.endpoint);
    }
    
    // 10. Get event statistics
    println!("\n📈 Event statistics:");
    let stats = mesh.get_events(None, 100).await?;
    println!("  Total events: {}", stats.len());
    
    println!("\n✨ AI-Ops Core example completed successfully!");
    
    Ok(())
}

// Example: Custom event processor
struct PerformanceMonitor;

impl PerformanceMonitor {
    async fn process_event(&self, event: &events::Event) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(response_time) = event.payload.get("metrics")
            .and_then(|m| m.get("response_time"))
            .and_then(|rt| rt.as_u64()) 
        {
            if response_time > 3000 {
                println!("⚠️  High response time detected: {}ms", response_time);
                // Here you would trigger auto-scaling or other remediation
            }
        }
        Ok(())
    }
}