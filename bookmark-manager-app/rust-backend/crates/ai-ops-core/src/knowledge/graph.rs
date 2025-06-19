//! Knowledge graph node and edge types

use super::*;

/// Knowledge node variants
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum KnowledgeNode {
    Problem(Problem),
    Solution(Solution),
    Pattern(Pattern),
    Tool(Tool),
    Agent(Agent),
    Insight(Insight),
}

/// Knowledge edge with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEdge {
    pub id: EdgeId,
    pub from: NodeId,
    pub to: NodeId,
    pub relationship: Relationship,
    pub weight: f64,
    pub metadata: EdgeMetadata,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Edge metadata
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EdgeMetadata {
    pub confidence: f64,
    pub evidence_count: u32,
    pub last_validated: Option<DateTime<Utc>>,
    pub properties: HashMap<String, serde_json::Value>,
}

/// Tool representation in knowledge graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub id: Uuid,
    pub name: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub dependencies: Vec<Dependency>,
    pub configuration: serde_json::Value,
    pub metrics: ToolMetrics,
}

/// Agent representation in knowledge graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: Uuid,
    pub agent_type: String,
    pub name: String,
    pub capabilities: Vec<String>,
    pub specializations: Vec<String>,
    pub performance_metrics: AgentMetrics,
    pub knowledge_domains: Vec<String>,
}

/// Insight representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Insight {
    pub id: Uuid,
    pub insight_type: InsightType,
    pub description: String,
    pub evidence: Vec<Evidence>,
    pub confidence: f64,
    pub impact: Impact,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub name: String,
    pub version_constraint: String,
    pub optional: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ToolMetrics {
    pub usage_count: u64,
    pub success_rate: f64,
    pub avg_execution_time: Duration,
    pub last_used: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentMetrics {
    pub tasks_completed: u64,
    pub success_rate: f64,
    pub avg_response_time: Duration,
    pub collaboration_score: f64,
    pub knowledge_contribution_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InsightType {
    Performance,
    Security,
    Optimization,
    Prediction,
    Correlation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub source: String,
    pub data: serde_json::Value,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Impact {
    pub severity: Severity,
    pub scope: Vec<String>,
    pub estimated_value: f64,
}

use std::time::Duration;

/// Relationship types in the knowledge graph
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Relationship {
    Solves,        // Solution solves Problem
    Uses,          // Solution uses Tool
    Requires,      // Tool requires Tool
    Causes,        // Problem causes Problem
    LeadsTo,       // Pattern leads to Outcome
    RelatedTo,     // Generic relationship
    PartOf,        // Hierarchical relationship
    DependsOn,     // Dependency relationship
    Conflicts,     // Conflicting relationship
    Improves,      // Performance improvement
    Validates,     // Validation relationship
    Generates,     // Generation relationship
    Custom(String), // Custom relationship type
}