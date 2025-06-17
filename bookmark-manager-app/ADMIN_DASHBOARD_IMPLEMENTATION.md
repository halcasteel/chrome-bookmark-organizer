# Admin Dashboard Implementation Guide

## Overview
The admin dashboard provides comprehensive monitoring and management capabilities for the Bookmark Manager application. It includes real-time log viewing, system health monitoring, analytics, AI-powered insights, and user activity tracking.

## Architecture

### Backend Components

1. **AI Log Analysis Service** (`backend/src/services/aiLogAnalysisService.js`)
   - Analyzes log patterns for anomalies
   - Identifies error patterns and root causes
   - Generates actionable insights
   - Runs analysis every 5 minutes

2. **Log Ingestion Service** (`backend/src/services/logIngestionService.js`)
   - Reads from unified.log file
   - Batches and stores logs in PostgreSQL
   - Updates aggregation tables for analytics
   - Provides API methods for log retrieval

3. **Admin API Routes** (`backend/src/routes/admin.js`)
   - `/api/admin/health` - System health status
   - `/api/admin/logs` - Recent logs with filtering
   - `/api/admin/analytics` - Time series and service breakdown
   - `/api/admin/ai-insights` - AI-generated insights
   - `/api/admin/users/activity` - User activity tracking

### Frontend Components

1. **AdminDashboard** (`frontend/src/pages/AdminDashboard.tsx`)
   - Main container with tabbed interface
   - Role-based access control (admin only)
   - Uses Chakra UI components

2. **SystemHealth** (`frontend/src/components/admin/SystemHealth.tsx`)
   - Real-time service status monitoring
   - Database, Redis, backend health checks
   - Log ingestion statistics
   - Auto-refresh every 30 seconds

3. **LogsViewer** (`frontend/src/components/admin/LogsViewer.tsx`)
   - Real-time log viewing with filtering
   - Search by text, level, service
   - Expandable log details
   - Export functionality

4. **LogAnalytics** (`frontend/src/components/admin/LogAnalytics.tsx`)
   - Time series visualization
   - Service breakdown charts
   - Error pattern analysis
   - Performance metrics

5. **AIInsights** (`frontend/src/components/admin/AIInsights.tsx`)
   - Display AI-generated insights
   - Severity-based categorization
   - Acknowledge/resolve actions
   - Recommendations display

6. **AlertsManager** (`frontend/src/components/admin/AlertsManager.tsx`)
   - Alert rule configuration (placeholder)
   - Future: Custom alert rules

7. **UserActivity** (`frontend/src/components/admin/UserActivity.tsx`)
   - Recent user activities
   - Top users by activity
   - Activity statistics

### Database Schema

```sql
-- System logs table
CREATE TABLE system_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(10) NOT NULL,
  service VARCHAR(50) NOT NULL,
  source VARCHAR(100),
  message TEXT NOT NULL,
  metadata JSONB,
  error_type VARCHAR(100),
  error_message TEXT,
  error_stack TEXT,
  user_id UUID,
  request_id VARCHAR(50),
  duration_ms INTEGER,
  status_code INTEGER
);

-- Log aggregations for analytics
CREATE TABLE log_aggregations (
  id SERIAL PRIMARY KEY,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  aggregation_type VARCHAR(50) NOT NULL,
  service VARCHAR(50),
  level VARCHAR(10),
  total_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms NUMERIC(10,2),
  p95_duration_ms NUMERIC(10,2),
  unique_users INTEGER DEFAULT 0,
  metadata JSONB,
  UNIQUE(period_start, period_end, aggregation_type, service, level)
);

-- AI analysis results
CREATE TABLE log_ai_analysis (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  analysis_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  affected_services TEXT[],
  recommendations JSONB,
  confidence_score NUMERIC(3,2),
  metadata JSONB
);
```

## Implementation Details

### Log Flow
1. All services write to `unifiedLogger`
2. Logs are written to `logs/unified.log` file
3. `logIngestionService` tails the file and batches logs
4. Batches are inserted into `system_logs` table
5. Aggregations are updated for analytics
6. AI service analyzes patterns periodically

### WebSocket Integration
- Real-time log streaming capability
- Uses Socket.IO with authentication
- Supports both polling and websocket transports
- Connection confirmation for reliability

### Security
- Admin role required for all dashboard endpoints
- JWT authentication for API access
- WebSocket connections require valid tokens
- No sensitive data in logs

## Testing

### Manual Testing
```bash
# Test admin API endpoints
./test-admin-api.sh

# Test WebSocket with auth
node test-websocket-auth.js

# Test complete admin dashboard
node test-admin-dashboard.js
```

### Automated Tests
- Unit tests for log parsing
- Integration tests for API endpoints
- WebSocket connection tests
- AI analysis service tests

## Deployment

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- PostgreSQL with required tables
- Redis for caching

### Deployment Steps
```bash
# Run deployment script
./deploy-app.sh

# Or manually:
# 1. Start Docker containers
docker-compose up -d

# 2. Run migrations
docker exec -i bookmark-postgres psql -U admin -d bookmark_manager < backend/src/db/migrations/add-logs-tables.sql

# 3. Build frontend
cd frontend && npm run build

# 4. Start backend
cd backend && npm start
```

### Production Considerations
1. Use PM2 or similar for process management
2. Configure log rotation for unified.log
3. Set up monitoring for log ingestion lag
4. Configure AI analysis frequency based on load
5. Implement proper backup strategy for logs
6. Consider TimescaleDB for better time-series performance

## Troubleshooting

### Common Issues

1. **WebSocket connection fails**
   - Check CORS configuration
   - Verify JWT token is valid
   - Ensure transport order (polling first)

2. **Logs not appearing**
   - Check log ingestion service is running
   - Verify unified.log file permissions
   - Check database connection

3. **AI insights empty**
   - Wait for analysis interval (5 minutes)
   - Check for sufficient log data
   - Verify AI service initialization

4. **Performance issues**
   - Add database indexes if needed
   - Implement log retention policy
   - Optimize aggregation queries
   - Consider caching frequently accessed data

## Future Enhancements

1. **Custom Dashboards**
   - User-defined widgets
   - Saved views
   - Export capabilities

2. **Advanced Analytics**
   - Machine learning for anomaly detection
   - Predictive alerts
   - Correlation analysis

3. **Integration**
   - Slack/Discord notifications
   - PagerDuty integration
   - Custom webhooks

4. **Performance**
   - Real-time streaming with Kafka
   - ClickHouse for analytics
   - Distributed tracing