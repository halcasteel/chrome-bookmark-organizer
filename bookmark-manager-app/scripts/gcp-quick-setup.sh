#!/bin/bash

# Quick setup script to get Cloud SQL connection name and create GCS bucket
# Run this if you want to set up resources step by step

PROJECT_ID="bookmarks-manager-462919"
REGION="us-central1"

echo "Quick GCP Setup for Bookmark Manager"
echo "===================================="

# Set project
gcloud config set project ${PROJECT_ID}

# Check if APIs are enabled
echo "Checking required APIs..."
gcloud services list --enabled --filter="name:(sqladmin.googleapis.com OR storage-api.googleapis.com)" --format="table(name)"

# List existing Cloud SQL instances
echo ""
echo "Existing Cloud SQL instances:"
gcloud sql instances list

# If you already have an instance, get its connection name
read -p "Enter your Cloud SQL instance name (or press Enter to create new): " INSTANCE_NAME

if [ -z "$INSTANCE_NAME" ]; then
    # Create new instance
    INSTANCE_NAME="bookmark-manager-db"
    echo "Creating new Cloud SQL instance: ${INSTANCE_NAME}"
    
    gcloud sql instances create ${INSTANCE_NAME} \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=${REGION} \
        --database-flags=cloudsql.enable_pgvector=on \
        --root-password=admin
fi

# Get connection name
CLOUD_SQL_CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --format="value(connectionName)")
echo "Cloud SQL Connection Name: ${CLOUD_SQL_CONNECTION_NAME}"

# Check for existing buckets
echo ""
echo "Existing GCS buckets:"
gsutil ls -p ${PROJECT_ID}

# Create bucket
BUCKET_NAME="${PROJECT_ID}-bookmarks"
read -p "Enter GCS bucket name (default: ${BUCKET_NAME}): " CUSTOM_BUCKET

if [ ! -z "$CUSTOM_BUCKET" ]; then
    BUCKET_NAME=$CUSTOM_BUCKET
fi

# Check if bucket exists
if gsutil ls -b gs://${BUCKET_NAME} &>/dev/null; then
    echo "Bucket ${BUCKET_NAME} already exists"
else
    echo "Creating bucket: ${BUCKET_NAME}"
    gsutil mb -p ${PROJECT_ID} -c standard -l ${REGION} gs://${BUCKET_NAME}/
fi

echo ""
echo "===================================="
echo "Setup Summary:"
echo "===================================="
echo "CLOUD_SQL_CONNECTION_NAME=${CLOUD_SQL_CONNECTION_NAME}"
echo "GCS_BUCKET_NAME=${BUCKET_NAME}"
echo ""
echo "Add these to your .env file!"
echo ""
echo "To enable pgvector on your Cloud SQL instance:"
echo "1. Connect to the instance:"
echo "   gcloud sql connect ${INSTANCE_NAME} --user=admin --database=postgres"
echo "2. Create database:"
echo "   CREATE DATABASE bookmark_manager;"
echo "3. Connect to the database:"
echo "   \\c bookmark_manager"
echo "4. Enable pgvector:"
echo "   CREATE EXTENSION vector;"