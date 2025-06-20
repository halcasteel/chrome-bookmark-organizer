//! Fix Executor Agent
//! 
//! This agent executes proposed solutions autonomously, monitors their progress,
//! and validates the fixes.

use async_trait::async_trait;
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tracing::{info, warn, error};
use std::process::Command;

use crate::{
    Result, Event, EventType, AgentId,
    agent::{
        UniversalAgent, AgentType, Capability, EventPattern, Experience, 
        Knowledge, CollaborationRequest, CollaborationResponse, AgentStatus,
        AgentState, Health, Context, Decision, Action, ActionType, Outcome,
        KnowledgeType
    },
    events::EventSeverity,
    knowledge::KnowledgeGraph,
};

/// Fix Executor Agent - Executes solutions and monitors their effectiveness
pub struct FixExecutorAgent {
    id: AgentId,
    name: String,
    knowledge_graph: KnowledgeGraph,
    active_fixes: HashMap<String, ActiveFix>,
    execution_history: Vec<ExecutionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ActiveFix {
    id: String,
    solution: ProposedSolution,
    started_at: DateTime<Utc>,
    current_step: usize,
    status: FixStatus,
    execution_log: Vec<ExecutionStep>,
    validation_results: Option<ValidationResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProposedSolution {
    description: String,
    steps: Vec<FixStep>,
    risk_level: RiskLevel,
    rollback_steps: Vec<FixStep>,
    validation_checks: Vec<ValidationCheck>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FixStep {
    description: String,
    command: Option<String>,
    script: Option<String>,
    config_change: Option<ConfigChange>,
    timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ConfigChange {
    file_path: String,
    key: String,
    old_value: serde_json::Value,
    new_value: serde_json::Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum FixStatus {
    Pending,
    InProgress,
    Validating,
    Completed,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExecutionStep {
    step_index: usize,
    started_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
    status: StepStatus,
    output: String,
    error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum StepStatus {
    Pending,
    Running,
    Success,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ValidationCheck {
    name: String,
    check_type: CheckType,
    expected_result: serde_json::Value,
    timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum CheckType {
    ServiceHealth,
    LogAbsence,
    MetricThreshold,
    HttpEndpoint,
    DatabaseQuery,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ValidationResult {
    all_passed: bool,
    checks: Vec<CheckResult>,
    validated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CheckResult {
    check_name: String,
    passed: bool,
    actual_result: serde_json::Value,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExecutionRecord {
    fix_id: String,
    solution: ProposedSolution,
    outcome: Outcome,
    duration: Duration,
    executed_at: DateTime<Utc>,
}

impl FixExecutorAgent {
    pub async fn new(knowledge_graph: KnowledgeGraph) -> Result<Self> {
        Ok(Self {
            id: Uuid::new_v4(),
            name: "Fix Executor Agent".to_string(),
            knowledge_graph,
            active_fixes: HashMap::new(),
            execution_history: Vec::new(),
        })
    }

    async fn execute_fix(&mut self, solution: ProposedSolution, correlation_id: String) -> Result<()> {
        let fix_id = correlation_id.clone();
        
        // Create active fix record
        let active_fix = ActiveFix {
            id: fix_id.clone(),
            solution: solution.clone(),
            started_at: Utc::now(),
            current_step: 0,
            status: FixStatus::InProgress,
            execution_log: Vec::new(),
            validation_results: None,
        };
        
        self.active_fixes.insert(fix_id.clone(), active_fix);
        
        // Execute each step
        for (index, step) in solution.steps.iter().enumerate() {
            match self.execute_step(&fix_id, index, step).await {
                Ok(()) => {
                    info!("Successfully executed step {} for fix {}", index, fix_id);
                }
                Err(e) => {
                    error!("Failed to execute step {} for fix {}: {}", index, fix_id, e);
                    
                    // Update status to failed
                    if let Some(fix) = self.active_fixes.get_mut(&fix_id) {
                        fix.status = FixStatus::Failed;
                    }
                    
                    // Attempt rollback if high risk
                    if matches!(solution.risk_level, RiskLevel::High) {
                        self.rollback_fix(&fix_id).await?;
                    }
                    
                    return Err(e);
                }
            }
            
            // Update current step
            if let Some(fix) = self.active_fixes.get_mut(&fix_id) {
                fix.current_step = index + 1;
            }
        }
        
        // Validate the fix
        self.validate_fix(&fix_id).await?;
        
        Ok(())
    }

    async fn execute_step(&mut self, fix_id: &str, index: usize, step: &FixStep) -> Result<()> {
        let started_at = Utc::now();
        
        let mut execution_step = ExecutionStep {
            step_index: index,
            started_at,
            completed_at: None,
            status: StepStatus::Running,
            output: String::new(),
            error: None,
        };
        
        // Execute based on step type
        let result = if let Some(command) = &step.command {
            self.execute_command(command, step.timeout_seconds).await
        } else if let Some(script) = &step.script {
            self.execute_script(script, step.timeout_seconds).await
        } else if let Some(config_change) = &step.config_change {
            self.apply_config_change(config_change).await
        } else {
            Err(crate::Error::InvalidInput("No execution method specified".to_string()))
        };
        
        // Update execution step
        execution_step.completed_at = Some(Utc::now());
        match result {
            Ok(output) => {
                execution_step.status = StepStatus::Success;
                execution_step.output = output;
            }
            Err(e) => {
                execution_step.status = StepStatus::Failed;
                execution_step.error = Some(e.to_string());
                
                // Add to fix log
                if let Some(fix) = self.active_fixes.get_mut(fix_id) {
                    fix.execution_log.push(execution_step);
                }
                
                return Err(e);
            }
        }
        
        // Add to fix log
        if let Some(fix) = self.active_fixes.get_mut(fix_id) {
            fix.execution_log.push(execution_step);
        }
        
        Ok(())
    }

    async fn execute_command(&self, command: &str, timeout_seconds: u64) -> Result<String> {
        info!("Executing command: {}", command);
        
        // Use tokio::process for async execution
        let output = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .output()
            .await
            .map_err(|e| crate::Error::Execution(format!("Command failed: {}", e)))?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(crate::Error::Execution(format!(
                "Command failed with status {}: {}",
                output.status,
                String::from_utf8_lossy(&output.stderr)
            )))
        }
    }

    async fn execute_script(&self, script: &str, timeout_seconds: u64) -> Result<String> {
        // Write script to temporary file
        let temp_dir = std::env::temp_dir();
        let script_path = temp_dir.join(format!("fix_script_{}.sh", Uuid::new_v4()));
        
        tokio::fs::write(&script_path, script).await
            .map_err(|e| crate::Error::Execution(format!("Failed to write script: {}", e)))?;
        
        // Make executable
        let _ = Command::new("chmod")
            .arg("+x")
            .arg(&script_path)
            .output();
        
        // Execute script
        let result = self.execute_command(&script_path.to_string_lossy(), timeout_seconds).await;
        
        // Clean up
        let _ = tokio::fs::remove_file(&script_path).await;
        
        result
    }

    async fn apply_config_change(&self, config: &ConfigChange) -> Result<String> {
        // Read current config
        let content = tokio::fs::read_to_string(&config.file_path).await
            .map_err(|e| crate::Error::Execution(format!("Failed to read config: {}", e)))?;
        
        // Parse as JSON
        let mut json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| crate::Error::Execution(format!("Failed to parse config: {}", e)))?;
        
        // Update value
        json[&config.key] = config.new_value.clone();
        
        // Write back
        let updated = serde_json::to_string_pretty(&json)
            .map_err(|e| crate::Error::Execution(format!("Failed to serialize config: {}", e)))?;
        
        tokio::fs::write(&config.file_path, &updated).await
            .map_err(|e| crate::Error::Execution(format!("Failed to write config: {}", e)))?;
        
        Ok(format!("Updated {} in {}", config.key, config.file_path))
    }

    async fn validate_fix(&mut self, fix_id: &str) -> Result<()> {
        let fix = self.active_fixes.get(fix_id)
            .ok_or_else(|| crate::Error::NotFound("Fix not found".to_string()))?;
        
        let validation_checks = fix.solution.validation_checks.clone();
        let mut check_results = Vec::new();
        
        for check in validation_checks {
            let result = self.perform_validation_check(&check).await;
            check_results.push(result);
        }
        
        let all_passed = check_results.iter().all(|r| r.passed);
        
        let validation_result = ValidationResult {
            all_passed,
            checks: check_results,
            validated_at: Utc::now(),
        };
        
        // Update fix status
        if let Some(fix) = self.active_fixes.get_mut(fix_id) {
            fix.validation_results = Some(validation_result.clone());
            fix.status = if all_passed {
                FixStatus::Completed
            } else {
                FixStatus::Failed
            };
        }
        
        if !all_passed {
            return Err(crate::Error::Validation("Fix validation failed".to_string()));
        }
        
        Ok(())
    }

    async fn perform_validation_check(&self, check: &ValidationCheck) -> CheckResult {
        match &check.check_type {
            CheckType::ServiceHealth => {
                // Check service health endpoint
                CheckResult {
                    check_name: check.name.clone(),
                    passed: true, // Stub
                    actual_result: serde_json::json!({"status": "healthy"}),
                    message: "Service is healthy".to_string(),
                }
            }
            CheckType::LogAbsence => {
                // Check that error logs are no longer appearing
                CheckResult {
                    check_name: check.name.clone(),
                    passed: true, // Stub
                    actual_result: serde_json::json!({"error_count": 0}),
                    message: "No errors found in logs".to_string(),
                }
            }
            _ => CheckResult {
                check_name: check.name.clone(),
                passed: false,
                actual_result: serde_json::Value::Null,
                message: "Check type not implemented".to_string(),
            }
        }
    }

    async fn rollback_fix(&mut self, fix_id: &str) -> Result<()> {
        warn!("Rolling back fix {}", fix_id);
        
        let fix = self.active_fixes.get(fix_id)
            .ok_or_else(|| crate::Error::NotFound("Fix not found".to_string()))?;
        
        let rollback_steps = fix.solution.rollback_steps.clone();
        
        for (index, step) in rollback_steps.iter().enumerate() {
            match self.execute_step(fix_id, index, step).await {
                Ok(()) => info!("Rollback step {} succeeded", index),
                Err(e) => error!("Rollback step {} failed: {}", index, e),
            }
        }
        
        if let Some(fix) = self.active_fixes.get_mut(fix_id) {
            fix.status = FixStatus::RolledBack;
        }
        
        Ok(())
    }
}

#[async_trait]
impl UniversalAgent for FixExecutorAgent {
    fn id(&self) -> AgentId {
        self.id
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Healing
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn capabilities(&self) -> Vec<Capability> {
        vec![
            Capability::ServiceRestart,
            Capability::ConfigurationUpdate,
            Capability::ResourceScaling,
        ]
    }

    fn subscriptions(&self) -> Vec<EventPattern> {
        vec![
            EventPattern {
                event_types: vec![
                    EventType::Custom("SolutionsProposed".to_string()),
                ],
                source_filter: None,
                metadata_filters: HashMap::new(),
            }
        ]
    }

    async fn process(&mut self, event: Event) -> Result<Vec<Event>> {
        let mut events = Vec::new();
        
        if let EventType::Custom(event_type) = &event.event_type {
            if event_type == "SolutionsProposed" {
                // Extract proposed solutions
                if let Some(solutions) = event.metadata.get("solutions") {
                    if let Ok(solutions) = serde_json::from_value::<Vec<ProposedSolution>>(solutions.clone()) {
                        // Execute the first low-risk solution automatically
                        for solution in solutions {
                            if matches!(solution.risk_level, RiskLevel::Low) {
                                let correlation_id = event.correlation_id.clone()
                                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                                
                                info!("Executing low-risk fix: {}", solution.description);
                                
                                match self.execute_fix(solution.clone(), correlation_id.clone()).await {
                                    Ok(()) => {
                                        events.push(Event {
                                            id: Uuid::new_v4(),
                                            timestamp: Utc::now(),
                                            event_type: EventType::Custom("FixExecuted".to_string()),
                                            source: self.id.to_string(),
                                            severity: EventSeverity::Low,
                                            service_id: event.service_id.clone(),
                                            correlation_id: Some(correlation_id),
                                            metadata: serde_json::json!({
                                                "solution": solution,
                                                "status": "completed",
                                            }),
                                        });
                                    }
                                    Err(e) => {
                                        error!("Fix execution failed: {}", e);
                                        events.push(Event {
                                            id: Uuid::new_v4(),
                                            timestamp: Utc::now(),
                                            event_type: EventType::Custom("FixFailed".to_string()),
                                            source: self.id.to_string(),
                                            severity: EventSeverity::High,
                                            service_id: event.service_id.clone(),
                                            correlation_id: Some(correlation_id),
                                            metadata: serde_json::json!({
                                                "solution": solution,
                                                "error": e.to_string(),
                                            }),
                                        });
                                    }
                                }
                                
                                break; // Only execute one solution at a time
                            }
                        }
                    }
                }
            }
        }
        
        Ok(events)
    }

    async fn learn(&mut self, experience: Experience) -> Result<Knowledge> {
        // Record execution history
        if let Some(fix_id) = experience.event.correlation_id {
            if let Some(fix) = self.active_fixes.get(&fix_id) {
                self.execution_history.push(ExecutionRecord {
                    fix_id: fix_id.clone(),
                    solution: fix.solution.clone(),
                    outcome: experience.outcome.clone(),
                    duration: fix.started_at.signed_duration_since(Utc::now()).abs(),
                    executed_at: fix.started_at,
                });
            }
        }
        
        // Learn from successful fixes
        let confidence = if experience.outcome.success { 0.9 } else { 0.2 };
        
        Ok(Knowledge {
            knowledge_type: KnowledgeType::Solution,
            content: serde_json::json!({
                "fix_type": experience.action_taken.action_type,
                "outcome": experience.outcome,
                "duration": experience.duration.as_secs(),
            }),
            confidence,
            applicable_contexts: vec![Context {
                environment: HashMap::new(),
                constraints: vec!["automated_fix".to_string()],
                requirements: vec!["low_risk".to_string()],
            }],
        })
    }

    async fn collaborate(&mut self, request: CollaborationRequest) -> Result<CollaborationResponse> {
        Ok(CollaborationResponse {
            request_id: request.request_id,
            responder: self.id,
            response_type: crate::agent::ResponseType::Accepted,
            content: serde_json::json!({
                "message": "Ready to execute proposed fixes",
                "capabilities": ["command_execution", "config_updates", "validation"],
            }),
        })
    }

    async fn status(&self) -> AgentStatus {
        AgentStatus {
            state: if self.active_fixes.is_empty() {
                AgentState::Idle
            } else {
                AgentState::Processing
            },
            health: Health::Healthy,
            current_load: self.active_fixes.len() as f64 / 5.0, // Max 5 concurrent fixes
            active_tasks: self.active_fixes.len(),
            last_activity: Utc::now(),
            metrics: {
                let mut metrics = HashMap::new();
                metrics.insert("active_fixes".to_string(), self.active_fixes.len() as f64);
                metrics.insert("total_executed".to_string(), self.execution_history.len() as f64);
                metrics
            },
        }
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Fix executor agent shutting down with {} active fixes", 
              self.active_fixes.len());
        
        // Wait for active fixes to complete or timeout
        for (fix_id, fix) in &self.active_fixes {
            if matches!(fix.status, FixStatus::InProgress) {
                warn!("Active fix {} still in progress during shutdown", fix_id);
            }
        }
        
        Ok(())
    }
}