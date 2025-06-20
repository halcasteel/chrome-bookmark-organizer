use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, PgPool};
use std::sync::Arc;
use time::OffsetDateTime;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db_pool: PgPool,
}

#[derive(Debug, Deserialize)]
struct LogRecord {
    timestamp: Option<OffsetDateTime>,
    level: String,
    service: String,
    target: Option<String>,
    message: String,
    correlation_id: Option<String>,
    request_id: Option<String>,
    user_id: Option<Uuid>,
    span_id: Option<String>,
    parent_span_id: Option<String>,
    fields: Option<serde_json::Value>,
    error_details: Option<serde_json::Value>,
    performance_metrics: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct LogBatch {
    pg_record: LogRecord,
}

#[derive(Debug, Serialize)]
struct LogResponse {
    success: bool,
    message: String,
}

async fn write_log(
    State(state): State<Arc<AppState>>,
    Json(batch): Json<LogBatch>,
) -> impl IntoResponse {
    let log = batch.pg_record;
    let timestamp = log.timestamp.unwrap_or_else(OffsetDateTime::now_utc);
    
    let result = sqlx::query!(
        r#"
        INSERT INTO application_logs (
            timestamp, level, service, target, message,
            correlation_id, request_id, user_id, span_id, parent_span_id,
            fields, error_details, performance_metrics
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        "#,
        timestamp,
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
    .execute(&state.db_pool)
    .await;

    match result {
        Ok(_) => (
            StatusCode::OK,
            Json(LogResponse {
                success: true,
                message: "Log written successfully".to_string(),
            }),
        ),
        Err(e) => {
            error!("Failed to write log: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(LogResponse {
                    success: false,
                    message: format!("Failed to write log: {}", e),
                }),
            )
        }
    }
}

async fn health_check() -> impl IntoResponse {
    StatusCode::OK
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv::dotenv().ok();
    
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("log_writer_service=info".parse()?)
                .add_directive("sqlx=warn".parse()?),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5434/bookmark_manager".to_string());

    info!("Connecting to database...");
    let db_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let app_state = Arc::new(AppState { db_pool });

    let app = Router::new()
        .route("/api/logs", post(write_log))
        .route("/health", axum::routing::get(health_check))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let addr = "0.0.0.0:8688";
    info!("Log writer service listening on {}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}