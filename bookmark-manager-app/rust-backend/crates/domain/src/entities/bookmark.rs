use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Bookmark {
    pub id: Uuid,
    pub user_id: Uuid,
    pub url: String,
    pub title: String,  // NOT NULL in database
    pub description: Option<String>,
    pub domain: Option<String>,
    pub favicon_url: Option<String>,
    pub is_valid: Option<bool>,
    pub last_checked: Option<DateTime<Utc>>,
    pub http_status: Option<i32>,
    pub content_hash: Option<String>,
    pub status: Option<String>,     // Status column exists in DB
    pub is_deleted: Option<bool>,
    pub is_dead: Option<bool>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateBookmarkDto {
    #[validate(url)]
    pub url: String,

    #[validate(length(max = 200))]
    pub title: String,

    #[validate(length(max = 1000))]
    pub description: Option<String>,

    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct UpdateBookmarkDto {
    #[validate(url)]
    pub url: Option<String>,

    #[validate(length(max = 200))]
    pub title: Option<String>,

    #[validate(length(max = 1000))]
    pub description: Option<String>,

    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
    pub is_deleted: Option<bool>,
    pub is_dead: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BookmarkDto {
    pub id: Uuid,
    pub url: String,
    pub title: String,  // NOT NULL in database
    pub description: Option<String>,
    pub favicon_url: Option<String>,
    pub tags: Vec<String>,
    pub status: Option<String>,
    pub is_valid: Option<bool>,
    pub is_deleted: Option<bool>,
    pub is_dead: Option<bool>,
    pub last_checked: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Bookmark> for BookmarkDto {
    fn from(bookmark: Bookmark) -> Self {
        Self {
            id: bookmark.id,
            url: bookmark.url,
            title: bookmark.title,
            description: bookmark.description,
            favicon_url: bookmark.favicon_url,
            tags: vec![], // Tags need to be loaded separately
            status: bookmark.status,
            is_valid: bookmark.is_valid,
            is_deleted: bookmark.is_deleted,
            is_dead: bookmark.is_dead,
            last_checked: bookmark.last_checked,
            created_at: bookmark.created_at,
            updated_at: bookmark.updated_at,
        }
    }
}