# Logging Standards for Bookmark Manager Application

## Overview
This document defines the logging standards and best practices for the Bookmark Manager application. All developers must follow these standards to ensure consistent, useful, and searchable logs across the entire application stack.

## Unified Logger Usage

### Import Statement
```javascript
// For service files
import unifiedLogger from './unifiedLogger.js';

// For other files (routes, middleware, agents, workers, etc.)
import unifiedLogger from '../services/unifiedLogger.js';
```

### Never Use Console
- ❌ NEVER use `console.log()`, `console.error()`, `console.warn()`, etc.
- ✅ ALWAYS use `unifiedLogger.info()`, `unifiedLogger.error()`, `unifiedLogger.warn()`, `unifiedLogger.debug()`

## Logging Levels

### Debug
Use for detailed information during development and troubleshooting:
```javascript
unifiedLogger.debug('Method entry', {
  service: 'import',
  source: 'parseBookmarkFile',
  userId,
  filePath,
  parameters: { mode, options }
});
```

### Info
Use for normal application flow and successful operations:
```javascript
unifiedLogger.info('Import completed successfully', {
  service: 'import',
  source: 'importBookmarks',
  userId,
  importId,
  bookmarksImported: count,
  duration: `${Date.now() - startTime}ms`
});
```

### Warn
Use for potentially harmful situations or performance issues:
```javascript
unifiedLogger.warn('Slow query detected', {
  service: 'database',
  source: 'query',
  queryId,
  duration: `${duration}ms`,
  query: query.substring(0, 100)
});
```

### Error
Use for error conditions with full context:
```javascript
unifiedLogger.error('Failed to process bookmark', {
  service: 'validation',
  source: 'validateUrl',
  error: error.message,
  stack: error.stack,
  bookmarkId,
  url,
  userId,
  attempt: retryCount
});
```

## Context Structure

Every log entry MUST include:
1. **service** - The service name (e.g., 'auth', 'import', 'database', 'websocket')
2. **source** - The specific method or function name
3. **Relevant IDs** - userId, bookmarkId, importId, etc.
4. **Operation details** - What was being attempted

### Standard Service Names
- `auth` - Authentication and authorization
- `database` - Database operations
- `import` - Bookmark import operations
- `validation` - URL and bookmark validation
- `websocket` - WebSocket connections and events
- `orchestrator` - Workflow orchestration
- `worker` - Background job processing
- `api` - REST API endpoints
- `middleware` - Express middleware
- `frontend` - Frontend application logs

## Logging Patterns

### Method Entry/Exit
```javascript
async function processBookmarks(userId, bookmarks) {
  const startTime = Date.now();
  const operationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  unifiedLogger.debug('Processing bookmarks', {
    service: 'import',
    source: 'processBookmarks',
    userId,
    operationId,
    bookmarkCount: bookmarks.length
  });
  
  try {
    // ... method logic ...
    
    unifiedLogger.info('Bookmarks processed successfully', {
      service: 'import',
      source: 'processBookmarks',
      userId,
      operationId,
      processed: result.length,
      duration: `${Date.now() - startTime}ms`
    });
    
    return result;
  } catch (error) {
    unifiedLogger.error('Failed to process bookmarks', {
      service: 'import',
      source: 'processBookmarks',
      error: error.message,
      stack: error.stack,
      userId,
      operationId,
      bookmarkCount: bookmarks.length
    });
    throw error;
  }
}
```

### Database Operations
```javascript
// Query logging
unifiedLogger.debug('Executing query', {
  service: 'database',
  source: 'getUserBookmarks',
  queryId: generateId(),
  userId,
  query: sql.substring(0, 100),
  paramCount: params.length
});

// Connection events
unifiedLogger.info('Database connection established', {
  service: 'database',
  source: 'pool-connect',
  database: dbName,
  poolSize: pool.totalCount
});
```

### API Routes
```javascript
router.post('/bookmarks', authenticate, async (req, res) => {
  const requestId = req.id;
  
  unifiedLogger.info('Creating bookmark', {
    service: 'api',
    source: 'POST /bookmarks',
    userId: req.user.id,
    requestId,
    url: req.body.url
  });
  
  try {
    const bookmark = await createBookmark(req.user.id, req.body);
    
    unifiedLogger.info('Bookmark created successfully', {
      service: 'api',
      source: 'POST /bookmarks',
      userId: req.user.id,
      requestId,
      bookmarkId: bookmark.id
    });
    
    res.json(bookmark);
  } catch (error) {
    unifiedLogger.error('Failed to create bookmark', {
      service: 'api',
      source: 'POST /bookmarks',
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      requestId,
      body: req.body
    });
    next(error);
  }
});
```

### WebSocket Events
```javascript
socket.on('subscribe:import', (importId) => {
  const startTime = Date.now();
  
  unifiedLogger.debug('Client subscribing to import', {
    service: 'websocket',
    source: 'subscribe:import',
    userId: socket.userId,
    socketId: socket.id,
    importId
  });
  
  socket.join(`import:${importId}`);
  
  unifiedLogger.info('Client subscribed to import', {
    service: 'websocket',
    source: 'subscribe:import',
    userId: socket.userId,
    importId,
    joinTime: `${Date.now() - startTime}ms`
  });
});
```

### Performance Logging
```javascript
// Log slow operations
if (duration > SLOW_QUERY_THRESHOLD) {
  unifiedLogger.warn('Slow operation detected', {
    service: 'import',
    source: 'parseHtmlFile',
    operationId,
    duration: `${duration}ms`,
    fileSize: `${fileSize} bytes`,
    threshold: SLOW_QUERY_THRESHOLD
  });
}

// Log performance metrics
unifiedLogger.info('Import performance metrics', {
  service: 'import',
  source: 'importComplete',
  importId,
  totalDuration: `${totalTime}ms`,
  bookmarksPerSecond: Math.round(count / (totalTime / 1000)),
  parseTime: `${parseTime}ms`,
  insertTime: `${insertTime}ms`,
  validationTime: `${validationTime}ms`
});
```

## What to Log

### Always Log
1. **Service start/stop** - Application lifecycle events
2. **Authentication events** - Login attempts, successes, failures
3. **Data modifications** - Create, update, delete operations
4. **External API calls** - Requests to OpenAI, validation services
5. **Errors and exceptions** - With full stack traces and context
6. **Performance issues** - Slow queries, timeouts
7. **Security events** - Failed auth, permission denials

### Log with Debug Level
1. **Method entry/exit** - For complex operations
2. **Intermediate steps** - In multi-step processes
3. **Query execution** - SQL queries and parameters
4. **Cache operations** - Redis get/set operations
5. **Message passing** - WebSocket events, queue messages

### Never Log
1. **Passwords** - Even hashed ones
2. **Full auth tokens** - Only log first 20 characters
3. **Sensitive user data** - PII, emails (unless necessary)
4. **Full request bodies** - Truncate large payloads
5. **Environment secrets** - API keys, connection strings

## Log Formatting

### IDs and Identifiers
Always generate unique IDs for operations:
```javascript
const operationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

### Truncating Long Values
```javascript
query: query.length > 200 ? query.substring(0, 200) + '...' : query
```

### Structured Error Logging
```javascript
unifiedLogger.error('Operation failed', {
  service: 'import',
  source: 'processFile',
  error: error.message,
  stack: error.stack,
  errorCode: error.code,
  customData: {
    filePath,
    fileSize,
    userId
  }
});
```

## Log Analysis

### Searching Logs
The unified logger creates structured JSON logs that can be easily searched:

```bash
# Find all errors for a specific user
grep '"userId":"12345"' logs/combined.log | grep '"level":"error"'

# Find all slow queries
grep '"service":"database"' logs/combined.log | grep '"level":"warn"'

# Track a specific operation
grep '"operationId":"1234567890-abc123"' logs/combined.log

# View only errors
tail -f logs/error.log

# View HTTP requests
tail -f logs/http.log
```

### Log Aggregation
Use the log viewer UI at `/logs` (admin only) for real-time log monitoring and filtering.

## Frontend Logging

Frontend logs should be sent to the backend:
```javascript
import { logger } from '../services/logger';

logger.error('Failed to load bookmarks', {
  component: 'BookmarkList',
  error: error.message,
  userId: currentUser.id
});
```

## Testing Logging

When writing tests, use the logger in test mode:
```javascript
process.env.LOG_LEVEL = 'error'; // Only log errors during tests
```

## Monitoring and Alerts

Key patterns to monitor:
1. Error rate increase
2. Authentication failures
3. Slow query frequency
4. WebSocket disconnections
5. Import failures
6. Validation errors

## Compliance

All developers must:
1. Use unifiedLogger exclusively
2. Include proper context in all logs
3. Follow the logging patterns defined above
4. Never log sensitive information
5. Test logging output during development
6. Review logs during code review

## Log Rotation

Logs are automatically rotated:
- `error.log` - 10MB max, 10 files retained (error level only)
- `combined.log` - 10MB max, 10 files retained (all levels)
- `http.log` - 10MB max, 5 files retained (HTTP requests)

## Questions?

For questions about logging standards, contact the team lead or review the unifiedLogger implementation at `/backend/src/services/unifiedLogger.js`.