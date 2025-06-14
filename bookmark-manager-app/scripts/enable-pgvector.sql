-- Script to enable pgvector extension in Cloud SQL
-- Run this after connecting to your Cloud SQL instance

-- Connect to the database first:
-- gcloud sql connect bookmark-manager-db --user=admin --database=bookmark_manager

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Test vector operations
CREATE TABLE IF NOT EXISTS vector_test (
    id serial PRIMARY KEY,
    embedding vector(3)
);

INSERT INTO vector_test (embedding) VALUES ('[1,2,3]'), ('[4,5,6]');

SELECT * FROM vector_test;

-- Calculate cosine similarity
SELECT 
    a.id as id1, 
    b.id as id2,
    1 - (a.embedding <=> b.embedding) as cosine_similarity
FROM vector_test a, vector_test b
WHERE a.id < b.id;

-- Clean up test table
DROP TABLE vector_test;

-- Now run the main schema
\i /path/to/database/schema.sql