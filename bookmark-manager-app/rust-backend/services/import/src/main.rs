use actix_cors::Cors;
use actix_web::{middleware, web, App, HttpServer};
use anyhow::Result;
use shared::{config::Config, middleware::auth::JwtAuth};
use sqlx::postgres::PgPoolOptions;
use tracing::info;
use tracing_actix_web::TracingLogger;

mod handlers;
mod parser;
mod queue;
mod repository;

pub struct AppState {
    pub db_pool: sqlx::PgPool,
    pub queue_service: queue::QueueService,
}

#[actix_web::main]
async fn main() -> Result<()> {
    // Load environment variables
    dotenv::dotenv().ok();
    
    // Initialize tracing
    shared::config::init_tracing("info");
    
    // Load configuration
    let config = Config::from_env()?;
    
    info!("Starting import service on {}:{}", config.server_host, config.server_port);
    
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
    
    // Create queue service
    let queue_service = queue::QueueService::new(&config.redis_url);
    
    // Create app state
    let state = web::Data::new(AppState { 
        db_pool,
        queue_service,
    });
    
    // Create JWT service for auth middleware
    let jwt_service = web::Data::new(shared::auth::JwtService::new(&config.jwt_secret));
    
    // Start server
    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_header()
            .allow_any_method();
            
        App::new()
            .app_data(state.clone())
            .app_data(jwt_service.clone())
            .wrap(cors)
            .wrap(TracingLogger::default())
            .wrap(middleware::NormalizePath::trim())
            .service(
                web::scope("/import")
                    .wrap(JwtAuth::new(jwt_service.get_ref().clone()))
                    .route("/upload", web::post().to(handlers::import_bookmarks))
                    .route("/status", web::get().to(handlers::get_import_status))
                    .route("/history", web::get().to(handlers::get_user_imports))
            )
            .route("/health", web::get().to(handlers::health))
    })
    .bind((config.server_host.as_str(), config.server_port))?
    .run()
    .await?;
    
    Ok(())
}
