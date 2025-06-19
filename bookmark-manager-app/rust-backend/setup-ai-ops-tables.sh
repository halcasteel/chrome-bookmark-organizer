#!/bin/bash

# Setup AI-Ops Core database tables

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5434}"
DB_USER="${DB_USER:-admin}"
DB_PASS="${DB_PASS:-admin}"
DB_NAME="${DB_NAME:-bookmark_manager}"

export PGPASSWORD="$DB_PASS"

echo "Setting up AI-Ops Core database tables..."

# Run knowledge graph migrations
echo "Creating knowledge graph tables..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
     -f migrations/knowledge_graph/001_create_knowledge_tables.sql

# Run events migrations
echo "Creating events table..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
     -f migrations/events/001_create_events_table.sql

echo "AI-Ops Core database setup complete!"

# Test the setup
echo "Testing database setup..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\dt" | grep -E "(knowledge_nodes|events|pattern_occurrences)"