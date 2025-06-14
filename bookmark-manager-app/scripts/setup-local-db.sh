#!/bin/bash

# Local database setup script using Docker

echo "Setting up local PostgreSQL database for Bookmark Manager"
echo "========================================================"

# Check if a bookmark-postgres container already exists
if docker ps -a | grep -q bookmark-postgres; then
    echo "Removing existing bookmark-postgres container..."
    docker stop bookmark-postgres 2>/dev/null
    docker rm bookmark-postgres 2>/dev/null
fi

# Start PostgreSQL with pgvector
echo ""
echo "1. Starting PostgreSQL with pgvector..."
docker run -d \
    --name bookmark-postgres \
    -e POSTGRES_USER=admin \
    -e POSTGRES_PASSWORD=admin \
    -e POSTGRES_DB=bookmark_manager \
    -p 5434:5432 \
    -v bookmark_postgres_data:/var/lib/postgresql/data \
    pgvector/pgvector:pg16

echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec bookmark-postgres pg_isready -U admin -d bookmark_manager >/dev/null 2>&1; then
        echo "PostgreSQL is ready!"
        break
    fi
    echo -n "."
    sleep 1
done
echo ""

# Test connection
echo ""
echo "2. Testing connection..."
docker exec bookmark-postgres pg_isready -U admin -d bookmark_manager

# Create database and enable extensions
echo ""
echo "3. Setting up database extensions..."
docker exec bookmark-postgres psql -U admin -d bookmark_manager -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker exec bookmark-postgres psql -U admin -d bookmark_manager -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
docker exec bookmark-postgres psql -U admin -d bookmark_manager -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# Apply schema
echo ""
echo "4. Applying database schema..."
docker exec -i bookmark-postgres psql -U admin -d bookmark_manager < database/schema.sql

# Verify setup
echo ""
echo "5. Verifying setup..."
docker exec bookmark-postgres psql -U admin -d bookmark_manager -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp', 'pgcrypto');"

echo ""
echo "6. Checking tables..."
docker exec bookmark-postgres psql -U admin -d bookmark_manager -c "\dt"

echo ""
echo "========================================================"
echo "✅ Local database setup complete!"
echo "========================================================"
echo ""
echo "Connection details:"
echo "  Host: localhost"
echo "  Port: 5434"
echo "  Database: bookmark_manager"
echo "  Username: admin"
echo "  Password: admin"
echo ""
echo "Connection string:"
echo "  postgresql://admin:admin@localhost:5434/bookmark_manager"
echo ""
echo "Update your .env file:"
echo "  DATABASE_URL=postgresql://admin:admin@localhost:5434/bookmark_manager"
echo ""
echo "Container status:"
docker ps | grep bookmark-postgres