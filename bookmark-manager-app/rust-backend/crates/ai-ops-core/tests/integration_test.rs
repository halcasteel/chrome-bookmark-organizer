//! Integration tests for AI-Ops Core

use ai_ops_core::*;
use uuid::Uuid;
use std::time::Duration;
use tokio::time::sleep;

#[tokio::test]
async fn test_knowledge_graph_basic_operations() {
    // Create knowledge graph with test database
    let db_url = "postgres://admin:admin@localhost:5434/bookmark_manager_test";
    let kg = KnowledgeGraph::new(db_url).await.unwrap();
    
    // Create a problem
    let problem = knowledge::Problem {
        fingerprint: "test-problem-001".to_string(),
        category: "performance".to_string(),
        description: "High memory usage in service".to_string(),
        error_patterns: vec!["OOM".to_string(), "memory exhausted".to_string()],
        context: std::collections::HashMap::new(),
        severity: knowledge::Severity::High,
        occurrence_count: 1,
        first_seen: chrono::Utc::now(),
        last_seen: chrono::Utc::now(),
    };
    
    let problem_id = kg.add_problem(problem.clone()).await.unwrap();
    assert_ne!(problem_id, Uuid::nil());
    
    // Create a solution
    let solution = knowledge::Solution {
        description: "Increase memory limit and optimize caching".to_string(),
        actions: vec![
            knowledge::Action {
                action_type: "configure".to_string(),
                target: Some("service.yaml".to_string()),
                parameters: std::collections::HashMap::new(),
                order: 1,
            }
        ],
        prerequisites: vec!["kubernetes access".to_string()],
        side_effects: vec!["service restart required".to_string()],
        success_rate: 0.85,
        attempt_count: 10,
        success_count: 8,
        avg_resolution_time: Some(Duration::from_secs(300)),
    };
    
    let solution_id = kg.add_solution(solution, problem_id).await.unwrap();
    assert_ne!(solution_id, Uuid::nil());
    
    // Find solutions for similar problem
    let candidates = kg.find_solutions("Service experiencing memory issues").await.unwrap();
    assert!(!candidates.is_empty());
}

#[tokio::test]
async fn test_event_mesh_pub_sub() {
    let mesh = events::EventMesh::new("redis://localhost:6382").await.unwrap();
    
    // Create test event
    let event = events::Event {
        id: Uuid::new_v4(),
        timestamp: chrono::Utc::now(),
        event_type: events::EventType::ServiceStarted,
        source: Uuid::new_v4(),
        payload: serde_json::json!({
            "service": "test-service",
            "version": "1.0.0"
        }),
        correlation_id: Some(Uuid::new_v4()),
        causation_id: None,
        metadata: std::collections::HashMap::new(),
    };
    
    // Publish event
    mesh.publish(event.clone()).await.unwrap();
    
    // Give time for processing
    sleep(Duration::from_millis(100)).await;
    
    // Query events
    let events = mesh.get_events(None, 10).await.unwrap();
    assert!(!events.is_empty());
}

#[tokio::test]
async fn test_service_registry() {
    let registry = registry::ServiceRegistry::new(
        "postgres://admin:admin@localhost:5434/bookmark_manager_test",
        "redis://localhost:6382"
    ).await.unwrap();
    
    // Register a service
    let service = registry::ServiceDefinition {
        id: Uuid::new_v4(),
        name: "test-service".to_string(),
        service_type: registry::ServiceType::Agent,
        version: "1.0.0".to_string(),
        endpoint: "http://localhost:9000".to_string(),
        health_check: Some("http://localhost:9000/health".to_string()),
        capabilities: vec!["monitoring".to_string(), "alerting".to_string()],
        metadata: std::collections::HashMap::new(),
        tags: vec!["test".to_string()],
    };
    
    registry.register(service.clone()).await.unwrap();
    
    // Discover services
    let filter = registry::ServiceFilter {
        service_type: Some(registry::ServiceType::Agent),
        capabilities: Some(vec!["monitoring".to_string()]),
        tags: Some(vec!["test".to_string()]),
        healthy_only: false,
    };
    
    let services = registry.discover(filter).await.unwrap();
    assert_eq!(services.len(), 1);
    assert_eq!(services[0].name, "test-service");
}

#[tokio::test]
async fn test_pattern_matching() {
    let pattern = knowledge::Pattern {
        pattern_type: knowledge::PatternType::Error,
        description: "Database connection timeout pattern".to_string(),
        matching_rules: vec![
            knowledge::MatchingRule {
                field: "error_type".to_string(),
                operator: knowledge::MatchOperator::Equals,
                value: serde_json::json!("timeout"),
            },
            knowledge::MatchingRule {
                field: "component".to_string(),
                operator: knowledge::MatchOperator::Contains,
                value: serde_json::json!("database"),
            }
        ],
        confidence: 0.9,
        occurrences: 5,
        last_updated: chrono::Utc::now(),
    };
    
    let matcher = knowledge::PatternMatcher::new();
    matcher.register_pattern(pattern.clone()).await;
    
    // Create test event
    let event = events::Event {
        id: Uuid::new_v4(),
        timestamp: chrono::Utc::now(),
        event_type: events::EventType::ServiceFailed,
        source: Uuid::new_v4(),
        payload: serde_json::json!({
            "error_type": "timeout",
            "component": "database-connector",
            "message": "Connection timeout after 30s"
        }),
        correlation_id: None,
        causation_id: None,
        metadata: std::collections::HashMap::new(),
    };
    
    let matches = matcher.match_event(&event).await;
    assert!(!matches.is_empty());
    assert!(matches[0].1 > 0.8); // High confidence match
}