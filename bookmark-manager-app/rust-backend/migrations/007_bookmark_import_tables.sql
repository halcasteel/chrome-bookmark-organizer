-- Add missing tables for bookmark import agent

-- Bookmark tags table
CREATE TABLE IF NOT EXISTS bookmark_tags (
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bookmark_id, tag)
);

-- Index for tag searches
CREATE INDEX IF NOT EXISTS idx_bookmark_tags_tag ON bookmark_tags(tag);

-- Bookmark folders table
CREATE TABLE IF NOT EXISTS bookmark_folders (
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    folder_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bookmark_id)
);

-- Index for folder path searches
CREATE INDEX IF NOT EXISTS idx_bookmark_folders_path ON bookmark_folders(folder_path);

-- Add hash column to bookmarks if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bookmarks' AND column_name = 'hash') THEN
        ALTER TABLE bookmarks ADD COLUMN hash VARCHAR(64);
        CREATE UNIQUE INDEX idx_bookmarks_user_hash ON bookmarks(user_id, hash);
    END IF;
END $$;

-- Add icon column if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bookmarks' AND column_name = 'icon') THEN
        ALTER TABLE bookmarks ADD COLUMN icon TEXT;
    END IF;
END $$;

-- Add date columns if not exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bookmarks' AND column_name = 'add_date') THEN
        ALTER TABLE bookmarks ADD COLUMN add_date TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bookmarks' AND column_name = 'last_modified') THEN
        ALTER TABLE bookmarks ADD COLUMN last_modified TIMESTAMPTZ;
    END IF;
END $$;