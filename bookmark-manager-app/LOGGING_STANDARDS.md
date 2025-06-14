# Logging Standards and Guidelines

## Overview
This document outlines the logging standards and best practices for the Bookmark Manager application.

## Log Levels

### Error (0)
- Use for unrecoverable errors that require immediate attention
- Include stack traces and context
- Examples: Database connection failures, uncaught exceptions, critical API failures

### Warn (1)
- Use for recoverable errors or concerning situations
- Include relevant context for debugging
- Examples: Failed bookmark validations, rate limit warnings, deprecated API usage

### Info (2)
- Use for important application events
- Keep messages concise and meaningful
- Examples: Server startup, user login, bookmark import completion

### HTTP (3)
- Automatic logging of all HTTP requests
- Includes method, URL, status, duration, user ID
- Handled by middleware

### Debug (4)
- Use for detailed debugging information
- Only visible in development mode
- Examples: Database queries, API responses, validation steps

## Logging Format

All logs follow a structured JSON format:
```json
{
  "timestamp": "2025-06-14 10:30:45:123",
  "level": "info",
  "message": "Bookmark import completed",
  "requestId": "abc123",
  "userId": "user-uuid",
  "context": {
    "importId": "import-uuid",
    "total": 1000,
    "processed": 950,
    "failed": 50
  }
}
```

## Implementation Guidelines

### 1. Always Use Structured Logging
```javascript
// Good
logInfo('Bookmark validated', {
  bookmarkId,
  url,
  statusCode,
  loadTime
});

// Bad
console.log(`Bookmark ${bookmarkId} validated with status ${statusCode}`);
```

### 2. Include Context
```javascript
// Good
logError(error, {
  context: 'BookmarkProcessor.validateBookmark',
  bookmarkId,
  url,
  userId
});

// Bad
logError(error.message);
```

### 3. Use Appropriate Log Levels
```javascript
// Error: Critical failures
logError(new Error('Database connection failed'), {
  context: 'Database.connect',
  host: dbConfig.host
});

// Warn: Concerning but recoverable
logWarn('Bookmark validation failed', {
  url,
  reason: 'HTTP 404'
});

// Info: Important events
logInfo('Import completed', {
  importId,
  duration: Date.now() - startTime
});

// Debug: Development details
logDebug('SQL query executed', {
  query,
  params,
  duration
});
```

### 4. Request Context
All logs within a request should include the request ID:
```javascript
req.log.info('Processing bookmark', { bookmarkId });
```

### 5. Error Handling
Always log errors with full context:
```javascript
try {
  await processBookmark(bookmark);
} catch (error) {
  logError(error, {
    context: 'BookmarkProcessor.process',
    bookmark,
    stage: 'validation'
  });
  throw error; // Re-throw if needed
}
```

## Log Storage

### Development
- Console output with colors
- Combined log file: `logs/combined.log`
- Error log file: `logs/error.log`
- Max file size: 5MB with rotation

### Production
- Structured JSON to stdout (for Cloud Run)
- Cloud Logging integration
- Log retention: 30 days
- Error alerts configured

## Performance Considerations

1. **Avoid Logging in Loops**
   ```javascript
   // Bad
   for (const item of items) {
     logInfo('Processing item', { item });
   }
   
   // Good
   logInfo('Processing batch', { count: items.length });
   // Process items
   logInfo('Batch complete', { processed: items.length });
   ```

2. **Use Debug Logs Sparingly**
   - Debug logs are only enabled in development
   - Avoid expensive operations in debug logs

3. **Sanitize Sensitive Data**
   ```javascript
   logInfo('User login', {
     email: user.email,
     // Never log passwords, tokens, or secrets
   });
   ```

## Monitoring and Alerts

### Critical Alerts (Error Level)
- Database connection failures
- Authentication service failures
- Unhandled exceptions

### Warning Alerts
- High error rates (> 5% of requests)
- Slow response times (> 3 seconds)
- Failed bookmark imports

### Info Metrics
- Request count by endpoint
- Average response time
- Active users
- Bookmark import statistics

## Examples

### API Endpoint
```javascript
router.post('/bookmarks', async (req, res) => {
  const startTime = Date.now();
  
  try {
    req.log.info('Creating bookmark', {
      url: req.body.url,
      userId: req.user.id
    });
    
    const bookmark = await createBookmark(req.body, req.user.id);
    
    req.log.info('Bookmark created', {
      bookmarkId: bookmark.id,
      duration: Date.now() - startTime
    });
    
    res.json(bookmark);
  } catch (error) {
    req.log.error('Failed to create bookmark', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});
```

### Service Method
```javascript
async validateBookmark(bookmark) {
  logDebug('Starting validation', { url: bookmark.url });
  
  try {
    const result = await puppeteer.validate(bookmark.url);
    
    if (result.valid) {
      logInfo('Bookmark valid', {
        url: bookmark.url,
        statusCode: result.statusCode
      });
    } else {
      logWarn('Bookmark invalid', {
        url: bookmark.url,
        reason: result.error
      });
    }
    
    return result;
  } catch (error) {
    logError(error, {
      context: 'BookmarkValidator.validate',
      url: bookmark.url
    });
    throw error;
  }
}
```

## Testing Logs

When writing tests, use log level ENV variable:
```javascript
// In test setup
process.env.LOG_LEVEL = 'error'; // Only show errors in tests
```

## Troubleshooting Guide

### Common Issues

1. **Missing Request ID**
   - Ensure `addRequestId` middleware is added before routes
   - Use `req.log` instead of direct logger

2. **Large Log Files**
   - Check rotation settings
   - Increase max files or decrease max size
   - Clean up old logs regularly

3. **Performance Impact**
   - Reduce debug logging in production
   - Use async logging for high-volume scenarios
   - Batch log writes when possible