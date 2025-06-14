# Google Cloud Platform Setup Guide

This guide helps you set up Cloud SQL (with pgvector) and Google Cloud Storage for the Bookmark Manager.

## Prerequisites

1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install
2. Authenticate with ADC: `gcloud auth application-default login`
3. Set project: `gcloud config set project bookmarks-manager-462919`

## Quick Setup

Run the quick setup script to get the connection details:

```bash
cd scripts
./gcp-quick-setup.sh
```

This will:
- Check for existing Cloud SQL instances
- Create a new instance if needed (with pgvector enabled)
- Create a GCS bucket for bookmark imports
- Output the connection details

## Manual Setup

### 1. Create Cloud SQL Instance

```bash
# Create instance with pgvector enabled
gcloud sql instances create bookmark-manager-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --database-flags=cloudsql.enable_pgvector=on \
    --root-password=admin
```

### 2. Create Database and Enable pgvector

```bash
# Connect to instance
gcloud sql connect bookmark-manager-db --user=postgres

# In psql:
CREATE DATABASE bookmark_manager;
\c bookmark_manager
CREATE EXTENSION vector;

# Create user
CREATE USER admin WITH PASSWORD 'admin';
GRANT ALL PRIVILEGES ON DATABASE bookmark_manager TO admin;
```

### 3. Get Connection Name

```bash
gcloud sql instances describe bookmark-manager-db --format="value(connectionName)"
```

Example output: `bookmarks-manager-462919:us-central1:bookmark-manager-db`

### 4. Create GCS Bucket

```bash
# Create bucket
gsutil mb -p bookmarks-manager-462919 -c standard -l us-central1 gs://bookmarks-manager-462919-bookmarks/

# Create directories
echo "Imports directory" | gsutil cp - gs://bookmarks-manager-462919-bookmarks/imports/README.txt
echo "Archives directory" | gsutil cp - gs://bookmarks-manager-462919-bookmarks/archives/README.txt
```

## Update .env File

Add these values to your `.env` file:

```env
CLOUD_SQL_CONNECTION_NAME=bookmarks-manager-462919:us-central1:bookmark-manager-db
GCS_BUCKET_NAME=bookmarks-manager-462919-bookmarks
```

## Production Database URL

For production deployment on Cloud Run, use:

```env
DATABASE_URL=postgresql://admin:admin@localhost:5432/bookmark_manager?host=/cloudsql/bookmarks-manager-462919:us-central1:bookmark-manager-db
```

## Local Development with Cloud SQL

To connect from local development to Cloud SQL using ADC:

1. Install Cloud SQL Proxy:
```bash
gcloud components install cloud-sql-proxy
```

2. Run the proxy with ADC:
```bash
cloud-sql-proxy --port=5432 bookmarks-manager-462919:us-central1:bookmark-manager-db
```

3. Use local connection string in your .env:
```env
DATABASE_URL=postgresql://admin:admin@localhost:5432/bookmark_manager
```

## Using Application Default Credentials (ADC)

Since you're using ADC, make sure you're authenticated:

```bash
# Login with your Google account
gcloud auth application-default login

# Verify your credentials
gcloud auth application-default print-access-token
```

Your application will automatically use these credentials when connecting to GCP services.

## Testing pgvector

Connect to your database and run:

```sql
-- Create test table
CREATE TABLE vector_test (
    id serial PRIMARY KEY,
    embedding vector(3)
);

-- Insert test data
INSERT INTO vector_test (embedding) VALUES 
    ('[1,2,3]'), 
    ('[4,5,6]');

-- Test similarity search
SELECT 
    id,
    1 - (embedding <=> '[1,2,3]'::vector) as similarity
FROM vector_test
ORDER BY embedding <=> '[1,2,3]'::vector
LIMIT 5;

-- Clean up
DROP TABLE vector_test;
```

## Troubleshooting

### pgvector not available
If you get an error about pgvector, ensure the flag is set:
```bash
gcloud sql instances patch bookmark-manager-db --database-flags=cloudsql.enable_pgvector=on
```

### Connection refused
Make sure Cloud SQL Admin API is enabled:
```bash
gcloud services enable sqladmin.googleapis.com
```

### ADC issues
If you encounter authentication issues:
```bash
# Re-authenticate
gcloud auth application-default login

# Check current configuration
gcloud config list
```