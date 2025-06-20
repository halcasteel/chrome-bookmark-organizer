//! Pattern Library
//! 
//! Reusable patterns and solutions for common problems

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Serialize, Deserialize};

use crate::{Result, Error};

pub mod detection;
pub mod application;
pub mod evolution;
pub mod log_patterns;

pub use detection::{PatternDetector, DetectionResult};
pub use application::{PatternApplicator, ApplicationResult};
pub use evolution::{PatternEvolver, EvolutionResult};
pub use log_patterns::{LogPatternMatcher, LogPattern, PatternMatchType, MatchResult, LogPatternBuilder};

/// Universal pattern that can be applied across different contexts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniversalPattern {
    pub id: PatternId,
    pub name: String,
    pub category: PatternCategory,
    pub description: String,
    pub context: PatternContext,
    pub solution: PatternSolution,
    pub metrics: PatternMetrics,
    pub metadata: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub type PatternId = Uuid;

/// Pattern categories
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PatternCategory {
    Performance,
    Reliability,
    Security,
    Scalability,
    DataIntegrity,
    UserExperience,
    CostOptimization,
    Observability,
    Custom(String),
}

/// Context in which a pattern applies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternContext {
    pub problem_indicators: Vec<Indicator>,
    pub preconditions: Vec<Condition>,
    pub applicable_domains: Vec<String>,
    pub constraints: Vec<Constraint>,
}

/// Indicator of a problem
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Indicator {
    pub indicator_type: IndicatorType,
    pub threshold: serde_json::Value,
    pub operator: ComparisonOperator,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IndicatorType {
    Metric(String),
    LogPattern(String),
    ErrorRate,
    ResponseTime,
    ResourceUsage(String),
    Custom(String),
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ComparisonOperator {
    GreaterThan,
    LessThan,
    Equal,
    NotEqual,
    Contains,
    Matches,
}

/// Condition that must be met
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Condition {
    pub condition_type: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

/// Constraint on pattern application
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Constraint {
    pub constraint_type: String,
    pub value: serde_json::Value,
}

/// Solution provided by the pattern
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternSolution {
    pub steps: Vec<SolutionStep>,
    pub rollback_steps: Vec<SolutionStep>,
    pub estimated_duration: std::time::Duration,
    pub required_capabilities: Vec<String>,
}

/// Step in applying a solution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolutionStep {
    pub order: u32,
    pub action: Action,
    pub validation: Option<Validation>,
    pub on_failure: FailureStrategy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub action_type: ActionType,
    pub target: Option<String>,
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    Execute,
    Configure,
    Scale,
    Restart,
    Deploy,
    Rollback,
    Custom(String),
}

impl std::fmt::Display for ActionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionType::Execute => write!(f, "Execute"),
            ActionType::Configure => write!(f, "Configure"),
            ActionType::Scale => write!(f, "Scale"),
            ActionType::Restart => write!(f, "Restart"),
            ActionType::Deploy => write!(f, "Deploy"),
            ActionType::Rollback => write!(f, "Rollback"),
            ActionType::Custom(s) => write!(f, "Custom({})", s),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Validation {
    pub validation_type: String,
    pub expected_result: serde_json::Value,
    pub timeout: std::time::Duration,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum FailureStrategy {
    Retry,
    Skip,
    Abort,
    Rollback,
}

/// Metrics about pattern effectiveness
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternMetrics {
    pub application_count: u64,
    pub success_count: u64,
    pub failure_count: u64,
    pub average_resolution_time: std::time::Duration,
    pub confidence_score: f64,
    pub evolution_count: u32,
}

impl Default for PatternMetrics {
    fn default() -> Self {
        Self {
            application_count: 0,
            success_count: 0,
            failure_count: 0,
            average_resolution_time: std::time::Duration::from_secs(0),
            confidence_score: 0.5,
            evolution_count: 0,
        }
    }
}

/// Pattern library for storing and retrieving patterns
pub struct PatternLibrary {
    patterns: Arc<RwLock<HashMap<PatternId, UniversalPattern>>>,
    category_index: Arc<RwLock<HashMap<PatternCategory, Vec<PatternId>>>>,
    detector: Arc<PatternDetector>,
    applicator: Arc<PatternApplicator>,
    evolver: Arc<PatternEvolver>,
}

impl PatternLibrary {
    /// Create a new pattern library
    pub fn new() -> Self {
        Self {
            patterns: Arc::new(RwLock::new(HashMap::new())),
            category_index: Arc::new(RwLock::new(HashMap::new())),
            detector: Arc::new(PatternDetector::new()),
            applicator: Arc::new(PatternApplicator::new()),
            evolver: Arc::new(PatternEvolver::new()),
        }
    }
    
    /// Add a pattern to the library
    pub async fn add_pattern(&self, mut pattern: UniversalPattern) -> Result<PatternId> {
        pattern.id = Uuid::new_v4();
        pattern.created_at = Utc::now();
        pattern.updated_at = Utc::now();
        
        let pattern_id = pattern.id;
        let category = pattern.category.clone();
        
        // Store pattern
        self.patterns.write().await.insert(pattern_id, pattern);
        
        // Update category index
        self.category_index.write().await
            .entry(category)
            .or_insert_with(Vec::new)
            .push(pattern_id);
        
        Ok(pattern_id)
    }
    
    /// Get a pattern by ID
    pub async fn get_pattern(&self, pattern_id: PatternId) -> Result<UniversalPattern> {
        self.patterns.read().await
            .get(&pattern_id)
            .cloned()
            .ok_or_else(|| Error::NotFound("Pattern not found".to_string()))
    }
    
    /// Find patterns by category
    pub async fn find_by_category(&self, category: &PatternCategory) -> Result<Vec<UniversalPattern>> {
        let category_index = self.category_index.read().await;
        let pattern_ids = category_index.get(category).cloned().unwrap_or_default();
        
        let patterns = self.patterns.read().await;
        let mut results = Vec::new();
        
        for pattern_id in pattern_ids {
            if let Some(pattern) = patterns.get(&pattern_id) {
                results.push(pattern.clone());
            }
        }
        
        Ok(results)
    }
    
    /// Detect applicable patterns for a given context
    pub async fn detect_patterns(&self, context: &DetectionContext) -> Result<Vec<DetectionResult>> {
        let patterns = self.patterns.read().await;
        self.detector.detect(context, &*patterns).await
    }
    
    /// Apply a pattern
    pub async fn apply_pattern(
        &self,
        pattern_id: PatternId,
        context: &ApplicationContext,
    ) -> Result<ApplicationResult> {
        let pattern = self.get_pattern(pattern_id).await?;
        let result = self.applicator.apply(&pattern, context).await?;
        
        // Update metrics
        self.update_pattern_metrics(pattern_id, &result).await?;
        
        Ok(result)
    }
    
    /// Evolve patterns based on outcomes
    pub async fn evolve_patterns(&self) -> Result<Vec<EvolutionResult>> {
        let patterns = self.patterns.read().await.clone();
        let evolution_results = self.evolver.evolve_all(patterns).await?;
        
        // Apply evolution results
        for result in &evolution_results {
            if result.should_update {
                self.update_pattern(result.pattern_id, result.evolved_pattern.clone()).await?;
            }
        }
        
        Ok(evolution_results)
    }
    
    /// Update a pattern
    async fn update_pattern(&self, pattern_id: PatternId, pattern: UniversalPattern) -> Result<()> {
        self.patterns.write().await.insert(pattern_id, pattern);
        Ok(())
    }
    
    /// Update pattern metrics based on application result
    async fn update_pattern_metrics(
        &self,
        pattern_id: PatternId,
        result: &ApplicationResult,
    ) -> Result<()> {
        let mut patterns = self.patterns.write().await;
        
        if let Some(pattern) = patterns.get_mut(&pattern_id) {
            pattern.metrics.application_count += 1;
            
            if result.success {
                pattern.metrics.success_count += 1;
            } else {
                pattern.metrics.failure_count += 1;
            }
            
            // Update confidence score
            pattern.metrics.confidence_score = 
                pattern.metrics.success_count as f64 / pattern.metrics.application_count as f64;
            
            // Update average resolution time
            let total_time = pattern.metrics.average_resolution_time.as_secs() 
                * pattern.metrics.application_count;
            let new_total = total_time + result.duration.as_secs();
            pattern.metrics.average_resolution_time = 
                std::time::Duration::from_secs(new_total / (pattern.metrics.application_count + 1));
            
            pattern.updated_at = Utc::now();
        }
        
        Ok(())
    }
}

/// Context for pattern detection
#[derive(Debug, Clone)]
pub struct DetectionContext {
    pub metrics: HashMap<String, f64>,
    pub logs: Vec<String>,
    pub errors: Vec<String>,
    pub environment: HashMap<String, String>,
}

/// Context for pattern application
#[derive(Debug, Clone)]
pub struct ApplicationContext {
    pub target: String,
    pub environment: HashMap<String, String>,
    pub parameters: HashMap<String, serde_json::Value>,
    pub dry_run: bool,
}