use actix_web::{error::ResponseError, HttpResponse};
use domain::errors::DomainError;
use std::fmt;

#[derive(Debug)]
pub struct ApiError {
    pub message: String,
    pub status_code: u16,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl ResponseError for ApiError {
    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(actix_web::http::StatusCode::from_u16(self.status_code).unwrap()).json(
            serde_json::json!({
                "error": self.message,
            }),
        )
    }
}

impl From<DomainError> for ApiError {
    fn from(err: DomainError) -> Self {
        match err {
            DomainError::NotFound { .. } => ApiError {
                message: err.to_string(),
                status_code: 404,
            },
            DomainError::ValidationError(_) => ApiError {
                message: err.to_string(),
                status_code: 400,
            },
            DomainError::Unauthorized => ApiError {
                message: err.to_string(),
                status_code: 401,
            },
            DomainError::Forbidden => ApiError {
                message: err.to_string(),
                status_code: 403,
            },
            DomainError::Conflict(_) => ApiError {
                message: err.to_string(),
                status_code: 409,
            },
            _ => ApiError {
                message: "Internal server error".to_string(),
                status_code: 500,
            },
        }
    }
}
