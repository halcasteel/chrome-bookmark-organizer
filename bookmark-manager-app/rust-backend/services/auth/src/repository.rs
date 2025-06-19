use chrono::Utc;
use domain::entities::user::User;
use domain::errors::{DomainError, Result};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn create_user(pool: &PgPool, email: &str, password_hash: &str) -> Result<User> {
    let id = Uuid::new_v4();
    let now = Utc::now();

    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (id, email, password_hash, role, two_factor_enabled, two_factor_secret, created_at, updated_at)
        VALUES ($1, $2, $3, 'user', false, NULL, $4, $5)
        RETURNING *
        "#
    )
    .bind(id)
    .bind(email)
    .bind(password_hash)
    .bind(now)
    .bind(now)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn find_user_by_email(pool: &PgPool, email: &str) -> Result<User> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT * FROM users WHERE email = $1
        "#,
    )
    .bind(email)
    .fetch_one(pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => DomainError::NotFound {
            entity: "User".to_string(),
            id: Uuid::nil(),
        },
        _ => DomainError::DatabaseError(e),
    })?;

    Ok(user)
}

pub async fn find_user_by_id(pool: &PgPool, id: Uuid) -> Result<User> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT * FROM users WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => DomainError::NotFound {
            entity: "User".to_string(),
            id,
        },
        _ => DomainError::DatabaseError(e),
    })?;

    Ok(user)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    async fn setup_test_pool() -> PgPool {
        let db_url = std::env::var("TEST_DATABASE_URL")
            .unwrap_or_else(|_| "postgres://admin:admin@localhost:5434/test_auth".to_string());

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .expect("Failed to create test pool");

        // Run migrations
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        pool
    }

    async fn cleanup_test_user(pool: &PgPool, email: &str) {
        sqlx::query("DELETE FROM users WHERE email = $1")
            .bind(email)
            .execute(pool)
            .await
            .expect("Failed to cleanup test user");
    }

    #[tokio::test]
    async fn test_create_user() {
        let pool = setup_test_pool().await;
        let email = format!("test_create_{}@az1.ai", Uuid::new_v4());

        let user = create_user(&pool, &email, "hashed_password")
            .await
            .expect("Failed to create user");

        assert_eq!(user.email, email);
        assert_eq!(user.password_hash, "hashed_password");
        assert_eq!(user.role, "user");
        assert!(!user.two_factor_enabled);
        assert!(user.two_factor_secret.is_none());

        // Cleanup
        cleanup_test_user(&pool, &email).await;
    }

    #[tokio::test]
    async fn test_find_user_by_email() {
        let pool = setup_test_pool().await;
        let email = format!("test_find_email_{}@az1.ai", Uuid::new_v4());

        // Create user first
        let created_user = create_user(&pool, &email, "hashed_password")
            .await
            .expect("Failed to create user");

        // Find by email
        let found_user = find_user_by_email(&pool, &email)
            .await
            .expect("Failed to find user by email");

        assert_eq!(found_user.id, created_user.id);
        assert_eq!(found_user.email, created_user.email);

        // Cleanup
        cleanup_test_user(&pool, &email).await;
    }

    #[tokio::test]
    async fn test_find_user_by_email_not_found() {
        let pool = setup_test_pool().await;
        let email = "nonexistent@az1.ai";

        let result = find_user_by_email(&pool, email).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            DomainError::NotFound { entity, .. } => {
                assert_eq!(entity, "User");
            }
            _ => panic!("Expected NotFound error"),
        }
    }

    #[tokio::test]
    async fn test_find_user_by_id() {
        let pool = setup_test_pool().await;
        let email = format!("test_find_id_{}@az1.ai", Uuid::new_v4());

        // Create user first
        let created_user = create_user(&pool, &email, "hashed_password")
            .await
            .expect("Failed to create user");

        // Find by id
        let found_user = find_user_by_id(&pool, created_user.id)
            .await
            .expect("Failed to find user by id");

        assert_eq!(found_user.id, created_user.id);
        assert_eq!(found_user.email, created_user.email);

        // Cleanup
        cleanup_test_user(&pool, &email).await;
    }

    #[tokio::test]
    async fn test_find_user_by_id_not_found() {
        let pool = setup_test_pool().await;
        let id = Uuid::new_v4();

        let result = find_user_by_id(&pool, id).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            DomainError::NotFound {
                entity,
                id: error_id,
            } => {
                assert_eq!(entity, "User");
                assert_eq!(error_id, id);
            }
            _ => panic!("Expected NotFound error"),
        }
    }
}
