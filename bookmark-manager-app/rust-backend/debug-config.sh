#!/bin/bash
export PATH="$HOME/.cargo/bin:$PATH"
cd /home/halcasteel/RUST-ACTIX-MIGRATION

# Set environment variables
export BOOKMARKS_DATABASE_URL="postgres://admin:admin@localhost:5434/bookmark_manager"
export BOOKMARKS_REDIS_URL="redis://localhost:6382"
export BOOKMARKS_JWT_SECRET="test-secret-key-change-in-production"
export BOOKMARKS_SERVER_HOST="0.0.0.0"
export BOOKMARKS_SERVER_PORT="8001"
export BOOKMARKS_LOG_LEVEL="info"

echo "Environment variables set:"
env | grep BOOKMARKS_

# Create a simple Rust program to test config loading
cat > test-config.rs << 'EOF'
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Config {
    database_url: String,
    redis_url: String,
    jwt_secret: String,
    server_host: String,
    server_port: u16,
    log_level: String,
}

fn main() {
    println!("Testing config loading...");
    
    let cfg = config::Config::builder()
        .add_source(
            config::Environment::with_prefix("BOOKMARKS")
                .separator("_")
                .try_parsing(true),
        )
        .set_default("server_host", "0.0.0.0").unwrap()
        .set_default("server_port", 8080).unwrap()
        .set_default("log_level", "info").unwrap()
        .build();
        
    match cfg {
        Ok(c) => {
            println!("Config built successfully");
            println!("Keys: {:?}", c.try_deserialize::<std::collections::HashMap<String, String>>());
            match c.try_deserialize::<Config>() {
                Ok(config) => println!("Config loaded: {:?}", config),
                Err(e) => println!("Failed to deserialize: {:?}", e),
            }
        }
        Err(e) => println!("Failed to build config: {:?}", e),
    }
}
EOF

# Run the test
cargo run --bin test-config --manifest-path crates/shared/Cargo.toml test-config.rs 2>&1 || rustc test-config.rs -o test-config && ./test-config