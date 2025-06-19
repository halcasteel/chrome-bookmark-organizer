//! Pattern Application System

use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

use crate::{Result, Error};
use super::{UniversalPattern, ApplicationContext};

/// Pattern applicator
pub struct PatternApplicator {
    executors: HashMap<String, Box<dyn ActionExecutor>>,
}

impl PatternApplicator {
    /// Create a new pattern applicator
    pub fn new() -> Self {
        let mut executors = HashMap::new();
        
        // Register default executors
        executors.insert(
            "execute".to_string(),
            Box::new(CommandExecutor::new()) as Box<dyn ActionExecutor>,
        );
        executors.insert(
            "configure".to_string(),
            Box::new(ConfigurationExecutor::new()) as Box<dyn ActionExecutor>,
        );
        executors.insert(
            "scale".to_string(),
            Box::new(ScalingExecutor::new()) as Box<dyn ActionExecutor>,
        );
        
        Self { executors }
    }
    
    /// Apply a pattern
    pub async fn apply(
        &self,
        pattern: &UniversalPattern,
        context: &ApplicationContext,
    ) -> Result<ApplicationResult> {
        let start_time = Utc::now();
        let mut step_results = Vec::new();
        let mut rollback_needed = false;
        
        // Execute each step
        for step in &pattern.solution.steps {
            let step_result = self.execute_step(step, context).await?;
            
            if !step_result.success {
                match step.on_failure {
                    super::FailureStrategy::Retry => {
                        // Retry logic
                        let retry_result = self.execute_step(step, context).await?;
                        step_results.push(retry_result.clone());
                        if !retry_result.success {
                            rollback_needed = true;
                            break;
                        }
                    }
                    super::FailureStrategy::Skip => {
                        step_results.push(step_result);
                        continue;
                    }
                    super::FailureStrategy::Abort => {
                        step_results.push(step_result);
                        rollback_needed = true;
                        break;
                    }
                    super::FailureStrategy::Rollback => {
                        step_results.push(step_result);
                        rollback_needed = true;
                        break;
                    }
                }
            } else {
                step_results.push(step_result);
            }
        }
        
        // Perform rollback if needed
        if rollback_needed && !context.dry_run {
            self.rollback(pattern, &step_results, context).await?;
        }
        
        let duration = Utc::now() - start_time;
        
        Ok(ApplicationResult {
            pattern_id: pattern.id,
            success: !rollback_needed,
            steps_executed: step_results,
            duration: duration.to_std().unwrap_or_default(),
            dry_run: context.dry_run,
        })
    }
    
    async fn execute_step(
        &self,
        step: &super::SolutionStep,
        context: &ApplicationContext,
    ) -> Result<StepResult> {
        let start_time = Utc::now();
        
        if context.dry_run {
            // Simulate execution in dry run mode
            return Ok(StepResult {
                step_order: step.order,
                success: true,
                output: Some("Dry run - step would be executed".to_string()),
                error: None,
                duration: std::time::Duration::from_millis(1),
            });
        }
        
        // Find appropriate executor
        let executor = self.executors.get(&step.action.action_type.to_string())
            .ok_or_else(|| Error::NotFound(format!("No executor for action type: {:?}", step.action.action_type)))?;
        
        // Execute the action
        let result = executor.execute(&step.action, context).await;
        
        let duration = (Utc::now() - start_time).to_std().unwrap_or_default();
        
        Ok(StepResult {
            step_order: step.order,
            success: result.is_ok(),
            output: result.as_ref().ok().cloned(),
            error: result.err().map(|e| e.to_string()),
            duration,
        })
    }
    
    async fn rollback(
        &self,
        pattern: &UniversalPattern,
        executed_steps: &[StepResult],
        context: &ApplicationContext,
    ) -> Result<()> {
        // Execute rollback steps in reverse order
        for step in pattern.solution.rollback_steps.iter().rev() {
            let _ = self.execute_step(step, context).await;
        }
        Ok(())
    }
}

/// Application result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationResult {
    pub pattern_id: super::PatternId,
    pub success: bool,
    pub steps_executed: Vec<StepResult>,
    pub duration: std::time::Duration,
    pub dry_run: bool,
}

/// Result of a single step
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_order: u32,
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
    pub duration: std::time::Duration,
}

/// Trait for action executors
#[async_trait::async_trait]
trait ActionExecutor: Send + Sync {
    async fn execute(
        &self,
        action: &super::Action,
        context: &ApplicationContext,
    ) -> Result<String>;
}

/// Command executor
struct CommandExecutor;

impl CommandExecutor {
    fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl ActionExecutor for CommandExecutor {
    async fn execute(
        &self,
        action: &super::Action,
        _context: &ApplicationContext,
    ) -> Result<String> {
        // Stub implementation
        Ok(format!("Executed command: {:?}", action.parameters))
    }
}

/// Configuration executor
struct ConfigurationExecutor;

impl ConfigurationExecutor {
    fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl ActionExecutor for ConfigurationExecutor {
    async fn execute(
        &self,
        action: &super::Action,
        _context: &ApplicationContext,
    ) -> Result<String> {
        // Stub implementation
        Ok(format!("Applied configuration: {:?}", action.parameters))
    }
}

/// Scaling executor
struct ScalingExecutor;

impl ScalingExecutor {
    fn new() -> Self {
        Self
    }
}

#[async_trait::async_trait]
impl ActionExecutor for ScalingExecutor {
    async fn execute(
        &self,
        action: &super::Action,
        _context: &ApplicationContext,
    ) -> Result<String> {
        // Stub implementation
        Ok(format!("Scaled resource: {:?}", action.target))
    }
}