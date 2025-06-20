# Unified Logging System

## Overview

The bookmark manager uses Vector (vector.dev) for unified log aggregation and processing. This system collects logs from all components (frontend, Rust backend, API gateway) and provides both human-readable logs and structured, AI-searchable logs.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │     │Rust Services│     │     API     │
│   (React)   │     │  (Tracing)  │     │   Gateway   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                     │
       │ HTTP              │ File                │ File
       ▼                   ▼                     ▼
    ┌─────────────────────────────────────────────┐
    │                   VECTOR                     │
    │  ┌─────────┐  ┌──────────┐  ┌──────────┐  │
    │  │ Sources │──│Transform │──│  Sinks   │  │
    │  └─────────┘  └──────────┘  └──────────┘  │
    └───────────────────┬─────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    ┌─────────┐   ┌──────────┐   ┌──────────┐
    │Unified  │   │Structured│   │PostgreSQL│
    │  Log    │   │  JSON    │   │   Logs   │
    └─────────┘   └──────────┘   └──────────┘
```

## Components

### 1. Frontend Logging
- **Location**: `frontend/src/services/logger.ts`
- **Features**:
  - Automatic error tracking
  - Performance monitoring
  - User action logging
  - API request/response logging
  - Buffered log shipping to Vector

### 2. Rust Backend Logging
- **Location**: `rust-backend/crates/shared/src/logging.rs`
- **Features**:
  - Structured logging with tracing
  - Correlation ID tracking
  - Performance metrics
  - Error context preservation
  - Dual output (console + Vector)

### 3. Vector Configuration
- **Config**: `vector.toml`
- **Sources**:
  - Frontend logs (HTTP endpoint)
  - Rust services (file tail)
  - Docker container logs
  - Syslog input
- **Transformations**:
  - Log parsing and enrichment
  - Correlation ID addition
  - Error aggregation
  - Performance analysis
- **Sinks**:
  - Human-readable unified log
  - Structured JSON logs
  - PostgreSQL storage
  - Prometheus metrics

## Log Formats

### Unified Log (Human-Readable)
```
2025-01-19T10:30:45Z INFO gateway: Request received
2025-01-19T10:30:45Z INFO auth-service: User authenticated
2025-01-19T10:30:45Z ERROR bookmarks-service: Database connection failed
```

### Structured Log (AI-Searchable)
```json
{
  "timestamp": "2025-01-19T10:30:45Z",
  "level": "ERROR",
  "service": "bookmarks-service",
  "message": "Database connection failed",
  "correlation_id": "abc123",
  "error_details": {
    "error_type": "DatabaseError",
    "error_message": "connection refused",
    "context": {
      "database": "bookmark_manager",
      "host": "localhost",
      "port": 5434
    }
  }
}
```

## Usage

### Starting the Logging System

1. **Install Vector** (one-time setup):
   ```bash
   ./scripts/install-vector.sh
   ```

2. **Start Vector**:
   ```bash
   ./scripts/start-vector.sh
   ```

3. **View Logs**:
   ```bash
   # Human-readable logs
   tail -f logs/unified.log
   
   # Structured logs
   tail -f logs/structured/all.json
   
   # Errors only
   tail -f logs/structured/errors.json
   ```

### Frontend Integration

```typescript
import { logger } from '@/services/logger';

// Basic logging
logger.info('User logged in', { userId: user.id });
logger.error('Failed to load bookmarks', { error });

// API logging (automatic with interceptor)
import { createApiInterceptor } from '@/services/logger';
createApiInterceptor(axiosInstance);

// Component logging
logger.logComponentMount('BookmarkList', { props });
logger.logUserAction('click', 'save-bookmark', { bookmarkId });
```

### Rust Backend Integration

```rust
use shared::logging::{log_with_context, log_error_with_context, log_performance};
use tracing::{info, error, Level};

// Basic logging
info!("Starting service");
error!("Connection failed");

// Structured logging
log_with_context!(Level::INFO, "User authenticated", {
    user_id: user.id,
    email: user.email
});

// Error logging with context
log_error_with_context!(err, "Database query failed", {
    query: "SELECT * FROM bookmarks",
    user_id: user_id
});

// Performance logging
log_performance!("database_query", duration_ms, {
    query_type: "select",
    table: "bookmarks",
    row_count: results.len()
});
```

## AI Agent Integration

### Querying Logs

AI agents can query logs using the PostgreSQL functions:

```sql
-- Search for recent errors
SELECT * FROM search_logs(
    p_level => 'ERROR',
    p_service => 'auth-service',
    p_start_time => NOW() - INTERVAL '1 hour'
);

-- Get error statistics
SELECT * FROM get_error_stats(INTERVAL '24 hours');

-- Find performance issues
SELECT * FROM performance_issues;

-- Get logs for a specific user
SELECT * FROM search_logs(
    p_user_id => 'user-uuid-here',
    p_start_time => NOW() - INTERVAL '1 day'
);
```

### Log Analysis Patterns

1. **Error Correlation**: Find related errors across services using correlation_id
2. **Performance Degradation**: Track response times over time
3. **User Journey**: Follow a user's actions through the system
4. **Error Patterns**: Identify recurring issues and their root causes

## Configuration

### Environment Variables

```bash
# Vector configuration
VECTOR_CONFIG_PATH=/path/to/vector.toml
VECTOR_DATA_DIR=/tmp/vector

# Log levels
RUST_LOG=info
NODE_ENV=production

# Database for log storage
DATABASE_URL=postgres://admin:admin@localhost:5434/bookmark_manager
```

### Log Retention

- **File logs**: Rotated daily, kept for 7 days
- **Database logs**: Partitioned monthly, kept for 90 days
- **Metrics**: Aggregated hourly, kept for 30 days

## Monitoring

### Vector Health Check
```bash
curl http://localhost:8686/health
```

### Metrics Endpoint
```bash
curl http://localhost:9598/metrics
```

### Log Volume Dashboard
Access Vector's built-in GraphQL API:
```
http://localhost:8686/graphql
```

## Troubleshooting

### Vector Not Starting
1. Check if port 8686 is available
2. Verify vector.toml syntax: `vector validate vector.toml`
3. Check Vector logs: `journalctl -u vector-bookmark`

### Logs Not Appearing
1. Verify services are writing to correct locations
2. Check Vector is running: `pgrep vector`
3. Test frontend endpoint: `curl -X POST http://localhost:8687/logs -d '{"test": true}'`

### High Memory Usage
1. Adjust buffer sizes in vector.toml
2. Increase flush frequency
3. Enable log sampling for high-volume services

## Best Practices

1. **Always include correlation IDs** for request tracking
2. **Use appropriate log levels** (ERROR for failures, INFO for important events)
3. **Include relevant context** but avoid logging sensitive data
4. **Monitor log volume** to prevent disk space issues
5. **Use structured fields** for better searchability
6. **Set up alerts** for critical errors
7. **Regular log analysis** to identify patterns

## Security Considerations

1. **No sensitive data** in logs (passwords, tokens, PII)
2. **Log encryption** at rest (PostgreSQL encryption)
3. **Access control** for log files and database
4. **Regular audit** of log access
5. **Compliance** with data retention policies