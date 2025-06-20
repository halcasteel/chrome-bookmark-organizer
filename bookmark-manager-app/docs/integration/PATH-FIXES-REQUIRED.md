# Path and Configuration Fixes Required
**Date**: 2025-06-19T19:20:00-04:00
**Status**: Pre-Integration Review

## Critical Issues to Fix

### 1. Frontend Configuration (HIGH PRIORITY)
**File**: `frontend/.env.local`
```bash
# CURRENT (pointing to old Node.js backend):
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001

# SHOULD BE (pointing to Rust gateway):
VITE_API_URL=http://localhost:8000/api
VITE_WS_URL=http://localhost:8000
```

### 2. Database Connection Strings

#### `rust-backend/scripts/run-all.sh` (Line 98)
```bash
# CURRENT:
export DATABASE_URL="postgres://postgres:postgres@localhost:5434/bookmarks"

# SHOULD BE:
export DATABASE_URL="postgres://admin:admin@localhost:5434/bookmark_manager"
```

#### `rust-backend/scripts/start-dependencies.sh` (Line 123)
```bash
# CURRENT:
PGPASSWORD=postgres psql -h localhost -p 5434 -U postgres -d bookmarks

# SHOULD BE:
PGPASSWORD=admin psql -h localhost -p 5434 -U admin -d bookmark_manager
```

#### `rust-backend/scripts/docker-build.sh`
```bash
# Multiple instances of port 5432 should remain as-is (internal Docker port)
# But ensure external mapping is 5434:5432
```

### 3. Docker Compose Configuration
**File**: `docker-compose.yml`
```yaml
# REMOVE entire backend service section (lines with Node.js backend)
# UPDATE PostgreSQL ports if needed:
ports:
  - "5434:5432"  # External:Internal
```

### 4. Start Services Script
**File**: `start-services.js`
```javascript
// REMOVE lines 430-496 (backend service startup code)
// This script should ONLY start Docker containers now
```

### 5. Environment Variables Consistency

Create a central configuration file:
**File**: `rust-backend/.env.shared`
```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5434
DATABASE_NAME=bookmark_manager
DATABASE_USER=admin
DATABASE_PASSWORD=admin

# Services
GATEWAY_PORT=8000
AUTH_SERVICE_PORT=8001
BOOKMARKS_SERVICE_PORT=8002
IMPORT_SERVICE_PORT=8003
SEARCH_SERVICE_PORT=8004

# Redis
REDIS_URL=redis://localhost:6382
```

### 6. Script Path Standardization

Update hardcoded paths in scripts to use relative paths:
```bash
# Instead of:
cd $HOME/BOOKMARKS/bookmark-manager-app

# Use:
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."
```

## Verification Checklist

After making these changes:

- [ ] Frontend can connect to Rust API at port 8000
- [ ] All services can connect to PostgreSQL at port 5434
- [ ] Database name is consistently `bookmark_manager`
- [ ] User credentials are `admin:admin`
- [ ] No references to Node.js backend remain
- [ ] Docker compose only starts infrastructure
- [ ] All scripts use correct paths

## Testing Commands

```bash
# Test database connection
psql -h localhost -p 5434 -U admin -d bookmark_manager -c "SELECT 1"

# Test Rust services
curl http://localhost:8000/health
curl http://localhost:8000/api/health

# Test frontend API connection
cd frontend && npm run dev
# Then check browser console for API errors
```

## Summary

These path fixes are essential before final integration:
1. **Frontend must point to Rust backend (port 8000)**
2. **Database connections must use correct credentials**
3. **Remove all Node.js backend references**
4. **Standardize configuration across all services**

Once these fixes are applied, the application will have a consistent, working path structure ready for testing and deployment.