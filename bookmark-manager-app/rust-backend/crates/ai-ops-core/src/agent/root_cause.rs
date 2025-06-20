//! Root Cause Analysis Agent
//! 
//! This agent analyzes errors and warnings from logs to determine root causes
//! and propose solutions.

use async_trait::async_trait;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use tracing::{info, warn, error};

use crate::{
    Result, Event, EventType, AgentId,
    agent::{
        UniversalAgent, AgentType, Capability, EventPattern, Experience, 
        Knowledge, CollaborationRequest, CollaborationResponse, AgentStatus,
        AgentState, Health, Context, Decision, Action, ActionType, Outcome,
        KnowledgeType
    },
    ai::{AIProvider, AIInput, Message, Role},
    knowledge::KnowledgeGraph,
    events::EventSeverity,
};

/// Root Cause Analysis Agent
pub struct RootCauseAnalysisAgent {
    id: AgentId,
    name: String,
    ai_provider: Box<dyn AIProvider>,
    knowledge_graph: KnowledgeGraph,
    active_investigations: HashMap<String, Investigation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Investigation {
    id: String,
    started_at: DateTime<Utc>,
    error_pattern: String,
    related_events: Vec<Event>,
    hypotheses: Vec<Hypothesis>,
    root_cause: Option<RootCause>,
    proposed_solutions: Vec<ProposedSolution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Hypothesis {
    description: String,
    confidence: f64,
    evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RootCause {
    description: String,
    category: String,
    confidence: f64,
    evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProposedSolution {
    description: String,
    steps: Vec<String>,
    risk_level: RiskLevel,
    confidence: f64,
    estimated_fix_time: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
enum RiskLevel {
    Low,
    Medium,
    High,
}

impl RootCauseAnalysisAgent {
    pub async fn new(
        ai_provider: Box<dyn AIProvider>,
        knowledge_graph: KnowledgeGraph,
    ) -> Result<Self> {
        Ok(Self {
            id: Uuid::new_v4(),
            name: "Root Cause Analysis Agent".to_string(),
            ai_provider,
            knowledge_graph,
            active_investigations: HashMap::new(),
        })
    }

    async fn analyze_error_pattern(&self, events: &[Event]) -> Result<String> {
        // Extract error messages and patterns
        let error_messages: Vec<String> = events.iter()
            .filter_map(|e| e.metadata.get("error_message").and_then(|v| v.as_str()))
            .map(|s| s.to_string())
            .collect();

        let stack_traces: Vec<String> = events.iter()
            .filter_map(|e| e.metadata.get("stack_trace").and_then(|v| v.as_str()))
            .map(|s| s.to_string())
            .collect();

        // Prepare AI prompt for pattern analysis
        let prompt = format!(
            r#"Analyze the following error messages and stack traces to identify patterns:

Error Messages:
{}

Stack Traces:
{}

Please identify:
1. Common patterns in the errors
2. Likely components involved
3. Potential root causes
4. Severity assessment

Format your response as JSON with fields: pattern, components, potential_causes, severity"#,
            error_messages.join("\n"),
            stack_traces.join("\n")
        );

        let input = AIInput::from_prompt(prompt)
            .with_system("You are an expert system administrator analyzing production errors. Provide detailed technical analysis.".to_string())
            .with_temperature(0.2)
            .with_max_tokens(1000);

        let output = self.ai_provider.complete(input).await?;
        Ok(output.content)
    }

    async fn determine_root_cause(&self, investigation: &Investigation) -> Result<RootCause> {
        // Query knowledge graph for similar patterns
        let similar_cases = self.knowledge_graph
            .find_similar_patterns(&investigation.error_pattern, 5)
            .await?;

        // Prepare context for AI analysis
        let similar_cases_desc: Vec<String> = similar_cases.iter()
            .map(|case| format!("- {}: {}", case.pattern_type, case.description))
            .collect();

        let prompt = format!(
            r#"Based on the following investigation data, determine the root cause:

Error Pattern: {}

Hypotheses:
{}

Similar Historical Cases:
{}

Related Events: {} events over {} minutes

Please determine:
1. The most likely root cause
2. Category (e.g., Configuration, Resource, Code Bug, Network, Database)
3. Confidence level (0-1)
4. Supporting evidence

Format your response as JSON with fields: description, category, confidence, evidence"#,
            investigation.error_pattern,
            investigation.hypotheses.iter()
                .map(|h| format!("- {} (confidence: {})", h.description, h.confidence))
                .collect::<Vec<_>>()
                .join("\n"),
            similar_cases_desc.join("\n"),
            investigation.related_events.len(),
            investigation.started_at.signed_duration_since(Utc::now()).num_minutes().abs()
        );

        let input = AIInput::from_prompt(prompt)
            .with_temperature(0.1)
            .with_max_tokens(800);

        let output = self.ai_provider.complete(input).await?;
        
        // Parse AI response
        let response: serde_json::Value = serde_json::from_str(&output.content)
            .unwrap_or_else(|_| serde_json::json!({
                "description": output.content,
                "category": "Unknown",
                "confidence": 0.5,
                "evidence": []
            }));

        Ok(RootCause {
            description: response["description"].as_str().unwrap_or("Unknown").to_string(),
            category: response["category"].as_str().unwrap_or("Unknown").to_string(),
            confidence: response["confidence"].as_f64().unwrap_or(0.5),
            evidence: response["evidence"]
                .as_array()
                .map(|arr| arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect())
                .unwrap_or_default(),
        })
    }

    async fn propose_solutions(&self, investigation: &Investigation) -> Result<Vec<ProposedSolution>> {
        let root_cause = investigation.root_cause.as_ref()
            .ok_or_else(|| crate::Error::Processing("No root cause determined".to_string()))?;

        // Query knowledge graph for successful solutions
        let successful_solutions = self.knowledge_graph
            .find_successful_solutions(&root_cause.category)
            .await?;

        let prompt = format!(
            r#"Based on the root cause analysis, propose solutions:

Root Cause: {}
Category: {}

Previous Successful Solutions:
{}

System Context:
- Service experiencing issues: {}
- Error frequency: {} errors
- Time span: {} minutes

Please propose 2-3 solutions with:
1. Clear description
2. Step-by-step instructions
3. Risk assessment (Low/Medium/High)
4. Confidence level (0-1)
5. Estimated time to implement

Format as JSON array with fields: description, steps, risk_level, confidence, estimated_fix_time"#,
            root_cause.description,
            root_cause.category,
            successful_solutions.iter()
                .map(|s| format!("- {}: {} (success rate: {}%)", 
                    s.solution_type, s.description, (s.success_rate * 100.0) as u32))
                .collect::<Vec<_>>()
                .join("\n"),
            investigation.related_events.first()
                .and_then(|e| e.service_id.as_ref())
                .unwrap_or(&"Unknown".to_string()),
            investigation.related_events.len(),
            investigation.started_at.signed_duration_since(Utc::now()).num_minutes().abs()
        );

        let input = AIInput::from_prompt(prompt)
            .with_temperature(0.3)
            .with_max_tokens(1500);

        let output = self.ai_provider.complete(input).await?;
        
        // Parse solutions
        let solutions: Vec<serde_json::Value> = serde_json::from_str(&output.content)
            .unwrap_or_else(|_| vec![]);

        Ok(solutions.into_iter()
            .filter_map(|s| {
                Some(ProposedSolution {
                    description: s["description"].as_str()?.to_string(),
                    steps: s["steps"].as_array()?
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect(),
                    risk_level: match s["risk_level"].as_str()? {
                        "Low" => RiskLevel::Low,
                        "Medium" => RiskLevel::Medium,
                        "High" => RiskLevel::High,
                        _ => RiskLevel::Medium,
                    },
                    confidence: s["confidence"].as_f64().unwrap_or(0.5),
                    estimated_fix_time: s["estimated_fix_time"].as_str()
                        .unwrap_or("Unknown")
                        .to_string(),
                })
            })
            .collect())
    }
}

#[async_trait]
impl UniversalAgent for RootCauseAnalysisAgent {
    fn id(&self) -> AgentId {
        self.id
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Diagnostic
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn capabilities(&self) -> Vec<Capability> {
        vec![
            Capability::RootCauseAnalysis,
            Capability::PatternRecognition,
            Capability::PredictiveAnalysis,
        ]
    }

    fn subscriptions(&self) -> Vec<EventPattern> {
        vec![
            EventPattern {
                event_types: vec![
                    EventType::ServiceFailure,
                    EventType::DatabaseError,
                    EventType::Custom("LogPatternDetected".to_string()),
                ],
                source_filter: None,
                metadata_filters: HashMap::new(),
            }
        ]
    }

    async fn process(&mut self, event: Event) -> Result<Vec<Event>> {
        let mut events = Vec::new();
        
        info!("Root cause agent processing event: {:?}", event.event_type);

        // Start or update investigation
        let investigation_id = event.correlation_id.clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let investigation = self.active_investigations
            .entry(investigation_id.clone())
            .or_insert_with(|| Investigation {
                id: investigation_id.clone(),
                started_at: Utc::now(),
                error_pattern: String::new(),
                related_events: Vec::new(),
                hypotheses: Vec::new(),
                root_cause: None,
                proposed_solutions: Vec::new(),
            });

        investigation.related_events.push(event.clone());

        // Analyze if we have enough events
        if investigation.related_events.len() >= 3 || 
           investigation.started_at.signed_duration_since(Utc::now()).num_minutes().abs() > 5 {
            
            // Analyze error pattern
            if investigation.error_pattern.is_empty() {
                investigation.error_pattern = self.analyze_error_pattern(&investigation.related_events).await?;
            }

            // Determine root cause
            if investigation.root_cause.is_none() {
                investigation.root_cause = Some(self.determine_root_cause(investigation).await?);
                
                // Emit root cause determined event
                events.push(Event {
                    id: Uuid::new_v4(),
                    timestamp: Utc::now(),
                    event_type: EventType::Custom("RootCauseDetermined".to_string()),
                    source: self.id.to_string(),
                    severity: EventSeverity::High,
                    service_id: event.service_id.clone(),
                    correlation_id: Some(investigation_id.clone()),
                    metadata: serde_json::to_value(&investigation.root_cause)?,
                });
            }

            // Propose solutions
            if investigation.proposed_solutions.is_empty() && investigation.root_cause.is_some() {
                investigation.proposed_solutions = self.propose_solutions(investigation).await?;
                
                // Emit solutions proposed event
                events.push(Event {
                    id: Uuid::new_v4(),
                    timestamp: Utc::now(),
                    event_type: EventType::Custom("SolutionsProposed".to_string()),
                    source: self.id.to_string(),
                    severity: EventSeverity::Medium,
                    service_id: event.service_id.clone(),
                    correlation_id: Some(investigation_id.clone()),
                    metadata: serde_json::json!({
                        "solutions": investigation.proposed_solutions,
                        "root_cause": investigation.root_cause,
                    }),
                });

                // Remove completed investigation after some time
                let investigation_id_clone = investigation_id.clone();
                let self_id = self.id;
                tokio::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
                    info!("Cleaning up investigation {} for agent {}", investigation_id_clone, self_id);
                });
            }
        }

        Ok(events)
    }

    async fn learn(&mut self, experience: Experience) -> Result<Knowledge> {
        // Learn from root cause analysis outcomes
        let knowledge_content = serde_json::json!({
            "event_type": experience.event.event_type,
            "action": experience.action_taken,
            "outcome": experience.outcome,
            "duration": experience.duration.as_secs(),
            "timestamp": Utc::now(),
        });

        // Store successful root cause analyses
        if experience.outcome.success {
            self.knowledge_graph.add_pattern(
                crate::knowledge::Pattern {
                    id: Uuid::new_v4(),
                    pattern_type: crate::knowledge::PatternType::Diagnostic,
                    name: "Successful Root Cause Analysis".to_string(),
                    description: format!("Successfully identified root cause for {}", 
                        experience.event.event_type.to_string()),
                    pattern: knowledge_content.clone(),
                    confidence: 0.8,
                    created_at: Utc::now(),
                    updated_at: Utc::now(),
                    usage_count: 1,
                    success_rate: 1.0,
                    metadata: experience.metadata,
                }
            ).await?;
        }

        Ok(Knowledge {
            knowledge_type: KnowledgeType::Pattern,
            content: knowledge_content,
            confidence: if experience.outcome.success { 0.9 } else { 0.3 },
            applicable_contexts: vec![Context {
                environment: HashMap::new(),
                constraints: vec!["error_analysis".to_string()],
                requirements: vec!["ai_provider".to_string()],
            }],
        })
    }

    async fn collaborate(&mut self, request: CollaborationRequest) -> Result<CollaborationResponse> {
        match request.collaboration_type {
            crate::agent::CollaborationType::JointAnalysis => {
                // Collaborate on root cause analysis
                Ok(CollaborationResponse {
                    request_id: request.request_id,
                    responder: self.id,
                    response_type: crate::agent::ResponseType::Accepted,
                    content: serde_json::json!({
                        "message": "Ready to collaborate on root cause analysis",
                        "capabilities": ["pattern_analysis", "ai_reasoning", "solution_generation"],
                    }),
                })
            }
            _ => Ok(CollaborationResponse {
                request_id: request.request_id,
                responder: self.id,
                response_type: crate::agent::ResponseType::Rejected,
                content: serde_json::json!({
                    "reason": "Unsupported collaboration type",
                }),
            }),
        }
    }

    async fn status(&self) -> AgentStatus {
        AgentStatus {
            state: if self.active_investigations.is_empty() {
                AgentState::Idle
            } else {
                AgentState::Processing
            },
            health: Health::Healthy,
            current_load: self.active_investigations.len() as f64 / 10.0, // Max 10 concurrent investigations
            active_tasks: self.active_investigations.len(),
            last_activity: Utc::now(),
            metrics: {
                let mut metrics = HashMap::new();
                metrics.insert("active_investigations".to_string(), self.active_investigations.len() as f64);
                metrics
            },
        }
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("Root cause analysis agent shutting down with {} active investigations", 
              self.active_investigations.len());
        self.active_investigations.clear();
        Ok(())
    }
}