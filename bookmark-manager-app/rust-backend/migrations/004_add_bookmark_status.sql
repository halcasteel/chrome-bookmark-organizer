-- Add status column to bookmarks table for A2A workflow tracking
ALTER TABLE bookmarks 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'imported';

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_bookmarks_status ON bookmarks(status);

-- Add comment for documentation
COMMENT ON COLUMN bookmarks.status IS 'Bookmark processing status: imported, validated, enriched, etc.';