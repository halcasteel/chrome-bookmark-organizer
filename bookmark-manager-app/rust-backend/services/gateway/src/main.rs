use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpResponse, HttpServer};
use anyhow::Result;
use dotenv::dotenv;
use serde_json::json;
use std::collections::HashMap;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod proxy;
mod static_files;

#[derive(Clone)]
struct ServiceConfig {
    url: String,
    health_path: String,
}

#[derive(Clone)]
struct AppState {
    services: HashMap<String, ServiceConfig>,
    client: reqwest::Client,
}

#[actix_web::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv().ok();

    // Initialize tracing
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let host = std::env::var("GATEWAY_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("GATEWAY_PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()?;

    info!("Starting API Gateway on {}:{}", host, port);

    // Configure services
    let mut services = HashMap::new();

    // Auth service
    services.insert(
        "auth".to_string(),
        ServiceConfig {
            url: std::env::var("AUTH_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8001".to_string()),
            health_path: "/health".to_string(),
        },
    );

    // Bookmarks service
    services.insert(
        "bookmarks".to_string(),
        ServiceConfig {
            url: std::env::var("BOOKMARKS_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8002".to_string()),
            health_path: "/health".to_string(),
        },
    );

    // Import service
    services.insert(
        "import".to_string(),
        ServiceConfig {
            url: std::env::var("IMPORT_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8003".to_string()),
            health_path: "/health".to_string(),
        },
    );

    // Search service
    services.insert(
        "search".to_string(),
        ServiceConfig {
            url: std::env::var("SEARCH_SERVICE_URL")
                .unwrap_or_else(|_| "http://localhost:8004".to_string()),
            health_path: "/health".to_string(),
        },
    );

    // Create HTTP client for proxying
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let state = web::Data::new(AppState { services, client });

    // Start server
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(state.clone())
            .wrap(cors)
            .wrap(Logger::default())
            .wrap(tracing_actix_web::TracingLogger::default())
            // Health check
            .route("/health", web::get().to(health_check))
            // API routes
            .service(web::scope("/api").route(
                "/{service}/{tail:.*}",
                web::route().to(proxy::proxy_request),
            ))
            // Static files (frontend)
            .default_service(web::route().to(static_files::serve_frontend))
    })
    .bind((host, port))?
    .run()
    .await?;

    Ok(())
}

async fn health_check(state: web::Data<AppState>) -> HttpResponse {
    let mut service_health = HashMap::new();

    for (name, config) in &state.services {
        let health_url = format!("{}{}", config.url, config.health_path);
        let is_healthy = match state.client.get(&health_url).send().await {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        };

        service_health.insert(name.clone(), is_healthy);
    }

    let all_healthy = service_health.values().all(|&h| h);

    let response = json!({
        "status": if all_healthy { "healthy" } else { "degraded" },
        "service": "gateway",
        "version": env!("CARGO_PKG_VERSION"),
        "services": service_health,
    });

    if all_healthy {
        HttpResponse::Ok().json(response)
    } else {
        HttpResponse::ServiceUnavailable().json(response)
    }
}
