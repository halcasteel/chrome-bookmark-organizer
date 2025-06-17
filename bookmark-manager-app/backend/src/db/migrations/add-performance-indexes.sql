-- Add indexes to improve query performance

-- Index for system_logs queries
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level_timestamp ON system_logs(level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_service_timestamp ON system_logs(service, timestamp DESC);

-- Index for user activity queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_history_user_created ON import_history(user_id, created_at DESC);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_log_aggregations_window ON log_aggregations(time_window, updated_at DESC);

-- Index for bookmark validation queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_validation_status ON bookmarks(is_valid, last_validation_date);

-- Composite index for common filter queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_status_created 
  ON bookmarks(user_id, is_valid, created_at DESC);

-- Analytics performance
ANALYZE system_logs;
ANALYZE bookmarks;
ANALYZE import_history;
ANALYZE log_aggregations;