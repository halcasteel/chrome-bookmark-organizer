-- Schema Improvements Migration
-- Addresses missing indexes, data integrity, performance, and consistency issues
-- Date: 2025-06-17

-- =====================================================
-- 1. MISSING INDEXES
-- =====================================================

-- Index for category queries on bookmark_metadata
CREATE INDEX IF NOT EXISTS idx_bookmark_metadata_category 
ON bookmark_metadata(category) 
WHERE category IS NOT NULL;

-- Composite index for enriched bookmarks sorted by creation date
CREATE INDEX IF NOT EXISTS idx_bookmarks_enriched_created 
ON bookmarks(enriched, created_at DESC) 
WHERE enriched = true;

-- Additional useful composite indexes
CREATE INDEX IF NOT EXISTS idx_bookmark_metadata_category_subcategory 
ON bookmark_metadata(category, subcategory) 
WHERE category IS NOT NULL;

-- Index for bookmark status workflow queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_status_user_created 
ON bookmarks(status, user_id, created_at DESC);

-- =====================================================
-- 2. DATA INTEGRITY CONSTRAINTS
-- =====================================================

-- Add CHECK constraint for import_history status
ALTER TABLE import_history 
DROP CONSTRAINT IF EXISTS import_history_status_check;

ALTER TABLE import_history 
ADD CONSTRAINT import_history_status_check 
CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Add CHECK constraint for bookmark status
ALTER TABLE bookmarks 
DROP CONSTRAINT IF EXISTS bookmarks_status_check;

ALTER TABLE bookmarks 
ADD CONSTRAINT bookmarks_status_check 
CHECK (status IN ('imported', 'validated', 'enriched', 'failed', 'archived'));

-- Create trigger to ensure bookmark_metadata exists for enriched bookmarks
CREATE OR REPLACE FUNCTION ensure_metadata_for_enriched_bookmarks()
RETURNS TRIGGER AS $$
BEGIN
    -- If bookmark is being marked as enriched
    IF NEW.enriched = true AND OLD.enriched = false THEN
        -- Check if metadata exists
        IF NOT EXISTS (
            SELECT 1 FROM bookmark_metadata 
            WHERE bookmark_id = NEW.id
        ) THEN
            -- Create minimal metadata record
            INSERT INTO bookmark_metadata (bookmark_id, extracted_at)
            VALUES (NEW.id, NOW());
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_metadata_for_enriched ON bookmarks;
CREATE TRIGGER trigger_ensure_metadata_for_enriched
AFTER UPDATE OF enriched ON bookmarks
FOR EACH ROW
EXECUTE FUNCTION ensure_metadata_for_enriched_bookmarks();

-- =====================================================
-- 3. PERFORMANCE OPTIMIZATIONS
-- =====================================================

-- Specialized GIN indexes for large JSONB fields
CREATE INDEX IF NOT EXISTS idx_bookmarks_enrichment_data_gin 
ON bookmarks USING gin(enrichment_data jsonb_path_ops)
WHERE enrichment_data IS NOT NULL AND enrichment_data != '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_bookmarks_validation_errors_gin 
ON bookmarks USING gin(validation_errors jsonb_path_ops)
WHERE validation_errors IS NOT NULL AND validation_errors != '[]'::jsonb;

-- Indexes for A2A tables JSONB fields
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_context_gin 
ON a2a_tasks USING gin(context jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_a2a_tasks_metadata_gin 
ON a2a_tasks USING gin(metadata jsonb_path_ops);

-- Partial index for active A2A tasks
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_active 
ON a2a_tasks(status, updated) 
WHERE status IN ('pending', 'running');

-- =====================================================
-- 4. SCHEMA CONSISTENCY
-- =====================================================

-- Add missing updated_at columns and triggers
ALTER TABLE tags 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE bookmark_tags 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE bookmark_collections 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE bookmark_metadata 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE import_history 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Create triggers for updated_at
CREATE TRIGGER update_tags_updated_at 
BEFORE UPDATE ON tags
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookmark_tags_updated_at 
BEFORE UPDATE ON bookmark_tags
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookmark_collections_updated_at 
BEFORE UPDATE ON bookmark_collections
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookmark_metadata_updated_at 
BEFORE UPDATE ON bookmark_metadata
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_import_history_updated_at 
BEFORE UPDATE ON import_history
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Standardize bookmark status fields
-- Create a migration function to consolidate status
CREATE OR REPLACE FUNCTION migrate_bookmark_status_fields()
RETURNS void AS $$
BEGIN
    -- Update status based on current boolean fields
    UPDATE bookmarks 
    SET status = CASE
        WHEN is_deleted = true THEN 'archived'
        WHEN is_dead = true THEN 'failed'
        WHEN is_valid = false THEN 'failed'
        WHEN enriched = true THEN 'enriched'
        WHEN is_valid = true AND enriched = false THEN 'validated'
        ELSE 'imported'
    END
    WHERE status IS NULL OR status = 'imported';
    
    -- Log migration
    RAISE NOTICE 'Migrated bookmark status fields for % bookmarks', 
        (SELECT COUNT(*) FROM bookmarks);
END;
$$ LANGUAGE plpgsql;

-- Run the migration
SELECT migrate_bookmark_status_fields();

-- Add comment explaining the consolidation
COMMENT ON COLUMN bookmarks.status IS 'Unified status field replacing is_valid/is_dead/is_deleted booleans. Values: imported, validated, enriched, failed, archived';
COMMENT ON COLUMN bookmarks.is_valid IS 'DEPRECATED: Use status field instead';
COMMENT ON COLUMN bookmarks.is_dead IS 'DEPRECATED: Use status field instead';
COMMENT ON COLUMN bookmarks.is_deleted IS 'DEPRECATED: Use status field instead. Archived bookmarks have status=archived';

-- =====================================================
-- 5. SYSTEM_LOGS PARTITIONING PREPARATION
-- =====================================================

-- Add partitioning comment for future implementation
COMMENT ON TABLE system_logs IS 'Consider partitioning by timestamp for logs older than 30 days. Use pg_partman extension for automated partition management.';

-- Create index for partition pruning preparation
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp_service 
ON system_logs(timestamp, service);

-- =====================================================
-- 6. ADDITIONAL PERFORMANCE IMPROVEMENTS
-- =====================================================

-- Index for user dashboard queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_status_domain 
ON bookmarks(user_id, status, domain) 
WHERE status != 'archived';

-- Index for import history queries
CREATE INDEX IF NOT EXISTS idx_import_history_user_status 
ON import_history(user_id, status, started_at DESC);

-- Covering index for common bookmark queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_enriched_valid_created 
ON bookmarks(user_id, enriched, is_valid, created_at DESC) 
INCLUDE (title, url, domain)
WHERE is_deleted = false;

-- =====================================================
-- 7. VACUUM AND ANALYZE
-- =====================================================

-- Update statistics for query planner
ANALYZE bookmarks;
ANALYZE bookmark_metadata;
ANALYZE tags;
ANALYZE bookmark_tags;
ANALYZE collections;
ANALYZE bookmark_collections;
ANALYZE import_history;
ANALYZE a2a_tasks;
ANALYZE a2a_artifacts;
ANALYZE a2a_messages;
ANALYZE system_logs;

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Ensure admin user has all necessary permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO admin;