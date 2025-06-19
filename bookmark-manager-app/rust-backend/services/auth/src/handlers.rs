use actix_web::{web, HttpMessage, HttpRequest, HttpResponse};
use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use domain::entities::user::{CreateUserDto, UserDto};
use serde::{Deserialize, Serialize};
use tracing::info;
use validator::Validate;

use crate::{repository, AppState};
use shared::auth::Claims;

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    pub password: String,
    pub two_factor_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: UserDto,
    pub requires_two_factor: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

pub async fn health() -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        status: "healthy".to_string(),
        service: "auth-service".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn register(
    state: web::Data<AppState>,
    dto: web::Json<CreateUserDto>,
) -> Result<HttpResponse, actix_web::Error> {
    // Validate input
    dto.validate()
        .map_err(|e| actix_web::error::ErrorBadRequest(e.to_string()))?;

    // Check if email ends with @az1.ai
    if !dto.email.ends_with("@az1.ai") {
        return Err(actix_web::error::ErrorBadRequest(
            "Only @az1.ai email addresses are allowed",
        ));
    }

    // Check if user already exists
    if repository::find_user_by_email(&state.db_pool, &dto.email)
        .await
        .is_ok()
    {
        return Err(actix_web::error::ErrorConflict("Email already registered"));
    }

    // Hash password
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(dto.password.as_bytes(), &salt)
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?
        .to_string();

    // Create user
    let user = repository::create_user(&state.db_pool, &dto.email, &password_hash)
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    // Generate token
    let token = state
        .jwt_service
        .generate_token(user.id, &user.email, user.role == "admin")
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    info!("User registered: {}", user.email);

    Ok(HttpResponse::Created().json(LoginResponse {
        token,
        user: user.into(),
        requires_two_factor: false,
    }))
}

pub async fn login(
    state: web::Data<AppState>,
    credentials: web::Json<LoginRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    // Validate input
    credentials
        .validate()
        .map_err(|e| actix_web::error::ErrorBadRequest(e.to_string()))?;

    // Find user
    let user = repository::find_user_by_email(&state.db_pool, &credentials.email)
        .await
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid credentials"))?;

    // Verify password
    let parsed_hash = PasswordHash::new(&user.password_hash)
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Argon2::default()
        .verify_password(credentials.password.as_bytes(), &parsed_hash)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid credentials"))?;

    // Handle 2FA if enabled
    if user.two_factor_enabled {
        // TODO: Implement 2FA verification
        if credentials.two_factor_code.is_none() {
            return Ok(HttpResponse::Ok().json(LoginResponse {
                token: String::new(),
                user: user.into(),
                requires_two_factor: true,
            }));
        }
    }

    // Generate token
    let token = state
        .jwt_service
        .generate_token(user.id, &user.email, user.role == "admin")
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    info!("User logged in: {}", user.email);

    Ok(HttpResponse::Ok().json(LoginResponse {
        token,
        user: user.into(),
        requires_two_factor: false,
    }))
}

pub async fn get_me(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract claims from request extensions (set by auth middleware)
    let claims = {
        let extensions = req.extensions();
        extensions
            .get::<Claims>()
            .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims found"))?
            .clone()
    };

    // Get user from database
    let user = repository::find_user_by_id(&state.db_pool, claims.sub)
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(UserDto::from(user)))
}

pub async fn refresh_token(
    state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<HttpResponse, actix_web::Error> {
    // Extract claims from request extensions
    let claims = {
        let extensions = req.extensions();
        extensions
            .get::<Claims>()
            .ok_or_else(|| actix_web::error::ErrorUnauthorized("No auth claims found"))?
            .clone()
    };

    // Generate new token
    let token = state
        .jwt_service
        .generate_token(claims.sub, &claims.email, claims.is_admin)
        .map_err(|e| actix_web::error::ErrorInternalServerError(e.to_string()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "token": token
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{http::StatusCode, test, App};
    use shared::auth::JwtService;
    use sqlx::{postgres::PgPoolOptions, PgPool};
    use std::sync::Arc;
    use uuid::Uuid;

    async fn setup_test_state() -> web::Data<AppState> {
        // Use in-memory SQLite for tests or test PostgreSQL
        let db_url = std::env::var("TEST_DATABASE_URL")
            .unwrap_or_else(|_| "postgres://admin:admin@localhost:5434/test_auth".to_string());

        let db_pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .expect("Failed to create test pool");

        // Run migrations
        sqlx::migrate!("./migrations")
            .run(&db_pool)
            .await
            .expect("Failed to run migrations");

        let jwt_service = Arc::new(JwtService::new("test-secret-key"));

        web::Data::new(AppState {
            db_pool,
            jwt_service,
        })
    }

    async fn cleanup_test_db(pool: &PgPool) {
        sqlx::query("DELETE FROM users WHERE email LIKE '%test_%@az1.ai'")
            .execute(pool)
            .await
            .expect("Failed to cleanup test data");
    }

    #[actix_web::test]
    async fn test_health_endpoint() {
        let app = test::init_service(App::new().route("/health", web::get().to(health))).await;

        let req = test::TestRequest::get().uri("/health").to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body: HealthResponse = test::read_body_json(resp).await;
        assert_eq!(body.status, "healthy");
        assert_eq!(body.service, "auth-service");
    }

    #[actix_web::test]
    async fn test_register_valid_user() {
        let state = setup_test_state().await;
        let pool_clone = state.db_pool.clone();

        let app = test::init_service(
            App::new()
                .app_data(state.clone())
                .route("/register", web::post().to(register)),
        )
        .await;

        let email = format!("test_{}@az1.ai", Uuid::new_v4());
        let req = test::TestRequest::post()
            .uri("/register")
            .set_json(&serde_json::json!({
                "email": email,
                "password": "ValidPassword123!"
            }))
            .to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::CREATED);

        let body: LoginResponse = test::read_body_json(resp).await;
        assert!(!body.token.is_empty());
        assert_eq!(body.user.email, email);
        assert!(!body.requires_two_factor);

        // Cleanup
        cleanup_test_db(&pool_clone).await;
    }

    #[actix_web::test]
    async fn test_register_invalid_email_domain() {
        let state = setup_test_state().await;

        let app = test::init_service(
            App::new()
                .app_data(state)
                .route("/register", web::post().to(register)),
        )
        .await;

        let req = test::TestRequest::post()
            .uri("/register")
            .set_json(&serde_json::json!({
                "email": "test@gmail.com",
                "password": "ValidPassword123!"
            }))
            .to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    }

    #[actix_web::test]
    async fn test_register_duplicate_email() {
        let state = setup_test_state().await;
        let pool_clone = state.db_pool.clone();

        let app = test::init_service(
            App::new()
                .app_data(state.clone())
                .route("/register", web::post().to(register)),
        )
        .await;

        let email = format!("duplicate_{}@az1.ai", Uuid::new_v4());

        // First registration
        let req1 = test::TestRequest::post()
            .uri("/register")
            .set_json(&serde_json::json!({
                "email": &email,
                "password": "ValidPassword123!"
            }))
            .to_request();

        let resp1 = test::call_service(&app, req1).await;
        assert_eq!(resp1.status(), StatusCode::CREATED);

        // Duplicate registration
        let req2 = test::TestRequest::post()
            .uri("/register")
            .set_json(&serde_json::json!({
                "email": &email,
                "password": "ValidPassword123!"
            }))
            .to_request();

        let resp2 = test::call_service(&app, req2).await;
        assert_eq!(resp2.status(), StatusCode::CONFLICT);

        // Cleanup
        cleanup_test_db(&pool_clone).await;
    }

    #[actix_web::test]
    async fn test_login_valid_credentials() {
        let state = setup_test_state().await;
        let pool_clone = state.db_pool.clone();

        let app = test::init_service(
            App::new()
                .app_data(state.clone())
                .route("/register", web::post().to(register))
                .route("/login", web::post().to(login)),
        )
        .await;

        let email = format!("login_test_{}@az1.ai", Uuid::new_v4());
        let password = "ValidPassword123!";

        // Register user first
        let register_req = test::TestRequest::post()
            .uri("/register")
            .set_json(&serde_json::json!({
                "email": &email,
                "password": password
            }))
            .to_request();

        let _register_resp = test::call_service(&app, register_req).await;

        // Login
        let login_req = test::TestRequest::post()
            .uri("/login")
            .set_json(&serde_json::json!({
                "email": &email,
                "password": password
            }))
            .to_request();

        let login_resp = test::call_service(&app, login_req).await;
        assert_eq!(login_resp.status(), StatusCode::OK);

        let body: LoginResponse = test::read_body_json(login_resp).await;
        assert!(!body.token.is_empty());
        assert_eq!(body.user.email, email);

        // Cleanup
        cleanup_test_db(&pool_clone).await;
    }

    #[actix_web::test]
    async fn test_login_invalid_password() {
        let state = setup_test_state().await;
        let pool_clone = state.db_pool.clone();

        let app = test::init_service(
            App::new()
                .app_data(state.clone())
                .route("/register", web::post().to(register))
                .route("/login", web::post().to(login)),
        )
        .await;

        let email = format!("wrong_pass_{}@az1.ai", Uuid::new_v4());

        // Register user
        let register_req = test::TestRequest::post()
            .uri("/register")
            .set_json(&serde_json::json!({
                "email": &email,
                "password": "ValidPassword123!"
            }))
            .to_request();

        let _register_resp = test::call_service(&app, register_req).await;

        // Login with wrong password
        let login_req = test::TestRequest::post()
            .uri("/login")
            .set_json(&serde_json::json!({
                "email": &email,
                "password": "WrongPassword123!"
            }))
            .to_request();

        let login_resp = test::call_service(&app, login_req).await;
        assert_eq!(login_resp.status(), StatusCode::UNAUTHORIZED);

        // Cleanup
        cleanup_test_db(&pool_clone).await;
    }

    #[actix_web::test]
    async fn test_login_nonexistent_user() {
        let state = setup_test_state().await;

        let app = test::init_service(
            App::new()
                .app_data(state)
                .route("/login", web::post().to(login)),
        )
        .await;

        let req = test::TestRequest::post()
            .uri("/login")
            .set_json(&serde_json::json!({
                "email": "nonexistent@az1.ai",
                "password": "SomePassword123!"
            }))
            .to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn test_get_me_with_valid_token() {
        let state = setup_test_state().await;
        let pool_clone = state.db_pool.clone();

        // Register a user first
        let email = format!("getme_test_{}@az1.ai", Uuid::new_v4());
        let user = repository::create_user(&state.db_pool, &email, "hashed_password")
            .await
            .expect("Failed to create test user");

        // Generate token
        let token = state
            .jwt_service
            .generate_token(user.id, &user.email, user.role == "admin")
            .expect("Failed to generate token");

        // Create app with auth middleware
        let app = test::init_service(
            App::new()
                .app_data(state.clone())
                .wrap(shared::middleware::auth::JwtAuth::new(
                    state.jwt_service.clone(),
                ))
                .route("/me", web::get().to(get_me)),
        )
        .await;

        let req = test::TestRequest::get()
            .uri("/me")
            .insert_header(("Authorization", format!("Bearer {}", token)))
            .to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        let body: UserDto = test::read_body_json(resp).await;
        assert_eq!(body.email, email);

        // Cleanup
        cleanup_test_db(&pool_clone).await;
    }

    #[actix_web::test]
    async fn test_get_me_without_token() {
        let state = setup_test_state().await;

        let app = test::init_service(
            App::new()
                .app_data(state.clone())
                .wrap(shared::middleware::auth::JwtAuth::new(
                    state.jwt_service.clone(),
                ))
                .route("/me", web::get().to(get_me)),
        )
        .await;

        let req = test::TestRequest::get().uri("/me").to_request();

        // The middleware will reject the request before it reaches the handler
        let result = test::try_call_service(&app, req).await;
        assert!(result.is_err());

        let err = result.unwrap_err();
        assert_eq!(
            err.as_response_error().status_code(),
            StatusCode::UNAUTHORIZED
        );
    }
}
