//! Pattern matching and extraction

use super::*;
use regex::Regex;
use crate::events::Event;

/// Pattern matcher for identifying recurring patterns
pub struct PatternMatcher {
    patterns: Arc<RwLock<Vec<CompiledPattern>>>,
}

struct CompiledPattern {
    pattern: Pattern,
    matchers: Vec<CompiledMatcher>,
}

struct CompiledMatcher {
    rule: MatchingRule,
    regex: Option<Regex>,
}

impl PatternMatcher {
    pub fn new() -> Self {
        Self {
            patterns: Arc::new(RwLock::new(Vec::new())),
        }
    }
    
    pub async fn register_pattern(&self, pattern: Pattern) {
        let compiled = self.compile_pattern(pattern);
        let mut patterns = self.patterns.write().await;
        patterns.push(compiled);
    }
    
    pub async fn match_event(&self, event: &Event) -> Vec<(Pattern, f64)> {
        let patterns = self.patterns.read().await;
        let mut matches = Vec::new();
        
        let event_data = serde_json::to_value(event).unwrap_or_default();
        
        for compiled in patterns.iter() {
            if let Some(confidence) = self.match_pattern(&compiled, &event_data) {
                matches.push((compiled.pattern.clone(), confidence));
            }
        }
        
        matches.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        matches
    }
    
    pub async fn extract_patterns(
        &self,
        db: &PgPool,
        min_occurrences: usize,
    ) -> Result<Vec<Pattern>> {
        // Query pattern occurrences
        let occurrences = sqlx::query_as::<_, (String, Option<Vec<serde_json::Value>>)>(
            r#"
            SELECT pattern_hash, array_agg(occurrence_data) as occurrences
            FROM pattern_occurrences
            WHERE timestamp > NOW() - INTERVAL '7 days'
            GROUP BY pattern_hash
            HAVING COUNT(*) >= $1
            "#
        )
        .bind(min_occurrences as i64)
        .fetch_all(db)
        .await?;
        
        let mut patterns = Vec::new();
        
        for occurrence in occurrences {
            if let Some(pattern) = self.analyze_occurrences(&occurrence.1.unwrap_or_default()) {
                patterns.push(pattern);
            }
        }
        
        Ok(patterns)
    }
    
    fn compile_pattern(&self, pattern: Pattern) -> CompiledPattern {
        let matchers = pattern
            .matching_rules
            .iter()
            .map(|rule| self.compile_matcher(rule))
            .collect();
        
        CompiledPattern { pattern, matchers }
    }
    
    fn compile_matcher(&self, rule: &MatchingRule) -> CompiledMatcher {
        let regex = match &rule.operator {
            MatchOperator::Regex => {
                rule.value.as_str().and_then(|s| Regex::new(s).ok())
            }
            _ => None,
        };
        
        CompiledMatcher {
            rule: rule.clone(),
            regex,
        }
    }
    
    fn match_pattern(
        &self,
        compiled: &CompiledPattern,
        data: &serde_json::Value,
    ) -> Option<f64> {
        let mut matches = 0;
        let mut total = 0;
        
        for matcher in &compiled.matchers {
            total += 1;
            if self.match_rule(&matcher, data) {
                matches += 1;
            }
        }
        
        if total == 0 {
            return None;
        }
        
        let match_ratio = matches as f64 / total as f64;
        if match_ratio >= 0.8 {
            Some(match_ratio * compiled.pattern.confidence)
        } else {
            None
        }
    }
    
    fn match_rule(&self, matcher: &CompiledMatcher, data: &serde_json::Value) -> bool {
        let field_value = self.get_field_value(data, &matcher.rule.field);
        
        match &matcher.rule.operator {
            MatchOperator::Equals => field_value == Some(&matcher.rule.value),
            MatchOperator::Contains => {
                if let (Some(serde_json::Value::String(haystack)), serde_json::Value::String(needle)) =
                    (field_value, &matcher.rule.value)
                {
                    haystack.contains(needle)
                } else {
                    false
                }
            }
            MatchOperator::Regex => {
                if let (Some(serde_json::Value::String(text)), Some(regex)) =
                    (field_value, &matcher.regex)
                {
                    regex.is_match(text)
                } else {
                    false
                }
            }
            MatchOperator::GreaterThan => {
                if let (Some(serde_json::Value::Number(a)), serde_json::Value::Number(b)) =
                    (field_value, &matcher.rule.value)
                {
                    a.as_f64() > b.as_f64()
                } else {
                    false
                }
            }
            MatchOperator::LessThan => {
                if let (Some(serde_json::Value::Number(a)), serde_json::Value::Number(b)) =
                    (field_value, &matcher.rule.value)
                {
                    a.as_f64() < b.as_f64()
                } else {
                    false
                }
            }
        }
    }
    
    fn get_field_value<'a>(
        &self,
        data: &'a serde_json::Value,
        field: &str,
    ) -> Option<&'a serde_json::Value> {
        let parts: Vec<&str> = field.split('.').collect();
        let mut current = data;
        
        for part in parts {
            match current {
                serde_json::Value::Object(map) => {
                    current = map.get(part)?;
                }
                _ => return None,
            }
        }
        
        Some(current)
    }
    
    fn analyze_occurrences(&self, occurrences: &[serde_json::Value]) -> Option<Pattern> {
        // TODO: Implement pattern extraction from occurrences
        let _ = occurrences; // Suppress unused warning
        None
    }
}

/// Pattern extractor for mining patterns from data
pub struct PatternExtractor;

impl PatternExtractor {
    pub async fn extract_from_events(
        &self,
        events: &[Event],
        min_support: f64,
    ) -> Vec<Pattern> {
        // TODO: Implement pattern mining algorithm
        Vec::new()
    }
}