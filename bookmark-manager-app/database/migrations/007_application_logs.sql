-- Application logs table for Vector to write structured logs
-- This enables AI agents to query and analyze logs

CREATE TABLE IF NOT EXISTS application_logs (
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

-- Partition by month for performance
CREATE TABLE application_logs_2025_01 PARTITION OF application_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE application_logs_2025_02 PARTITION OF application_logs
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- Add more partitions as needed

-- Function to automatically create monthly partitions
CREATE OR REPLACE FUNCTION create_monthly_log_partition()
RETURNS void AS $$
DECLARE
    start_date date;
    end_date date;
    partition_name text;
BEGIN
    start_date := date_trunc('month', CURRENT_DATE + interval '1 month');
    end_date := start_date + interval '1 month';
    partition_name := 'application_logs_' || to_char(start_date, 'YYYY_MM');
    
    -- Check if partition already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE tablename = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF application_logs FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to create partitions (requires pg_cron extension)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule('create-log-partitions', '0 0 25 * *', 'SELECT create_monthly_log_partition()');

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
    id UUID,
    timestamp TIMESTAMPTZ,
    level VARCHAR(10),
    service VARCHAR(50),
    message TEXT,
    correlation_id VARCHAR(100),
    user_id UUID,
    fields JSONB,
    error_details JSONB,
    performance_metrics JSONB
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
            service,
            COUNT(*) as error_count,
            COUNT(DISTINCT message) as unique_errors,
            COUNT(DISTINCT user_id) as affected_users,
            message,
            ROW_NUMBER() OVER (PARTITION BY service ORDER BY COUNT(*) DESC) as rn
        FROM application_logs
        WHERE level = 'ERROR'
            AND timestamp > NOW() - p_interval
        GROUP BY service, message
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

-- Grant permissions
GRANT SELECT, INSERT ON application_logs TO bookmark_user;
GRANT SELECT ON recent_errors TO bookmark_user;
GRANT SELECT ON performance_issues TO bookmark_user;
GRANT EXECUTE ON FUNCTION search_logs TO bookmark_user;
GRANT EXECUTE ON FUNCTION get_error_stats TO bookmark_user;