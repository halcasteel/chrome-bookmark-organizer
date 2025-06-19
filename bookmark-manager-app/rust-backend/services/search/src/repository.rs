use sqlx::PgPool;
use uuid::Uuid;
use pgvector::Vector;

use crate::embeddings::EmbeddingsService;
use crate::handlers::SearchResult;

pub async fn fulltext_search(
    pool: &PgPool,
    user_id: Uuid,
    query: &str,
    limit: u32,
    offset: u32,
    archived: Option<bool>,
    tags: Option<&Vec<String>>,
) -> Result<(Vec<SearchResult>, i64), sqlx::Error> {
    let search_query = format!("%{}%", query);
    
    // Build the WHERE clause
    let mut where_clauses = vec!["b.user_id = $1"];
    let mut param_count = 1;
    
    if let Some(archived) = archived {
        param_count += 1;
        if archived {
            where_clauses.push(&format!("b.status = ${}", param_count));
        } else {
            where_clauses.push(&format!("b.status != ${}", param_count));
        }
    }
    
    // Search in title, description, and URL
    where_clauses.push("(b.title ILIKE $2 OR b.description ILIKE $2 OR b.url ILIKE $2)");
    
    // Handle tag filtering if provided
    if let Some(tags) = tags {
        if !tags.is_empty() {
            let tag_placeholders: Vec<String> = tags
                .iter()
                .enumerate()
                .map(|(i, _)| format!("${}", param_count + 3 + i))
                .collect();
            
            where_clauses.push(&format!(
                "EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON bt.tag_id = t.id WHERE bt.bookmark_id = b.id AND t.name = ANY(ARRAY[{}]))",
                tag_placeholders.join(", ")
            ));
        }
    }
    
    let where_clause = where_clauses.join(" AND ");
    
    // Build and execute count query
    let count_query = format!(
        "SELECT COUNT(*) FROM bookmarks b WHERE {}",
        where_clause
    );
    
    let mut count_query_builder = sqlx::query_scalar::<_, i64>(&count_query);
    count_query_builder = count_query_builder.bind(user_id);
    count_query_builder = count_query_builder.bind(&search_query);
    
    if let Some(archived) = archived {
        if archived {
            count_query_builder = count_query_builder.bind("archived");
        } else {
            count_query_builder = count_query_builder.bind("archived");
        }
    }
    
    if let Some(tags) = tags {
        for tag in tags {
            count_query_builder = count_query_builder.bind(tag);
        }
    }
    
    let total = count_query_builder.fetch_one(pool).await?;
    
    // Build and execute search query
    let search_query_sql = format!(
        r#"
        SELECT 
            b.id,
            b.url,
            b.title,
            b.description,
            COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{{}}') as tags,
            CASE 
                WHEN b.title ILIKE $2 THEN 1.0
                WHEN b.url ILIKE $2 THEN 0.8
                ELSE 0.5
            END as score,
            b.created_at
        FROM bookmarks b
        LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE {}
        GROUP BY b.id
        ORDER BY score DESC, b.created_at DESC
        LIMIT $3 OFFSET $4
        "#,
        where_clause
    );
    
    let mut search_query_builder = sqlx::query_as::<_, SearchResultRow>(&search_query_sql);
    search_query_builder = search_query_builder.bind(user_id);
    search_query_builder = search_query_builder.bind(&search_query);
    search_query_builder = search_query_builder.bind(limit as i32);
    search_query_builder = search_query_builder.bind(offset as i32);
    
    if let Some(archived) = archived {
        if archived {
            search_query_builder = search_query_builder.bind("archived");
        } else {
            search_query_builder = search_query_builder.bind("archived");
        }
    }
    
    if let Some(tags) = tags {
        for tag in tags {
            search_query_builder = search_query_builder.bind(tag);
        }
    }
    
    let rows = search_query_builder.fetch_all(pool).await?;
    
    let results: Vec<SearchResult> = rows
        .into_iter()
        .map(|row| SearchResult {
            id: row.id,
            url: row.url,
            title: row.title,
            description: row.description,
            tags: row.tags,
            score: row.score,
            created_at: row.created_at,
        })
        .collect();
    
    Ok((results, total))
}

pub async fn semantic_search(
    pool: &PgPool,
    embeddings_service: &EmbeddingsService,
    user_id: Uuid,
    query: &str,
    limit: u32,
    offset: u32,
    archived: Option<bool>,
    tags: Option<&Vec<String>>,
) -> Result<(Vec<SearchResult>, i64), anyhow::Error> {
    // Generate embedding for the query
    let query_embedding = embeddings_service.generate_embedding(query).await?;
    let query_vector = Vector::from(query_embedding);
    
    // Build WHERE clause
    let mut where_clauses = vec!["b.user_id = $1"];
    let mut param_count = 1;
    
    if let Some(archived) = archived {
        param_count += 1;
        if archived {
            where_clauses.push(&format!("b.status = ${}", param_count));
        } else {
            where_clauses.push(&format!("b.status != ${}", param_count));
        }
    }
    
    if let Some(tags) = tags {
        if !tags.is_empty() {
            let tag_placeholders: Vec<String> = tags
                .iter()
                .enumerate()
                .map(|(i, _)| format!("${}", param_count + 2 + i))
                .collect();
            
            where_clauses.push(&format!(
                "EXISTS (SELECT 1 FROM bookmark_tags bt JOIN tags t ON bt.tag_id = t.id WHERE bt.bookmark_id = b.id AND t.name = ANY(ARRAY[{}]))",
                tag_placeholders.join(", ")
            ));
        }
    }
    
    let where_clause = where_clauses.join(" AND ");
    
    // Count query
    let count_query = format!(
        "SELECT COUNT(*) FROM bookmarks b JOIN bookmark_embeddings be ON b.id = be.bookmark_id WHERE {}",
        where_clause
    );
    
    let mut count_query_builder = sqlx::query_scalar::<_, i64>(&count_query);
    count_query_builder = count_query_builder.bind(user_id);
    
    if let Some(archived) = archived {
        if archived {
            count_query_builder = count_query_builder.bind("archived");
        } else {
            count_query_builder = count_query_builder.bind("archived");
        }
    }
    
    if let Some(tags) = tags {
        for tag in tags {
            count_query_builder = count_query_builder.bind(tag);
        }
    }
    
    let total = count_query_builder.fetch_one(pool).await?;
    
    // Semantic search query using cosine similarity
    let search_query = format!(
        r#"
        SELECT 
            b.id,
            b.url,
            b.title,
            b.description,
            COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{{}}') as tags,
            1 - (be.embedding <=> $2::vector) as score,
            b.created_at
        FROM bookmarks b
        JOIN bookmark_embeddings be ON b.id = be.bookmark_id
        LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE {}
        GROUP BY b.id, be.embedding
        ORDER BY score DESC
        LIMIT $3 OFFSET $4
        "#,
        where_clause
    );
    
    let mut search_query_builder = sqlx::query_as::<_, SearchResultRow>(&search_query);
    search_query_builder = search_query_builder.bind(user_id);
    search_query_builder = search_query_builder.bind(&query_vector);
    search_query_builder = search_query_builder.bind(limit as i32);
    search_query_builder = search_query_builder.bind(offset as i32);
    
    if let Some(archived) = archived {
        if archived {
            search_query_builder = search_query_builder.bind("archived");
        } else {
            search_query_builder = search_query_builder.bind("archived");
        }
    }
    
    if let Some(tags) = tags {
        for tag in tags {
            search_query_builder = search_query_builder.bind(tag);
        }
    }
    
    let rows = search_query_builder.fetch_all(pool).await?;
    
    let results: Vec<SearchResult> = rows
        .into_iter()
        .map(|row| SearchResult {
            id: row.id,
            url: row.url,
            title: row.title,
            description: row.description,
            tags: row.tags,
            score: row.score,
            created_at: row.created_at,
        })
        .collect();
    
    Ok((results, total))
}

pub async fn find_related_bookmarks(
    pool: &PgPool,
    embeddings_service: &EmbeddingsService,
    user_id: Uuid,
    bookmark_id: Uuid,
    limit: u32,
) -> Result<Vec<SearchResult>, anyhow::Error> {
    // Get the embedding for the source bookmark
    let source_embedding: Option<Vector> = sqlx::query_scalar!(
        "SELECT embedding as \"embedding: Vector\" FROM bookmark_embeddings WHERE bookmark_id = $1",
        bookmark_id
    )
    .fetch_optional(pool)
    .await?
    .flatten();
    
    let embedding = match source_embedding {
        Some(e) => e,
        None => {
            // Generate embedding if it doesn't exist
            let bookmark = sqlx::query!(
                "SELECT title, description, url FROM bookmarks WHERE id = $1 AND user_id = $2",
                bookmark_id,
                user_id
            )
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Bookmark not found"))?;
            
            let text = format!(
                "{} {} {}",
                bookmark.title.unwrap_or_default(),
                bookmark.description.unwrap_or_default(),
                bookmark.url
            );
            
            let embedding_vec = embeddings_service.generate_embedding(&text).await?;
            let vector = Vector::from(embedding_vec);
            
            // Store the embedding for future use
            sqlx::query!(
                "INSERT INTO bookmark_embeddings (bookmark_id, embedding) VALUES ($1, $2) ON CONFLICT (bookmark_id) DO UPDATE SET embedding = $2",
                bookmark_id,
                &vector as &Vector
            )
            .execute(pool)
            .await?;
            
            vector
        }
    };
    
    // Find similar bookmarks
    let related = sqlx::query_as!(
        SearchResultRow,
        r#"
        SELECT 
            b.id as "id!",
            b.url as "url!",
            b.title as "title?",
            b.description as "description?",
            COALESCE(array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL), '{}') as "tags!",
            (1 - (be.embedding <=> $3::vector))::float4 as "score!",
            b.created_at as "created_at!"
        FROM bookmarks b
        JOIN bookmark_embeddings be ON b.id = be.bookmark_id
        LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE b.user_id = $1 AND b.id != $2
        GROUP BY b.id, be.embedding, b.created_at
        ORDER BY (1 - (be.embedding <=> $3::vector)) DESC
        LIMIT $4
        "#,
        user_id,
        bookmark_id,
        &embedding as &Vector,
        limit as i32
    )
    .fetch_all(pool)
    .await?;
    
    let results: Vec<SearchResult> = related
        .into_iter()
        .map(|row| SearchResult {
            id: row.id,
            url: row.url,
            title: row.title,
            description: row.description,
            tags: row.tags,
            score: row.score,
            created_at: row.created_at,
        })
        .collect();
    
    Ok(results)
}

// Helper struct for query results
#[derive(sqlx::FromRow)]
struct SearchResultRow {
    id: Uuid,
    url: String,
    title: Option<String>,
    description: Option<String>,
    tags: Vec<String>,
    score: f32,
    created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn get_search_suggestions(
    pool: &PgPool,
    user_id: Uuid,
    query: &str,
    limit: u32,
) -> Result<Vec<String>, sqlx::Error> {
    let search_query = format!("%{}%", query);
    
    let suggestions = sqlx::query_scalar!(
        r#"
        SELECT DISTINCT 
            CASE 
                WHEN title ILIKE $2 THEN title
                WHEN url ILIKE $2 THEN url
                ELSE NULL
            END as suggestion
        FROM bookmarks
        WHERE user_id = $1 
            AND (title ILIKE $2 OR url ILIKE $2)
            AND (title IS NOT NULL OR url IS NOT NULL)
        LIMIT $3
        "#,
        user_id,
        search_query,
        limit as i32
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .filter_map(|s| s)
    .collect();
    
    Ok(suggestions)
}