use serde::Deserialize;
use tracing_subscriber::EnvFilter;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub server_host: String,
    pub server_port: u16,
    pub log_level: String,
}

impl Config {
    pub fn from_env() -> Result<Self, config::ConfigError> {
        let mut cfg = config::Config::builder();

        // First, try to load from dotenv file
        dotenv::dotenv().ok();

        // Load from environment variables with BOOKMARKS_ prefix
        cfg = cfg.add_source(
            config::Environment::with_prefix("BOOKMARKS")
                .prefix_separator("_")
                .separator("__") // Use double underscore for nested keys
                .try_parsing(true),
        );

        // Set defaults
        cfg = cfg
            .set_default("server_host", "0.0.0.0")?
            .set_default("server_port", 8080)?
            .set_default("log_level", "info")?;

        cfg.build()?.try_deserialize()
    }
}

/// Initialize tracing/logging
pub fn init_tracing(log_level: &str) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(log_level));
    
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .with_thread_ids(true)
        .with_line_number(true)
        .init();
}
