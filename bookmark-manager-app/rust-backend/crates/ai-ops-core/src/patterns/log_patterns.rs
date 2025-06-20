//! Log Pattern Matching Engine
//! 
//! Advanced pattern matching for log analysis with support for:
//! - Regular expressions
//! - Fuzzy matching
//! - Temporal patterns
//! - Anomaly detection

use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use regex::Regex;
use chrono::{DateTime, Utc, Duration};
use uuid::Uuid;

use crate::{Result, Error};

/// Log pattern matcher with multiple strategies
pub struct LogPatternMatcher {
    patterns: Vec<LogPattern>,
    compiled_regexes: HashMap<Uuid, Regex>,
    anomaly_detector: AnomalyDetector,
    temporal_analyzer: TemporalAnalyzer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogPattern {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub pattern_type: PatternMatchType,
    pub severity: PatternSeverity,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub last_matched: Option<DateTime<Utc>>,
    pub match_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatternMatchType {
    /// Exact regex pattern
    Regex(String),
    /// Fuzzy pattern with similarity threshold
    Fuzzy { pattern: String, threshold: f64 },
    /// Sequence of patterns that must occur in order
    Sequence(Vec<SequenceStep>),
    /// Temporal pattern (e.g., spike in errors)
    Temporal(TemporalPattern),
    /// Statistical anomaly
    Anomaly(AnomalyPattern),
    /// Composite pattern combining multiple types
    Composite(Vec<PatternMatchType>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceStep {
    pub pattern: String,
    pub max_time_between: Duration,
    pub optional: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemporalPattern {
    pub window_size: Duration,
    pub condition: TemporalCondition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TemporalCondition {
    /// Spike in frequency
    FrequencySpike { baseline_multiplier: f64 },
    /// Sustained high rate
    SustainedRate { min_count: u64, duration: Duration },
    /// Periodic pattern
    Periodic { interval: Duration, tolerance: Duration },
    /// Absence of expected logs
    Absence { expected_interval: Duration },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnomalyPattern {
    pub metric: String,
    pub anomaly_type: AnomalyType,
    pub sensitivity: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AnomalyType {
    /// Value outside statistical bounds
    Statistical,
    /// Sudden change in pattern
    ChangePoint,
    /// Unusual combination of values
    Multivariate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PatternSeverity {
    Critical,
    High,
    Medium,
    Low,
    Info,
}

/// Result of pattern matching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchResult {
    pub pattern_id: Uuid,
    pub pattern_name: String,
    pub confidence: f64,
    pub matched_text: String,
    pub context: MatchContext,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchContext {
    pub line_number: Option<u64>,
    pub surrounding_lines: Vec<String>,
    pub extracted_values: HashMap<String, String>,
    pub temporal_context: Option<TemporalContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemporalContext {
    pub time_since_last_match: Option<Duration>,
    pub frequency_in_window: u64,
    pub trend: Trend,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Trend {
    Increasing,
    Decreasing,
    Stable,
    Volatile,
}

/// Anomaly detection for logs
struct AnomalyDetector {
    baselines: HashMap<String, BaselineStats>,
    sensitivity: f64,
}

#[derive(Debug, Clone)]
struct BaselineStats {
    mean: f64,
    std_dev: f64,
    count: u64,
    last_update: DateTime<Utc>,
}

/// Temporal pattern analysis
struct TemporalAnalyzer {
    event_history: HashMap<String, Vec<DateTime<Utc>>>,
    window_size: Duration,
}

impl LogPatternMatcher {
    pub fn new() -> Self {
        Self {
            patterns: Vec::new(),
            compiled_regexes: HashMap::new(),
            anomaly_detector: AnomalyDetector::new(1.5),
            temporal_analyzer: TemporalAnalyzer::new(Duration::minutes(5)),
        }
    }

    /// Add a pattern to the matcher
    pub fn add_pattern(&mut self, pattern: LogPattern) -> Result<()> {
        // Compile regex patterns
        if let PatternMatchType::Regex(regex_str) = &pattern.pattern_type {
            let compiled = Regex::new(regex_str)
                .map_err(|e| Error::InvalidInput(format!("Invalid regex: {}", e)))?;
            self.compiled_regexes.insert(pattern.id, compiled);
        }
        
        self.patterns.push(pattern);
        Ok(())
    }

    /// Match a log line against all patterns
    pub fn match_line(&mut self, line: &str, timestamp: DateTime<Utc>) -> Vec<MatchResult> {
        let mut results = Vec::new();
        
        for pattern in &mut self.patterns {
            if let Some(result) = self.try_match_pattern(pattern, line, timestamp) {
                pattern.match_count += 1;
                pattern.last_matched = Some(timestamp);
                results.push(result);
            }
        }
        
        results
    }

    /// Match multiple log lines for sequence patterns
    pub fn match_sequence(&mut self, lines: &[(&str, DateTime<Utc>)]) -> Vec<MatchResult> {
        let mut results = Vec::new();
        
        for pattern in &mut self.patterns {
            if let PatternMatchType::Sequence(steps) = &pattern.pattern_type {
                if let Some(result) = self.match_sequence_pattern(pattern, steps, lines) {
                    pattern.match_count += 1;
                    pattern.last_matched = Some(Utc::now());
                    results.push(result);
                }
            }
        }
        
        results
    }

    fn try_match_pattern(
        &mut self,
        pattern: &LogPattern,
        line: &str,
        timestamp: DateTime<Utc>,
    ) -> Option<MatchResult> {
        match &pattern.pattern_type {
            PatternMatchType::Regex(_) => self.match_regex_pattern(pattern, line, timestamp),
            PatternMatchType::Fuzzy { pattern: fuzzy_pattern, threshold } => {
                self.match_fuzzy_pattern(pattern, fuzzy_pattern, *threshold, line, timestamp)
            }
            PatternMatchType::Temporal(temporal) => {
                self.match_temporal_pattern(pattern, temporal, line, timestamp)
            }
            PatternMatchType::Anomaly(anomaly) => {
                self.match_anomaly_pattern(pattern, anomaly, line, timestamp)
            }
            PatternMatchType::Composite(sub_patterns) => {
                self.match_composite_pattern(pattern, sub_patterns, line, timestamp)
            }
            _ => None, // Sequence patterns handled separately
        }
    }

    fn match_regex_pattern(
        &self,
        pattern: &LogPattern,
        line: &str,
        timestamp: DateTime<Utc>,
    ) -> Option<MatchResult> {
        let regex = self.compiled_regexes.get(&pattern.id)?;
        
        if let Some(captures) = regex.captures(line) {
            let mut extracted_values = HashMap::new();
            
            // Extract named capture groups
            for name in regex.capture_names().flatten() {
                if let Some(value) = captures.name(name) {
                    extracted_values.insert(name.to_string(), value.as_str().to_string());
                }
            }
            
            Some(MatchResult {
                pattern_id: pattern.id,
                pattern_name: pattern.name.clone(),
                confidence: 1.0,
                matched_text: captures.get(0).unwrap().as_str().to_string(),
                context: MatchContext {
                    line_number: None,
                    surrounding_lines: vec![],
                    extracted_values,
                    temporal_context: None,
                },
                timestamp,
            })
        } else {
            None
        }
    }

    fn match_fuzzy_pattern(
        &self,
        pattern: &LogPattern,
        fuzzy_pattern: &str,
        threshold: f64,
        line: &str,
        timestamp: DateTime<Utc>,
    ) -> Option<MatchResult> {
        let similarity = self.calculate_similarity(fuzzy_pattern, line);
        
        if similarity >= threshold {
            Some(MatchResult {
                pattern_id: pattern.id,
                pattern_name: pattern.name.clone(),
                confidence: similarity,
                matched_text: line.to_string(),
                context: MatchContext {
                    line_number: None,
                    surrounding_lines: vec![],
                    extracted_values: HashMap::new(),
                    temporal_context: None,
                },
                timestamp,
            })
        } else {
            None
        }
    }

    fn match_temporal_pattern(
        &mut self,
        pattern: &LogPattern,
        temporal: &TemporalPattern,
        line: &str,
        timestamp: DateTime<Utc>,
    ) -> Option<MatchResult> {
        // Update temporal analyzer
        self.temporal_analyzer.record_event(&pattern.name, timestamp);
        
        let temporal_context = self.temporal_analyzer.analyze_pattern(
            &pattern.name,
            temporal,
            timestamp,
        )?;
        
        Some(MatchResult {
            pattern_id: pattern.id,
            pattern_name: pattern.name.clone(),
            confidence: 0.8,
            matched_text: line.to_string(),
            context: MatchContext {
                line_number: None,
                surrounding_lines: vec![],
                extracted_values: HashMap::new(),
                temporal_context: Some(temporal_context),
            },
            timestamp,
        })
    }

    fn match_anomaly_pattern(
        &mut self,
        pattern: &LogPattern,
        anomaly: &AnomalyPattern,
        line: &str,
        timestamp: DateTime<Utc>,
    ) -> Option<MatchResult> {
        // Extract metric value from line
        let value = self.extract_metric_value(line, &anomaly.metric)?;
        
        // Check for anomaly
        if self.anomaly_detector.is_anomalous(&anomaly.metric, value, anomaly.sensitivity) {
            Some(MatchResult {
                pattern_id: pattern.id,
                pattern_name: pattern.name.clone(),
                confidence: 0.7,
                matched_text: line.to_string(),
                context: MatchContext {
                    line_number: None,
                    surrounding_lines: vec![],
                    extracted_values: {
                        let mut values = HashMap::new();
                        values.insert(anomaly.metric.clone(), value.to_string());
                        values
                    },
                    temporal_context: None,
                },
                timestamp,
            })
        } else {
            None
        }
    }

    fn match_composite_pattern(
        &mut self,
        pattern: &LogPattern,
        sub_patterns: &[PatternMatchType],
        line: &str,
        timestamp: DateTime<Utc>,
    ) -> Option<MatchResult> {
        let mut total_confidence = 0.0;
        let mut matched_count = 0;
        
        for sub_pattern in sub_patterns {
            // Create temporary pattern for sub-matching
            let temp_pattern = LogPattern {
                id: Uuid::new_v4(),
                name: format!("{}_sub", pattern.name),
                description: String::new(),
                pattern_type: sub_pattern.clone(),
                severity: pattern.severity,
                tags: vec![],
                created_at: Utc::now(),
                last_matched: None,
                match_count: 0,
            };
            
            if let Some(result) = self.try_match_pattern(&temp_pattern, line, timestamp) {
                total_confidence += result.confidence;
                matched_count += 1;
            }
        }
        
        if matched_count > 0 {
            let avg_confidence = total_confidence / matched_count as f64;
            Some(MatchResult {
                pattern_id: pattern.id,
                pattern_name: pattern.name.clone(),
                confidence: avg_confidence,
                matched_text: line.to_string(),
                context: MatchContext {
                    line_number: None,
                    surrounding_lines: vec![],
                    extracted_values: HashMap::new(),
                    temporal_context: None,
                },
                timestamp,
            })
        } else {
            None
        }
    }

    fn match_sequence_pattern(
        &self,
        pattern: &LogPattern,
        steps: &[SequenceStep],
        lines: &[(&str, DateTime<Utc>)],
    ) -> Option<MatchResult> {
        let mut step_index = 0;
        let mut last_match_time = None;
        let mut matched_lines = Vec::new();
        
        for (line, timestamp) in lines {
            if step_index >= steps.len() {
                break;
            }
            
            let step = &steps[step_index];
            
            // Check time constraint
            if let Some(last_time) = last_match_time {
                if timestamp.signed_duration_since(last_time) > step.max_time_between {
                    if !step.optional {
                        return None; // Sequence broken
                    }
                    step_index += 1;
                    continue;
                }
            }
            
            // Try to match pattern
            if line.contains(&step.pattern) {
                matched_lines.push(line.to_string());
                last_match_time = Some(*timestamp);
                step_index += 1;
            } else if !step.optional {
                // Required step not matched
                continue;
            }
        }
        
        // Check if all required steps matched
        let required_steps = steps.iter().filter(|s| !s.optional).count();
        if matched_lines.len() >= required_steps {
            Some(MatchResult {
                pattern_id: pattern.id,
                pattern_name: pattern.name.clone(),
                confidence: matched_lines.len() as f64 / steps.len() as f64,
                matched_text: matched_lines.join(" -> "),
                context: MatchContext {
                    line_number: None,
                    surrounding_lines: matched_lines,
                    extracted_values: HashMap::new(),
                    temporal_context: None,
                },
                timestamp: last_match_time.unwrap_or_else(Utc::now),
            })
        } else {
            None
        }
    }

    fn calculate_similarity(&self, pattern: &str, text: &str) -> f64 {
        // Simple Levenshtein distance-based similarity
        let max_len = pattern.len().max(text.len());
        if max_len == 0 {
            return 1.0;
        }
        
        let distance = self.levenshtein_distance(pattern, text);
        1.0 - (distance as f64 / max_len as f64)
    }

    fn levenshtein_distance(&self, s1: &str, s2: &str) -> usize {
        let len1 = s1.chars().count();
        let len2 = s2.chars().count();
        let mut matrix = vec![vec![0; len2 + 1]; len1 + 1];
        
        for i in 0..=len1 {
            matrix[i][0] = i;
        }
        for j in 0..=len2 {
            matrix[0][j] = j;
        }
        
        for (i, c1) in s1.chars().enumerate() {
            for (j, c2) in s2.chars().enumerate() {
                let cost = if c1 == c2 { 0 } else { 1 };
                matrix[i + 1][j + 1] = (matrix[i][j + 1] + 1)
                    .min(matrix[i + 1][j] + 1)
                    .min(matrix[i][j] + cost);
            }
        }
        
        matrix[len1][len2]
    }

    fn extract_metric_value(&self, line: &str, metric_name: &str) -> Option<f64> {
        // Simple extraction - look for metric_name=value pattern
        let pattern = format!(r"{}[=:\s]+([0-9.]+)", regex::escape(metric_name));
        let regex = Regex::new(&pattern).ok()?;
        
        regex.captures(line)?
            .get(1)?
            .as_str()
            .parse::<f64>()
            .ok()
    }
}

impl AnomalyDetector {
    fn new(sensitivity: f64) -> Self {
        Self {
            baselines: HashMap::new(),
            sensitivity,
        }
    }

    fn is_anomalous(&mut self, metric: &str, value: f64, sensitivity: f64) -> bool {
        let baseline = self.baselines.entry(metric.to_string())
            .or_insert_with(|| BaselineStats {
                mean: value,
                std_dev: 0.0,
                count: 1,
                last_update: Utc::now(),
            });
        
        // Update baseline using exponential moving average
        let alpha = 0.1;
        let delta = value - baseline.mean;
        baseline.mean = baseline.mean + alpha * delta;
        baseline.std_dev = (1.0 - alpha) * (baseline.std_dev + alpha * delta * delta);
        baseline.count += 1;
        baseline.last_update = Utc::now();
        
        // Check if value is outside bounds
        if baseline.count > 10 {
            let z_score = (value - baseline.mean) / (baseline.std_dev.sqrt() + 1e-6);
            z_score.abs() > sensitivity * self.sensitivity
        } else {
            false // Not enough data yet
        }
    }
}

impl TemporalAnalyzer {
    fn new(window_size: Duration) -> Self {
        Self {
            event_history: HashMap::new(),
            window_size,
        }
    }

    fn record_event(&mut self, pattern_name: &str, timestamp: DateTime<Utc>) {
        let history = self.event_history
            .entry(pattern_name.to_string())
            .or_insert_with(Vec::new);
        
        history.push(timestamp);
        
        // Clean old events
        let cutoff = timestamp - self.window_size;
        history.retain(|&t| t > cutoff);
    }

    fn analyze_pattern(
        &self,
        pattern_name: &str,
        temporal: &TemporalPattern,
        current_time: DateTime<Utc>,
    ) -> Option<TemporalContext> {
        let history = self.event_history.get(pattern_name)?;
        
        match &temporal.condition {
            TemporalCondition::FrequencySpike { baseline_multiplier } => {
                let window_start = current_time - temporal.window_size;
                let recent_count = history.iter()
                    .filter(|&&t| t > window_start)
                    .count() as f64;
                
                let baseline = history.len() as f64 / (self.window_size.num_seconds() as f64 / temporal.window_size.num_seconds() as f64);
                
                if recent_count > baseline * baseline_multiplier {
                    Some(TemporalContext {
                        time_since_last_match: history.last().map(|&t| current_time - t),
                        frequency_in_window: recent_count as u64,
                        trend: Trend::Increasing,
                    })
                } else {
                    None
                }
            }
            TemporalCondition::SustainedRate { min_count, duration } => {
                let window_start = current_time - *duration;
                let sustained_count = history.iter()
                    .filter(|&&t| t > window_start)
                    .count() as u64;
                
                if sustained_count >= *min_count {
                    Some(TemporalContext {
                        time_since_last_match: history.last().map(|&t| current_time - t),
                        frequency_in_window: sustained_count,
                        trend: Trend::Stable,
                    })
                } else {
                    None
                }
            }
            _ => None, // Other conditions not implemented in this example
        }
    }
}

/// Builder for creating log patterns
pub struct LogPatternBuilder {
    name: String,
    description: String,
    severity: PatternSeverity,
    tags: Vec<String>,
}

impl LogPatternBuilder {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: String::new(),
            severity: PatternSeverity::Medium,
            tags: Vec::new(),
        }
    }

    pub fn description(mut self, desc: impl Into<String>) -> Self {
        self.description = desc.into();
        self
    }

    pub fn severity(mut self, severity: PatternSeverity) -> Self {
        self.severity = severity;
        self
    }

    pub fn tag(mut self, tag: impl Into<String>) -> Self {
        self.tags.push(tag.into());
        self
    }

    pub fn regex(self, pattern: impl Into<String>) -> LogPattern {
        LogPattern {
            id: Uuid::new_v4(),
            name: self.name,
            description: self.description,
            pattern_type: PatternMatchType::Regex(pattern.into()),
            severity: self.severity,
            tags: self.tags,
            created_at: Utc::now(),
            last_matched: None,
            match_count: 0,
        }
    }

    pub fn fuzzy(self, pattern: impl Into<String>, threshold: f64) -> LogPattern {
        LogPattern {
            id: Uuid::new_v4(),
            name: self.name,
            description: self.description,
            pattern_type: PatternMatchType::Fuzzy {
                pattern: pattern.into(),
                threshold,
            },
            severity: self.severity,
            tags: self.tags,
            created_at: Utc::now(),
            last_matched: None,
            match_count: 0,
        }
    }

    pub fn temporal(self, window: Duration, condition: TemporalCondition) -> LogPattern {
        LogPattern {
            id: Uuid::new_v4(),
            name: self.name,
            description: self.description,
            pattern_type: PatternMatchType::Temporal(TemporalPattern {
                window_size: window,
                condition,
            }),
            severity: self.severity,
            tags: self.tags,
            created_at: Utc::now(),
            last_matched: None,
            match_count: 0,
        }
    }
}