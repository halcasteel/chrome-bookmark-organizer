#!/bin/bash

# Script to create GCP resources for Bookmark Manager
# Run this after authenticating with: gcloud auth login

PROJECT_ID="bookmarks-manager-462919"
REGION="us-central1"
INSTANCE_NAME="bookmark-manager-db"
BUCKET_NAME="${PROJECT_ID}-bookmarks"

echo "======================================"
echo "Creating GCP Resources"
echo "======================================"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo ""

# Create Cloud SQL instance
echo "1. Creating Cloud SQL instance '${INSTANCE_NAME}'..."
echo "   This may take a few minutes..."

gcloud sql instances create ${INSTANCE_NAME} \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=${REGION} \
    --database-flags=cloudsql.enable_pgvector=on \
    --root-password=admin \
    --project=${PROJECT_ID}

# Get connection name
CLOUD_SQL_CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} --format="value(connectionName)")
echo "   Cloud SQL Connection Name: ${CLOUD_SQL_CONNECTION_NAME}"

# Create database
echo ""
echo "2. Creating database 'bookmark_manager'..."
gcloud sql databases create bookmark_manager --instance=${INSTANCE_NAME} --project=${PROJECT_ID}

# Create GCS bucket
echo ""
echo "3. Creating GCS bucket '${BUCKET_NAME}'..."
gsutil mb -p ${PROJECT_ID} -c standard -l ${REGION} gs://${BUCKET_NAME}/

# Create bucket directories
echo ""
echo "4. Setting up bucket structure..."
echo "Bookmark imports directory" | gsutil cp - gs://${BUCKET_NAME}/imports/README.txt
echo "Bookmark archives directory" | gsutil cp - gs://${BUCKET_NAME}/archives/README.txt

# Output configuration
echo ""
echo "======================================"
echo "✅ GCP Resources Created Successfully!"
echo "======================================"
echo ""
echo "Add these to your .env file:"
echo ""
echo "CLOUD_SQL_CONNECTION_NAME=${CLOUD_SQL_CONNECTION_NAME}"
echo "GCS_BUCKET_NAME=${BUCKET_NAME}"
echo ""
echo "Next steps:"
echo "1. Update your .env file with the values above"
echo "2. Connect to Cloud SQL to enable pgvector:"
echo "   gcloud sql connect ${INSTANCE_NAME} --user=admin --database=bookmark_manager"
echo "   Then run: CREATE EXTENSION vector;"
echo ""
echo "For local development, start Cloud SQL Proxy:"
echo "   cloud-sql-proxy --port=5432 ${CLOUD_SQL_CONNECTION_NAME}"