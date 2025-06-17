-- A2A-Compliant Task Management Schema
-- Following Google A2A protocol standards for task-centric workflows

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS a2a_messages CASCADE;
DROP TABLE IF EXISTS a2a_artifacts CASCADE;
DROP TABLE IF EXISTS a2a_tasks CASCADE;
DROP TABLE IF EXISTS a2a_agent_capabilities CASCADE;

-- A2A Tasks table - Core task entity
CREATE TABLE a2a_tasks (
    id VARCHAR(255) PRIMARY KEY,
    type VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Workflow information
    workflow_type VARCHAR(255),
    workflow_agents TEXT[], -- Array of agent types in workflow
    current_agent VARCHAR(255),
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER,
    
    -- Context data (flexible JSON for different task types)
    context JSONB NOT NULL DEFAULT '{}',
    
    -- User and permissions
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    error_message TEXT,
    
    -- Indexes for performance
    INDEX idx_a2a_tasks_status (status),
    INDEX idx_a2a_tasks_type (type),
    INDEX idx_a2a_tasks_user_id (user_id),
    INDEX idx_a2a_tasks_created (created),
    INDEX idx_a2a_tasks_workflow_type (workflow_type)
);

-- A2A Artifacts table - Immutable agent outputs
CREATE TABLE a2a_artifacts (
    id VARCHAR(255) PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
    agent_type VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL,
    mime_type VARCHAR(255) NOT NULL DEFAULT 'application/json',
    
    -- Artifact data (JSON for flexibility)
    data JSONB NOT NULL,
    
    -- A2A compliance fields
    created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    immutable BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata
    size_bytes INTEGER,
    checksum VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    
    -- Indexes
    INDEX idx_a2a_artifacts_task_id (task_id),
    INDEX idx_a2a_artifacts_agent_type (agent_type),
    INDEX idx_a2a_artifacts_type (type),
    INDEX idx_a2a_artifacts_created (created)
);

-- A2A Messages table - Task progress and status updates
CREATE TABLE a2a_messages (
    id VARCHAR(255) PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
    agent_type VARCHAR(255) NOT NULL,
    
    -- Message details
    type VARCHAR(50) NOT NULL CHECK (type IN ('progress', 'status', 'error', 'warning', 'info', 'completion')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Metadata (progress percentage, error details, etc.)
    metadata JSONB DEFAULT '{}',
    
    -- Indexes
    INDEX idx_a2a_messages_task_id (task_id),
    INDEX idx_a2a_messages_agent_type (agent_type),
    INDEX idx_a2a_messages_type (type),
    INDEX idx_a2a_messages_timestamp (timestamp)
);

-- A2A Agent Capabilities table - Service discovery
CREATE TABLE a2a_agent_capabilities (
    agent_type VARCHAR(255) PRIMARY KEY,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    description TEXT,
    
    -- Capabilities definition (A2A AgentCard format)
    capabilities JSONB NOT NULL,
    
    -- Endpoints
    endpoints JSONB NOT NULL,
    
    -- Authentication and protocols
    authentication TEXT[] DEFAULT ARRAY['bearer'],
    protocols TEXT[] DEFAULT ARRAY['a2a', 'http'],
    
    -- Status and health
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deprecated')),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_a2a_tasks_workflow_current ON a2a_tasks(workflow_type, current_agent, status);
CREATE INDEX idx_a2a_artifacts_task_agent ON a2a_artifacts(task_id, agent_type);
CREATE INDEX idx_a2a_messages_task_recent ON a2a_messages(task_id, timestamp DESC);

-- Create views for easier querying

-- Active tasks view
CREATE VIEW v_active_tasks AS
SELECT 
    t.id,
    t.type,
    t.status,
    t.workflow_type,
    t.current_agent,
    t.current_step,
    t.total_steps,
    ROUND(CASE 
        WHEN t.total_steps > 0 THEN (t.current_step::NUMERIC / t.total_steps) * 100 
        ELSE 0 
    END, 2) as progress_percentage,
    t.created,
    t.updated,
    t.user_id,
    COUNT(DISTINCT a.id) as artifact_count,
    COUNT(DISTINCT m.id) as message_count
FROM a2a_tasks t
LEFT JOIN a2a_artifacts a ON t.id = a.task_id
LEFT JOIN a2a_messages m ON t.id = m.task_id
WHERE t.status IN ('pending', 'running')
GROUP BY t.id;

-- Task history view with summary
CREATE VIEW v_task_history AS
SELECT 
    t.id,
    t.type,
    t.status,
    t.workflow_type,
    t.created,
    t.updated,
    t.updated - t.created as duration,
    t.user_id,
    u.email as user_email,
    COUNT(DISTINCT a.id) as artifact_count,
    COUNT(DISTINCT m.id) as message_count,
    MAX(CASE WHEN m.type = 'error' THEN m.content END) as last_error
FROM a2a_tasks t
LEFT JOIN users u ON t.user_id = u.id
LEFT JOIN a2a_artifacts a ON t.id = a.task_id
LEFT JOIN a2a_messages m ON t.id = m.task_id
GROUP BY t.id, u.email
ORDER BY t.created DESC;

-- Agent performance view
CREATE VIEW v_agent_performance AS
SELECT 
    ac.agent_type,
    ac.version,
    ac.status as agent_status,
    COUNT(DISTINCT t.id) as total_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks,
    COUNT(DISTINCT CASE WHEN t.status = 'failed' THEN t.id END) as failed_tasks,
    ROUND(AVG(EXTRACT(EPOCH FROM (m2.timestamp - m1.timestamp))), 2) as avg_duration_seconds
FROM a2a_agent_capabilities ac
LEFT JOIN a2a_artifacts a ON ac.agent_type = a.agent_type
LEFT JOIN a2a_tasks t ON a.task_id = t.id
LEFT JOIN a2a_messages m1 ON t.id = m1.task_id AND m1.type = 'progress' AND m1.metadata->>'progress' = '0'
LEFT JOIN a2a_messages m2 ON t.id = m2.task_id AND m2.type = 'completion'
GROUP BY ac.agent_type, ac.version, ac.status;

-- Function to update task status
CREATE OR REPLACE FUNCTION update_task_status(
    p_task_id VARCHAR(255),
    p_status VARCHAR(50),
    p_error_message TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
    UPDATE a2a_tasks 
    SET 
        status = p_status,
        updated = NOW(),
        error_message = COALESCE(p_error_message, error_message)
    WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get task progress
CREATE OR REPLACE FUNCTION get_task_progress(p_task_id VARCHAR(255))
RETURNS TABLE (
    task_id VARCHAR(255),
    status VARCHAR(50),
    current_agent VARCHAR(255),
    progress_percentage NUMERIC,
    last_message TEXT,
    artifact_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.status,
        t.current_agent,
        ROUND(CASE 
            WHEN t.total_steps > 0 THEN (t.current_step::NUMERIC / t.total_steps) * 100 
            ELSE COALESCE((m.metadata->>'progress')::NUMERIC, 0)
        END, 2) as progress_percentage,
        m.content as last_message,
        COUNT(DISTINCT a.id) as artifact_count
    FROM a2a_tasks t
    LEFT JOIN a2a_artifacts a ON t.id = a.task_id
    LEFT JOIN LATERAL (
        SELECT content, metadata
        FROM a2a_messages
        WHERE task_id = t.id
        ORDER BY timestamp DESC
        LIMIT 1
    ) m ON true
    WHERE t.id = p_task_id
    GROUP BY t.id, m.content, m.metadata;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update task timestamp
CREATE OR REPLACE FUNCTION update_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_task_timestamp
BEFORE UPDATE ON a2a_tasks
FOR EACH ROW
EXECUTE FUNCTION update_task_timestamp();

-- Grant permissions (adjust as needed)
GRANT SELECT, INSERT, UPDATE ON a2a_tasks TO bookmark_user;
GRANT SELECT, INSERT ON a2a_artifacts TO bookmark_user;
GRANT SELECT, INSERT ON a2a_messages TO bookmark_user;
GRANT SELECT, INSERT, UPDATE ON a2a_agent_capabilities TO bookmark_user;
GRANT SELECT ON ALL VIEWS IN SCHEMA public TO bookmark_user;