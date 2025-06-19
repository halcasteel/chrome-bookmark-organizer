use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    error::ErrorUnauthorized,
    http::header::AUTHORIZATION,
    Error, HttpMessage,
};
use futures::future::{ok, LocalBoxFuture, Ready};
use std::{rc::Rc, sync::Arc};

use crate::auth::{Claims, JwtService};

pub struct JwtAuth {
    jwt_service: Arc<JwtService>,
}

impl JwtAuth {
    pub fn new(jwt_service: Arc<JwtService>) -> Self {
        Self { jwt_service }
    }
}

impl<S, B> Transform<S, ServiceRequest> for JwtAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = JwtAuthMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(JwtAuthMiddleware {
            service: Rc::new(service),
            jwt_service: self.jwt_service.clone(),
        })
    }
}

pub struct JwtAuthMiddleware<S> {
    service: Rc<S>,
    jwt_service: Arc<JwtService>,
}

impl<S, B> Service<ServiceRequest> for JwtAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        let jwt_service = self.jwt_service.clone();

        Box::pin(async move {
            // Extract Authorization header
            let auth_header = req.headers().get(AUTHORIZATION);

            if let Some(auth_value) = auth_header {
                if let Ok(auth_str) = auth_value.to_str() {
                    if let Some(token) = auth_str.strip_prefix("Bearer ") {
                        // Validate token
                        match jwt_service.validate_token(token) {
                            Ok(claims) => {
                                // Store claims in request extensions
                                req.extensions_mut().insert::<Claims>(claims);
                            }
                            Err(_) => {
                                return Err(ErrorUnauthorized("Invalid token"));
                            }
                        }
                    } else {
                        return Err(ErrorUnauthorized("Invalid authorization format"));
                    }
                } else {
                    return Err(ErrorUnauthorized("Invalid authorization header"));
                }
            } else {
                return Err(ErrorUnauthorized("Missing authorization header"));
            }

            // Continue to the next service
            service.call(req).await
        })
    }
}
