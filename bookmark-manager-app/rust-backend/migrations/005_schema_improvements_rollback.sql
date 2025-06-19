-- Rollback script for schema improvements migration
-- Use this if you need to undo the changes from 005_schema_improvements.sql

-- =====================================================
-- 1. DROP NEW INDEXES
-- =====================================================

DROP INDEX IF EXISTS idx_bookmark_metadata_category;
DROP INDEX IF EXISTS idx_bookmarks_enriched_created;
DROP INDEX IF EXISTS idx_bookmark_metadata_category_subcategory;
DROP INDEX IF EXISTS idx_bookmarks_status_user_created;
DROP INDEX IF EXISTS idx_bookmarks_enrichment_data_gin;
DROP INDEX IF EXISTS idx_bookmarks_validation_errors_gin;
DROP INDEX IF EXISTS idx_a2a_tasks_context_gin;
DROP INDEX IF EXISTS idx_a2a_tasks_metadata_gin;
DROP INDEX IF EXISTS idx_a2a_tasks_active;
DROP INDEX IF EXISTS idx_system_logs_timestamp_service;
DROP INDEX IF EXISTS idx_bookmarks_user_status_domain;
DROP INDEX IF EXISTS idx_import_history_user_status;
DROP INDEX IF EXISTS idx_bookmarks_user_enriched_valid_created;

-- =====================================================
-- 2. REMOVE CONSTRAINTS
-- =====================================================

ALTER TABLE import_history DROP CONSTRAINT IF EXISTS import_history_status_check;
ALTER TABLE bookmarks DROP CONSTRAINT IF EXISTS bookmarks_status_check;

-- Drop trigger and function
DROP TRIGGER IF EXISTS trigger_ensure_metadata_for_enriched ON bookmarks;
DROP FUNCTION IF EXISTS ensure_metadata_for_enriched_bookmarks();

-- =====================================================
-- 3. REMOVE TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS update_tags_updated_at ON tags;
DROP TRIGGER IF EXISTS update_bookmark_tags_updated_at ON bookmark_tags;
DROP TRIGGER IF EXISTS update_bookmark_collections_updated_at ON bookmark_collections;
DROP TRIGGER IF EXISTS update_bookmark_metadata_updated_at ON bookmark_metadata;
DROP TRIGGER IF EXISTS update_import_history_updated_at ON import_history;

-- =====================================================
-- 4. REMOVE COLUMNS (if they didn't exist before)
-- =====================================================

-- Note: Only remove these columns if they were added by the migration
-- Uncomment if needed:
-- ALTER TABLE tags DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE bookmark_tags DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE bookmark_collections DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE bookmark_metadata DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE import_history DROP COLUMN IF EXISTS updated_at;

-- =====================================================
-- 5. REMOVE FUNCTIONS
-- =====================================================

DROP FUNCTION IF EXISTS migrate_bookmark_status_fields();

-- =====================================================
-- 6. REMOVE COMMENTS
-- =====================================================

COMMENT ON COLUMN bookmarks.status IS NULL;
COMMENT ON COLUMN bookmarks.is_valid IS NULL;
COMMENT ON COLUMN bookmarks.is_dead IS NULL;
COMMENT ON COLUMN bookmarks.is_deleted IS NULL;
COMMENT ON TABLE system_logs IS NULL;