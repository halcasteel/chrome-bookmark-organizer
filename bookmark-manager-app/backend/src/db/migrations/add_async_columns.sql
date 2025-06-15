-- Add columns for async processing
ALTER TABLE bookmarks 
ADD COLUMN IF NOT EXISTS enriched BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES import_history(id);

-- Add status tracking to import_history
ALTER TABLE import_history
ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(50) DEFAULT 'pending';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookmarks_import_id ON bookmarks(import_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_enriched ON bookmarks(enriched);
CREATE INDEX IF NOT EXISTS idx_bookmarks_validation ON bookmarks(is_valid, last_checked);