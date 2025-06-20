-- Add status column to bookmarks table
ALTER TABLE bookmarks 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';

-- Update existing bookmarks based on their current state
UPDATE bookmarks 
SET status = CASE 
    WHEN is_deleted = true THEN 'deleted'
    WHEN is_dead = true THEN 'dead'
    ELSE 'active'
END
WHERE status IS NULL;

-- Add index for status column for better query performance
CREATE INDEX IF NOT EXISTS idx_bookmarks_status ON bookmarks(status);