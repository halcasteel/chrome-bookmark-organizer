#!/bin/bash

# Direct script to create Cloud SQL database and enable pgvector

PROJECT_ID="bookmarks-manager-462919"
REGION="us-central1"
INSTANCE_NAME="bookmark-manager-db"
DB_NAME="bookmark_manager"
DB_USER="admin"
DB_PASSWORD="admin"

echo "Creating Cloud SQL Database"
echo "=========================="

# Create Cloud SQL instance if it doesn't exist
echo "1. Creating Cloud SQL instance (this may take a few minutes)..."
gcloud sql instances create ${INSTANCE_NAME} \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=${REGION} \
    --database-flags=cloudsql.enable_pgvector=on \
    --root-password=${DB_PASSWORD} \
    --project=${PROJECT_ID} || echo "Instance may already exist"

# Get connection name
CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} --format='value(connectionName)')
echo "Connection name: ${CONNECTION_NAME}"

# Create database
echo ""
echo "2. Creating database..."
gcloud sql databases create ${DB_NAME} --instance=${INSTANCE_NAME} --project=${PROJECT_ID} || echo "Database may already exist"

# Create user
echo ""
echo "3. Creating admin user..."
gcloud sql users create ${DB_USER} --instance=${INSTANCE_NAME} --password=${DB_PASSWORD} --project=${PROJECT_ID} || echo "User may already exist"

# Create a temporary SQL file to run
echo ""
echo "4. Creating schema with pgvector..."
cat > /tmp/cloud-sql-setup.sql << 'EOF'
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Verify pgvector is installed
SELECT * FROM pg_extension WHERE extname = 'vector';
EOF

# Upload and run the setup SQL
echo ""
echo "5. Running initial setup..."
gcloud sql import sql ${INSTANCE_NAME} gs://${GCS_BUCKET_NAME:-bookmarks-manager-462919-bookmarks}/setup.sql \
    --database=${DB_NAME} \
    --project=${PROJECT_ID} 2>/dev/null || {
    echo "Direct import not available. Please run these commands manually:"
    echo ""
    echo "Option 1 - Connect directly:"
    echo "gcloud sql connect ${INSTANCE_NAME} --user=${DB_USER} --database=${DB_NAME} --project=${PROJECT_ID}"
    echo ""
    echo "Option 2 - Use Cloud SQL Proxy:"
    echo "cloud-sql-proxy --port=5432 ${CONNECTION_NAME}"
    echo "Then: psql postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
    echo ""
    echo "Once connected, run:"
    echo "CREATE EXTENSION IF NOT EXISTS vector;"
    echo "Then run the schema from database/schema.sql"
}

# Output final configuration
echo ""
echo "=========================="
echo "Database Setup Complete!"
echo "=========================="
echo ""
echo "Cloud SQL Instance: ${INSTANCE_NAME}"
echo "Database: ${DB_NAME}"
echo "User: ${DB_USER}"
echo "Connection Name: ${CONNECTION_NAME}"
echo ""
echo "For production use:"
echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?host=/cloudsql/${CONNECTION_NAME}"
echo ""
echo "For local development with Cloud SQL Proxy:"
echo "1. Run: cloud-sql-proxy --port=5432 ${CONNECTION_NAME}"
echo "2. Use: DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
echo ""
echo "Next step: Run the schema"
echo "psql \$DATABASE_URL < database/schema.sql"