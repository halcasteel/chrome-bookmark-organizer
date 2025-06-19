//! Pattern Detection System

use std::collections::HashMap;
use serde::{Serialize, Deserialize};

use crate::{Result, Error};
use super::{UniversalPattern, PatternId, DetectionContext};

/// Pattern detector
pub struct PatternDetector {
    matchers: Vec<Box<dyn PatternMatcher>>,
}

impl PatternDetector {
    /// Create a new pattern detector
    pub fn new() -> Self {
        Self {
            matchers: vec![
                Box::new(MetricPatternMatcher::new()),
                Box::new(LogPatternMatcher::new()),
                Box::new(ErrorPatternMatcher::new()),
            ],
        }
    }
    
    /// Detect patterns in the given context
    pub async fn detect(
        &self,
        context: &DetectionContext,
        patterns: &HashMap<PatternId, UniversalPattern>,
    ) -> Result<Vec<DetectionResult>> {
        let mut results = Vec::new();
        
        for (pattern_id, pattern) in patterns {
            let mut confidence: f64 = 0.0;
            let mut matched_indicators = Vec::new();
            
            // Check each matcher
            for matcher in &self.matchers {
                if let Some(match_result) = matcher.matches(pattern, context)? {
                    confidence = confidence.max(match_result.confidence);
                    matched_indicators.extend(match_result.matched_indicators);
                }
            }
            
            if confidence > 0.5 {
                results.push(DetectionResult {
                    pattern_id: *pattern_id,
                    confidence,
                    matched_indicators,
                    suggested_priority: self.calculate_priority(pattern, confidence),
                });
            }
        }
        
        // Sort by confidence
        results.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        
        Ok(results)
    }
    
    fn calculate_priority(&self, pattern: &UniversalPattern, confidence: f64) -> Priority {
        let base_score = confidence * pattern.metrics.confidence_score;
        
        if base_score > 0.8 {
            Priority::High
        } else if base_score > 0.5 {
            Priority::Medium
        } else {
            Priority::Low
        }
    }
}

/// Pattern detection result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionResult {
    pub pattern_id: PatternId,
    pub confidence: f64,
    pub matched_indicators: Vec<String>,
    pub suggested_priority: Priority,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Priority {
    Low,
    Medium,
    High,
    Critical,
}

/// Trait for pattern matchers
trait PatternMatcher: Send + Sync {
    fn matches(
        &self,
        pattern: &UniversalPattern,
        context: &DetectionContext,
    ) -> Result<Option<MatchResult>>;
}

/// Result of pattern matching
struct MatchResult {
    confidence: f64,
    matched_indicators: Vec<String>,
}

/// Metric-based pattern matcher
struct MetricPatternMatcher;

impl MetricPatternMatcher {
    fn new() -> Self {
        Self
    }
}

impl PatternMatcher for MetricPatternMatcher {
    fn matches(
        &self,
        pattern: &UniversalPattern,
        context: &DetectionContext,
    ) -> Result<Option<MatchResult>> {
        let mut matched = Vec::new();
        let mut total_weight = 0.0;
        let mut weighted_score = 0.0;
        
        for indicator in &pattern.context.problem_indicators {
            if let super::IndicatorType::Metric(metric_name) = &indicator.indicator_type {
                if let Some(value) = context.metrics.get(metric_name) {
                    let matches = self.check_threshold(value, indicator)?;
                    if matches {
                        matched.push(format!("Metric {} matches threshold", metric_name));
                        weighted_score += 1.0;
                    }
                    total_weight += 1.0;
                }
            }
        }
        
        if total_weight > 0.0 {
            Ok(Some(MatchResult {
                confidence: weighted_score / total_weight,
                matched_indicators: matched,
            }))
        } else {
            Ok(None)
        }
    }
}

impl MetricPatternMatcher {
    fn check_threshold(&self, value: &f64, indicator: &super::Indicator) -> Result<bool> {
        if let Ok(threshold) = serde_json::from_value::<f64>(indicator.threshold.clone()) {
            Ok(match indicator.operator {
                super::ComparisonOperator::GreaterThan => *value > threshold,
                super::ComparisonOperator::LessThan => *value < threshold,
                super::ComparisonOperator::Equal => (*value - threshold).abs() < f64::EPSILON,
                _ => false,
            })
        } else {
            Ok(false)
        }
    }
}

/// Log-based pattern matcher
struct LogPatternMatcher;

impl LogPatternMatcher {
    fn new() -> Self {
        Self
    }
}

impl PatternMatcher for LogPatternMatcher {
    fn matches(
        &self,
        pattern: &UniversalPattern,
        context: &DetectionContext,
    ) -> Result<Option<MatchResult>> {
        // Stub implementation
        Ok(None)
    }
}

/// Error-based pattern matcher
struct ErrorPatternMatcher;

impl ErrorPatternMatcher {
    fn new() -> Self {
        Self
    }
}

impl PatternMatcher for ErrorPatternMatcher {
    fn matches(
        &self,
        pattern: &UniversalPattern,
        context: &DetectionContext,
    ) -> Result<Option<MatchResult>> {
        // Stub implementation
        Ok(None)
    }
}