# Startup Scripts Guide

This guide explains the two main scripts for managing the Bookmark Manager application services.

## Overview

We have two scripts for service management:

1. **`start-all-with-logging.sh`** - Simple startup script (start only)
2. **`services-manager.sh`** - Full lifecycle management (start/stop/restart/status/check/clean)

## Script Comparison

### Common Features

Both scripts share these capabilities:

| Feature | Description |
|---------|-------------|
| **Process Detection** | Check if services are already running before starting |
| **Port Verification** | Wait for services to be ready on their ports |
| **Service Order** | Start services in correct dependency order |
| **Infrastructure First** | PostgreSQL & Redis start before application services |
| **Vector Integration** | Start Vector for unified logging |
| **Build Step** | Run `cargo build --release` for Rust services |
| **Status Display** | Show URLs and ports after startup |
| **Color Output** | User-friendly colored terminal output |

### Key Differences

| Feature | `start-all-with-logging.sh` | `services-manager.sh` |
|---------|----------------------------|----------------------|
| **Commands** | Start only | start, stop, restart, status, check, clean |
| **Shutdown** | No (manual pkill command shown) | Yes, graceful shutdown with timeout |
| **Health Checks** | Basic port checks | Full health endpoint verification |
| **Stale Process Cleanup** | No | Yes, detects and cleans zombie processes |
| **PID Tracking** | No | Yes, shows PIDs for all services |
| **Error Recovery** | Basic | Advanced with retry logic |
| **Log Management** | Create only | Create, clean, rotate options |
| **Database Verification** | No | Yes, tests connections |
| **Interactive Options** | No | Yes, for cleanup operations |

## When to Use Each Script

### Use `start-all-with-logging.sh` when:
- You need a quick start in development
- All services are known to be stopped
- You don't need health monitoring
- You want minimal interaction
- You're running for the first time

### Use `services-manager.sh` when:
- You need full control over services
- You want to stop/restart services cleanly
- You need health status verification
- You're debugging service issues
- You want to clean up and start fresh
- You're in production or staging

## Usage Examples

### Basic Startup (start-all-with-logging.sh)

```bash
# Simple start - everything at once
./scripts/start-all-with-logging.sh

# That's it! No options or arguments
```

### Full Management (services-manager.sh)

```bash
# Start all services
./scripts/services-manager.sh start

# Check what's running
./scripts/services-manager.sh status

# Health check all services
./scripts/services-manager.sh check

# Restart everything cleanly
./scripts/services-manager.sh restart

# Stop all services
./scripts/services-manager.sh stop

# Clean stop + remove logs/temp files
./scripts/services-manager.sh clean
```

## Service Start Order

Both scripts start services in this order:

1. **Infrastructure**
   - PostgreSQL (port 5434)
   - Redis (port 6382)

2. **Logging**
   - Vector (ports 8686, 8687, 9598)

3. **Rust Services** (built first)
   - Auth Service (port 8001)
   - Bookmarks Service (port 8002)
   - Import Service (port 8003)
   - Search Service (port 8004)
   - AI-Ops Monitor (port 8500)
   - API Gateway (port 8000) - must be last

4. **Frontend**
   - Vite Dev Server (port 5173)

## Important Nuances

### 1. **Process Detection Methods**

`start-all-with-logging.sh` uses simple process grep:
```bash
check_process() {
    if pgrep -f "$1" > /dev/null; then
        return 0
    fi
}
```

`services-manager.sh` adds port checking:
```bash
# Checks both process AND port
if check_process "$service" && check_port $port; then
    # Service is truly running
fi
```

### 2. **Gateway Environment Variable**

Both scripts set the Gateway port differently than other services:
```bash
# Special handling for gateway
GATEWAY_PORT=8000 ./target/release/gateway &
```

### 3. **Docker Container Handling**

- `start-all-with-logging.sh`: Relies on `node start-services.js`
- `services-manager.sh`: Direct Docker commands for stop/status

### 4. **Build Behavior**

Both scripts **always** run `cargo build --release`, which can be slow. Consider:
- Run build separately if iterating quickly
- Use `cargo build --release --bin specific-service` for single service updates

### 5. **Frontend Detection**

- `start-all-with-logging.sh`: Checks for "vite" process
- `services-manager.sh`: More specific Vite detection

### 6. **Error Handling**

`start-all-with-logging.sh`:
- Uses `set -e` (exit on error)
- Basic timeout for port waiting

`services-manager.sh`:
- More granular error handling
- Continues even if non-critical services fail
- Provides detailed error messages

### 7. **Log File Locations**

Both scripts expect:
```
logs/
├── unified.log          # Human-readable combined log
└── structured/          # AI-searchable JSON logs
    ├── all.json
    ├── errors.json
    ├── performance.json
    └── security.json
```

### 8. **Vector Dependency**

Both scripts assume Vector is installed. If not:
```bash
./scripts/install-vector.sh
```

### 9. **Stop Commands**

`start-all-with-logging.sh` shows manual kill:
```bash
pkill -f 'auth-service|bookmarks-service|import-service|search-service|gateway|aiops-monitor|vector'
```

`services-manager.sh` does graceful shutdown:
- SIGTERM first (graceful)
- Waits 10 seconds
- SIGKILL if needed (force)

### 10. **Status Information**

`start-all-with-logging.sh` output:
- Static list of URLs
- Basic command hints

`services-manager.sh status` output:
- Live process status with PIDs
- Health indicator per service
- Port availability status
- Container status for Docker services

## Troubleshooting

### Service Won't Start

1. Check if port is already in use:
   ```bash
   lsof -i :8001  # Replace with service port
   ```

2. Check for stale processes:
   ```bash
   ./scripts/services-manager.sh status
   # Look for "Process running but port not responding"
   ```

3. Clean start:
   ```bash
   ./scripts/services-manager.sh clean
   ./scripts/services-manager.sh start
   ```

### Services Start But Immediately Crash

1. Check logs:
   ```bash
   tail -f logs/unified.log
   tail -f logs/structured/errors.json | jq
   ```

2. Check individual service:
   ```bash
   cd rust-backend
   ./target/release/auth-service  # Run directly to see errors
   ```

### Vector Not Starting

1. Check if installed:
   ```bash
   which vector || ./scripts/install-vector.sh
   ```

2. Check Vector config:
   ```bash
   vector validate vector.toml
   ```

### Frontend Not Accessible

1. Check if running:
   ```bash
   ./scripts/services-manager.sh status | grep -i vite
   ```

2. Check for port conflicts:
   ```bash
   lsof -i :5173
   ```

## Best Practices

1. **Development Workflow**
   ```bash
   # Morning startup
   ./scripts/services-manager.sh start
   
   # Check everything is healthy
   ./scripts/services-manager.sh check
   
   # End of day
   ./scripts/services-manager.sh stop
   ```

2. **After Code Changes**
   ```bash
   # Rebuild and restart specific service
   cd rust-backend
   cargo build --release --bin auth-service
   cd ..
   ./scripts/services-manager.sh restart
   ```

3. **Debugging Issues**
   ```bash
   # Get full status
   ./scripts/services-manager.sh status
   
   # Check health endpoints
   ./scripts/services-manager.sh check
   
   # Clean restart
   ./scripts/services-manager.sh clean
   ./scripts/services-manager.sh start
   ```

4. **Production Deployment**
   - Use `services-manager.sh` for better control
   - Set up as systemd service
   - Enable health monitoring
   - Configure auto-restart on failure

## Environment Variables

Both scripts respect these environment variables:

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin
POSTGRES_DB=bookmark_manager

# Redis
REDIS_HOST=localhost
REDIS_PORT=6382

# Services
GATEWAY_PORT=8000
RUST_LOG=info

# Vector
VECTOR_CONFIG_PATH=./vector.toml
```

## Quick Reference

```bash
# Quick start (no options)
./scripts/start-all-with-logging.sh

# Full control
./scripts/services-manager.sh start|stop|restart|status|check|clean

# View logs
tail -f logs/unified.log                    # Human readable
tail -f logs/structured/errors.json | jq   # Errors only
curl http://localhost:8500/status | jq      # AI-Ops status

# Manual service control
docker ps                                   # Check containers
ps aux | grep -E "auth-|bookmark-|gateway" # Check Rust services
lsof -i :8000                              # Check specific port
```