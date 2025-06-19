-- Knowledge Graph Schema for AI-Ops Core
-- Stores all knowledge, patterns, and relationships

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Knowledge node types enum
CREATE TYPE knowledge_node_type AS ENUM (
    'problem',
    'solution',
    'pattern',
    'tool',
    'agent',
    'insight'
);

-- Relationship types enum
CREATE TYPE knowledge_relationship AS ENUM (
    'solves',
    'causes',
    'requires',
    'implements',
    'triggers',
    'leads_to',
    'similar_to',
    'evolves_into',
    'collaborates'
);

-- Main knowledge nodes table
CREATE TABLE knowledge_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    node_type knowledge_node_type NOT NULL,
    data JSONB NOT NULL,
    embedding vector(1536), -- For similarity search
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge edges table (relationships)
CREATE TABLE knowledge_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_node UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    to_node UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    relationship knowledge_relationship NOT NULL,
    weight FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent experiences table
CREATE TABLE agent_experiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL,
    event_id UUID NOT NULL,
    action_taken JSONB NOT NULL,
    outcome JSONB NOT NULL,
    duration_ms INTEGER NOT NULL,
    knowledge_gained JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pattern occurrences for pattern extraction
CREATE TABLE pattern_occurrences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pattern_hash VARCHAR(64) NOT NULL,
    occurrence_data JSONB NOT NULL,
    context JSONB NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- AI insights and predictions
CREATE TABLE ai_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    insight_type VARCHAR(50) NOT NULL,
    content JSONB NOT NULL,
    confidence FLOAT NOT NULL,
    source_nodes UUID[] NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    validated BOOLEAN DEFAULT FALSE,
    validation_score FLOAT
);

-- Indexes for performance
CREATE INDEX idx_nodes_type ON knowledge_nodes(node_type);
CREATE INDEX idx_nodes_data_fingerprint ON knowledge_nodes((data->>'fingerprint')) WHERE node_type = 'problem';
CREATE INDEX idx_nodes_created ON knowledge_nodes(created_at DESC);
CREATE INDEX idx_nodes_embedding ON knowledge_nodes USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX idx_edges_from ON knowledge_edges(from_node);
CREATE INDEX idx_edges_to ON knowledge_edges(to_node);
CREATE INDEX idx_edges_relationship ON knowledge_edges(relationship);
CREATE INDEX idx_edges_weight ON knowledge_edges(weight DESC);

CREATE INDEX idx_experiences_agent ON agent_experiences(agent_id);
CREATE INDEX idx_experiences_created ON agent_experiences(created_at DESC);

CREATE INDEX idx_patterns_hash ON pattern_occurrences(pattern_hash);
CREATE INDEX idx_patterns_timestamp ON pattern_occurrences(timestamp DESC);

CREATE INDEX idx_insights_type ON ai_insights(insight_type);
CREATE INDEX idx_insights_confidence ON ai_insights(confidence DESC);
CREATE INDEX idx_insights_created ON ai_insights(created_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_knowledge_nodes_updated_at BEFORE UPDATE ON knowledge_nodes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_edges_updated_at BEFORE UPDATE ON knowledge_edges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to increment access count
CREATE OR REPLACE FUNCTION increment_access_count(node_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE knowledge_nodes 
    SET access_count = access_count + 1,
        last_accessed = NOW()
    WHERE id = node_id;
END;
$$ language 'plpgsql';

-- View for most accessed knowledge
CREATE VIEW popular_knowledge AS
SELECT 
    id,
    node_type,
    data->>'description' as description,
    access_count,
    last_accessed
FROM knowledge_nodes
ORDER BY access_count DESC
LIMIT 100;

-- View for recent problems
CREATE VIEW recent_problems AS
SELECT 
    id,
    data->>'category' as category,
    data->>'description' as description,
    data->>'severity' as severity,
    (data->>'occurrence_count')::int as occurrence_count,
    created_at,
    updated_at
FROM knowledge_nodes
WHERE node_type = 'problem'
ORDER BY updated_at DESC
LIMIT 100;

-- View for successful solutions
CREATE VIEW successful_solutions AS
SELECT 
    n.id,
    n.data->>'description' as description,
    (n.data->>'success_rate')::float as success_rate,
    (n.data->>'attempt_count')::int as attempt_count,
    array_agg(e.to_node) as solves_problems
FROM knowledge_nodes n
LEFT JOIN knowledge_edges e ON e.from_node = n.id AND e.relationship = 'solves'
WHERE n.node_type = 'solution'
  AND (n.data->>'success_rate')::float > 0.7
GROUP BY n.id
ORDER BY (n.data->>'success_rate')::float DESC;