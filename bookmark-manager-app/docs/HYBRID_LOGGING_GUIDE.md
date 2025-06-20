# Hybrid Logging System Guide

## Overview

The bookmark manager uses a sophisticated hybrid logging system that provides:
- **File-based logs** for quick access and debugging
- **PostgreSQL storage** for structured queries and audit trails
- **Elasticsearch** (optional) for advanced analytics and search

## Logging Modes

### 1. Basic Mode (Default)
The simplest and fastest option for development:
```bash
./scripts/services-manager.sh start  # Uses basic mode by default
```

Features:
- Writes to `logs/unified.log` (human-readable)
- Writes to `logs/structured/*.json` (AI-searchable)
- Minimal resource usage
- No additional services needed

### 2. PostgreSQL Mode
Adds database logging for persistence and queries:
```bash
LOGGING_MODE=postgres ./scripts/services-manager.sh start
```

Features:
- Everything from basic mode
- Writes to `application_logs` table in PostgreSQL
- Enables SQL queries on logs
- Can JOIN with application data (users, bookmarks)
- Requires log-writer service (auto-started)

### 3. Hybrid Mode (Full Stack)
Complete logging solution with Elasticsearch:
```bash
LOGGING_MODE=hybrid ./scripts/services-manager.sh start
```

Features:
- Everything from PostgreSQL mode
- Elasticsearch for full-text search
- Kibana for visualizations
- Advanced analytics and dashboards
- Higher resource usage (~1GB RAM for Elastic)

## Quick Commands

### View Logs
```bash
# Real-time log viewing
tail -f logs/unified.log

# View errors only
cat logs/structured/errors.json | jq '.'

# Query PostgreSQL logs (postgres/hybrid mode)
psql -h localhost -p 5434 -U admin -d bookmark_manager \
  -c "SELECT * FROM search_logs('ERROR', 'auth-service');"

# Access Kibana (hybrid mode)
open http://localhost:5601
```

### Change Logging Mode
```bash
# Switch to PostgreSQL mode
./scripts/start-logging.sh postgres

# Switch to hybrid mode
./scripts/start-logging.sh hybrid

# Back to basic
./scripts/start-logging.sh basic
```

## Architecture

### Log Flow
1. **Services** generate structured logs using tracing crate
2. **Vector** collects logs from all sources:
   - Rust services (file tail)
   - Frontend (HTTP endpoint)
   - Docker containers
3. **Vector** transforms and routes logs to:
   - File sinks (always)
   - PostgreSQL (postgres/hybrid mode)
   - Elasticsearch (hybrid mode only)
   - AI-Ops Core (TCP stream)

### Components

#### Vector (Always Running)
- Central log aggregator
- Handles parsing, enrichment, routing
- Config: `vector.toml` or `vector-hybrid.toml`
- API: http://localhost:8686

#### Log Writer Service (PostgreSQL Mode)
- Rust service that receives logs from Vector
- Writes to PostgreSQL `application_logs` table
- Port: 8688
- Health: http://localhost:8688/health

#### Elasticsearch Stack (Hybrid Mode)
- Elasticsearch: http://localhost:9200
- Kibana: http://localhost:5601
- 30-day retention policy
- Automatic index management

## AI Agent Integration

The logging system is designed for AI agents to query and analyze:

### PostgreSQL Functions
```sql
-- Search logs by various criteria
SELECT * FROM search_logs(
    p_level => 'ERROR',
    p_service => 'auth-service',
    p_message_pattern => 'authentication failed',
    p_start_time => NOW() - INTERVAL '1 hour'
);

-- Get error statistics
SELECT * FROM get_error_stats(INTERVAL '24 hours');

-- View recent errors
SELECT * FROM recent_errors;

-- View performance issues
SELECT * FROM performance_issues;
```

### Elasticsearch Queries
```bash
# Search for errors in the last hour
curl -X GET "localhost:9200/bookmark-logs-*/_search" -H 'Content-Type: application/json' -d'
{
  "query": {
    "bool": {
      "must": [
        { "term": { "level": "ERROR" } },
        { "range": { "timestamp": { "gte": "now-1h" } } }
      ]
    }
  }
}'
```

## Frontend Integration

The frontend automatically sends logs to Vector:

```typescript
import { logger } from '@/services/logger';

// Log errors
logger.error('Authentication failed', {
    userId: user.id,
    error: error.message
});

// Log performance
logger.logPerformance('api-call', duration, {
    endpoint: '/api/bookmarks',
    method: 'GET'
});
```

## Troubleshooting

### Vector Not Starting
```bash
# Check Vector logs
cat logs/vector.log

# Verify config
vector validate --config vector.toml
```

### No Logs in PostgreSQL
```bash
# Check log-writer service
curl http://localhost:8688/health

# Check logs
cat logs/log-writer.log
```

### Elasticsearch Issues
```bash
# Check cluster health
curl http://localhost:9200/_cluster/health

# Check indices
curl http://localhost:9200/_cat/indices
```

## Resource Usage

| Mode | RAM Usage | Disk Usage | Startup Time |
|------|-----------|------------|--------------|
| Basic | ~50MB | Minimal | <1s |
| PostgreSQL | ~100MB | Moderate | ~5s |
| Hybrid | ~1.2GB | High | ~30s |

## Best Practices

1. **Development**: Use basic mode for fast iteration
2. **Testing**: Use PostgreSQL mode to test log queries
3. **Production**: Use hybrid mode for full analytics
4. **Debugging**: Always check `logs/unified.log` first
5. **Performance**: Batch log writes to reduce overhead

## Future Enhancements

- [ ] Add Grafana for metrics visualization
- [ ] Implement log sampling for high-volume services
- [ ] Add machine learning for anomaly detection
- [ ] Create custom Kibana dashboards
- [ ] Add log forwarding to cloud services