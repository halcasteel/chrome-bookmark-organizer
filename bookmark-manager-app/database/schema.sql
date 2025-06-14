-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL CHECK (email LIKE '%@az1.ai'),
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    two_factor_enabled BOOLEAN DEFAULT false NOT NULL,
    two_factor_secret VARCHAR(255),
    two_factor_verified BOOLEAN DEFAULT false,
    recovery_codes JSONB,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    domain VARCHAR(255),
    favicon_url TEXT,
    is_valid BOOLEAN DEFAULT true,
    last_checked TIMESTAMP WITH TIME ZONE,
    http_status INTEGER,
    content_hash VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    imported_at TIMESTAMP WITH TIME ZONE,
    chrome_add_date BIGINT,
    UNIQUE(user_id, url)
);

-- Create bookmark embeddings table for semantic search
CREATE TABLE IF NOT EXISTS bookmark_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    embedding vector(1536), -- OpenAI embeddings dimension
    model_version VARCHAR(50) DEFAULT 'text-embedding-ada-002',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bookmark_id)
);

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#3182ce',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);

-- Create bookmark_tags junction table
CREATE TABLE IF NOT EXISTS bookmark_tags (
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bookmark_id, tag_id)
);

-- Create collections table
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    share_token VARCHAR(32) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create bookmark_collections junction table
CREATE TABLE IF NOT EXISTS bookmark_collections (
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    position INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bookmark_id, collection_id)
);

-- Create import_history table
CREATE TABLE IF NOT EXISTS import_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT,
    total_bookmarks INTEGER,
    new_bookmarks INTEGER,
    updated_bookmarks INTEGER,
    failed_bookmarks INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create bookmark_metadata table for extracted content
CREATE TABLE IF NOT EXISTS bookmark_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bookmark_id UUID NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    og_title TEXT,
    og_description TEXT,
    og_image TEXT,
    keywords TEXT[],
    author VARCHAR(255),
    published_date DATE,
    content_snippet TEXT,
    language VARCHAR(10),
    reading_time INTEGER, -- in seconds
    extracted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bookmark_id)
);

-- Indexes for performance
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_domain ON bookmarks(domain);
CREATE INDEX idx_bookmarks_created_at ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmarks_is_valid ON bookmarks(is_valid);
CREATE INDEX idx_bookmark_embeddings_bookmark_id ON bookmark_embeddings(bookmark_id);
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_collections_share_token ON collections(share_token);
CREATE INDEX idx_import_history_user_id ON import_history(user_id);

-- Vector similarity search index
CREATE INDEX idx_bookmark_embeddings_vector ON bookmark_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Full text search
CREATE INDEX idx_bookmarks_title_gin ON bookmarks USING gin(to_tsvector('english', title));
CREATE INDEX idx_bookmarks_description_gin ON bookmarks USING gin(to_tsvector('english', COALESCE(description, '')));

-- Functions and triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bookmarks_updated_at BEFORE UPDATE ON bookmarks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function for semantic search
CREATE OR REPLACE FUNCTION search_bookmarks_semantic(
    query_embedding vector(1536),
    user_id_param UUID,
    similarity_threshold FLOAT DEFAULT 0.5,
    limit_param INTEGER DEFAULT 20
)
RETURNS TABLE (
    bookmark_id UUID,
    url TEXT,
    title TEXT,
    description TEXT,
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.url,
        b.title,
        b.description,
        1 - (be.embedding <=> query_embedding) as similarity
    FROM bookmarks b
    JOIN bookmark_embeddings be ON b.id = be.bookmark_id
    WHERE b.user_id = user_id_param
        AND b.is_valid = true
        AND 1 - (be.embedding <=> query_embedding) > similarity_threshold
    ORDER BY be.embedding <=> query_embedding
    LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;