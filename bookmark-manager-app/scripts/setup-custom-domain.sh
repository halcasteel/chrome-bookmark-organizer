#!/bin/bash

# Script to set up custom domain for Cloud Run with automated certificates

PROJECT_ID="bookmarks-manager-462919"
REGION="us-central1"
DOMAIN="bookmarks.az1.ai"
API_DOMAIN="api.bookmarks.az1.ai"
FRONTEND_SERVICE="bookmark-manager-frontend"
BACKEND_SERVICE="bookmark-manager-backend"

echo "Setting up custom domain: ${DOMAIN}"
echo "========================================"

# Verify services are deployed
echo "1. Verifying Cloud Run services..."
gcloud run services list --region=${REGION} --project=${PROJECT_ID}

# Map domain to frontend service
echo ""
echo "2. Mapping ${DOMAIN} to frontend service..."
gcloud beta run domain-mappings create \
    --service=${FRONTEND_SERVICE} \
    --domain=${DOMAIN} \
    --region=${REGION} \
    --project=${PROJECT_ID}

# Get the DNS records to add to GoDaddy
echo ""
echo "3. Getting DNS configuration for frontend..."
gcloud beta run domain-mappings describe \
    --domain=${DOMAIN} \
    --region=${REGION} \
    --project=${PROJECT_ID}

# Create backend subdomain mapping
echo ""
echo "4. Mapping ${API_DOMAIN} to backend service..."
gcloud beta run domain-mappings create \
    --service=${BACKEND_SERVICE} \
    --domain=${API_DOMAIN} \
    --region=${REGION} \
    --project=${PROJECT_ID}

echo ""
echo "========================================"
echo "DNS Configuration for GoDaddy"
echo "========================================"
echo ""
echo "Add these DNS records in your GoDaddy DNS management:"
echo ""
echo "For bookmarks.az1.ai (frontend):"
echo "Type: CNAME"
echo "Name: bookmarks"
echo "Value: ghs.googlehosted.com"
echo "TTL: 600"
echo ""
echo "For api.bookmarks.az1.ai (backend API):"
echo "Type: CNAME"
echo "Name: api.bookmarks"
echo "Value: ghs.googlehosted.com"
echo "TTL: 600"
echo ""
echo "SSL certificates will be automatically provisioned by Google Cloud."
echo "This may take up to 24 hours to fully propagate."
echo ""
echo "After DNS propagation, your services will be available at:"
echo "Frontend: https://bookmarks.az1.ai"
echo "Backend API: https://api.bookmarks.az1.ai"
echo ""
echo "IMPORTANT: Update your .env and deployment configs with:"
echo "VITE_API_URL=https://api.bookmarks.az1.ai/api"
echo "FRONTEND_URL=https://bookmarks.az1.ai"