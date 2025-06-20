use actix_cors::Cors;
use actix_web::{middleware, web, App, HttpServer};
use anyhow::Result;
use shared::{config::Config, middleware::auth::JwtAuth, auth::JwtService};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use tracing::info;
use tracing_actix_web::TracingLogger;

use bookmarks_service::{handlers, AppState};

#[actix_web::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Initialize tracing
    shared::config::init_tracing("info");
    
    // Load configuration
    let config = Config::from_env()?;
    
    info!("Starting bookmarks service on {}:{}", config.server_host, config.server_port);
    
    // Create database pool
    let db_pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;
    
    // Run migrations
    sqlx::migrate!("../../migrations")
        .run(&db_pool)
        .await?;
    
    info!("Database connected and migrations run");
    
    // Create app state
    let state = web::Data::new(AppState { db_pool });
    
    // Create JWT service for auth middleware
    let jwt_service = Arc::new(shared::auth::JwtService::new(&config.jwt_secret));
    
    // Start server
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_header()
            .allow_any_method();
            
        App::new()
            .app_data(state.clone())
            .app_data(web::Data::new(jwt_service.clone()))
            .wrap(cors)
            .wrap(TracingLogger::default())
            .wrap(middleware::NormalizePath::trim())
            .service(
                web::scope("/bookmarks")
                    .wrap(JwtAuth::new(jwt_service.clone()))
                    .route("", web::get().to(handlers::list_bookmarks))
                    .route("", web::post().to(handlers::create_bookmark))
                    .route("/{id}", web::get().to(handlers::get_bookmark))
                    .route("/{id}", web::put().to(handlers::update_bookmark))
                    .route("/{id}", web::delete().to(handlers::delete_bookmark))
            )
            .route("/health", web::get().to(handlers::health))
    })
    .bind((config.server_host.as_str(), config.server_port))?
    .run()
    .await?;
    
    Ok(())
}
