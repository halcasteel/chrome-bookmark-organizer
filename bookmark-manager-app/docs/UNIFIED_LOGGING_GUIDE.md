# Unified Logging System Guide

## Overview

We've implemented a comprehensive unified logging system that provides:
- **Single view** of all application activity across the entire stack
- **Real-time streaming** of logs via WebSocket
- **Source attribution** so you know exactly where issues originate
- **Structured logging** with consistent format across all services
- **Performance tracking** and error aggregation

## Architecture

### Components

1. **Backend Unified Logger** (`backend/src/services/unifiedLogger.js`)
   - Central logging service using Winston
   - Handles all backend, database, worker, and process logs
   - WebSocket server for real-time streaming
   - Multiple log files with rotation

2. **Frontend Logger** (`frontend/src/services/logger.ts`)
   - Captures all frontend events, errors, and performance metrics
   - Batches logs and sends to backend
   - Handles offline scenarios
   - Automatic error boundary integration

3. **Log Viewer UI** (`frontend/src/pages/LogViewer.tsx`)
   - Admin-only interface for viewing logs
   - Real-time streaming support
   - Filtering by level, service, and search
   - Download log files

4. **API Endpoints** (`backend/src/routes/logs.js`)
   - `/api/logs/frontend` - Receive frontend logs
   - `/api/logs/recent` - Get recent logs with filters
   - `/api/logs/stats` - Get logging statistics
   - `/api/logs/stream` - SSE endpoint for real-time logs
   - `/api/logs/download/:filename` - Download log files

## Log Structure

Every log entry contains:
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info|warn|error|debug",
  "service": "backend|frontend|database|worker",
  "source": "component-or-file-name",
  "message": "Human readable message",
  "requestId": "unique-request-id",
  "userId": "user-id-if-authenticated",
  "metadata": {
    // Additional context
  }
}
```

## Log Files

All logs are stored in the `logs/` directory:

- **unified.log** - All logs from all services (10MB rotation, 10 files)
- **errors.log** - Error-level logs only (5MB rotation, 5 files)
- **services.log** - Service health and status logs
- **backend.log** - Backend stdout/stderr from startup script
- **frontend.log** - Frontend build output from startup script

## Usage Examples

### Backend Logging

```javascript
// In any backend file
import unifiedLogger from '../services/unifiedLogger.js';

// Basic logging
unifiedLogger.info('User logged in', {
  service: 'backend',
  source: 'auth-controller',
  userId: user.id,
  email: user.email
});

// Error logging with stack trace
unifiedLogger.error('Database query failed', error, {
  service: 'backend',
  source: 'bookmark-service',
  query: 'SELECT * FROM bookmarks',
  userId: req.user.id
});

// Performance logging
const start = Date.now();
// ... do something ...
unifiedLogger.logPerformance('bookmark-import', Date.now() - start, {
  bookmarkCount: 1000,
  userId: req.user.id
});
```

### Frontend Logging

```typescript
// In any React component
import logger from '../services/logger';

// Component logging
logger.info('Component mounted', {
  component: 'BookmarkList',
  props: { userId, collectionId }
});

// Error logging
try {
  await api.createBookmark(data);
} catch (error) {
  logger.error('Failed to create bookmark', error, {
    component: 'BookmarkForm',
    data
  });
}

// User action logging
logger.logUserAction('bookmark-deleted', {
  bookmarkId,
  collectionId
});

// Performance measurement
await logger.measurePerformance('load-bookmarks', async () => {
  return await api.getBookmarks();
});
```

### Database Query Logging

All database queries are automatically logged:
```
[10:30:45.123] [DEBUG] [backend][database] Database query executed
  → query: "SELECT * FROM bookmarks WHERE user_id = $1"
  → params: 1
  → rowCount: 25
  → duration: "45ms"
```

### HTTP Request Logging

All HTTP requests are automatically logged:
```
[10:30:45.123] [INFO] [backend][http-server] GET /api/bookmarks 200
  → method: "GET"
  → url: "/api/bookmarks"
  → statusCode: 200
  → responseTime: "123ms"
  → userId: "user-123"
```

## Real-time Log Viewing

1. Navigate to `/logs` in the admin interface
2. Click "Start Streaming" to see logs in real-time
3. Use filters to focus on specific services or error levels
4. Click on any log entry to see full metadata

## Troubleshooting Guide

### Finding Issues Quickly

1. **Check Recent Errors**
   ```bash
   tail -f logs/errors.log | grep -A 5 -B 5 "pattern"
   ```

2. **Track a Request**
   - Every request has a unique `requestId`
   - Search for this ID to see the complete request flow
   ```bash
   grep "request-id-here" logs/unified.log
   ```

3. **Service-Specific Issues**
   - Filter by service in the log viewer
   - Or use grep: `grep '"service":"frontend"' logs/unified.log`

4. **Performance Issues**
   - Look for "Performance:" entries
   - Check for operations taking >1000ms

### Common Patterns

**Authentication Issues:**
```
grep -E "(auth|login|token)" logs/unified.log
```

**Database Issues:**
```
grep -E "(database|query failed|connection)" logs/unified.log
```

**Frontend Errors:**
```
grep '"service":"frontend"' logs/unified.log | grep '"level":"error"'
```

## Configuration

### Environment Variables

- `LOG_LEVEL` - Minimum log level (debug|info|warn|error)
- `UNIFIED_LOGGING` - Enable unified logging (default: true)
- `LOG_MAX_SIZE` - Max log file size (default: 10MB)
- `LOG_MAX_FILES` - Max number of rotated files (default: 10)

### Startup Script Integration

The `start-services.js` script:
1. Creates log directory
2. Initializes log files for each service
3. Streams service output to both console and log files
4. Shows real-time status with colors and progress bars

## Best Practices

1. **Always Include Context**
   ```javascript
   // Bad
   logger.error('Failed');
   
   // Good
   logger.error('Failed to validate bookmark', error, {
     service: 'backend',
     source: 'validation-service',
     bookmarkId: bookmark.id,
     url: bookmark.url,
     validationType: 'url-check'
   });
   ```

2. **Use Appropriate Log Levels**
   - `error` - Something failed that shouldn't have
   - `warn` - Something concerning but handled
   - `info` - Important business events
   - `debug` - Detailed technical information

3. **Log at Service Boundaries**
   - When receiving HTTP requests
   - Before/after database queries
   - When calling external services
   - When handling user actions

4. **Include Performance Metrics**
   ```javascript
   const start = Date.now();
   const result = await someOperation();
   logger.logPerformance('operation-name', Date.now() - start);
   ```

## Security Considerations

1. **Never Log Sensitive Data**
   - Passwords, tokens, API keys
   - Full credit card numbers
   - Personal identification numbers

2. **Admin-Only Access**
   - Log viewer requires admin privileges
   - Log download requires authentication
   - Real-time streaming uses auth tokens

3. **Log Retention**
   - Logs rotate automatically
   - Old logs are deleted after 10 rotations
   - Consider archiving important logs

## Monitoring Health

The system tracks:
- Service uptime and status
- Error rates by service
- Performance metrics
- User activity patterns

Access the log statistics endpoint to see:
- Total logs by level
- Active services
- Recent error trends
- Log file sizes

## Future Enhancements

1. **Log Search API** - Full-text search across all logs
2. **Alert System** - Notify on error thresholds
3. **Log Export** - Export logs to external services
4. **Custom Dashboards** - Build monitoring dashboards
5. **Log Analytics** - Trend analysis and insights