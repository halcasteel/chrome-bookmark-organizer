# Deployment Guide

## Prerequisites
- ✅ Google Cloud Project: `bookmarks-manager-462919`
- ✅ PostgreSQL database with pgvector running locally
- ✅ Node.js 20+ installed
- ✅ Docker installed
- ✅ gcloud CLI installed and authenticated

## Step 1: Local Development Setup

### 1.1 Start the Database
```bash
./scripts/setup-local-db.sh
```
✅ Database is running on port 5434

### 1.2 Install Dependencies
```bash
npm install
```

### 1.3 Create Admin User
```bash
node scripts/create-admin-user.js
```
Enter your @az1.ai email and password when prompted.

### 1.4 Start Development Server
```bash
./scripts/start-local.sh
```
- Frontend: http://localhost:5173
- Backend: http://localhost:3001

### 1.5 Test the Application
1. Navigate to http://localhost:5173
2. Login with your @az1.ai email
3. Set up 2FA on first login
4. Import your bookmarks

## Step 2: Deploy to Google Cloud

### 2.1 Enable Required APIs
```bash
./scripts/enable-apis.sh
```

### 2.2 Create Cloud SQL Instance
```bash
gcloud sql instances create bookmark-manager-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --database-flags=cloudsql.enable_pgvector=on \
    --root-password=admin \
    --project=bookmarks-manager-462919
```

### 2.3 Set Up Database
```bash
# Connect to Cloud SQL
gcloud sql connect bookmark-manager-db --user=admin --database=postgres

# In psql:
CREATE DATABASE bookmark_manager;
\c bookmark_manager
CREATE EXTENSION vector;
\q

# Apply schema
gcloud sql import sql bookmark-manager-db gs://bookmarks-manager-462919-bookmarks/schema.sql \
    --database=bookmark_manager
```

### 2.4 Create Artifact Registry Repository
```bash
gcloud artifacts repositories create bookmark-manager \
    --repository-format=docker \
    --location=us-central1 \
    --description="Bookmark Manager Docker images"
```

### 2.5 Build and Deploy
```bash
# Submit build
gcloud builds submit --config cloudbuild.yaml

# Or manually deploy
gcloud run deploy bookmark-manager-frontend \
    --image us-central1-docker.pkg.dev/bookmarks-manager-462919/bookmark-manager/frontend:latest \
    --region us-central1 \
    --allow-unauthenticated

gcloud run deploy bookmark-manager-backend \
    --image us-central1-docker.pkg.dev/bookmarks-manager-462919/bookmark-manager/backend:latest \
    --region us-central1 \
    --allow-unauthenticated \
    --add-cloudsql-instances bookmarks-manager-462919:us-central1:bookmark-manager-db \
    --set-env-vars NODE_ENV=production
```

### 2.6 Set Up Custom Domain
```bash
./scripts/setup-custom-domain.sh
```

Then add these DNS records in GoDaddy:

| Type  | Name          | Value                | TTL |
|-------|---------------|---------------------|-----|
| CNAME | bookmarks     | ghs.googlehosted.com | 600 |
| CNAME | api.bookmarks | ghs.googlehosted.com | 600 |

## Step 3: Post-Deployment

### 3.1 Create Production Admin User
Connect to Cloud SQL and run:
```bash
node scripts/create-admin-user.js
```

### 3.2 Verify Deployment
1. Visit https://bookmarks.az1.ai
2. Login with your @az1.ai account
3. Set up 2FA
4. Import bookmarks

### 3.3 Set Up Automatic Import
Place bookmark files in the `imports/` folder in your GitHub repo. The GitHub Action will automatically:
1. Upload to GCS
2. Trigger the import job
3. Archive processed files

## Step 4: Monitoring

### View Logs
```bash
# Backend logs
gcloud run logs read --service bookmark-manager-backend --region us-central1

# Frontend logs
gcloud run logs read --service bookmark-manager-frontend --region us-central1
```

### Check Service Status
```bash
gcloud run services list --region us-central1
```

## Troubleshooting

### Database Connection Issues
1. Ensure Cloud SQL Admin API is enabled
2. Check Cloud SQL instance is running
3. Verify Cloud Run service has SQL connection configured

### Domain Not Working
1. Wait 24-48 hours for DNS propagation
2. Check domain mapping status:
   ```bash
   gcloud beta run domain-mappings list --region us-central1
   ```

### 2FA Issues
1. Ensure system time is synchronized
2. Try using backup codes
3. Contact admin to reset 2FA

## Security Checklist
- ✅ Only @az1.ai emails can register
- ✅ 2FA is mandatory
- ✅ HTTPS only in production
- ✅ JWT tokens expire after 24 hours
- ✅ Database connections use SSL
- ✅ Secrets stored in environment variables