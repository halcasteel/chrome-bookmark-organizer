use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::parser::ParsedBookmark;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ImportRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub filename: String,
    pub status: Option<String>,  // nullable in DB
    pub total_bookmarks: Option<i32>,  // different column name
    pub processed_count: Option<i32>,  // nullable in DB
    pub new_bookmarks: Option<i32>,
    pub failed_bookmarks: Option<i32>,
    pub started_at: Option<DateTime<Utc>>,  // different column name
    pub completed_at: Option<DateTime<Utc>>,
}

pub async fn create_import_record(
    pool: &PgPool,
    user_id: Uuid,
    filename: &str,
    total_count: i32,
) -> Result<Uuid, sqlx::Error> {
    let import_id = Uuid::new_v4();
    
    sqlx::query!(
        r#"
        INSERT INTO import_history (id, user_id, filename, status, total_bookmarks, processed_count, new_bookmarks, failed_bookmarks)
        VALUES ($1, $2, $3, $4, $5, 0, 0, 0)
        "#,
        import_id,
        user_id,
        filename,
        "processing",
        total_count
    )
    .execute(pool)
    .await?;
    
    Ok(import_id)
}

pub async fn bulk_insert_raw_bookmarks(
    pool: &PgPool,
    user_id: Uuid,
    import_id: Uuid,
    bookmarks: &[ParsedBookmark],
) -> Result<Vec<Uuid>, sqlx::Error> {
    let mut tx = pool.begin().await?;
    let mut bookmark_ids = Vec::with_capacity(bookmarks.len());
    
    for bookmark in bookmarks {
        let bookmark_id = Uuid::new_v4();
        bookmark_ids.push(bookmark_id);
        
        // Insert into bookmarks table with minimal processing
        sqlx::query!(
            r#"
            INSERT INTO bookmarks (id, user_id, url, title, status, import_id, chrome_add_date, favicon, imported_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'imported', $5, $6, $7, NOW(), NOW(), NOW())
            "#,
            bookmark_id,
            user_id,
            bookmark.url,
            bookmark.title,
            import_id,
            bookmark.add_date.map(|d| d.timestamp()),
            bookmark.icon
        )
        .execute(&mut *tx)
        .await?;
        
        // Insert initial tags if any
        for tag_name in &bookmark.tags {
            let tag_id = sqlx::query_scalar!(
                r#"
                INSERT INTO tags (user_id, name)
                VALUES ($1, $2)
                ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
                RETURNING id
                "#,
                user_id,
                tag_name
            )
            .fetch_one(&mut *tx)
            .await?;
            
            sqlx::query!(
                "INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)",
                bookmark_id,
                tag_id
            )
            .execute(&mut *tx)
            .await?;
        }
    }
    
    tx.commit().await?;
    
    Ok(bookmark_ids)
}

pub async fn get_import_status(
    pool: &PgPool,
    import_id: Uuid,
    user_id: Uuid,
) -> Result<ImportRecord, sqlx::Error> {
    sqlx::query_as!(
        ImportRecord,
        r#"
        SELECT id, user_id, filename, status, total_bookmarks, processed_count, 
               new_bookmarks, failed_bookmarks, started_at, completed_at
        FROM import_history
        WHERE id = $1 AND user_id = $2
        "#,
        import_id,
        user_id
    )
    .fetch_one(pool)
    .await
}

pub async fn get_user_imports(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<ImportRecord>, sqlx::Error> {
    sqlx::query_as!(
        ImportRecord,
        r#"
        SELECT id, user_id, filename, status, total_bookmarks, processed_count,
               new_bookmarks, failed_bookmarks, started_at, completed_at
        FROM import_history
        WHERE user_id = $1
        ORDER BY started_at DESC
        LIMIT 50
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
}

pub async fn update_import_progress(
    pool: &PgPool,
    import_id: Uuid,
    processed: i32,
    success: i32,
    errors: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE import_history
        SET processed_count = $2, new_bookmarks = $3, failed_bookmarks = $4
        WHERE id = $1
        "#,
        import_id,
        processed,
        success,
        errors
    )
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn complete_import(
    pool: &PgPool,
    import_id: Uuid,
    status: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE import_history
        SET status = $2, completed_at = NOW()
        WHERE id = $1
        "#,
        import_id,
        status
    )
    .execute(pool)
    .await?;
    
    Ok(())
}