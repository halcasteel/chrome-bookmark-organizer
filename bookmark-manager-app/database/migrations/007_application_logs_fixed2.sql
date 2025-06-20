-- Application logs table for Vector to write structured logs
-- This enables AI agents to query and analyze logs

-- First drop if exists to handle partitioning properly
DROP TABLE IF EXISTS application_logs CASCADE;
DROP VIEW IF EXISTS recent_errors CASCADE;
DROP VIEW IF EXISTS performance_issues CASCADE;
DROP FUNCTION IF EXISTS search_logs CASCADE;
DROP FUNCTION IF EXISTS get_error_stats CASCADE;

-- Create main table without partitioning first
CREATE TABLE application_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level VARCHAR(10) NOT NULL,
    service VARCHAR(50) NOT NULL,
    target VARCHAR(255),
    message TEXT NOT NULL,
    correlation_id VARCHAR(100),
    request_id VARCHAR(100),
    user_id UUID REFERENCES users(id),
    span_id VARCHAR(50),
    parent_span_id VARCHAR(50),
    fields JSONB DEFAULT '{}',
    error_details JSONB,
    performance_metrics JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_logs_timestamp ON application_logs(timestamp DESC);
CREATE INDEX idx_logs_level ON application_logs(level);
CREATE INDEX idx_logs_service ON application_logs(service);
CREATE INDEX idx_logs_correlation_id ON application_logs(correlation_id);
CREATE INDEX idx_logs_request_id ON application_logs(request_id);
CREATE INDEX idx_logs_user_id ON application_logs(user_id);
CREATE INDEX idx_logs_error ON application_logs(level) WHERE level = 'ERROR';
CREATE INDEX idx_logs_fields ON application_logs USING GIN(fields);

-- View for recent errors (last 24 hours)
CREATE OR REPLACE VIEW recent_errors AS
SELECT 
    timestamp,
    service,
    message,
    correlation_id,
    user_id,
    error_details,
    fields
FROM application_logs
WHERE level = 'ERROR'
    AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- View for performance issues
CREATE OR REPLACE VIEW performance_issues AS
SELECT 
    timestamp,
    service,
    message,
    correlation_id,
    performance_metrics,
    fields
FROM application_logs
WHERE performance_metrics IS NOT NULL
    AND (performance_metrics->>'duration_ms')::float > 1000
    AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY (performance_metrics->>'duration_ms')::float DESC;

-- Function for AI agents to search logs
CREATE OR REPLACE FUNCTION search_logs(
    p_level VARCHAR(10) DEFAULT NULL,
    p_service VARCHAR(50) DEFAULT NULL,
    p_message_pattern TEXT DEFAULT NULL,
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 hour',
    p_end_time TIMESTAMPTZ DEFAULT NOW(),
    p_user_id UUID DEFAULT NULL,
    p_correlation_id VARCHAR(100) DEFAULT NULL,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    log_id UUID,
    log_timestamp TIMESTAMPTZ,
    log_level VARCHAR(10),
    log_service VARCHAR(50),
    log_message TEXT,
    log_correlation_id VARCHAR(100),
    log_user_id UUID,
    log_fields JSONB,
    log_error_details JSONB,
    log_performance_metrics JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.timestamp,
        l.level,
        l.service,
        l.message,
        l.correlation_id,
        l.user_id,
        l.fields,
        l.error_details,
        l.performance_metrics
    FROM application_logs l
    WHERE 
        (p_level IS NULL OR l.level = p_level)
        AND (p_service IS NULL OR l.service = p_service)
        AND (p_message_pattern IS NULL OR l.message ILIKE '%' || p_message_pattern || '%')
        AND l.timestamp BETWEEN p_start_time AND p_end_time
        AND (p_user_id IS NULL OR l.user_id = p_user_id)
        AND (p_correlation_id IS NULL OR l.correlation_id = p_correlation_id)
    ORDER BY l.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get error statistics
CREATE OR REPLACE FUNCTION get_error_stats(
    p_interval INTERVAL DEFAULT INTERVAL '1 hour'
)
RETURNS TABLE (
    service VARCHAR(50),
    error_count BIGINT,
    unique_errors BIGINT,
    affected_users BIGINT,
    most_common_error TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH error_summary AS (
        SELECT 
            l.service,
            COUNT(*) as error_count,
            COUNT(DISTINCT l.message) as unique_errors,
            COUNT(DISTINCT l.user_id) as affected_users,
            l.message,
            ROW_NUMBER() OVER (PARTITION BY l.service ORDER BY COUNT(*) DESC) as rn
        FROM application_logs l
        WHERE l.level = 'ERROR'
            AND l.timestamp > NOW() - p_interval
        GROUP BY l.service, l.message
    )
    SELECT 
        es.service,
        SUM(es.error_count)::BIGINT,
        COUNT(DISTINCT es.message)::BIGINT,
        MAX(es.affected_users)::BIGINT,
        MAX(CASE WHEN es.rn = 1 THEN es.message END) as most_common_error
    FROM error_summary es
    GROUP BY es.service
    ORDER BY SUM(es.error_count) DESC;
END;
$$ LANGUAGE plpgsql;

-- Note: Partitioning can be added later if needed
-- Grant permissions will be handled after confirming user exists