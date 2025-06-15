-- Migration: Add validation workflow columns
-- Description: Adds columns needed for bookmark validation and enrichment workflow

-- Add validation columns to bookmarks table
ALTER TABLE bookmarks 
ADD COLUMN IF NOT EXISTS is_valid BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS validation_errors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_checked TIMESTAMP,
ADD COLUMN IF NOT EXISTS check_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS enrichment_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS ai_tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

-- Add validation tracking columns to import_history table
ALTER TABLE import_history
ADD COLUMN IF NOT EXISTS total_invalid INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_enriched INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS validation_details JSONB DEFAULT '{}'::jsonb;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bookmarks_validation_status ON bookmarks(is_valid, last_checked);
CREATE INDEX IF NOT EXISTS idx_bookmarks_check_attempts ON bookmarks(check_attempts);
CREATE INDEX IF NOT EXISTS idx_bookmarks_ai_tags ON bookmarks USING GIN(ai_tags);

-- Create partial index for bookmarks needing validation
CREATE INDEX IF NOT EXISTS idx_bookmarks_needs_check ON bookmarks(id) 
WHERE last_checked IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN bookmarks.is_valid IS 'Whether the bookmark URL is currently valid and accessible';
COMMENT ON COLUMN bookmarks.validation_errors IS 'Array of validation error objects with code and message';
COMMENT ON COLUMN bookmarks.last_checked IS 'Timestamp of last validation check';
COMMENT ON COLUMN bookmarks.check_attempts IS 'Number of validation attempts made';
COMMENT ON COLUMN bookmarks.enrichment_data IS 'Additional metadata from AI enrichment';
COMMENT ON COLUMN bookmarks.ai_tags IS 'AI-generated tags for categorization';
COMMENT ON COLUMN bookmarks.ai_summary IS 'AI-generated summary of the bookmark content';
COMMENT ON COLUMN bookmarks.screenshot_url IS 'URL to screenshot of the bookmark page';

COMMENT ON COLUMN import_history.total_invalid IS 'Total number of invalid bookmarks in this import';
COMMENT ON COLUMN import_history.total_enriched IS 'Total number of enriched bookmarks in this import';
COMMENT ON COLUMN import_history.validation_details IS 'Detailed validation statistics and errors';