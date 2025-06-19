//! Knowledge Graph System
//! 
//! Universal knowledge representation for sharing learnings across all agents and tools

use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, postgres::PgPoolOptions};
use dashmap::DashMap;
use tokio::sync::RwLock;
use pgvector::Vector;

use crate::{Result, Error, AgentId};

pub mod graph;
pub mod embeddings;
pub mod patterns;
pub mod queries;

pub use graph::{KnowledgeNode, KnowledgeEdge, Relationship};
pub use embeddings::{EmbeddingStore, EmbeddingGenerator};
pub use patterns::{PatternMatcher, PatternExtractor};

/// Knowledge Graph with vector embeddings for similarity search
#[derive(Clone)]
pub struct KnowledgeGraph {
    /// Database connection pool
    db: PgPool,
    /// In-memory cache for frequently accessed nodes
    node_cache: Arc<DashMap<NodeId, KnowledgeNode>>,
    /// Embedding store for vector similarity
    embeddings: Arc<EmbeddingStore>,
    /// Pattern matcher
    pattern_matcher: Arc<PatternMatcher>,
}

pub type NodeId = Uuid;
pub type EdgeId = Uuid;

impl KnowledgeGraph {
    /// Create a new knowledge graph
    pub async fn new(database_url: &str) -> Result<Self> {
        let db = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;
        
        // Run migrations
        sqlx::migrate!("../../migrations/knowledge_graph")
            .run(&db)
            .await?;
        
        let embeddings = Arc::new(EmbeddingStore::new(db.clone()).await?);
        let pattern_matcher = Arc::new(PatternMatcher::new());
        
        Ok(Self {
            db,
            node_cache: Arc::new(DashMap::new()),
            embeddings,
            pattern_matcher,
        })
    }
    
    /// Add a problem node
    pub async fn add_problem(&self, problem: Problem) -> Result<NodeId> {
        let id = Uuid::new_v4();
        let fingerprint = self.generate_fingerprint(&problem);
        
        // Check if similar problem exists
        if let Some(existing_id) = self.find_similar_problem(&fingerprint).await? {
            // Update occurrence count
            self.increment_problem_occurrences(existing_id).await?;
            return Ok(existing_id);
        }
        
        // Create embedding
        let embedding = self.embeddings.generate_embedding(&problem.description).await?;
        
        // Insert into database
        let embedding_vec = Vector::from(embedding);
        
        sqlx::query(
            r#"
            INSERT INTO knowledge_nodes (id, node_type, data, embedding)
            VALUES ($1, 'problem', $2, $3)
            "#
        )
        .bind(id)
        .bind(serde_json::to_value(&problem)?)
        .bind(embedding_vec)
        .execute(&self.db)
        .await?;
        
        // Cache the node
        self.node_cache.insert(id, KnowledgeNode::Problem(problem));
        
        Ok(id)
    }
    
    /// Add a solution node
    pub async fn add_solution(&self, solution: Solution, problem_id: NodeId) -> Result<NodeId> {
        let id = Uuid::new_v4();
        
        // Create embedding
        let embedding = self.embeddings.generate_embedding(&solution.description).await?;
        
        // Insert solution
        let embedding_vec = Vector::from(embedding);
        
        sqlx::query(
            r#"
            INSERT INTO knowledge_nodes (id, node_type, data, embedding)
            VALUES ($1, 'solution', $2, $3)
            "#
        )
        .bind(id)
        .bind(serde_json::to_value(&solution)?)
        .bind(embedding_vec)
        .execute(&self.db)
        .await?;
        
        // Create edge: Solution -> Solves -> Problem
        self.add_edge(id, problem_id, Relationship::Solves, 1.0).await?;
        
        // Cache the node
        self.node_cache.insert(id, KnowledgeNode::Solution(solution));
        
        Ok(id)
    }
    
    /// Add a pattern node
    pub async fn add_pattern(&self, pattern: Pattern) -> Result<NodeId> {
        let id = Uuid::new_v4();
        
        // Insert pattern
        sqlx::query(
            r#"
            INSERT INTO knowledge_nodes (id, node_type, data)
            VALUES ($1, 'pattern', $2)
            "#
        )
        .bind(id)
        .bind(serde_json::to_value(&pattern)?)
        .execute(&self.db)
        .await?;
        
        // Register with pattern matcher
        self.pattern_matcher.register_pattern(pattern.clone()).await;
        
        // Cache the node
        self.node_cache.insert(id, KnowledgeNode::Pattern(pattern));
        
        Ok(id)
    }
    
    /// Add an edge between nodes
    pub async fn add_edge(
        &self,
        from: NodeId,
        to: NodeId,
        relationship: Relationship,
        weight: f64,
    ) -> Result<EdgeId> {
        let id = Uuid::new_v4();
        
        // Convert relationship to database enum string
        let relationship_str = match relationship {
            Relationship::Solves => "solves",
            Relationship::Uses => "requires",
            Relationship::Requires => "requires",
            Relationship::Causes => "causes",
            Relationship::LeadsTo => "leads_to",
            Relationship::RelatedTo => "similar_to",
            Relationship::PartOf => "implements",
            Relationship::DependsOn => "requires",
            Relationship::Conflicts => "triggers",
            Relationship::Improves => "evolves_into",
            Relationship::Validates => "collaborates",
            Relationship::Generates => "triggers",
            Relationship::Custom(_) => "collaborates",
        };
        
        sqlx::query(
            r#"
            INSERT INTO knowledge_edges (id, from_node, to_node, relationship, weight)
            VALUES ($1, $2, $3, $4::knowledge_relationship, $5)
            "#
        )
        .bind(id)
        .bind(from)
        .bind(to)
        .bind(relationship_str)
        .bind(weight)
        .execute(&self.db)
        .await?;
        
        Ok(id)
    }
    
    /// Find solutions for a problem
    pub async fn find_solutions(&self, problem_description: &str) -> Result<Vec<SolutionCandidate>> {
        // Generate embedding for the problem
        let problem_embedding = self.embeddings.generate_embedding(problem_description).await?;
        
        // Find similar problems using vector similarity
        let embedding_vec = Vector::from(problem_embedding);
        
        let similar_problems = sqlx::query_as::<_, (Uuid, serde_json::Value, f32)>(
            r#"
            SELECT n.id, n.data, 1 - (n.embedding <=> $1) as similarity
            FROM knowledge_nodes n
            WHERE n.node_type = 'problem'
            ORDER BY n.embedding <=> $1
            LIMIT 10
            "#
        )
        .bind(embedding_vec)
        .fetch_all(&self.db)
        .await?;
        
        let mut solution_candidates = Vec::new();
        
        // For each similar problem, find its solutions
        for problem in similar_problems {
            let solutions = sqlx::query_as::<_, (Uuid, serde_json::Value, f64)>(
                r#"
                SELECT n.id, n.data, e.weight
                FROM knowledge_nodes n
                JOIN knowledge_edges e ON e.from_node = n.id
                WHERE e.to_node = $1 AND e.relationship = 'solves'
                ORDER BY e.weight DESC
                "#
            )
            .bind(problem.0)
            .fetch_all(&self.db)
            .await?;
            
            for solution in solutions {
                let solution_data: Solution = serde_json::from_value(solution.1)?;
                solution_candidates.push(SolutionCandidate {
                    solution: solution_data,
                    confidence: problem.2 * solution.2,
                    similar_problem_id: problem.0,
                });
            }
        }
        
        // Sort by confidence
        solution_candidates.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
        
        Ok(solution_candidates)
    }
    
    /// Update solution success rate based on outcome
    pub async fn update_solution_outcome(
        &self,
        solution_id: NodeId,
        success: bool,
    ) -> Result<()> {
        // Get current solution data
        let node = sqlx::query_as::<_, (serde_json::Value,)>(
            "SELECT data FROM knowledge_nodes WHERE id = $1"
        )
        .bind(solution_id)
        .fetch_one(&self.db)
        .await?;
        
        let mut solution: Solution = serde_json::from_value(node.0)?;
        
        // Update success rate
        solution.attempt_count += 1;
        if success {
            solution.success_count += 1;
        }
        solution.success_rate = solution.success_count as f64 / solution.attempt_count as f64;
        
        // Update in database
        sqlx::query(
            "UPDATE knowledge_nodes SET data = $1 WHERE id = $2"
        )
        .bind(serde_json::to_value(&solution)?)
        .bind(solution_id)
        .execute(&self.db)
        .await?;
        
        // Update cache
        self.node_cache.insert(solution_id, KnowledgeNode::Solution(solution));
        
        Ok(())
    }
    
    /// Extract patterns from recent experiences
    pub async fn extract_patterns(&self, min_occurrences: usize) -> Result<Vec<Pattern>> {
        self.pattern_matcher.extract_patterns(&self.db, min_occurrences).await
    }
    
    fn generate_fingerprint(&self, problem: &Problem) -> String {
        // Simple fingerprint generation - can be made more sophisticated
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        
        let mut hasher = DefaultHasher::new();
        problem.category.hash(&mut hasher);
        problem.error_patterns.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }
    
    async fn find_similar_problem(&self, fingerprint: &str) -> Result<Option<NodeId>> {
        let result = sqlx::query_as::<_, (Uuid,)>(
            r#"
            SELECT id FROM knowledge_nodes 
            WHERE node_type = 'problem' 
            AND data->>'fingerprint' = $1
            LIMIT 1
            "#
        )
        .bind(fingerprint)
        .fetch_optional(&self.db)
        .await?;
        
        Ok(result.map(|r| r.0))
    }
    
    async fn increment_problem_occurrences(&self, problem_id: NodeId) -> Result<()> {
        // Update both fields in a single JSONB operation
        sqlx::query(
            r#"
            UPDATE knowledge_nodes 
            SET data = data || jsonb_build_object(
                'occurrence_count', COALESCE((data->>'occurrence_count')::int, 0) + 1,
                'last_seen', $1::text
            )
            WHERE id = $2
            "#
        )
        .bind(Utc::now().to_rfc3339())
        .bind(problem_id)
        .execute(&self.db)
        .await?;
        
        Ok(())
    }
}

/// Problem representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Problem {
    pub fingerprint: String,
    pub category: String,
    pub description: String,
    pub error_patterns: Vec<String>,
    pub context: HashMap<String, serde_json::Value>,
    pub severity: Severity,
    pub occurrence_count: u32,
    pub first_seen: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}

/// Solution representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Solution {
    pub description: String,
    pub actions: Vec<Action>,
    pub prerequisites: Vec<String>,
    pub side_effects: Vec<String>,
    pub success_rate: f64,
    pub attempt_count: u32,
    pub success_count: u32,
    pub avg_resolution_time: Option<std::time::Duration>,
}

/// Pattern representation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub pattern_type: PatternType,
    pub description: String,
    pub matching_rules: Vec<MatchingRule>,
    pub confidence: f64,
    pub occurrences: u32,
    pub last_updated: DateTime<Utc>,
}

/// Action to take
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub action_type: String,
    pub target: Option<String>,
    pub parameters: HashMap<String, serde_json::Value>,
    pub order: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PatternType {
    Error,
    Performance,
    Security,
    Configuration,
    Behavioral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchingRule {
    pub field: String,
    pub operator: MatchOperator,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MatchOperator {
    Equals,
    Contains,
    Regex,
    GreaterThan,
    LessThan,
}

/// Solution candidate with confidence score
pub struct SolutionCandidate {
    pub solution: Solution,
    pub confidence: f64,
    pub similar_problem_id: NodeId,
}