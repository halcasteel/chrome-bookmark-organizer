//! Learning Agent
//! 
//! This agent observes outcomes from fixes and updates the knowledge graph
//! to improve future decision-making.

use async_trait::async_trait;
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tracing::{info, warn, debug};

use crate::{
    Result, Event, EventType, AgentId,
    agent::{
        UniversalAgent, AgentType, Capability, EventPattern, Experience, 
        Knowledge, CollaborationRequest, CollaborationResponse, AgentStatus,
        AgentState, Health, Context, KnowledgeType
    },
    events::EventSeverity,
    knowledge::{KnowledgeGraph, Pattern, PatternType, Solution, SolutionOutcome},
    ai::{AIProvider, AIInput},
};

/// Learning Agent - Learns from outcomes and improves the system
pub struct LearningAgent {
    id: AgentId,
    name: String,
    knowledge_graph: KnowledgeGraph,
    ai_provider: Option<Box<dyn AIProvider>>,
    learning_sessions: HashMap<String, LearningSession>,
    pattern_cache: HashMap<String, PatternStats>,
    solution_effectiveness: HashMap<String, SolutionStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LearningSession {
    id: String,
    started_at: DateTime<Utc>,
    problem_type: String,
    initial_event: Event,
    root_cause: Option<RootCause>,
    solution_applied: Option<Solution>,
    outcome: Option<OutcomeAnalysis>,
    lessons_learned: Vec<Lesson>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RootCause {
    description: String,
    category: String,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OutcomeAnalysis {
    success: bool,
    fix_duration: Duration,
    validation_results: Vec<ValidationResult>,
    side_effects: Vec<String>,
    performance_impact: Option<PerformanceImpact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ValidationResult {
    check_name: String,
    passed: bool,
    details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PerformanceImpact {
    cpu_change: f64,
    memory_change: f64,
    response_time_change: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Lesson {
    lesson_type: LessonType,
    description: String,
    confidence: f64,
    applicable_patterns: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum LessonType {
    SuccessfulPattern,
    FailurePattern,
    OptimizationOpportunity,
    RiskIdentification,
    ContextualCondition,
}

#[derive(Debug, Clone, Default)]
struct PatternStats {
    occurrences: u64,
    successful_applications: u64,
    failed_applications: u64,
    average_resolution_time: Duration,
    last_seen: DateTime<Utc>,
    contexts: HashMap<String, u64>,
}

#[derive(Debug, Clone, Default)]
struct SolutionStats {
    applications: u64,
    successes: u64,
    failures: u64,
    average_execution_time: Duration,
    risk_adjustments: Vec<RiskAdjustment>,
    effectiveness_by_context: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RiskAdjustment {
    date: DateTime<Utc>,
    old_risk: String,
    new_risk: String,
    reason: String,
}

impl LearningAgent {
    pub async fn new(
        knowledge_graph: KnowledgeGraph,
        ai_provider: Option<Box<dyn AIProvider>>,
    ) -> Result<Self> {
        Ok(Self {
            id: Uuid::new_v4(),
            name: "Learning Agent".to_string(),
            knowledge_graph,
            ai_provider,
            learning_sessions: HashMap::new(),
            pattern_cache: HashMap::new(),
            solution_effectiveness: HashMap::new(),
        })
    }

    async fn analyze_outcome(&mut self, session: &mut LearningSession) -> Result<()> {
        if let Some(outcome) = &session.outcome {
            // Analyze what worked or didn't work
            let lessons = if outcome.success {
                self.extract_success_lessons(session).await?
            } else {
                self.extract_failure_lessons(session).await?
            };
            
            session.lessons_learned = lessons;
            
            // Update pattern statistics
            self.update_pattern_stats(session);
            
            // Update solution effectiveness
            self.update_solution_stats(session);
            
            // Store lessons in knowledge graph
            self.store_lessons(session).await?;
        }
        
        Ok(())
    }

    async fn extract_success_lessons(&self, session: &LearningSession) -> Result<Vec<Lesson>> {
        let mut lessons = Vec::new();
        
        // Basic success pattern
        lessons.push(Lesson {
            lesson_type: LessonType::SuccessfulPattern,
            description: format!(
                "Solution '{}' successfully resolved {} issue",
                session.solution_applied.as_ref()
                    .map(|s| s.description.as_str())
                    .unwrap_or("unknown"),
                session.problem_type
            ),
            confidence: 0.8,
            applicable_patterns: vec![session.problem_type.clone()],
        });
        
        // Use AI for deeper analysis if available
        if let Some(ai) = &self.ai_provider {
            let prompt = format!(
                r#"Analyze this successful fix and extract lessons learned:

Problem Type: {}
Root Cause: {}
Solution Applied: {}
Execution Time: {} seconds
Validation Results: {:?}

Please identify:
1. Why this solution worked
2. Key success factors
3. Optimization opportunities
4. Conditions for reapplication

Format as JSON array of lessons with fields: type, description, confidence"#,
                session.problem_type,
                session.root_cause.as_ref()
                    .map(|rc| &rc.description)
                    .unwrap_or(&"Unknown".to_string()),
                session.solution_applied.as_ref()
                    .map(|s| &s.description)
                    .unwrap_or(&"Unknown".to_string()),
                session.outcome.as_ref()
                    .map(|o| o.fix_duration.num_seconds())
                    .unwrap_or(0),
                session.outcome.as_ref()
                    .map(|o| &o.validation_results)
                    .unwrap_or(&vec![])
            );
            
            let input = AIInput::from_prompt(prompt)
                .with_temperature(0.3)
                .with_max_tokens(800);
            
            match ai.complete(input).await {
                Ok(output) => {
                    if let Ok(ai_lessons) = serde_json::from_str::<Vec<serde_json::Value>>(&output.content) {
                        for lesson_data in ai_lessons {
                            if let (Some(desc), Some(conf)) = 
                                (lesson_data["description"].as_str(), lesson_data["confidence"].as_f64()) {
                                lessons.push(Lesson {
                                    lesson_type: LessonType::SuccessfulPattern,
                                    description: desc.to_string(),
                                    confidence: conf,
                                    applicable_patterns: vec![session.problem_type.clone()],
                                });
                            }
                        }
                    }
                }
                Err(e) => warn!("AI analysis failed: {}", e),
            }
        }
        
        Ok(lessons)
    }

    async fn extract_failure_lessons(&self, session: &LearningSession) -> Result<Vec<Lesson>> {
        let mut lessons = Vec::new();
        
        // Basic failure pattern
        lessons.push(Lesson {
            lesson_type: LessonType::FailurePattern,
            description: format!(
                "Solution '{}' failed to resolve {} issue",
                session.solution_applied.as_ref()
                    .map(|s| s.description.as_str())
                    .unwrap_or("unknown"),
                session.problem_type
            ),
            confidence: 0.9,
            applicable_patterns: vec![session.problem_type.clone()],
        });
        
        // Analyze validation failures
        if let Some(outcome) = &session.outcome {
            for validation in &outcome.validation_results {
                if !validation.passed {
                    lessons.push(Lesson {
                        lesson_type: LessonType::FailurePattern,
                        description: format!("Validation '{}' failed: {}", 
                            validation.check_name, validation.details),
                        confidence: 0.85,
                        applicable_patterns: vec![session.problem_type.clone()],
                    });
                }
            }
        }
        
        Ok(lessons)
    }

    fn update_pattern_stats(&mut self, session: &LearningSession) {
        let pattern_key = session.problem_type.clone();
        let stats = self.pattern_cache.entry(pattern_key).or_default();
        
        stats.occurrences += 1;
        stats.last_seen = Utc::now();
        
        if let Some(outcome) = &session.outcome {
            if outcome.success {
                stats.successful_applications += 1;
            } else {
                stats.failed_applications += 1;
            }
            
            // Update average resolution time
            let total_time = stats.average_resolution_time.num_seconds() * (stats.occurrences - 1) as i64
                + outcome.fix_duration.num_seconds();
            stats.average_resolution_time = Duration::seconds(total_time / stats.occurrences as i64);
        }
    }

    fn update_solution_stats(&mut self, session: &LearningSession) {
        if let Some(solution) = &session.solution_applied {
            let stats = self.solution_effectiveness
                .entry(solution.solution_type.clone())
                .or_default();
            
            stats.applications += 1;
            
            if let Some(outcome) = &session.outcome {
                if outcome.success {
                    stats.successes += 1;
                } else {
                    stats.failures += 1;
                }
                
                // Update average execution time
                let total_time = stats.average_execution_time.num_seconds() * (stats.applications - 1) as i64
                    + outcome.fix_duration.num_seconds();
                stats.average_execution_time = Duration::seconds(total_time / stats.applications as i64);
                
                // Update effectiveness by context
                let context_key = session.problem_type.clone();
                let current_effectiveness = stats.effectiveness_by_context
                    .entry(context_key.clone())
                    .or_insert(0.0);
                
                // Rolling average of effectiveness
                *current_effectiveness = (*current_effectiveness * 0.8) + (if outcome.success { 1.0 } else { 0.0 }) * 0.2;
            }
        }
    }

    async fn store_lessons(&self, session: &LearningSession) -> Result<()> {
        for lesson in &session.lessons_learned {
            // Create a pattern from the lesson
            let pattern = Pattern {
                id: Uuid::new_v4(),
                pattern_type: match lesson.lesson_type {
                    LessonType::SuccessfulPattern => PatternType::Solution,
                    LessonType::FailurePattern => PatternType::Failure,
                    _ => PatternType::Behavioral,
                },
                name: format!("{} - {}", session.problem_type, lesson.lesson_type.to_string()),
                description: lesson.description.clone(),
                pattern: serde_json::json!({
                    "problem_type": session.problem_type,
                    "lesson": lesson,
                    "session_id": session.id,
                }),
                confidence: lesson.confidence,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                usage_count: 0,
                success_rate: if matches!(lesson.lesson_type, LessonType::SuccessfulPattern) { 1.0 } else { 0.0 },
                metadata: HashMap::new(),
            };
            
            self.knowledge_graph.add_pattern(pattern).await?;
        }
        
        Ok(())
    }

    async fn suggest_improvements(&self) -> Vec<Improvement> {
        let mut improvements = Vec::new();
        
        // Analyze solution effectiveness
        for (solution_type, stats) in &self.solution_effectiveness {
            let success_rate = if stats.applications > 0 {
                stats.successes as f64 / stats.applications as f64
            } else {
                0.0
            };
            
            if success_rate < 0.5 && stats.applications > 5 {
                improvements.push(Improvement {
                    improvement_type: ImprovementType::SolutionOptimization,
                    target: solution_type.clone(),
                    description: format!(
                        "Solution '{}' has low success rate ({:.1}%). Consider reviewing implementation or adding prerequisites.",
                        solution_type, success_rate * 100.0
                    ),
                    priority: if success_rate < 0.3 { Priority::High } else { Priority::Medium },
                });
            }
            
            // Check for context-specific issues
            for (context, effectiveness) in &stats.effectiveness_by_context {
                if *effectiveness < 0.4 && stats.applications > 3 {
                    improvements.push(Improvement {
                        improvement_type: ImprovementType::ContextualAdjustment,
                        target: solution_type.clone(),
                        description: format!(
                            "Solution '{}' performs poorly in context '{}' ({:.1}% success). Consider context-specific adjustments.",
                            solution_type, context, effectiveness * 100.0
                        ),
                        priority: Priority::Medium,
                    });
                }
            }
        }
        
        // Analyze pattern trends
        for (pattern, stats) in &self.pattern_cache {
            if stats.occurrences > 10 && stats.failed_applications > stats.successful_applications {
                improvements.push(Improvement {
                    improvement_type: ImprovementType::PatternReview,
                    target: pattern.clone(),
                    description: format!(
                        "Pattern '{}' has more failures ({}) than successes ({}). Root cause analysis may be flawed.",
                        pattern, stats.failed_applications, stats.successful_applications
                    ),
                    priority: Priority::High,
                });
            }
        }
        
        improvements
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Improvement {
    improvement_type: ImprovementType,
    target: String,
    description: String,
    priority: Priority,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum ImprovementType {
    SolutionOptimization,
    ContextualAdjustment,
    PatternReview,
    RiskReassessment,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum Priority {
    Low,
    Medium,
    High,
}

impl std::fmt::Display for LessonType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LessonType::SuccessfulPattern => write!(f, "Success"),
            LessonType::FailurePattern => write!(f, "Failure"),
            LessonType::OptimizationOpportunity => write!(f, "Optimization"),
            LessonType::RiskIdentification => write!(f, "Risk"),
            LessonType::ContextualCondition => write!(f, "Context"),
        }
    }
}

#[async_trait]
impl UniversalAgent for LearningAgent {
    fn id(&self) -> AgentId {
        self.id
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Learning
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn capabilities(&self) -> Vec<Capability> {
        vec![
            Capability::PatternExtraction,
            Capability::KnowledgeAcquisition,
            Capability::FeedbackProcessing,
        ]
    }

    fn subscriptions(&self) -> Vec<EventPattern> {
        vec![
            EventPattern {
                event_types: vec![
                    EventType::Custom("RootCauseDetermined".to_string()),
                    EventType::Custom("FixExecuted".to_string()),
                    EventType::Custom("FixFailed".to_string()),
                    EventType::Custom("ValidationCompleted".to_string()),
                ],
                source_filter: None,
                metadata_filters: HashMap::new(),
            }
        ]
    }

    async fn process(&mut self, event: Event) -> Result<Vec<Event>> {
        let mut events = Vec::new();
        
        let correlation_id = event.correlation_id.clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        
        match &event.event_type {
            EventType::Custom(event_type) => {
                match event_type.as_str() {
                    "RootCauseDetermined" => {
                        // Start a new learning session
                        let root_cause = serde_json::from_value::<RootCause>(event.metadata.clone())
                            .ok();
                        
                        let session = LearningSession {
                            id: correlation_id.clone(),
                            started_at: Utc::now(),
                            problem_type: root_cause.as_ref()
                                .map(|rc| rc.category.clone())
                                .unwrap_or_else(|| "Unknown".to_string()),
                            initial_event: event.clone(),
                            root_cause,
                            solution_applied: None,
                            outcome: None,
                            lessons_learned: Vec::new(),
                        };
                        
                        self.learning_sessions.insert(correlation_id, session);
                    }
                    
                    "FixExecuted" | "FixFailed" => {
                        // Update learning session with outcome
                        if let Some(session) = self.learning_sessions.get_mut(&correlation_id) {
                            // Extract solution info
                            if let Ok(solution) = serde_json::from_value::<Solution>(
                                event.metadata.get("solution").cloned().unwrap_or_default()
                            ) {
                                session.solution_applied = Some(solution);
                            }
                            
                            // Create outcome analysis
                            let outcome = OutcomeAnalysis {
                                success: event_type == "FixExecuted",
                                fix_duration: session.started_at.signed_duration_since(Utc::now()).abs(),
                                validation_results: Vec::new(), // Will be filled by validation event
                                side_effects: Vec::new(),
                                performance_impact: None,
                            };
                            
                            session.outcome = Some(outcome);
                            
                            // Analyze and learn
                            self.analyze_outcome(session).await?;
                            
                            // Emit learning completed event
                            events.push(Event {
                                id: Uuid::new_v4(),
                                timestamp: Utc::now(),
                                event_type: EventType::Custom("LearningCompleted".to_string()),
                                source: self.id.to_string(),
                                severity: EventSeverity::Low,
                                service_id: event.service_id.clone(),
                                correlation_id: Some(correlation_id.clone()),
                                metadata: serde_json::json!({
                                    "lessons_learned": session.lessons_learned.len(),
                                    "success": event_type == "FixExecuted",
                                }),
                            });
                        }
                    }
                    
                    _ => {}
                }
            }
            _ => {}
        }
        
        // Periodically suggest improvements
        if self.learning_sessions.len() % 10 == 0 && !self.learning_sessions.is_empty() {
            let improvements = self.suggest_improvements().await;
            if !improvements.is_empty() {
                events.push(Event {
                    id: Uuid::new_v4(),
                    timestamp: Utc::now(),
                    event_type: EventType::Custom("ImprovementsSuggested".to_string()),
                    source: self.id.to_string(),
                    severity: EventSeverity::Medium,
                    service_id: None,
                    correlation_id: None,
                    metadata: serde_json::to_value(&improvements)?,
                });
            }
        }
        
        Ok(events)
    }

    async fn learn(&mut self, experience: Experience) -> Result<Knowledge> {
        // Meta-learning: Learn about the learning process itself
        let meta_knowledge = serde_json::json!({
            "learning_sessions_completed": self.learning_sessions.len(),
            "patterns_identified": self.pattern_cache.len(),
            "solution_types_tracked": self.solution_effectiveness.len(),
            "experience": experience,
        });
        
        Ok(Knowledge {
            knowledge_type: KnowledgeType::Optimization,
            content: meta_knowledge,
            confidence: 0.7,
            applicable_contexts: vec![Context {
                environment: HashMap::new(),
                constraints: vec!["continuous_learning".to_string()],
                requirements: vec!["outcome_tracking".to_string()],
            }],
        })
    }

    async fn collaborate(&mut self, request: CollaborationRequest) -> Result<CollaborationResponse> {
        match request.collaboration_type {
            crate::agent::CollaborationType::KnowledgeSharing => {
                // Share learning insights
                let insights = serde_json::json!({
                    "pattern_stats": self.pattern_cache,
                    "solution_effectiveness": self.solution_effectiveness,
                    "recent_lessons": self.learning_sessions.values()
                        .flat_map(|s| &s.lessons_learned)
                        .take(10)
                        .collect::<Vec<_>>(),
                });
                
                Ok(CollaborationResponse {
                    request_id: request.request_id,
                    responder: self.id,
                    response_type: crate::agent::ResponseType::Accepted,
                    content: insights,
                })
            }
            _ => Ok(CollaborationResponse {
                request_id: request.request_id,
                responder: self.id,
                response_type: crate::agent::ResponseType::Rejected,
                content: serde_json::json!({
                    "reason": "Learning agent only shares knowledge",
                }),
            }),
        }
    }

    async fn status(&self) -> AgentStatus {
        AgentStatus {
            state: if self.learning_sessions.is_empty() {
                AgentState::Idle
            } else {
                AgentState::Learning
            },
            health: Health::Healthy,
            current_load: self.learning_sessions.len() as f64 / 50.0, // Max 50 concurrent sessions
            active_tasks: self.learning_sessions.len(),
            last_activity: Utc::now(),
            metrics: {
                let mut metrics = HashMap::new();
                metrics.insert("active_sessions".to_string(), self.learning_sessions.len() as f64);
                metrics.insert("patterns_learned".to_string(), self.pattern_cache.len() as f64);
                metrics.insert("solutions_tracked".to_string(), self.solution_effectiveness.len() as f64);
                
                // Calculate overall system effectiveness
                let total_applications: u64 = self.solution_effectiveness.values()
                    .map(|s| s.applications)
                    .sum();
                let total_successes: u64 = self.solution_effectiveness.values()
                    .map(|s| s.successes)
                    .sum();
                
                if total_applications > 0 {
                    metrics.insert("overall_success_rate".to_string(), 
                        total_successes as f64 / total_applications as f64);
                }
                
                metrics
            },
        }
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Learning agent shutting down with {} active sessions", 
              self.learning_sessions.len());
        
        // Complete any pending learning sessions
        for (id, session) in &mut self.learning_sessions {
            if session.outcome.is_some() && session.lessons_learned.is_empty() {
                warn!("Incomplete learning session {} during shutdown", id);
                self.analyze_outcome(session).await?;
            }
        }
        
        Ok(())
    }
}