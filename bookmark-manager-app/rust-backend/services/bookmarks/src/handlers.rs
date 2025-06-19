use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use domain::entities::bookmark::{BookmarkDto, CreateBookmarkDto, UpdateBookmarkDto};
use serde::{Deserialize, Serialize};
use shared::auth::Claims;
use tracing::info;
use uuid::Uuid;
use validator::Validate;

use crate::{repository, AppState};

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
pub struct ListBookmarksQuery {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub archived: Option<bool>,
    pub tag: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ListBookmarksResponse {
    pub bookmarks: Vec<BookmarkDto>,
    pub total: i64,
    pub page: u32,
    pub limit: u32,
}

pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "healthy".to_string(),
        service: "bookmarks-service".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn list_bookmarks(
    state: web::Data<AppState>,
    query: web::Query<ListBookmarksQuery>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    let (bookmarks, total) = repository::list_bookmarks(
        &state.db_pool,
        claims.sub,
        limit,
        offset,
        query.archived,
        query.tag.as_deref(),
    )
    .await
    .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(ListBookmarksResponse {
        bookmarks,
        total,
        page,
        limit,
    }))
}

pub async fn get_bookmark(
    state: web::Data<AppState>,
    bookmark_id: web::Path<Uuid>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    let bookmark = repository::get_bookmark(&state.db_pool, *bookmark_id, claims.sub)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => actix_web::error::ErrorNotFound("Bookmark not found"),
            _ => actix_web::error::ErrorInternalServerError(e.to_string()),
        })?;

    Ok(HttpResponse::Ok().json(bookmark))
}

pub async fn create_bookmark(
    state: web::Data<AppState>,
    dto: web::Json<CreateBookmarkDto>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    dto.validate()
        .map_err(|e| actix_web::error::ErrorBadRequest(e.to_string()))?;

    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    let bookmark = repository::create_bookmark(&state.db_pool, claims.sub, &dto)
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    info!("Created bookmark {} for user {}", bookmark.id, claims.sub);

    Ok(HttpResponse::Created().json(bookmark))
}

pub async fn update_bookmark(
    state: web::Data<AppState>,
    bookmark_id: web::Path<Uuid>,
    dto: web::Json<UpdateBookmarkDto>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    dto.validate()
        .map_err(|e| actix_web::error::ErrorBadRequest(e.to_string()))?;

    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    let bookmark = repository::update_bookmark(&state.db_pool, *bookmark_id, claims.sub, &dto)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => actix_web::error::ErrorNotFound("Bookmark not found"),
            _ => actix_web::error::ErrorInternalServerError(e.to_string()),
        })?;

    info!("Updated bookmark {} for user {}", bookmark.id, claims.sub);

    Ok(HttpResponse::Ok().json(bookmark))
}

pub async fn delete_bookmark(
    state: web::Data<AppState>,
    bookmark_id: web::Path<Uuid>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    let claims = req
        .extensions()
        .get::<Claims>()
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims"))?
        .clone();

    repository::delete_bookmark(&state.db_pool, *bookmark_id, claims.sub)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => actix_web::error::ErrorNotFound("Bookmark not found"),
            _ => actix_web::error::ErrorInternalServerError(e.to_string()),
        })?;

    info!("Deleted bookmark {} for user {}", bookmark_id, claims.sub);

    Ok(HttpResponse::NoContent().finish())
}