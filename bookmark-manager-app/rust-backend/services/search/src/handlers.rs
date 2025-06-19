use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use shared::auth::Claims;
use tracing::info;
use uuid::Uuid;

use crate::{repository, AppState};

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub archived: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub semantic: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub id: Uuid,
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub score: f32,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
    pub query: String,
    pub search_type: String,
}

pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "healthy".to_string(),
        service: "search-service".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn search_bookmarks(
    state: web::Data<AppState>,
    query: web::Query<SearchQuery>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    if query.q.trim().is_empty() {
        return Err(actix_web::error::ErrorBadRequest("Query cannot be empty"));
    }

    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;
    let use_semantic = query.semantic.unwrap_or(true);

    let (results, total) = if use_semantic && state.embeddings_service.is_available() {
        // Semantic search using embeddings
        info!("Performing semantic search for user {}", claims.sub);
        
        repository::semantic_search(
            &state.db_pool,
            &state.embeddings_service,
            claims.sub,
            &query.q,
            limit,
            offset,
            query.archived,
            query.tags.as_deref(),
        )
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
    } else {
        // Full-text search
        info!("Performing full-text search for user {}", claims.sub);
        
        repository::fulltext_search(
            &state.db_pool,
            claims.sub,
            &query.q,
            limit,
            offset,
            query.archived,
            query.tags.as_deref(),
        )
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
    };

    Ok(HttpResponse::Ok().json(SearchResponse {
        results,
        total,
        page,
        limit,
        query: query.q.clone(),
        search_type: if use_semantic && state.embeddings_service.is_available() {
            "semantic".to_string()
        } else {
            "fulltext".to_string()
        },
    }))
}

pub async fn get_suggestions(
    state: web::Data<AppState>,
    query: web::Query<SearchQuery>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    if query.q.trim().is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<String>::new()));
    }

    let suggestions = repository::get_search_suggestions(
        &state.db_pool,
        claims.sub,
        &query.q,
        10,
    )
    .await
    .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(suggestions))
}

pub async fn get_related_bookmarks(
    state: web::Data<AppState>,
    bookmark_id: web::Path<Uuid>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    if !state.embeddings_service.is_available() {
        return Err(actix_web::error::ErrorServiceUnavailable(
            "Embeddings service not available",
        ));
    }

    let related = repository::find_related_bookmarks(
        &state.db_pool,
        &state.embeddings_service,
        claims.sub,
        *bookmark_id,
        10,
    )
    .await
    .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(related))
}