use actix_cors::Cors;
use actix_web::{middleware::Logger, web, App, HttpServer};
use anyhow::Result;
use dotenv::dotenv;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod handlers;
mod repository;

use shared::{auth::JwtService, config::Config};

pub struct AppState {
    pub db_pool: sqlx::PgPool,
    pub jwt_service: Arc<JwtService>,
}

#[actix_web::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv().ok();

    // Initialize tracing
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    // Load configuration
    let config = Config::from_env()?;

    info!(
        "Starting auth service on {}:{}",
        config.server_host, config.server_port
    );

    // Create database pool
    let db_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;

    // Run migrations
    sqlx::migrate!("./migrations").run(&db_pool).await?;

    // Create JWT service
    let jwt_service = Arc::new(JwtService::new(&config.jwt_secret));

    // Create app state
    let state = web::Data::new(AppState {
        db_pool: db_pool.clone(),
        jwt_service: jwt_service.clone(),
    });

    // Start HTTP server
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(state.clone())
            .app_data(web::Data::new(jwt_service.clone()))
            .wrap(cors)
            .wrap(Logger::default())
            .wrap(tracing_actix_web::TracingLogger::default())
            .service(
                web::scope("/api/auth")
                    .route("/register", web::post().to(handlers::register))
                    .route("/login", web::post().to(handlers::login))
                    .service(
                        web::scope("")
                            .wrap(shared::middleware::auth::JwtAuth::new(jwt_service.clone()))
                            .route("/me", web::get().to(handlers::get_me))
                            .route("/refresh", web::post().to(handlers::refresh_token))
                    ),
            )
            .route("/health", web::get().to(handlers::health))
    })
    .bind((config.server_host, config.server_port))?
    .run()
    .await?;

    Ok(())
}
