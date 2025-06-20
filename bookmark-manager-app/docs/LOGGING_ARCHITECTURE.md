# Dual Storage Logging Architecture

## Overview

This architecture implements a hybrid approach using both PostgreSQL and Elasticsearch to leverage the strengths of each system:

- **PostgreSQL**: Structured queries, transactional consistency, integration with application data
- **Elasticsearch**: Full-text search, log analytics, real-time dashboards, pattern detection

## Architecture Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Rust      │     │  Frontend   │     │   System    │
│  Services   │     │    Logs     │     │    Logs     │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Vector    │
                    │ (Collector) │
                    └──────┬──────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
    ┌──────▼──────┐                 ┌──────▼──────┐
    │ PostgreSQL  │                 │Elasticsearch│
    │  (Primary)  │                 │ (Analytics) │
    └──────┬──────┘                 └──────┬──────┘
           │                               │
           └───────────────┬───────────────┘
                           │
                    ┌──────▼──────┐
                    │  AI-Ops     │
                    │    Core     │
                    └─────────────┘
```

## Storage Strategy

### PostgreSQL (Primary Storage)
- **Purpose**: Authoritative log storage with ACID guarantees
- **Use Cases**:
  - Audit trails requiring compliance
  - Correlation with application data (users, bookmarks)
  - Time-series analytics with TimescaleDB
  - AI agent structured queries
- **Retention**: 30 days detailed, 1 year aggregated
- **Features**:
  - Hypertables for automatic partitioning
  - Continuous aggregates for real-time metrics
  - JSONB for flexible metadata storage

### Elasticsearch (Analytics Storage)
- **Purpose**: Fast search and real-time analytics
- **Use Cases**:
  - Full-text search across all logs
  - Pattern detection and anomaly analysis
  - Real-time dashboards with Kibana
  - Complex aggregations and visualizations
- **Retention**: 7 days hot, 30 days warm
- **Features**:
  - Automatic index rotation
  - Machine learning for anomaly detection
  - Alerting and watching

## Implementation Steps

### 1. Start Elasticsearch Stack
```bash
# Create network if not exists
docker network create bookmark-network

# Start Elasticsearch, Kibana, and Logstash
docker-compose -f docker-compose.elasticsearch.yml up -d
```

### 2. Build and Start Log Writer Service
```bash
cd rust-migration/log-writer-service
cargo build --release
./target/release/log-writer-service &
```

### 3. Update Vector Configuration
```bash
# Replace the current Vector config with enhanced version
cp vector-enhanced.toml vector.toml

# Restart Vector
# If running in Docker:
docker restart bookmark-vector

# If running as a service:
systemctl restart vector
```

### 4. Configure Elasticsearch Index Templates
```bash
curl -X PUT "localhost:9200/_index_template/logs_template" -H 'Content-Type: application/json' -d'
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "logs_policy"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "service": { "type": "keyword" },
        "message": { "type": "text" },
        "correlation_id": { "type": "keyword" },
        "user_id": { "type": "keyword" },
        "fields": { "type": "object" },
        "error_details": { "type": "object" },
        "performance_metrics": { "type": "object" },
        "tags": { "type": "keyword" },
        "ai_analysis": { "type": "object" }
      }
    }
  }
}'
```

### 5. Set Up Index Lifecycle Management
```bash
curl -X PUT "localhost:9200/_ilm/policy/logs_policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "50GB",
            "max_age": "7d"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}'
```

## AI Agent Query Patterns

### PostgreSQL Queries
```sql
-- Find errors for a specific user
SELECT * FROM search_logs(
  p_level := 'ERROR',
  p_user_id := '123e4567-e89b-12d3-a456-426614174000',
  p_start_time := NOW() - INTERVAL '1 hour'
);

-- Get error statistics
SELECT * FROM get_error_stats(INTERVAL '6 hours');

-- Find correlated logs
SELECT * FROM application_logs
WHERE correlation_id = 'abc-123-def'
ORDER BY timestamp;
```

### Elasticsearch Queries
```json
// Find all logs with specific error pattern
{
  "query": {
    "bool": {
      "must": [
        { "match": { "message": "connection refused" } },
        { "term": { "level": "ERROR" } },
        { "range": { "@timestamp": { "gte": "now-1h" } } }
      ]
    }
  },
  "aggs": {
    "by_service": {
      "terms": { "field": "service" }
    }
  }
}

// Anomaly detection query
{
  "query": {
    "bool": {
      "must": [
        { "term": { "tags": "performance" } },
        { "range": { "performance_metrics.duration_ms": { "gte": 5000 } } }
      ]
    }
  }
}
```

## Performance Considerations

### Vector Optimization
- Batch size: 100 events for PostgreSQL, 500 for Elasticsearch
- Buffer: In-memory with disk overflow
- Compression: Enabled for file backups
- Parallel processing: Enabled

### PostgreSQL Optimization
- TimescaleDB hypertables for automatic partitioning
- Continuous aggregates for real-time metrics
- Proper indexes on commonly queried fields
- Connection pooling in log writer service

### Elasticsearch Optimization
- Single shard for daily indices (adjust based on volume)
- Force merge in warm phase
- Compressed storage for older indices
- Dedicated master node for production

## Monitoring and Alerting

### Key Metrics
1. **Log Volume**: Events per second by service
2. **Error Rate**: Errors per minute by service
3. **Latency**: p95 and p99 response times
4. **Storage**: Disk usage trends

### Alert Examples
- Error rate spike: >10 errors/minute for any service
- Performance degradation: p95 latency >1000ms
- Storage warning: >80% disk usage
- Service down: No logs from service for >5 minutes

## Maintenance Tasks

### Daily
- Review error dashboard
- Check storage usage
- Verify all services logging

### Weekly
- Review AI-generated insights
- Update alert thresholds
- Archive old logs

### Monthly
- Performance tuning
- Update retention policies
- Review logging patterns

## Cost Optimization

### Storage Costs
- PostgreSQL: ~$0.10/GB/month
- Elasticsearch: ~$0.15/GB/month (with replicas)
- Total estimated: <$50/month for typical usage

### Optimization Tips
1. Use appropriate retention periods
2. Compress old logs
3. Filter unnecessary debug logs
4. Use continuous aggregates instead of raw queries
5. Implement sampling for high-volume services

## Future Enhancements

1. **Machine Learning Integration**
   - Anomaly detection models
   - Predictive alerting
   - Root cause analysis

2. **Advanced Analytics**
   - User behavior patterns
   - Service dependency mapping
   - Performance regression detection

3. **Automation**
   - Auto-remediation for common issues
   - Dynamic threshold adjustment
   - Intelligent log sampling