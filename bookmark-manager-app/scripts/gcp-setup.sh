#!/bin/bash

# GCP Setup Script for Bookmark Manager
# This script sets up Cloud SQL with pgvector and GCS bucket

set -e

# Configuration
PROJECT_ID="bookmarks-manager-462919"
REGION="us-central1"
ZONE="us-central1-a"

# Cloud SQL Configuration
INSTANCE_NAME="bookmark-manager-db"
DB_VERSION="POSTGRES_15"
DB_TIER="db-f1-micro"  # For development, upgrade for production
DB_NAME="bookmark_manager"
DB_USER="admin"
DB_PASSWORD="admin"

# GCS Configuration
BUCKET_NAME="${PROJECT_ID}-bookmarks"

echo "Setting up GCP resources for Bookmark Manager..."
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"

# Set the project
echo "1. Setting project..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "2. Enabling required APIs..."
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage-api.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Create Cloud SQL instance with PostgreSQL
echo "3. Creating Cloud SQL instance..."
gcloud sql instances create ${INSTANCE_NAME} \
    --database-version=${DB_VERSION} \
    --tier=${DB_TIER} \
    --region=${REGION} \
    --network=default \
    --database-flags=cloudsql.enable_pgvector=on \
    --root-password=${DB_PASSWORD} \
    --backup \
    --backup-start-time=03:00 \
    --maintenance-window-day=SUN \
    --maintenance-window-hour=03 \
    --maintenance-release-channel=production

# Wait for instance to be ready
echo "Waiting for Cloud SQL instance to be ready..."
gcloud sql operations wait --project=${PROJECT_ID} \
    $(gcloud sql operations list --instance=${INSTANCE_NAME} --project=${PROJECT_ID} --filter="status!=DONE" --format="value(name)" | head -n1)

# Create database
echo "4. Creating database..."
gcloud sql databases create ${DB_NAME} --instance=${INSTANCE_NAME}

# Create user
echo "5. Creating database user..."
gcloud sql users create ${DB_USER} --instance=${INSTANCE_NAME} --password=${DB_PASSWORD}

# Get connection name
CLOUD_SQL_CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --format="value(connectionName)")
echo "Cloud SQL Connection Name: ${CLOUD_SQL_CONNECTION_NAME}"

# Create GCS bucket
echo "6. Creating GCS bucket..."
gsutil mb -p ${PROJECT_ID} -c standard -l ${REGION} gs://${BUCKET_NAME}/

# Set bucket permissions
echo "7. Setting bucket permissions..."
gsutil iam ch allUsers:objectViewer gs://${BUCKET_NAME}

# Create directories in bucket
echo "8. Creating bucket directories..."
echo "Bookmark imports directory" | gsutil cp - gs://${BUCKET_NAME}/imports/README.txt
echo "Bookmark archives directory" | gsutil cp - gs://${BUCKET_NAME}/archives/README.txt

# Note: Using Application Default Credentials (ADC)
echo "9. Using Application Default Credentials..."
echo "Make sure you've authenticated with: gcloud auth application-default login"

# Output configuration
echo ""
echo "================================"
echo "GCP Setup Complete!"
echo "================================"
echo ""
echo "Add these values to your .env file:"
echo ""
echo "CLOUD_SQL_CONNECTION_NAME=${CLOUD_SQL_CONNECTION_NAME}"
echo "GCS_BUCKET_NAME=${BUCKET_NAME}"
echo ""
echo "Cloud SQL Instance: ${INSTANCE_NAME}"
echo "Database: ${DB_NAME}"
echo "Username: ${DB_USER}"
echo "Password: ${DB_PASSWORD}"
echo ""
echo "Using Application Default Credentials (ADC)"
echo "Run 'gcloud auth application-default login' if not already authenticated"
echo ""
echo "For production, update DATABASE_URL to:"
echo "DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION_NAME}"
echo ""
echo "To connect to Cloud SQL from your local machine:"
echo "gcloud sql connect ${INSTANCE_NAME} --user=${DB_USER} --database=${DB_NAME}"