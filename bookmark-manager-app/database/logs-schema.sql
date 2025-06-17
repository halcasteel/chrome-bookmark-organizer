-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Logs table with automatic time partitioning
CREATE TABLE IF NOT EXISTS system_logs (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(10) NOT NULL,
  service VARCHAR(50) NOT NULL,
  source VARCHAR(100),
  message TEXT NOT NULL,
  metadata JSONB,
  error_type VARCHAR(100),
  error_message TEXT,
  error_stack TEXT,
  user_id UUID,
  request_id VARCHAR(50),
  duration_ms INTEGER,
  status_code INTEGER,
  
  -- Indexes for fast filtering
  PRIMARY KEY (id, timestamp)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('system_logs', 'timestamp', 
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Create indexes for common queries
CREATE INDEX idx_logs_level ON system_logs(level, timestamp DESC);
CREATE INDEX idx_logs_service ON system_logs(service, timestamp DESC);
CREATE INDEX idx_logs_error ON system_logs(error_type, timestamp DESC) WHERE error_type IS NOT NULL;
CREATE INDEX idx_logs_user ON system_logs(user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_logs_metadata ON system_logs USING GIN(metadata);

-- Log aggregations table (pre-computed for dashboard)
CREATE TABLE IF NOT EXISTS log_aggregations (
  id SERIAL PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  aggregation_type VARCHAR(50) NOT NULL, -- 'hourly', 'daily', 'weekly'
  service VARCHAR(50),
  level VARCHAR(10),
  total_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms NUMERIC(10,2),
  p95_duration_ms NUMERIC(10,2),
  unique_users INTEGER DEFAULT 0,
  metadata JSONB,
  
  UNIQUE(period_start, period_end, aggregation_type, service, level)
);

-- AI Analysis results table
CREATE TABLE IF NOT EXISTS log_ai_analysis (
  id SERIAL PRIMARY KEY,
  analysis_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  analysis_type VARCHAR(50) NOT NULL, -- 'anomaly', 'pattern', 'root_cause', 'prediction'
  severity VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  affected_services TEXT[],
  recommendations JSONB,
  confidence_score NUMERIC(3,2), -- 0.00 to 1.00
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

-- Alerts configuration table
CREATE TABLE IF NOT EXISTS log_alerts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  alert_type VARCHAR(50) NOT NULL, -- 'threshold', 'anomaly', 'pattern'
  conditions JSONB NOT NULL, -- {"level": "error", "count": 10, "window": "5m"}
  actions JSONB NOT NULL, -- {"email": ["admin@az1.ai"], "webhook": "url"}
  cooldown_minutes INTEGER DEFAULT 30,
  last_triggered TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert history
CREATE TABLE IF NOT EXISTS alert_history (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES log_alerts(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  log_count INTEGER NOT NULL,
  sample_logs JSONB, -- Store a few example logs that triggered this
  notification_sent BOOLEAN DEFAULT FALSE,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ
);

-- Saved searches/filters for dashboard
CREATE TABLE IF NOT EXISTS log_saved_searches (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  filters JSONB NOT NULL,
  chart_config JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ
);

-- Dashboard widgets configuration
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  widget_type VARCHAR(50) NOT NULL, -- 'chart', 'metric', 'logs', 'ai_insights'
  position JSONB NOT NULL, -- {"x": 0, "y": 0, "w": 6, "h": 4}
  config JSONB NOT NULL, -- Widget-specific configuration
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create retention policy (keep detailed logs for 30 days, aggregated for 1 year)
SELECT add_retention_policy('system_logs', INTERVAL '30 days', if_not_exists => TRUE);

-- Create continuous aggregates for real-time analytics
CREATE MATERIALIZED VIEW log_stats_hourly
WITH (timescaledb.continuous) AS
SELECT 
  time_bucket('1 hour', timestamp) AS hour,
  service,
  level,
  COUNT(*) as count,
  COUNT(DISTINCT user_id) as unique_users,
  AVG(duration_ms) as avg_duration,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration
FROM system_logs
GROUP BY hour, service, level
WITH NO DATA;

-- Refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('log_stats_hourly',
  start_offset => INTERVAL '2 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);