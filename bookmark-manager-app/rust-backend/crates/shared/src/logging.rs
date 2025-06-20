use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::Arc;
use tracing::{Event, Subscriber};
use tracing_subscriber::{
    fmt::{self, format::FmtSpan, time::UtcTime},
    layer::SubscriberExt,
    registry::LookupSpan,
    Layer, Registry,
};
use uuid::Uuid;

/// Structured log entry for AI analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredLog {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub level: String,
    pub service: String,
    pub target: String,
    pub message: String,
    pub correlation_id: Option<String>,
    pub request_id: Option<String>,
    pub user_id: Option<Uuid>,
    pub span_id: Option<String>,
    pub parent_span_id: Option<String>,
    pub fields: serde_json::Value,
    pub error_details: Option<ErrorDetails>,
    pub performance_metrics: Option<PerformanceMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorDetails {
    pub error_type: String,
    pub error_message: String,
    pub stack_trace: Option<String>,
    pub context: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub duration_ms: f64,
    pub database_queries: u32,
    pub cache_hits: u32,
    pub cache_misses: u32,
    pub memory_used_bytes: Option<u64>,
}

/// File writer that outputs to Vector's input file
pub struct VectorFileWriter {
    file: std::sync::Mutex<std::fs::File>,
}

impl VectorFileWriter {
    pub fn new() -> Result<Self> {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open("/tmp/rust-services.log")?;
        
        Ok(Self {
            file: std::sync::Mutex::new(file),
        })
    }
}

impl Write for VectorFileWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mut file = self.file.lock().unwrap();
        file.write(buf)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        let mut file = self.file.lock().unwrap();
        file.flush()
    }
}

/// Custom layer that sends structured logs to Vector
pub struct VectorLayer {
    writer: Arc<VectorFileWriter>,
    service_name: String,
}

impl VectorLayer {
    pub fn new(service_name: impl Into<String>) -> Result<Self> {
        Ok(Self {
            writer: Arc::new(VectorFileWriter::new()?),
            service_name: service_name.into(),
        })
    }
}

impl<S> Layer<S> for VectorLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_event(&self, event: &Event<'_>, ctx: tracing_subscriber::layer::Context<'_, S>) {
        // Extract event metadata
        let metadata = event.metadata();
        let level = metadata.level();
        let target = metadata.target();
        
        // Get current span context
        let span_id = ctx.current_span().id().map(|id| id.into_u64().to_string());
        
        // Create structured log entry
        let mut fields = serde_json::Map::new();
        event.record(&mut JsonVisitor(&mut fields));
        
        let log_entry = StructuredLog {
            timestamp: chrono::Utc::now(),
            level: level.to_string(),
            service: self.service_name.clone(),
            target: target.to_string(),
            message: fields.get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            correlation_id: fields.get("correlation_id")
                .and_then(|v| v.as_str())
                .map(String::from),
            request_id: fields.get("request_id")
                .and_then(|v| v.as_str())
                .map(String::from),
            user_id: fields.get("user_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok()),
            span_id,
            parent_span_id: None, // TODO: Extract parent span
            fields: serde_json::Value::Object(fields),
            error_details: None, // TODO: Extract error details
            performance_metrics: None, // TODO: Extract performance metrics
        };
        
        // Write to Vector input file
        if let Ok(json) = serde_json::to_string(&log_entry) {
            let mut writer = self.writer.file.lock().unwrap();
            let _ = writeln!(writer, "{}", json);
            let _ = writer.flush();
        }
    }
}

/// JSON visitor for extracting event fields
struct JsonVisitor<'a>(&'a mut serde_json::Map<String, serde_json::Value>);

impl<'a> tracing::field::Visit for JsonVisitor<'a> {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        self.0.insert(
            field.name().to_string(),
            serde_json::Value::String(format!("{:?}", value)),
        );
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        self.0.insert(
            field.name().to_string(),
            serde_json::Value::String(value.to_string()),
        );
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        self.0.insert(
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        );
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        self.0.insert(
            field.name().to_string(),
            serde_json::Value::Number(value.into()),
        );
    }

    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        self.0.insert(
            field.name().to_string(),
            serde_json::Value::Bool(value),
        );
    }
}

/// Initialize unified logging for a service
pub fn init_unified_logging(service_name: impl Into<String>) -> Result<()> {
    let service_name = service_name.into();
    
    // Console layer for human-readable output
    let console_layer = fmt::layer()
        .with_timer(UtcTime::rfc_3339())
        .with_span_events(FmtSpan::CLOSE)
        .with_target(true)
        .with_thread_ids(true)
        .with_thread_names(true);
    
    // Vector layer for structured output
    let vector_layer = VectorLayer::new(service_name)?;
    
    // Combine layers
    let subscriber = Registry::default()
        .with(console_layer)
        .with(vector_layer)
        .with(tracing_subscriber::EnvFilter::from_default_env());
    
    // Set as global default
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set tracing subscriber");
    
    Ok(())
}

/// Helper macros for structured logging

#[macro_export]
macro_rules! log_with_context {
    ($level:expr, $msg:expr, { $($key:tt : $value:expr),* $(,)? }) => {
        match $level {
            tracing::Level::ERROR => tracing::error!($($key = ?$value,)* "{}", $msg),
            tracing::Level::WARN => tracing::warn!($($key = ?$value,)* "{}", $msg),
            tracing::Level::INFO => tracing::info!($($key = ?$value,)* "{}", $msg),
            tracing::Level::DEBUG => tracing::debug!($($key = ?$value,)* "{}", $msg),
            tracing::Level::TRACE => tracing::trace!($($key = ?$value,)* "{}", $msg),
        }
    };
}

#[macro_export]
macro_rules! log_error_with_context {
    ($err:expr, $msg:expr, { $($key:tt : $value:expr),* $(,)? }) => {
        tracing::error!(
            error_type = %std::any::type_name_of_val(&$err),
            error_message = %$err,
            $($key = ?$value,)*
            "{}",
            $msg
        )
    };
}

#[macro_export]
macro_rules! log_performance {
    ($operation:expr, $duration_ms:expr, { $($key:tt : $value:expr),* $(,)? }) => {
        tracing::info!(
            operation = $operation,
            duration_ms = $duration_ms,
            performance_event = true,
            $($key = ?$value,)*
            "Operation completed"
        )
    };
}

/// Correlation ID middleware support
pub mod correlation {
    use super::*;
    use actix_web::{
        dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
        Error, HttpMessage,
    };
    use futures::future::LocalBoxFuture;
    use std::future::{ready, Ready};
    
    pub struct CorrelationId;
    
    impl<S, B> Transform<S, ServiceRequest> for CorrelationId
    where
        S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
        S::Future: 'static,
        B: 'static,
    {
        type Response = ServiceResponse<B>;
        type Error = Error;
        type InitError = ();
        type Transform = CorrelationIdMiddleware<S>;
        type Future = Ready<Result<Self::Transform, Self::InitError>>;
        
        fn new_transform(&self, service: S) -> Self::Future {
            ready(Ok(CorrelationIdMiddleware { service }))
        }
    }
    
    pub struct CorrelationIdMiddleware<S> {
        service: S,
    }
    
    impl<S, B> Service<ServiceRequest> for CorrelationIdMiddleware<S>
    where
        S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
        S::Future: 'static,
        B: 'static,
    {
        type Response = ServiceResponse<B>;
        type Error = Error;
        type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;
        
        forward_ready!(service);
        
        fn call(&self, req: ServiceRequest) -> Self::Future {
            let correlation_id = req
                .headers()
                .get("x-correlation-id")
                .and_then(|h| h.to_str().ok())
                .map(String::from)
                .unwrap_or_else(|| Uuid::new_v4().to_string());
            
            req.extensions_mut().insert(correlation_id.clone());
            
            let fut = self.service.call(req);
            
            Box::pin(async move {
                let mut res = fut.await?;
                res.headers_mut().insert(
                    actix_web::http::header::HeaderName::from_static("x-correlation-id"),
                    actix_web::http::header::HeaderValue::from_str(&correlation_id).unwrap(),
                );
                Ok(res)
            })
        }
    }
}