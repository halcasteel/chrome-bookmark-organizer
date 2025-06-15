#!/bin/bash

# Bookmark Manager Deployment Script for GCP
# This script handles the deployment of the bookmark manager to Google Cloud Platform

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if required environment variables are set
check_env_vars() {
    local missing_vars=()
    
    # Required variables
    [ -z "$PROJECT_ID" ] && missing_vars+=("PROJECT_ID")
    [ -z "$REGION" ] && missing_vars+=("REGION")
    [ -z "$JWT_SECRET" ] && missing_vars+=("JWT_SECRET")
    
    # Optional but recommended
    [ -z "$OPENAI_API_KEY" ] && print_warning "OPENAI_API_KEY not set - embedding features will be disabled"
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        print_error "Missing required environment variables: ${missing_vars[*]}"
        echo "Please set them before running this script:"
        for var in "${missing_vars[@]}"; do
            echo "  export $var=<value>"
        done
        exit 1
    fi
}

# Set default values
set_defaults() {
    export REGION=${REGION:-us-central1}
    export CLOUD_SQL_INSTANCE=${CLOUD_SQL_INSTANCE:-bookmark-manager-db}
    export DATABASE_NAME=${DATABASE_NAME:-bookmark_manager}
    export DATABASE_USER=${DATABASE_USER:-admin}
    export GCS_BUCKET_NAME=${GCS_BUCKET_NAME:-${PROJECT_ID}-bookmarks}
    export ARTIFACT_REGISTRY_REPO=${ARTIFACT_REGISTRY_REPO:-bookmark-manager}
    export BACKEND_SERVICE_NAME=${BACKEND_SERVICE_NAME:-bookmark-manager-backend}
    export FRONTEND_SERVICE_NAME=${FRONTEND_SERVICE_NAME:-bookmark-manager-frontend}
    export DOMAIN=${DOMAIN:-bookmarks.az1.ai}
}

# Get Cloud SQL connection name
get_cloud_sql_connection() {
    CLOUD_SQL_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${CLOUD_SQL_INSTANCE}"
    print_status "Cloud SQL connection name: $CLOUD_SQL_CONNECTION_NAME"
}

# Get backend URL
get_backend_url() {
    BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE_NAME \
        --region=$REGION \
        --format="value(status.url)" 2>/dev/null || echo "")
    
    if [ -z "$BACKEND_URL" ]; then
        print_warning "Backend service not deployed yet"
        BACKEND_URL="https://${BACKEND_SERVICE_NAME}-xxxxx-${REGION:0:2}.a.run.app"
    fi
    
    API_URL="${BACKEND_URL}/api"
    print_status "API URL: $API_URL"
}

# Build and deploy using Cloud Build
deploy_with_cloud_build() {
    print_status "Starting Cloud Build deployment..."
    
    # Create substitutions file
    cat > .env.yaml << EOF
substitutions:
  _REGION: ${REGION}
  _API_URL: ${API_URL}
  _CLOUD_SQL_CONNECTION_NAME: ${CLOUD_SQL_CONNECTION_NAME}
  _DATABASE_URL: postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@localhost:5432/${DATABASE_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION_NAME}
  _GCS_BUCKET_NAME: ${GCS_BUCKET_NAME}
  _JWT_SECRET: ${JWT_SECRET}
  _OPENAI_API_KEY: ${OPENAI_API_KEY:-}
EOF

    # Submit Cloud Build
    gcloud builds submit \
        --config=cloudbuild.yaml \
        --substitutions-file=.env.yaml \
        --region=$REGION
    
    # Clean up
    rm -f .env.yaml
}

# Update DNS records (if using Cloud DNS)
update_dns() {
    if [ "$DOMAIN" != "bookmarks.az1.ai" ]; then
        print_warning "Custom domain detected. Please update DNS records manually."
        return
    fi
    
    print_status "Getting frontend service URL..."
    FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE_NAME \
        --region=$REGION \
        --format="value(status.url)")
    
    print_status "Frontend URL: $FRONTEND_URL"
    echo ""
    echo "To set up custom domain mapping:"
    echo "1. Run: gcloud run domain-mappings create --service=$FRONTEND_SERVICE_NAME --domain=$DOMAIN --region=$REGION"
    echo "2. Update your DNS records as instructed by the command output"
}

# Main deployment flow
main() {
    print_status "Starting deployment for project: $PROJECT_ID"
    
    # Check prerequisites
    check_env_vars
    set_defaults
    
    # Get required values
    get_cloud_sql_connection
    
    # Get database password
    if [ -z "$DATABASE_PASSWORD" ]; then
        print_error "DATABASE_PASSWORD not set"
        echo "Please set it with: export DATABASE_PASSWORD=<your-password>"
        exit 1
    fi
    
    # Deploy backend first to get its URL
    print_status "Building and deploying services..."
    get_backend_url
    deploy_with_cloud_build
    
    # Get actual backend URL after deployment
    sleep 5  # Wait for service to be ready
    get_backend_url
    
    # Update DNS if needed
    update_dns
    
    print_status "Deployment complete!"
    echo ""
    echo "Service URLs:"
    echo "  Backend:  $BACKEND_URL"
    echo "  Frontend: https://$DOMAIN (after DNS propagation)"
    echo ""
    echo "Next steps:"
    echo "1. Wait for DNS propagation (if using custom domain)"
    echo "2. Test the application at https://$DOMAIN"
    echo "3. Monitor logs with: gcloud logging read \"resource.type=cloud_run_revision\""
}

# Run main function
main "$@"