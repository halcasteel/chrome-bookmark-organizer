#!/bin/bash

# Script to enable required GCP APIs

PROJECT_ID="bookmarks-manager-462919"

echo "Enabling required APIs for project: ${PROJECT_ID}"
echo "=============================================="

# Enable APIs
echo "1. Enabling Cloud SQL Admin API..."
gcloud services enable sqladmin.googleapis.com --project=${PROJECT_ID}

echo "2. Enabling Cloud Storage API..."
gcloud services enable storage-api.googleapis.com --project=${PROJECT_ID}

echo "3. Enabling Cloud Build API..."
gcloud services enable cloudbuild.googleapis.com --project=${PROJECT_ID}

echo "4. Enabling Cloud Run API..."
gcloud services enable run.googleapis.com --project=${PROJECT_ID}

echo "5. Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --project=${PROJECT_ID}

echo "6. Enabling Compute Engine API..."
gcloud services enable compute.googleapis.com --project=${PROJECT_ID}

echo ""
echo "✅ APIs enabled successfully!"
echo ""
echo "Now you can run ./scripts/create-gcp-resources.sh to create the Cloud SQL instance"