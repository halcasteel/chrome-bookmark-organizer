-- Events table for AI-Ops Core Event Store

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    source UUID NOT NULL,
    payload JSONB NOT NULL,
    correlation_id UUID,
    causation_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_source ON events(source);
CREATE INDEX idx_events_correlation ON events(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_events_causation ON events(causation_id) WHERE causation_id IS NOT NULL;
CREATE INDEX idx_events_payload_gin ON events USING gin(payload);
CREATE INDEX idx_events_metadata_gin ON events USING gin(metadata);

-- Partitioning by month for better performance with time-series data
-- Note: This requires PostgreSQL 11+ and manual partition creation
COMMENT ON TABLE events IS 'Consider partitioning this table by timestamp for better performance with large datasets';