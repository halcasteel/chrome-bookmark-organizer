#!/bin/bash

# Script to set up the database (both local and Cloud SQL)

PROJECT_ID="bookmarks-manager-462919"
REGION="us-central1"
INSTANCE_NAME="bookmark-manager-db"
DB_NAME="bookmark_manager"
DB_USER="admin"
DB_PASSWORD="admin"

echo "Database Setup Script"
echo "===================="
echo ""
echo "Choose database setup option:"
echo "1) Local PostgreSQL with Docker"
echo "2) Google Cloud SQL"
echo "3) Both"
read -p "Enter choice (1-3): " choice

# Function to setup local database
setup_local_db() {
    echo ""
    echo "Setting up local PostgreSQL database..."
    
    # Start PostgreSQL with pgvector using docker-compose
    echo "Starting PostgreSQL container..."
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to be ready..."
    sleep 5
    
    # Create database and run schema
    echo "Creating database and schema..."
    docker-compose exec -T postgres psql -U admin -d postgres << EOF
CREATE DATABASE bookmark_manager;
\c bookmark_manager
\i /docker-entrypoint-initdb.d/01-schema.sql
EOF
    
    echo "Local database setup complete!"
    echo "Connection string: postgresql://admin:admin@localhost:5432/bookmark_manager"
}

# Function to setup Cloud SQL
setup_cloud_sql() {
    echo ""
    echo "Setting up Google Cloud SQL database..."
    
    # Check if instance exists
    if gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} &>/dev/null; then
        echo "Cloud SQL instance '${INSTANCE_NAME}' already exists"
    else
        echo "Creating Cloud SQL instance..."
        gcloud sql instances create ${INSTANCE_NAME} \
            --database-version=POSTGRES_15 \
            --tier=db-f1-micro \
            --region=${REGION} \
            --database-flags=cloudsql.enable_pgvector=on \
            --root-password=${DB_PASSWORD} \
            --project=${PROJECT_ID}
        
        echo "Waiting for instance to be ready..."
        gcloud sql operations wait \
            $(gcloud sql operations list --instance=${INSTANCE_NAME} --project=${PROJECT_ID} --filter="status!=DONE" --format="value(name)" | head -n1)
    fi
    
    # Create database
    echo "Creating database '${DB_NAME}'..."
    gcloud sql databases create ${DB_NAME} --instance=${INSTANCE_NAME} --project=${PROJECT_ID} 2>/dev/null || echo "Database already exists"
    
    # Create user
    echo "Creating user '${DB_USER}'..."
    gcloud sql users create ${DB_USER} --instance=${INSTANCE_NAME} --password=${DB_PASSWORD} --project=${PROJECT_ID} 2>/dev/null || echo "User already exists"
    
    # Run schema
    echo "Applying database schema..."
    echo "Please run these commands after connecting to Cloud SQL:"
    echo ""
    echo "gcloud sql connect ${INSTANCE_NAME} --user=${DB_USER} --database=${DB_NAME} --project=${PROJECT_ID}"
    echo ""
    echo "Then in psql, run:"
    echo "CREATE EXTENSION IF NOT EXISTS vector;"
    echo "\i /path/to/database/schema.sql"
    echo ""
    echo "Or use Cloud SQL Proxy for local connection:"
    echo "cloud-sql-proxy --port=5432 $(gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} --format='value(connectionName)')"
}

# Function to run schema on existing database
run_schema_only() {
    echo ""
    echo "Running schema on existing database..."
    echo "Using connection: ${DATABASE_URL:-postgresql://admin:admin@localhost:5432/bookmark_manager}"
    
    # Use psql to run the schema
    psql "${DATABASE_URL:-postgresql://admin:admin@localhost:5432/bookmark_manager}" < database/schema.sql
    
    echo "Schema applied successfully!"
}

# Execute based on choice
case $choice in
    1)
        setup_local_db
        ;;
    2)
        setup_cloud_sql
        ;;
    3)
        setup_local_db
        echo ""
        setup_cloud_sql
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "===================="
echo "Setup Complete!"
echo "===================="