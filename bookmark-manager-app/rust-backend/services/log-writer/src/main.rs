use actix_web::{middleware::Logger, web, App, HttpResponse, HttpServer};
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tracing::{error, info};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogEntry {
    timestamp: DateTime<Utc>,
    level: String,
    service: String,
    target: Option<String>,
    message: String,
    correlation_id: Option<String>,
    request_id: Option<String>,
    user_id: Option<Uuid>,
    span_id: Option<String>,
    parent_span_id: Option<String>,
    fields: serde_json::Value,
    error_details: Option<serde_json::Value>,
    performance_metrics: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogBatch {
    logs: Vec<LogEntry>,
}

struct AppState {
    db_pool: sqlx::PgPool,
}

async fn write_logs(
    data: web::Data<Arc<AppState>>,
    batch: web::Json<Vec<LogEntry>>,
) -> Result<HttpResponse, actix_web::Error> {
    let start = std::time::Instant::now();
    let batch_size = batch.len();
    
    // Process logs in a transaction for atomicity
    let mut tx = data.db_pool.begin().await.map_err(|e| {
        error!("Failed to start transaction: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    
    for log in batch.iter() {
        let result = sqlx::query!(
            r#"
            INSERT INTO application_logs (
                timestamp, level, service, target, message,
                correlation_id, request_id, user_id, span_id, parent_span_id,
                fields, error_details, performance_metrics
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            "#,
            log.timestamp,
            log.level,
            log.service,
            log.target,
            log.message,
            log.correlation_id,
            log.request_id,
            log.user_id,
            log.span_id,
            log.parent_span_id,
            log.fields,
            log.error_details,
            log.performance_metrics
        )
        .execute(&mut *tx)
        .await;
        
        if let Err(e) = result {
            error!("Failed to insert log: {}", e);
            // Continue with other logs even if one fails
        }
    }
    
    tx.commit().await.map_err(|e| {
        error!("Failed to commit transaction: {}", e);
        actix_web::error::ErrorInternalServerError("Database error")
    })?;
    
    let duration = start.elapsed();
    info!(
        "Wrote {} logs to PostgreSQL in {:?}",
        batch_size, duration
    );
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "logs_written": batch_size,
        "duration_ms": duration.as_millis()
    })))
}

async fn health_check(data: web::Data<Arc<AppState>>) -> Result<HttpResponse, actix_web::Error> {
    // Check database connection
    let result = sqlx::query!("SELECT 1 as alive")
        .fetch_one(&data.db_pool)
        .await;
    
    match result {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "healthy",
            "service": "log-writer",
            "database": "connected"
        }))),
        Err(e) => {
            error!("Health check failed: {}", e);
            Ok(HttpResponse::ServiceUnavailable().json(serde_json::json!({
                "status": "unhealthy",
                "service": "log-writer",
                "database": "disconnected",
                "error": e.to_string()
            })))
        }
    }
}

#[actix_web::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Initialize logging
    tracing_subscriber::fmt()
        .with_env_filter("log_writer=info,actix_web=info")
        .json()
        .init();
    
    info!("Starting log-writer service");
    
    // Create database pool
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://admin:admin@localhost:5434/bookmark_manager".to_string());
    
    let db_pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    
    info!("Connected to PostgreSQL");
    
    // Create app state
    let state = Arc::new(AppState { db_pool });
    
    // Start HTTP server
    info!("Starting HTTP server on 0.0.0.0:8688");
    
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(state.clone()))
            .wrap(Logger::default())
            .service(
                web::resource("/logs")
                    .route(web::post().to(write_logs))
            )
            .service(
                web::resource("/health")
                    .route(web::get().to(health_check))
            )
    })
    .bind("0.0.0.0:8688")?
    .run()
    .await?;
    
    Ok(())
}