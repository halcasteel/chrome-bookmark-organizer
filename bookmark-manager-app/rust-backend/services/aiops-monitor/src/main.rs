use actix_web::{web, App, HttpResponse, HttpServer};
use anyhow::Result;
use dotenv::dotenv;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{error, info};

use ai_ops_core::{
    logging_integration::{LogEventAdapter, LogMonitoringAgent, vector_integration::VectorLogStream},
    events::{Event, EventMesh},
    agents::{Agent, foundation::{MonitorAgent, DiagnosticAgent, HealingAgent, LearningAgent}},
    registry::ServiceRegistry,
    knowledge::KnowledgeGraph,
};
use shared::config::Config;

#[actix_web::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv().ok();

    // Initialize unified logging
    shared::logging::init_unified_logging("aiops-monitor")?;

    // Load configuration
    let config = Config::from_env()?;

    info!("Starting AI-Ops Monitor Service");

    // Create database pool
    let db_pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await?;

    // Initialize AI-Ops Core components
    let knowledge_graph = Arc::new(KnowledgeGraph::new(db_pool.clone()).await?);
    let event_mesh = Arc::new(EventMesh::new(&config.redis_url).await?);
    let service_registry = Arc::new(ServiceRegistry::new(db_pool.clone()).await?);

    // Create event channel
    let (event_tx, mut event_rx) = mpsc::channel::<Event>(1000);

    // Initialize log adapter
    let log_adapter = Arc::new(LogEventAdapter::new(db_pool.clone()));

    // Create foundation agents
    let monitor_agent = Arc::new(MonitorAgent::new(
        service_registry.clone(),
        event_tx.clone(),
    ));
    
    let diagnostic_agent = Arc::new(DiagnosticAgent::new(
        knowledge_graph.clone(),
        db_pool.clone(),
    ));
    
    let healing_agent = Arc::new(HealingAgent::new(
        service_registry.clone(),
        knowledge_graph.clone(),
    ));
    
    let learning_agent = Arc::new(LearningAgent::new(
        knowledge_graph.clone(),
        db_pool.clone(),
    ));

    // Create log monitoring agent
    let log_monitor = Arc::new(LogMonitoringAgent::new(
        log_adapter.clone(),
        event_tx.clone(),
    ));

    // Register agents
    service_registry.register_agent(monitor_agent.clone()).await?;
    service_registry.register_agent(diagnostic_agent.clone()).await?;
    service_registry.register_agent(healing_agent.clone()).await?;
    service_registry.register_agent(learning_agent.clone()).await?;
    service_registry.register_agent(log_monitor.clone()).await?;

    // Start Vector log stream processing
    let vector_stream = VectorLogStream::new(log_adapter.clone(), event_tx.clone());
    
    // Spawn Vector stream listeners
    tokio::spawn(async move {
        info!("Starting Vector log stream on port 9500");
        if let Err(e) = vector_stream.start_streaming("127.0.0.1:9500").await {
            error!("Vector stream error: {}", e);
        }
    });

    // Spawn high-priority stream listener
    let priority_stream = VectorLogStream::new(log_adapter.clone(), event_tx.clone());
    tokio::spawn(async move {
        info!("Starting priority log stream on port 9501");
        if let Err(e) = priority_stream.start_streaming("127.0.0.1:9501").await {
            error!("Priority stream error: {}", e);
        }
    });

    // Start log monitoring
    let monitor_clone = log_monitor.clone();
    tokio::spawn(async move {
        info!("Starting log monitoring");
        if let Err(e) = monitor_clone.start_monitoring().await {
            error!("Log monitoring error: {}", e);
        }
    });

    // Event processing loop
    let agents = vec![
        monitor_agent.clone() as Arc<dyn Agent>,
        diagnostic_agent.clone() as Arc<dyn Agent>,
        healing_agent.clone() as Arc<dyn Agent>,
        learning_agent.clone() as Arc<dyn Agent>,
        log_monitor.clone() as Arc<dyn Agent>,
    ];

    let event_mesh_clone = event_mesh.clone();
    let knowledge_graph_clone = knowledge_graph.clone();
    
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            // Publish to event mesh
            if let Err(e) = event_mesh_clone.publish(event.clone()).await {
                error!("Failed to publish event: {}", e);
                continue;
            }

            // Process with relevant agents
            for agent in &agents {
                let agent_context = ai_ops_core::agents::AgentContext {
                    agent_id: agent.id(),
                    knowledge_graph: knowledge_graph_clone.clone(),
                    event_history: vec![], // TODO: Implement event history
                };

                match agent.process_event(event.clone(), agent_context).await {
                    Ok(decision) => {
                        if decision.should_act {
                            info!(
                                "Agent {} decided to act with confidence {}", 
                                agent.name(), 
                                decision.confidence
                            );
                            
                            // Execute recommended actions
                            for action in decision.recommended_actions {
                                let context = ai_ops_core::agents::AgentContext {
                                    agent_id: agent.id(),
                                    knowledge_graph: knowledge_graph_clone.clone(),
                                    event_history: vec![],
                                };
                                
                                if let Err(e) = agent.execute_action(action, context).await {
                                    error!("Action execution failed: {}", e);
                                }
                            }
                        }
                    }
                    Err(e) => {
                        error!("Agent {} failed to process event: {}", agent.name(), e);
                    }
                }
            }
        }
    });

    // Start HTTP server for status and control
    let app_state = web::Data::new(AppState {
        agents: vec![
            monitor_agent as Arc<dyn Agent>,
            diagnostic_agent as Arc<dyn Agent>,
            healing_agent as Arc<dyn Agent>,
            learning_agent as Arc<dyn Agent>,
            log_monitor as Arc<dyn Agent>,
        ],
        knowledge_graph,
        event_mesh,
        service_registry,
    });

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(shared::logging::correlation::CorrelationId)
            .route("/health", web::get().to(health))
            .route("/status", web::get().to(status))
            .route("/agents", web::get().to(list_agents))
            .route("/patterns", web::get().to(get_patterns))
            .route("/errors/recent", web::get().to(recent_errors))
    })
    .bind(("0.0.0.0", 8500))?
    .run()
    .await?;

    Ok(())
}

struct AppState {
    agents: Vec<Arc<dyn Agent>>,
    knowledge_graph: Arc<KnowledgeGraph>,
    event_mesh: Arc<EventMesh>,
    service_registry: Arc<ServiceRegistry>,
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "aiops-monitor",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn status(data: web::Data<AppState>) -> HttpResponse {
    let agent_status: Vec<_> = data.agents.iter().map(|agent| {
        serde_json::json!({
            "id": agent.id(),
            "name": agent.name(),
            "capabilities": agent.capabilities(),
        })
    }).collect();

    HttpResponse::Ok().json(serde_json::json!({
        "agents": agent_status,
        "event_mesh": "connected",
        "knowledge_graph": "connected",
    }))
}

async fn list_agents(data: web::Data<AppState>) -> HttpResponse {
    let agents: Vec<_> = data.agents.iter().map(|agent| {
        serde_json::json!({
            "id": agent.id(),
            "name": agent.name(),
            "capabilities": agent.capabilities(),
        })
    }).collect();

    HttpResponse::Ok().json(agents)
}

async fn get_patterns(data: web::Data<AppState>) -> HttpResponse {
    match data.knowledge_graph.get_patterns(None, 50).await {
        Ok(patterns) => HttpResponse::Ok().json(patterns),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}

async fn recent_errors(data: web::Data<AppState>) -> HttpResponse {
    // Query recent errors from knowledge graph
    match data.knowledge_graph.search_events(
        Some("ERROR".to_string()),
        chrono::Utc::now() - chrono::Duration::hours(1),
        chrono::Utc::now(),
        100,
    ).await {
        Ok(errors) => HttpResponse::Ok().json(errors),
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": e.to_string()
        })),
    }
}