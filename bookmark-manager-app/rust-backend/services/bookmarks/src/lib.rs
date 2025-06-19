pub mod handlers;
pub mod repository;

pub struct AppState {
    pub db_pool: sqlx::PgPool,
}