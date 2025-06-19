//! Pattern Evolution System

use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

use crate::{Result, Error};
use super::{UniversalPattern, PatternId};

/// Pattern evolver that improves patterns based on outcomes
pub struct PatternEvolver {
    evolution_strategies: Vec<Box<dyn EvolutionStrategy>>,
}

impl PatternEvolver {
    /// Create a new pattern evolver
    pub fn new() -> Self {
        Self {
            evolution_strategies: vec![
                Box::new(SuccessRateStrategy::new()),
                Box::new(PerformanceStrategy::new()),
                Box::new(SimplificationStrategy::new()),
            ],
        }
    }
    
    /// Evolve all patterns based on their metrics
    pub async fn evolve_all(
        &self,
        patterns: HashMap<PatternId, UniversalPattern>,
    ) -> Result<Vec<EvolutionResult>> {
        let mut results = Vec::new();
        
        for (pattern_id, pattern) in patterns {
            if self.should_evolve(&pattern) {
                let evolution_result = self.evolve_pattern(pattern_id, pattern).await?;
                results.push(evolution_result);
            }
        }
        
        Ok(results)
    }
    
    /// Evolve a single pattern
    pub async fn evolve_pattern(
        &self,
        pattern_id: PatternId,
        pattern: UniversalPattern,
    ) -> Result<EvolutionResult> {
        let mut evolved_pattern = pattern.clone();
        let mut changes = Vec::new();
        
        // Apply each evolution strategy
        for strategy in &self.evolution_strategies {
            if let Some(change) = strategy.evolve(&evolved_pattern)? {
                changes.push(change.clone());
                evolved_pattern = self.apply_change(evolved_pattern, change)?;
            }
        }
        
        // Update evolution count
        evolved_pattern.metrics.evolution_count += 1;
        evolved_pattern.updated_at = Utc::now();
        
        let should_update = !changes.is_empty();
        let confidence_delta = self.calculate_confidence_delta(&changes);
        
        Ok(EvolutionResult {
            pattern_id,
            original_pattern: pattern,
            evolved_pattern,
            changes,
            should_update,
            confidence_delta,
        })
    }
    
    fn should_evolve(&self, pattern: &UniversalPattern) -> bool {
        // Evolve if:
        // 1. Pattern has been applied at least 10 times
        // 2. Last evolution was more than 7 days ago
        // 3. Confidence score is below 0.9
        
        pattern.metrics.application_count >= 10
            && pattern.metrics.confidence_score < 0.9
            && (Utc::now() - pattern.updated_at).num_days() > 7
    }
    
    fn apply_change(
        &self,
        mut pattern: UniversalPattern,
        change: EvolutionChange,
    ) -> Result<UniversalPattern> {
        match change.change_type {
            ChangeType::ModifyStep { step_index, new_step } => {
                if step_index < pattern.solution.steps.len() {
                    pattern.solution.steps[step_index] = new_step;
                }
            }
            ChangeType::AddStep { position, step } => {
                if position <= pattern.solution.steps.len() {
                    pattern.solution.steps.insert(position, step);
                }
            }
            ChangeType::RemoveStep { step_index } => {
                if step_index < pattern.solution.steps.len() {
                    pattern.solution.steps.remove(step_index);
                }
            }
            ChangeType::ModifyThreshold { indicator_index, new_threshold } => {
                if indicator_index < pattern.context.problem_indicators.len() {
                    pattern.context.problem_indicators[indicator_index].threshold = new_threshold;
                }
            }
            ChangeType::UpdateMetadata { key, value } => {
                pattern.metadata.insert(key, value);
            }
        }
        
        Ok(pattern)
    }
    
    fn calculate_confidence_delta(&self, changes: &[EvolutionChange]) -> f64 {
        // Simple heuristic: each change contributes to confidence improvement
        changes.len() as f64 * 0.05
    }
}

/// Evolution result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionResult {
    pub pattern_id: PatternId,
    pub original_pattern: UniversalPattern,
    pub evolved_pattern: UniversalPattern,
    pub changes: Vec<EvolutionChange>,
    pub should_update: bool,
    pub confidence_delta: f64,
}

/// Evolution change
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionChange {
    pub change_type: ChangeType,
    pub reason: String,
    pub expected_improvement: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChangeType {
    ModifyStep {
        step_index: usize,
        new_step: super::SolutionStep,
    },
    AddStep {
        position: usize,
        step: super::SolutionStep,
    },
    RemoveStep {
        step_index: usize,
    },
    ModifyThreshold {
        indicator_index: usize,
        new_threshold: serde_json::Value,
    },
    UpdateMetadata {
        key: String,
        value: serde_json::Value,
    },
}

/// Trait for evolution strategies
trait EvolutionStrategy: Send + Sync {
    fn evolve(&self, pattern: &UniversalPattern) -> Result<Option<EvolutionChange>>;
}

/// Success rate based evolution
struct SuccessRateStrategy;

impl SuccessRateStrategy {
    fn new() -> Self {
        Self
    }
}

impl EvolutionStrategy for SuccessRateStrategy {
    fn evolve(&self, pattern: &UniversalPattern) -> Result<Option<EvolutionChange>> {
        // If success rate is low, consider simplifying steps
        if pattern.metrics.confidence_score < 0.5 {
            // Stub: Would analyze failure patterns and suggest improvements
            Ok(Some(EvolutionChange {
                change_type: ChangeType::UpdateMetadata {
                    key: "needs_review".to_string(),
                    value: serde_json::json!(true),
                },
                reason: "Low success rate detected".to_string(),
                expected_improvement: 0.1,
            }))
        } else {
            Ok(None)
        }
    }
}

/// Performance based evolution
struct PerformanceStrategy;

impl PerformanceStrategy {
    fn new() -> Self {
        Self
    }
}

impl EvolutionStrategy for PerformanceStrategy {
    fn evolve(&self, pattern: &UniversalPattern) -> Result<Option<EvolutionChange>> {
        // If average resolution time is high, optimize steps
        if pattern.metrics.average_resolution_time.as_secs() > 300 {
            // Stub: Would analyze slow steps and suggest optimizations
            Ok(None)
        } else {
            Ok(None)
        }
    }
}

/// Simplification strategy
struct SimplificationStrategy;

impl SimplificationStrategy {
    fn new() -> Self {
        Self
    }
}

impl EvolutionStrategy for SimplificationStrategy {
    fn evolve(&self, pattern: &UniversalPattern) -> Result<Option<EvolutionChange>> {
        // If pattern has many steps with high success rate, consider simplifying
        if pattern.solution.steps.len() > 5 && pattern.metrics.confidence_score > 0.8 {
            // Stub: Would analyze redundant steps
            Ok(None)
        } else {
            Ok(None)
        }
    }
}