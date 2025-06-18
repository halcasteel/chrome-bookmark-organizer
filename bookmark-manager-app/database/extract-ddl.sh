#!/bin/bash

# Database connection parameters
DB_HOST="localhost"
DB_PORT="5434"
DB_USER="admin"
DB_NAME="bookmark_manager"

# Output file
OUTPUT_FILE="/home/halcasteel/BOOKMARKS/bookmark-manager-app/database/complete-schema.sql"

# Start with a header
cat > "$OUTPUT_FILE" << 'EOF'
-- Complete PostgreSQL Schema for bookmark_manager Database
-- Generated on: $(date)
-- 
-- This file contains the complete DDL to recreate the database schema
-- including all tables, indexes, constraints, functions, and triggers
--
-- Usage: psql -h localhost -p 5432 -U admin -d bookmark_manager < complete-schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE validation_status AS ENUM ('pending', 'valid', 'invalid', 'redirect', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE log_level_enum AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE problem_status_enum AS ENUM ('open', 'investigating', 'resolved', 'ignored');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE problem_severity_enum AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create task timestamp function
CREATE OR REPLACE FUNCTION update_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

EOF

# Extract table definitions
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "-- TABLE DEFINITIONS" >> "$OUTPUT_FILE"
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Get list of tables and extract DDL for each
PGPASSWORD=admin psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename NOT IN ('_sqlx_migrations')
ORDER BY 
    CASE 
        WHEN tablename = 'users' THEN 1
        WHEN tablename = 'collections' THEN 2
        WHEN tablename = 'tags' THEN 3
        WHEN tablename = 'bookmarks' THEN 4
        ELSE 5
    END,
    tablename;" | while read -r table; do
    if [ -n "$table" ]; then
        table=$(echo "$table" | xargs) # trim whitespace
        echo "-- Table: $table" >> "$OUTPUT_FILE"
        
        # Get the CREATE TABLE statement
        PGPASSWORD=admin psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT 
            'CREATE TABLE IF NOT EXISTS ' || quote_ident(tablename) || ' (' || E'\n' ||
            string_agg(
                '    ' || quote_ident(column_name) || ' ' || 
                CASE 
                    WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
                    WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
                    WHEN data_type = 'ARRAY' THEN REPLACE(udt_name, '_', '') || '[]'
                    WHEN data_type = 'USER-DEFINED' THEN udt_name
                    ELSE UPPER(data_type)
                END ||
                CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
                CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
                E',\n' ORDER BY ordinal_position
            ) || E'\n);'
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '$table'
        GROUP BY tablename;" >> "$OUTPUT_FILE"
        
        echo "" >> "$OUTPUT_FILE"
    fi
done

echo "" >> "$OUTPUT_FILE"
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "-- CONSTRAINTS" >> "$OUTPUT_FILE"
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Add all constraints
PGPASSWORD=admin psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
SELECT 
    'ALTER TABLE ' || quote_ident(tc.table_name) || 
    ' ADD CONSTRAINT ' || quote_ident(tc.constraint_name) || 
    CASE tc.constraint_type
        WHEN 'PRIMARY KEY' THEN ' PRIMARY KEY (' || string_agg(quote_ident(kcu.column_name), ', ') || ')'
        WHEN 'UNIQUE' THEN ' UNIQUE (' || string_agg(quote_ident(kcu.column_name), ', ') || ')'
        WHEN 'FOREIGN KEY' THEN ' FOREIGN KEY (' || string_agg(quote_ident(kcu.column_name), ', ') || 
            ') REFERENCES ' || quote_ident(ccu.table_name) || '(' || string_agg(quote_ident(ccu.column_name), ', ') || ')' ||
            ' ON DELETE ' || rc.delete_rule || ' ON UPDATE ' || rc.update_rule
        WHEN 'CHECK' THEN ' CHECK ' || cc.check_clause
    END || ';'
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
LEFT JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
LEFT JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type, ccu.table_name, rc.delete_rule, rc.update_rule, cc.check_clause
ORDER BY 
    CASE tc.constraint_type 
        WHEN 'PRIMARY KEY' THEN 1 
        WHEN 'UNIQUE' THEN 2 
        WHEN 'CHECK' THEN 3
        WHEN 'FOREIGN KEY' THEN 4 
    END,
    tc.table_name;" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "-- INDEXES" >> "$OUTPUT_FILE"
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Add indexes
PGPASSWORD=admin psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
SELECT indexdef || ';'
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname NOT LIKE '%_pkey'
AND indexname NOT LIKE '%_key'
ORDER BY tablename, indexname;" >> "$OUTPUT_FILE"

echo "" >> "$OUTPUT_FILE"
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "-- TRIGGERS" >> "$OUTPUT_FILE"
echo "-- ============================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Add triggers
PGPASSWORD=admin psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
SELECT 
    'CREATE TRIGGER ' || trigger_name || ' ' || action_timing || ' ' || 
    event_manipulation || ' ON ' || event_object_table || 
    ' FOR EACH ROW EXECUTE FUNCTION ' || action_statement || ';'
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;" >> "$OUTPUT_FILE"

echo "Schema extracted to: $OUTPUT_FILE"