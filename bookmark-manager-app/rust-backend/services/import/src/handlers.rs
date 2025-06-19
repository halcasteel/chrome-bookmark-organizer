use actix_multipart::Multipart;
use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use futures_util::TryStreamExt;
use serde::{Deserialize, Serialize};
use shared::auth::Claims;
use std::io::Write;
use tempfile::NamedTempFile;
use tracing::{error, info};
use uuid::Uuid;

use crate::{parser, repository, AppState};

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
pub struct ImportResponse {
    pub import_id: Uuid,
    pub status: String,
    pub total_count: i32,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportStatusQuery {
    pub import_id: Uuid,
}

#[derive(Debug, Serialize)]
pub struct ImportStatusResponse {
    pub import_id: Uuid,
    pub status: String,
    pub total_count: i32,
    pub processed_count: i32,
    pub success_count: i32,
    pub error_count: i32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "healthy".to_string(),
        service: "import-service".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn import_bookmarks(
    mut multipart: Multipart,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    // Process uploaded file
    let mut temp_file = NamedTempFile::new()
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    while let Some(mut field) = multipart
        .try_next()
        .await
        .map_err(|e| actix_web::error::ErrorBadRequest(e.to_string()))?
    {
        let filename = field.content_disposition()
            .and_then(|cd| cd.get_filename().map(|s| s.to_string()));
        
        if let Some(filename) = filename {
            if !filename.ends_with(".html") {
                return Err(actix_web::error::ErrorBadRequest(
                    "Only HTML files are supported",
                ));
            }

            info!("Processing uploaded file: {}", filename);

            while let Some(chunk) = field
                .try_next()
                .await
                .map_err(|e| actix_web::error::ErrorBadRequest(e.to_string()))?
            {
                temp_file
                    .write_all(&chunk)
                    .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;
            }

            // Parse bookmarks from file
            let file_path = temp_file.path();
            let content = std::fs::read_to_string(file_path)
                .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

            let bookmarks = parser::parse_bookmarks_html(&content);

            info!(
                "Parsed {} bookmarks for user {}",
                bookmarks.len(),
                claims.sub
            );

            // Create import record
            let import_id = repository::create_import_record(
                &state.db_pool,
                claims.sub,
                filename,
                bookmarks.len() as i32,
            )
            .await
            .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

            // Queue bookmarks for processing
            let bookmark_ids = repository::bulk_insert_raw_bookmarks(
                &state.db_pool,
                claims.sub,
                import_id,
                &bookmarks,
            )
            .await
            .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

            info!(
                "Inserted {} raw bookmarks for import {}",
                bookmark_ids.len(),
                import_id
            );

            // Create A2A task for processing
            let task_payload = serde_json::json!({
                "import_id": import_id,
                "user_id": claims.sub,
                "bookmark_ids": bookmark_ids,
            });

            // Send task to queue
            if let Err(e) = state
                .queue_service
                .send_task("process_import", task_payload)
                .await
            {
                error!("Failed to queue import task: {}", e);
            }

            return Ok(HttpResponse::Ok().json(ImportResponse {
                import_id,
                status: "processing".to_string(),
                total_count: bookmarks.len() as i32,
                message: format!(
                    "Import started. {} bookmarks queued for processing.",
                    bookmarks.len()
                ),
            }));
        }
    }

    Err(actix_web::error::ErrorBadRequest("No file uploaded"))
}

pub async fn get_import_status(
    state: web::Data<AppState>,
    query: web::Query<ImportStatusQuery>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    let status = repository::get_import_status(&state.db_pool, query.import_id, claims.sub)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => actix_web::error::ErrorNotFound("Import not found"),
            _ => actix_web::error::ErrorInternalServerError(e.to_string()),
        })?;

    Ok(HttpResponse::Ok().json(status))
}

pub async fn get_user_imports(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    let imports = repository::get_user_imports(&state.db_pool, claims.sub)
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(imports))
}