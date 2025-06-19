use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceConfig {
    pub name: String,
    pub url: String,
    pub health_endpoint: String,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone)]
pub struct GatewayConfig {
    pub services: HashMap<String, ServiceConfig>,
    pub frontend_url: String,
}

impl Default for GatewayConfig {
    fn default() -> Self {
        let mut services = HashMap::new();

        // Auth service
        services.insert(
            "auth".to_string(),
            ServiceConfig {
                name: "auth-service".to_string(),
                url: "http://localhost:8001".to_string(),
                health_endpoint: "/health".to_string(),
                timeout_seconds: 30,
            },
        );

        // Bookmarks service
        services.insert(
            "bookmarks".to_string(),
            ServiceConfig {
                name: "bookmarks-service".to_string(),
                url: "http://localhost:8002".to_string(),
                health_endpoint: "/health".to_string(),
                timeout_seconds: 30,
            },
        );

        // Import service
        services.insert(
            "import".to_string(),
            ServiceConfig {
                name: "import-service".to_string(),
                url: "http://localhost:8003".to_string(),
                health_endpoint: "/health".to_string(),
                timeout_seconds: 60,
            },
        );

        // Search service
        services.insert(
            "search".to_string(),
            ServiceConfig {
                name: "search-service".to_string(),
                url: "http://localhost:8004".to_string(),
                health_endpoint: "/health".to_string(),
                timeout_seconds: 30,
            },
        );

        Self {
            services,
            frontend_url: "http://localhost:5173".to_string(),
        }
    }
}

impl GatewayConfig {
    pub fn from_env() -> Self {
        let mut config = Self::default();

        // Override with environment variables if set
        if let Ok(auth_url) = std::env::var("AUTH_SERVICE_URL") {
            if let Some(service) = config.services.get_mut("auth") {
                service.url = auth_url;
            }
        }

        if let Ok(bookmarks_url) = std::env::var("BOOKMARKS_SERVICE_URL") {
            if let Some(service) = config.services.get_mut("bookmarks") {
                service.url = bookmarks_url;
            }
        }

        if let Ok(import_url) = std::env::var("IMPORT_SERVICE_URL") {
            if let Some(service) = config.services.get_mut("import") {
                service.url = import_url;
            }
        }

        if let Ok(search_url) = std::env::var("SEARCH_SERVICE_URL") {
            if let Some(service) = config.services.get_mut("search") {
                service.url = search_url;
            }
        }

        if let Ok(frontend_url) = std::env::var("FRONTEND_URL") {
            config.frontend_url = frontend_url;
        }

        config
    }
}