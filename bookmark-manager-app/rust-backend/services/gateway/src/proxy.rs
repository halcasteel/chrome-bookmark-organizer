use actix_web::http::{header, StatusCode};
use actix_web::{web, Error, HttpRequest, HttpResponse};
use tracing::{error, info, warn};

use crate::AppState;

pub async fn proxy_request(
    req: HttpRequest,
    body: web::Bytes,
    path: web::Path<(String, String)>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    let (service_name, tail) = path.into_inner();

    // Get service configuration
    let service_config = state.services.get(&service_name).ok_or_else(|| {
        warn!("Unknown service requested: {}", service_name);
        actix_web::error::ErrorNotFound(format!("Service '{}' not found", service_name))
    })?;

    // Build target URL
    let target_url = format!("{}/{}", service_config.url, tail);

    info!("Proxying {} {} to {}", req.method(), req.path(), target_url);

    // Create request builder
    let mut proxy_req = state.client.request(req.method().clone(), &target_url);

    // Copy headers (except Host and Connection)
    for (name, value) in req.headers().iter() {
        if name != header::HOST && name != header::CONNECTION {
            if let Ok(value_str) = value.to_str() {
                proxy_req = proxy_req.header(name.as_str(), value_str);
            }
        }
    }

    // Send request with body
    let response = proxy_req.body(body.to_vec()).send().await.map_err(|e| {
        error!("Failed to proxy request to {}: {}", target_url, e);
        actix_web::error::ErrorBadGateway("Service unavailable")
    })?;

    // Build response
    let status = StatusCode::from_u16(response.status().as_u16())
        .unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    let mut client_resp = HttpResponse::build(status);

    // Copy response headers
    for (name, value) in response.headers().iter() {
        if name != header::CONNECTION {
            client_resp.insert_header((name.clone(), value.clone()));
        }
    }

    // Stream response body
    let body_bytes = response.bytes().await.map_err(|e| {
        error!("Failed to read response body: {}", e);
        actix_web::error::ErrorInternalServerError("Failed to read response")
    })?;

    Ok(client_resp.body(body_bytes))
}
