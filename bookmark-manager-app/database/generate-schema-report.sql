-- Complete Database Schema Report for bookmark_manager
-- Generated on: CURRENT_DATE
-- ================================================

\echo '=== DATABASE INFORMATION ==='
SELECT current_database() as database_name, 
       version() as postgres_version,
       pg_database_size(current_database()) as database_size;

\echo '\n=== EXTENSIONS ==='
SELECT * FROM pg_extension ORDER BY extname;

\echo '\n=== SCHEMAS ==='
SELECT schema_name FROM information_schema.schemata 
WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
ORDER BY schema_name;

\echo '\n=== TABLES WITH DETAILS ==='
SELECT 
    schemaname,
    tablename,
    tableowner,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

\echo '\n=== DETAILED TABLE STRUCTURES ==='
-- This will show each table's structure
\d+ a2a_agents
\d+ a2a_messages  
\d+ a2a_task_artifacts
\d+ a2a_tasks
\d+ bookmark_collections
\d+ bookmark_embeddings
\d+ bookmark_tags
\d+ bookmarks
\d+ collections
\d+ import_history
\d+ import_mappings
\d+ tags
\d+ users

\echo '\n=== ALL COLUMNS WITH DATA TYPES ==='
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

\echo '\n=== PRIMARY KEYS ==='
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY' 
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

\echo '\n=== FOREIGN KEYS ==='
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

\echo '\n=== UNIQUE CONSTRAINTS ==='
SELECT 
    tc.table_name,
    tc.constraint_name,
    string_agg(kcu.column_name, ', ') as columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE' 
    AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name;

\echo '\n=== CHECK CONSTRAINTS ==='
SELECT 
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name;

\echo '\n=== INDEXES ==='
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo '\n=== SEQUENCES ==='
SELECT 
    sequence_schema,
    sequence_name,
    data_type,
    start_value,
    minimum_value,
    maximum_value,
    increment
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

\echo '\n=== VIEWS ==='
SELECT 
    table_name as view_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY view_name;

\echo '\n=== FUNCTIONS ==='
SELECT 
    routine_name,
    routine_type,
    data_type as return_type,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

\echo '\n=== TRIGGERS ==='
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

\echo '\n=== USER DEFINED TYPES ==='
SELECT 
    n.nspname as schema_name,
    t.typname as type_name,
    t.typtype as type_type,
    CASE t.typtype
        WHEN 'c' THEN 'composite'
        WHEN 'd' THEN 'domain'
        WHEN 'e' THEN 'enum'
        WHEN 'r' THEN 'range'
        ELSE 'other'
    END as type_category
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
    AND t.typtype IN ('c', 'd', 'e', 'r')
ORDER BY type_name;

\echo '\n=== ENUM VALUES ==='
SELECT 
    t.typname AS enum_name,
    e.enumlabel AS enum_value,
    e.enumsortorder AS sort_order
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;