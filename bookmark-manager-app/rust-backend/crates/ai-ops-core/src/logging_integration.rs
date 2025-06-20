use crate::{
    agent::{UniversalAgent, AgentType, Capability, Decision, Context, AgentStatus, EventPattern, 
            Experience, Knowledge, CollaborationRequest, CollaborationResponse, AgentState, Health},
    events::{Event, EventType, EventSeverity},
    knowledge::{KnowledgeNode, KnowledgeGraph, Solution, SolutionOutcome, Pattern, PatternType},
    patterns::{UniversalPattern, PatternLibrary, PatternCategory, PatternId},
    AgentId, Result, Error,
};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Log event that can be processed by AI-Ops agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEvent {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub service: String,
    pub message: String,
    pub correlation_id: Option<String>,
    pub user_id: Option<Uuid>,
    pub error_details: Option<ErrorDetails>,
    pub performance_metrics: Option<PerformanceMetrics>,
    pub context: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
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

/// Converts logs into events for AI-Ops processing
pub struct LogEventAdapter {
    db_pool: PgPool,
}

impl LogEventAdapter {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    /// Convert a log entry to an AI-Ops event
    pub fn log_to_event(&self, log: &LogEvent) -> Event {
        let severity = match log.level {
            LogLevel::Error => EventSeverity::Critical,
            LogLevel::Warn => EventSeverity::High,
            LogLevel::Info => EventSeverity::Medium,
            LogLevel::Debug | LogLevel::Trace => EventSeverity::Low,
        };

        let event_type = self.determine_event_type(log);
        
        Event {
            id: log.id,
            timestamp: log.timestamp,
            event_type,
            severity,
            source: log.service.clone(),
            description: log.message.clone(),
            metadata: self.build_metadata(log),
            correlation_id: log.correlation_id.clone(),
            parent_id: None,
        }
    }

    fn determine_event_type(&self, log: &LogEvent) -> EventType {
        // Analyze log content to determine event type
        let message_lower = log.message.to_lowercase();
        
        if log.level == LogLevel::Error {
            if message_lower.contains("database") || message_lower.contains("connection") {
                EventType::DatabaseError
            } else if message_lower.contains("auth") || message_lower.contains("permission") {
                EventType::SecurityIncident
            } else {
                EventType::ServiceFailure
            }
        } else if let Some(perf) = &log.performance_metrics {
            if perf.duration_ms > 1000.0 {
                EventType::PerformanceDegradation
            } else {
                EventType::MetricUpdate
            }
        } else if message_lower.contains("deploy") || message_lower.contains("update") {
            EventType::ConfigurationChange
        } else {
            EventType::Custom(log.level.to_string())
        }
    }

    fn build_metadata(&self, log: &LogEvent) -> serde_json::Value {
        let mut metadata = serde_json::Map::new();
        
        if let Some(user_id) = &log.user_id {
            metadata.insert("user_id".to_string(), serde_json::json!(user_id));
        }
        
        if let Some(error) = &log.error_details {
            metadata.insert("error_type".to_string(), serde_json::json!(error.error_type));
            metadata.insert("error_message".to_string(), serde_json::json!(error.error_message));
        }
        
        if let Some(perf) = &log.performance_metrics {
            metadata.insert("duration_ms".to_string(), serde_json::json!(perf.duration_ms));
            metadata.insert("db_queries".to_string(), serde_json::json!(perf.database_queries));
        }
        
        // Merge with existing context
        if let serde_json::Value::Object(context) = &log.context {
            for (k, v) in context {
                metadata.insert(k.clone(), v.clone());
            }
        }
        
        serde_json::Value::Object(metadata)
    }

    /// Query logs for analysis
    pub async fn query_logs(
        &self,
        service: Option<String>,
        level: Option<LogLevel>,
        start_time: DateTime<Utc>,
        end_time: DateTime<Utc>,
        limit: i64,
    ) -> Result<Vec<LogEvent>> {
        let level_str = level.map(|l| format!("{:?}", l).to_uppercase());
        
        let logs = sqlx::query_as!(
            LogEventRecord,
            r#"
            SELECT 
                id,
                timestamp,
                level,
                service,
                message,
                correlation_id,
                user_id,
                error_details,
                performance_metrics,
                fields as context
            FROM application_logs
            WHERE 
                ($1::VARCHAR IS NULL OR service = $1)
                AND ($2::VARCHAR IS NULL OR level = $2)
                AND timestamp BETWEEN $3 AND $4
            ORDER BY timestamp DESC
            LIMIT $5
            "#,
            service,
            level_str,
            start_time,
            end_time,
            limit
        )
        .fetch_all(&self.db_pool)
        .await?;

        Ok(logs.into_iter().map(|r| r.into()).collect())
    }

    /// Get error statistics for pattern analysis
    pub async fn get_error_patterns(&self, hours: i32) -> Result<Vec<ErrorPattern>> {
        let patterns = sqlx::query!(
            r#"
            SELECT 
                service,
                error_details->>'error_type' as error_type,
                COUNT(*) as occurrence_count,
                array_agg(DISTINCT user_id) as affected_users,
                MIN(timestamp) as first_seen,
                MAX(timestamp) as last_seen,
                array_agg(correlation_id) as correlation_ids
            FROM application_logs
            WHERE 
                level = 'ERROR'
                AND timestamp > NOW() - INTERVAL '1 hour' * $1
                AND error_details IS NOT NULL
            GROUP BY service, error_details->>'error_type'
            HAVING COUNT(*) > 1
            ORDER BY COUNT(*) DESC
            "#,
            hours
        )
        .fetch_all(&self.db_pool)
        .await?;

        Ok(patterns.into_iter().map(|r| ErrorPattern {
            service: r.service,
            error_type: r.error_type.unwrap_or_default(),
            occurrence_count: r.occurrence_count.unwrap_or(0) as u32,
            affected_users: r.affected_users.unwrap_or_default().into_iter().flatten().collect(),
            first_seen: r.first_seen.unwrap_or_default(),
            last_seen: r.last_seen.unwrap_or_default(),
            correlation_ids: r.correlation_ids.unwrap_or_default().into_iter().flatten().collect(),
        }).collect())
    }
}

/// Error pattern for AI analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPattern {
    pub service: String,
    pub error_type: String,
    pub occurrence_count: u32,
    pub affected_users: Vec<Uuid>,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub correlation_ids: Vec<String>,
}

/// Log monitoring agent that processes logs in real-time
pub struct LogMonitoringAgent {
    adapter: Arc<LogEventAdapter>,
    event_tx: tokio::sync::mpsc::Sender<Event>,
}

impl LogMonitoringAgent {
    pub fn new(
        adapter: Arc<LogEventAdapter>,
        event_tx: tokio::sync::mpsc::Sender<Event>,
    ) -> Self {
        Self { adapter, event_tx }
    }

    /// Start monitoring logs
    pub async fn start_monitoring(&self) -> Result<()> {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));
        let mut last_check = Utc::now();

        loop {
            interval.tick().await;
            let now = Utc::now();

            // Query recent logs
            match self.adapter.query_logs(
                None,
                None,
                last_check,
                now,
                100,
            ).await {
                Ok(logs) => {
                    for log in logs {
                        // Convert high-severity logs to events
                        if matches!(log.level, LogLevel::Error | LogLevel::Warn) {
                            let event = self.adapter.log_to_event(&log);
                            if let Err(e) = self.event_tx.send(event).await {
                                error!("Failed to send log event: {}", e);
                            }
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to query logs: {}", e);
                }
            }

            last_check = now;
        }
    }

    /// Analyze error patterns
    pub async fn analyze_patterns(&self) -> Result<Vec<Pattern>> {
        let error_patterns = self.adapter.get_error_patterns(24).await?;
        let mut patterns = Vec::new();

        for error_pattern in error_patterns {
            // Create a pattern for recurring errors
            if error_pattern.occurrence_count > 5 {
                let pattern = Pattern {
                    id: Uuid::new_v4(),
                    name: format!("{} - {}", error_pattern.service, error_pattern.error_type),
                    pattern_type: PatternType::Failure,
                    trigger_conditions: serde_json::json!({
                        "service": error_pattern.service,
                        "error_type": error_pattern.error_type,
                        "threshold": 5,
                    }),
                    recommended_actions: vec![
                        "Investigate root cause".to_string(),
                        "Check service dependencies".to_string(),
                        "Review recent deployments".to_string(),
                    ],
                    success_rate: 0.0, // Will be updated based on solutions
                    metadata: serde_json::json!({
                        "occurrence_count": error_pattern.occurrence_count,
                        "affected_users": error_pattern.affected_users.len(),
                        "time_span": (error_pattern.last_seen - error_pattern.first_seen).num_minutes(),
                    }),
                };
                patterns.push(pattern);
            }
        }

        Ok(patterns)
    }
}

#[async_trait]
impl UniversalAgent for LogMonitoringAgent {
    fn id(&self) -> AgentId {
        self.id
    }

    fn agent_type(&self) -> AgentType {
        AgentType::LogAnalyzer
    }

    fn name(&self) -> &str {
        "Log Monitoring Agent"
    }

    fn capabilities(&self) -> Vec<Capability> {
        vec![
            Capability::LogAnalysis,
            Capability::AnomalyDetection,
        ]
    }

    fn subscriptions(&self) -> Vec<EventPattern> {
        vec![
            EventPattern {
                event_types: vec![EventType::ServiceFailure, EventType::DatabaseError],
                source_filter: None,
                metadata_filters: HashMap::new(),
            }
        ]
    }

    async fn process(&mut self, event: Event) -> Result<Vec<Event>> {
        let mut events = Vec::new();
        
        // Analyze log-based events
        match &event.event_type {
            EventType::ServiceFailure | EventType::DatabaseError => {
                // Query related logs for context
                let related_logs = self.adapter.query_logs(
                    Some(event.source.clone()),
                    Some(LogLevel::Error),
                    event.timestamp - chrono::Duration::minutes(5),
                    event.timestamp + chrono::Duration::minutes(1),
                    50,
                ).await?;

                // Look for patterns
                let mut error_types = HashMap::new();
                for log in &related_logs {
                    if let Some(error) = &log.error_details {
                        *error_types.entry(&error.error_type).or_insert(0) += 1;
                    }
                }

                // Generate analysis event if significant errors found
                if related_logs.len() > 10 {
                    events.push(Event {
                        id: Uuid::new_v4(),
                        timestamp: Utc::now(),
                        event_type: EventType::Custom("LogPatternDetected".to_string()),
                        source: self.id.to_string(),
                        severity: EventSeverity::Medium,
                        service_id: event.service_id.clone(),
                        correlation_id: event.correlation_id.clone(),
                        metadata: serde_json::json!({
                            "related_errors": related_logs.len(),
                            "error_types": error_types,
                            "time_span_minutes": 6,
                            "patterns_detected": true
                        }),
                    });
                }
            }
            _ => {}
        }
        
        Ok(events)
    }

    async fn learn(&mut self, experience: Experience) -> Result<Knowledge> {
        // Learn from log patterns
        let confidence = if experience.outcome.success { 0.8 } else { 0.3 };
        
        Ok(Knowledge {
            knowledge_type: crate::agent::KnowledgeType::Pattern,
            content: serde_json::json!({
                "experience": experience,
                "learned_at": Utc::now(),
            }),
            confidence,
            applicable_contexts: vec![Context {
                environment: HashMap::new(),
                constraints: vec![],
                requirements: vec![],
            }],
        })
    }

    async fn collaborate(&mut self, request: CollaborationRequest) -> Result<CollaborationResponse> {
        Ok(CollaborationResponse {
            request_id: request.request_id,
            responder: self.id,
            response_type: crate::agent::ResponseType::Accepted,
            content: serde_json::json!({
                "message": "Ready to collaborate on log analysis"
            }),
        })
    }

    async fn status(&self) -> AgentStatus {
        AgentStatus {
            state: AgentState::Idle,
            health: Health::Healthy,
            current_load: 0.0,
            active_tasks: 0,
            last_activity: Utc::now(),
            metrics: HashMap::new(),
        }
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Log monitoring agent shutting down");
        Ok(())
    }
}

// Database record struct
struct LogEventRecord {
    id: Uuid,
    timestamp: DateTime<Utc>,
    level: String,
    service: String,
    message: String,
    correlation_id: Option<String>,
    user_id: Option<Uuid>,
    error_details: Option<serde_json::Value>,
    performance_metrics: Option<serde_json::Value>,
    context: Option<serde_json::Value>,
}

impl From<LogEventRecord> for LogEvent {
    fn from(record: LogEventRecord) -> Self {
        LogEvent {
            id: record.id,
            timestamp: record.timestamp,
            level: match record.level.as_str() {
                "ERROR" => LogLevel::Error,
                "WARN" => LogLevel::Warn,
                "INFO" => LogLevel::Info,
                "DEBUG" => LogLevel::Debug,
                "TRACE" => LogLevel::Trace,
                _ => LogLevel::Info,
            },
            service: record.service,
            message: record.message,
            correlation_id: record.correlation_id,
            user_id: record.user_id,
            error_details: record.error_details.and_then(|v| serde_json::from_value(v).ok()),
            performance_metrics: record.performance_metrics.and_then(|v| serde_json::from_value(v).ok()),
            context: record.context.unwrap_or_default(),
        }
    }
}

impl ToString for LogLevel {
    fn to_string(&self) -> String {
        match self {
            LogLevel::Error => "ERROR",
            LogLevel::Warn => "WARN",
            LogLevel::Info => "INFO",
            LogLevel::Debug => "DEBUG",
            LogLevel::Trace => "TRACE",
        }.to_string()
    }
}

/// Integration with Vector for real-time log streaming
pub mod vector_integration {
    use super::*;
    use futures::StreamExt;
    use tokio::net::TcpStream;
    use tokio_util::codec::{FramedRead, LinesCodec};

    pub struct VectorLogStream {
        adapter: Arc<LogEventAdapter>,
        event_tx: tokio::sync::mpsc::Sender<Event>,
    }

    impl VectorLogStream {
        pub fn new(
            adapter: Arc<LogEventAdapter>,
            event_tx: tokio::sync::mpsc::Sender<Event>,
        ) -> Self {
            Self { adapter, event_tx }
        }

        /// Connect to Vector's TCP output and process logs in real-time
        pub async fn start_streaming(&self, vector_address: &str) -> Result<()> {
            let stream = TcpStream::connect(vector_address).await?;
            let mut lines = FramedRead::new(stream, LinesCodec::new());

            while let Some(line) = lines.next().await {
                match line {
                    Ok(data) => {
                        if let Ok(log) = serde_json::from_str::<LogEvent>(&data) {
                            // Process high-priority logs immediately
                            if matches!(log.level, LogLevel::Error | LogLevel::Warn) {
                                let event = self.adapter.log_to_event(&log);
                                let _ = self.event_tx.send(event).await;
                            }
                        }
                    }
                    Err(e) => {
                        error!("Error reading from Vector stream: {}", e);
                    }
                }
            }

            Ok(())
        }
    }
}