#!/bin/bash

# Script to get current GCP configuration values

PROJECT_ID="bookmarks-manager-462919"

echo "Getting GCP configuration for project: ${PROJECT_ID}"
echo "=================================================="

# Set project
gcloud config set project ${PROJECT_ID}

# Get Cloud SQL instances
echo ""
echo "Cloud SQL Instances:"
gcloud sql instances list --format="table(name,connectionName,state)"

# If you have an instance, get its connection name
INSTANCE_NAME=$(gcloud sql instances list --format="value(name)" --limit=1)

if [ ! -z "$INSTANCE_NAME" ]; then
    CLOUD_SQL_CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --format="value(connectionName)")
    echo ""
    echo "CLOUD_SQL_CONNECTION_NAME=${CLOUD_SQL_CONNECTION_NAME}"
else
    echo ""
    echo "No Cloud SQL instance found. Create one with:"
    echo "gcloud sql instances create bookmark-manager-db --database-version=POSTGRES_15 --tier=db-f1-micro --region=us-central1 --database-flags=cloudsql.enable_pgvector=on --root-password=admin"
fi

# Get GCS buckets
echo ""
echo "GCS Buckets:"
gsutil ls -p ${PROJECT_ID}

# Suggest bucket name
BUCKET_NAME="${PROJECT_ID}-bookmarks"
echo ""
echo "Suggested GCS_BUCKET_NAME=${BUCKET_NAME}"

# Check if bucket exists
if gsutil ls -b gs://${BUCKET_NAME} &>/dev/null; then
    echo "Bucket already exists!"
else
    echo "Create bucket with:"
    echo "gsutil mb -p ${PROJECT_ID} -c standard -l us-central1 gs://${BUCKET_NAME}/"
fi

echo ""
echo "=================================================="
echo "Add these to your .env file:"
echo ""
echo "CLOUD_SQL_CONNECTION_NAME=${CLOUD_SQL_CONNECTION_NAME}"
echo "GCS_BUCKET_NAME=${BUCKET_NAME}"