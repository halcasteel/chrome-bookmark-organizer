-- Create system_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_logs (
  id BIGSERIAL PRIMARY KEY,
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
  status_code INTEGER
);

-- Create indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_service ON system_logs(service, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_error ON system_logs(error_type, timestamp DESC) WHERE error_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logs_user ON system_logs(user_id, timestamp DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logs_metadata ON system_logs USING GIN(metadata);

-- Log aggregations table for pre-computed stats
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  analysis_type VARCHAR(50) NOT NULL, -- 'anomaly', 'pattern', 'root_cause'
  severity VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  affected_services TEXT[],
  recommendations JSONB,
  confidence_score NUMERIC(3,2), -- 0.00 to 1.00
  metadata JSONB
);

-- Create index on AI analysis for fast queries
CREATE INDEX IF NOT EXISTS idx_ai_analysis_created ON log_ai_analysis(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_severity ON log_ai_analysis(severity, created_at DESC);