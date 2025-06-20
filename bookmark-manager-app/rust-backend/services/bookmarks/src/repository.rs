use domain::entities::bookmark::{BookmarkDto, CreateBookmarkDto, UpdateBookmarkDto};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn list_bookmarks(
    pool: &PgPool,
    user_id: Uuid,
    limit: u32,
    offset: u32,
    archived: Option<bool>,
    tag: Option<&str>,
) -> Result<(Vec<BookmarkDto>, i64), sqlx::Error> {
    // Count query
    let mut count_query = String::from("SELECT COUNT(DISTINCT b.id) FROM bookmarks b WHERE b.user_id = $1");
    let mut count_binds: Vec<&str> = vec![];
    
    if archived.unwrap_or(false) {
        count_query.push_str(" AND b.status = 'archived'");
    } else {
        count_query.push_str(" AND (b.status != 'archived' OR b.status IS NULL)");
    }
    
    if tag.is_some() {
        count_query.push_str(" AND EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON bt.tag_id = t.id WHERE bt.bookmark_id = b.id AND t.name = $2)");
    }
    
    let mut count_query_builder = sqlx::query_scalar(&count_query);
    count_query_builder = count_query_builder.bind(user_id);
    if let Some(tag) = tag {
        count_query_builder = count_query_builder.bind(tag);
    }
    
    let total = count_query_builder.fetch_one(pool).await?;
    
    // Main query
    let mut main_query = String::from(r#"
        SELECT 
            b.id, b.url, b.title, b.description, b.favicon_url,
            b.status, b.is_valid, b.is_deleted, b.is_dead, b.last_checked,
            b.created_at, b.updated_at,
            COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') as tags
        FROM bookmarks b
        LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE b.user_id = $1"#);
    
    if archived.unwrap_or(false) {
        main_query.push_str(" AND b.status = 'archived'");
    } else {
        main_query.push_str(" AND (b.status != 'archived' OR b.status IS NULL)");
    }
    
    if tag.is_some() {
        main_query.push_str(" AND EXISTS (SELECT 1 FROM bookmark_tags bt2 JOIN tags t2 ON bt2.tag_id = t2.id WHERE bt2.bookmark_id = b.id AND t2.name = $2)");
    }
    
    main_query.push_str(" GROUP BY b.id ORDER BY b.created_at DESC LIMIT $");
    let limit_param = if tag.is_some() { 3 } else { 2 };
    main_query.push_str(&limit_param.to_string());
    main_query.push_str(" OFFSET $");
    main_query.push_str(&(limit_param + 1).to_string());
    
    let mut query_builder = sqlx::query_as::<_, BookmarkDto>(&main_query);
    query_builder = query_builder.bind(user_id);
    if let Some(tag) = tag {
        query_builder = query_builder.bind(tag);
    }
    query_builder = query_builder.bind(limit as i32);
    query_builder = query_builder.bind(offset as i32);
    
    let bookmarks = query_builder.fetch_all(pool).await?;
    
    Ok((bookmarks, total))
}

pub async fn get_bookmark(
    pool: &PgPool,
    user_id: Uuid,
    bookmark_id: Uuid,
) -> Result<Option<BookmarkDto>, sqlx::Error> {
    let query = r#"
        SELECT 
            b.id, b.url, b.title, b.description, b.favicon_url,
            b.status, b.is_valid, b.is_deleted, b.is_dead, b.last_checked,
            b.created_at, b.updated_at,
            COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') as tags
        FROM bookmarks b
        LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE b.id = $1 AND b.user_id = $2
        GROUP BY b.id
    "#;
    
    let bookmark = sqlx::query_as::<_, BookmarkDto>(query)
        .bind(bookmark_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    
    Ok(bookmark)
}

pub async fn create_bookmark(
    pool: &PgPool,
    user_id: Uuid,
    dto: &CreateBookmarkDto,
) -> Result<BookmarkDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    
    // Extract domain from URL
    let domain = url::Url::parse(&dto.url)
        .ok()
        .and_then(|u| u.host_str().map(|s| s.to_string()));
    
    // Insert bookmark
    let bookmark_id = Uuid::new_v4();
    sqlx::query!(
        r#"
        INSERT INTO bookmarks (id, user_id, url, title, description, domain, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
        "#,
        bookmark_id,
        user_id,
        dto.url,
        dto.title,
        dto.description,
        domain
    )
    .execute(&mut *tx)
    .await?;
    
    // Insert tags
    for tag_name in &dto.tags {
        // Get or create tag
        let tag_id = sqlx::query_scalar!(
            "INSERT INTO tags (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO UPDATE SET name = $2 RETURNING id",
            user_id,
            tag_name
        )
        .fetch_one(&mut *tx)
        .await?;
        
        // Link tag to bookmark
        sqlx::query!(
            "INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)",
            bookmark_id,
            tag_id
        )
        .execute(&mut *tx)
        .await?;
    }
    
    tx.commit().await?;
    
    // Fetch the created bookmark
    get_bookmark(pool, user_id, bookmark_id)
        .await?
        .ok_or_else(|| sqlx::Error::RowNotFound)
}

pub async fn update_bookmark(
    pool: &PgPool,
    user_id: Uuid,
    bookmark_id: Uuid,
    dto: &UpdateBookmarkDto,
) -> Result<BookmarkDto, sqlx::Error> {
    let mut tx = pool.begin().await?;
    
    // Update bookmark fields if provided
    let mut update_fields = vec!["updated_at = NOW()"];
    let mut params: Vec<String> = vec![];
    
    if dto.url.is_some() {
        update_fields.push("url = $3");
        params.push("url".to_string());
    }
    if dto.title.is_some() {
        update_fields.push("title = $4");
        params.push("title".to_string());
    }
    if dto.description.is_some() {
        update_fields.push("description = $5");
        params.push("description".to_string());
    }
    if dto.status.is_some() {
        update_fields.push("status = $6");
        params.push("status".to_string());
    }
    if dto.is_deleted.is_some() {
        update_fields.push("is_deleted = $7");
        params.push("is_deleted".to_string());
    }
    if dto.is_dead.is_some() {
        update_fields.push("is_dead = $8");
        params.push("is_dead".to_string());
    }
    
    let update_query = format!(
        "UPDATE bookmarks SET {} WHERE id = $1 AND user_id = $2",
        update_fields.join(", ")
    );
    
    let mut query_builder = sqlx::query(&update_query);
    query_builder = query_builder.bind(bookmark_id);
    query_builder = query_builder.bind(user_id);
    
    for param in &params {
        match param.as_str() {
            "url" => query_builder = query_builder.bind(dto.url.as_ref()),
            "title" => query_builder = query_builder.bind(dto.title.as_ref()),
            "description" => query_builder = query_builder.bind(dto.description.as_ref()),
            "status" => query_builder = query_builder.bind(dto.status.as_ref()),
            "is_deleted" => query_builder = query_builder.bind(dto.is_deleted.as_ref()),
            "is_dead" => query_builder = query_builder.bind(dto.is_dead.as_ref()),
            _ => {}
        }
    }
    
    query_builder.execute(&mut *tx).await?;
    
    // Update tags if provided
    if let Some(tags) = &dto.tags {
        // Remove existing tags
        sqlx::query!(
            "DELETE FROM bookmark_tags WHERE bookmark_id = $1",
            bookmark_id
        )
        .execute(&mut *tx)
        .await?;
        
        // Add new tags
        for tag_name in tags {
            let tag_id = sqlx::query_scalar!(
                "INSERT INTO tags (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id, name) DO UPDATE SET name = $2 RETURNING id",
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
    
    // Fetch the updated bookmark
    get_bookmark(pool, user_id, bookmark_id)
        .await?
        .ok_or_else(|| sqlx::Error::RowNotFound)
}

pub async fn delete_bookmark(
    pool: &PgPool,
    user_id: Uuid,
    bookmark_id: Uuid,
) -> Result<(), sqlx::Error> {
    let result = sqlx::query!(
        "DELETE FROM bookmarks WHERE id = $1 AND user_id = $2",
        bookmark_id,
        user_id
    )
    .execute(pool)
    .await?;
    
    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    // Add tests here if needed
}