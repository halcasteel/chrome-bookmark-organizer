# Rust Backend Deployment Guide

## Overview

This guide describes how to deploy the Rust microservices backend alongside or as a replacement for the Node.js backend.

## Architecture

```
                    ┌─────────────┐
                    │   Frontend  │
                    │  (React)    │
                    │  Port 5173  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ API Gateway │
                    │  Port 8000  │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐      ┌─────▼─────┐     ┌─────▼─────┐
   │  Auth   │      │ Bookmarks │     │  Import   │
   │  8001   │      │   8002    │     │   8003    │
   └─────────┘      └───────────┘     └───────────┘
                           │
                    ┌──────▼──────┐
                    │   Search    │
                    │    8004     │
                    └─────────────┘
```

## Prerequisites

- Rust 1.75+ installed
- PostgreSQL 15+ running on port 5434
- Redis running on port 6382
- Node.js 20+ (for running migration script)

## Quick Start

### 1. Start Dependencies

```bash
cd bookmark-manager-app
node start-services.js  # Starts PostgreSQL and Redis
```

### 2. Run Migration Analysis

```bash
cd rust-migration
node migrate-data.js
```

This will:
- Analyze the existing database
- Create a `.env` file for Rust services
- Generate a migration report

### 3. Build All Services

```bash
cd rust-migration
cargo build --release
```

### 4. Start Services

Option 1: Start all services individually:

```bash
# Terminal 1 - Auth Service
BOOKMARKS_SERVER_PORT=8001 ./target/release/auth-service

# Terminal 2 - Bookmarks Service  
BOOKMARKS_SERVER_PORT=8002 ./target/release/bookmarks-service

# Terminal 3 - Import Service
BOOKMARKS_SERVER_PORT=8003 ./target/release/import-service

# Terminal 4 - Search Service
BOOKMARKS_SERVER_PORT=8004 ./target/release/search-service

# Terminal 5 - API Gateway
GATEWAY_PORT=8000 ./target/release/gateway
```

Option 2: Use the master script (if available):

```bash
./rust-platform
```

### 5. Update Frontend Configuration

Edit `frontend/.env`:

```env
# Use Rust backend via gateway
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=ws://localhost:8000/ws
```

### 6. Restart Frontend

```bash
cd frontend
npm run dev
```

## Production Deployment

### Using Docker

1. Build Docker images:

```bash
cd rust-migration
docker build -f services/auth/Dockerfile -t bookmark-auth:latest .
docker build -f services/bookmarks/Dockerfile -t bookmark-bookmarks:latest .
docker build -f services/import/Dockerfile -t bookmark-import:latest .
docker build -f services/search/Dockerfile -t bookmark-search:latest .
docker build -f services/gateway/Dockerfile -t bookmark-gateway:latest .
```

2. Run with Docker Compose:

```bash
docker-compose -f docker-compose.rust.yml up -d
```

### Using Kubernetes

See `kubernetes/` directory for Kubernetes manifests.

## Environment Variables

### Required for All Services

```env
BOOKMARKS_DATABASE_URL=postgres://admin:admin@localhost:5434/bookmark_manager
BOOKMARKS_REDIS_URL=redis://localhost:6382
BOOKMARKS_JWT_SECRET=your-secret-key
RUST_LOG=info
```

### Service-Specific

**Auth Service:**
```env
BOOKMARKS_SERVER_PORT=8001
```

**Bookmarks Service:**
```env
BOOKMARKS_SERVER_PORT=8002
```

**Import Service:**
```env
BOOKMARKS_SERVER_PORT=8003
```

**Search Service:**
```env
BOOKMARKS_SERVER_PORT=8004
BOOKMARKS_OPENAI_API_KEY=your-openai-key  # Optional
```

**Gateway:**
```env
GATEWAY_PORT=8000
AUTH_SERVICE_URL=http://localhost:8001
BOOKMARKS_SERVICE_URL=http://localhost:8002
IMPORT_SERVICE_URL=http://localhost:8003
SEARCH_SERVICE_URL=http://localhost:8004
```

## Health Checks

Check individual services:
```bash
curl http://localhost:8001/health  # Auth
curl http://localhost:8002/health  # Bookmarks
curl http://localhost:8003/health  # Import
curl http://localhost:8004/health  # Search
```

Check gateway (shows all services):
```bash
curl http://localhost:8000/health
```

## Testing the Deployment

1. **Test Authentication:**
```bash
# Register a new user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@az1.ai","password":"testpass123"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@az1.ai","password":"testpass123"}'
```

2. **Test Bookmarks:**
```bash
# Create a bookmark (use token from login)
curl -X POST http://localhost:8000/api/bookmarks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"url":"https://example.com","title":"Example"}'
```

## Monitoring

### Logs

View service logs:
```bash
# If using systemd
journalctl -u bookmark-auth -f
journalctl -u bookmark-bookmarks -f

# If running directly
tail -f auth.log
tail -f bookmarks.log
```

### Metrics

The services expose Prometheus metrics at `/metrics` endpoint.

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port
   lsof -i :8001
   # Kill process
   kill -9 PID
   ```

2. **Database Connection Failed**
   - Ensure PostgreSQL is running on port 5434
   - Check credentials: admin/admin
   - Verify database exists: bookmark_manager

3. **Redis Connection Failed**
   - Ensure Redis is running on port 6382
   - Check no password is set

4. **Services Can't Communicate**
   - Check all services are running
   - Verify gateway configuration
   - Check firewall rules

## Rollback Plan

If you need to rollback to Node.js backend:

1. Stop all Rust services
2. Update frontend `.env`:
   ```env
   VITE_API_URL=http://localhost:3001/api
   ```
3. Restart Node.js backend:
   ```bash
   cd bookmark-manager-app
   node start-services.js
   ```
4. Restart frontend

## Performance Tuning

### Database Connections
Adjust in each service:
```env
DATABASE_MAX_CONNECTIONS=10
DATABASE_MIN_CONNECTIONS=2
```

### Worker Threads
For CPU-bound operations:
```env
RUST_WORKER_THREADS=4
```

### Memory Limits
If using containers:
```yaml
resources:
  limits:
    memory: "512Mi"
  requests:
    memory: "256Mi"
```

## Security Considerations

1. **Use HTTPS in Production**
   - Configure TLS certificates
   - Update service URLs to use https://

2. **Secure JWT Secret**
   - Use a strong, random secret
   - Rotate regularly
   - Never commit to version control

3. **Database Security**
   - Use strong passwords
   - Enable SSL/TLS
   - Restrict network access

4. **API Rate Limiting**
   - Configure in gateway
   - Set appropriate limits per service

## Next Steps

1. Set up CI/CD pipeline
2. Configure monitoring and alerting
3. Implement auto-scaling
4. Set up backup and disaster recovery
5. Create runbooks for common operations