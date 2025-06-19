# Enterprise-Grade API Design

## Recommended Approach: API Gateway + Microservices

### 1. API Gateway (New, Simple, Rock-Solid)
```
┌─────────────────┐
│   API Gateway   │  <- New, minimal Node.js or Go service
│  (Port 3001)    │     - Authentication only
│                 │     - Request routing
└────────┬────────┘     - Rate limiting
         │              - Health checks
         │
    ┌────┴────┐
    │ Routes  │
    └────┬────┘
         │
┌────────┴────────────────────────────────┐
│                                         │
▼                ▼              ▼         ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Auth     │ │ Bookmark │ │ Import   │ │ A2A Task │
│ Service  │ │ Service  │ │ Service  │ │ Service  │
│ :3010    │ │ :3011    │ │ :3012    │ │ :3013    │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### 2. Service Design Principles

#### Each Service:
- **Single Responsibility**: One domain only
- **Stateless**: No shared memory
- **Database per Service**: Own their data
- **Event-Driven**: Communicate via Redis Pub/Sub
- **Resilient**: Circuit breakers, retries, timeouts

### 3. Technology Choices

#### API Gateway (Choose One):
```go
// Option A: Go with Gin
package main

import (
    "github.com/gin-gonic/gin"
    "github.com/sony/gobreaker"
)

func main() {
    r := gin.New()
    
    // Middleware
    r.Use(gin.Recovery())
    r.Use(RateLimiter())
    r.Use(Authentication())
    
    // Circuit breaker for each service
    authBreaker := gobreaker.NewCircuitBreaker(gobreaker.Settings{
        Name:        "auth-service",
        MaxRequests: 10,
        Interval:    time.Minute,
        Timeout:     30 * time.Second,
    })
    
    // Routes
    r.Any("/api/auth/*path", ProxyWithBreaker(authBreaker, "http://localhost:3010"))
    r.Any("/api/bookmarks/*path", ProxyWithBreaker(bookmarkBreaker, "http://localhost:3011"))
    
    r.Run(":3001")
}
```

```javascript
// Option B: Node.js with Fastify (faster than Express)
const fastify = require('fastify')()
const httpProxy = require('@fastify/http-proxy')
const CircuitBreaker = require('opossum')

// Service registry
const services = {
  auth: { url: 'http://localhost:3010', breaker: new CircuitBreaker(proxyRequest) },
  bookmarks: { url: 'http://localhost:3011', breaker: new CircuitBreaker(proxyRequest) },
  import: { url: 'http://localhost:3012', breaker: new CircuitBreaker(proxyRequest) },
  tasks: { url: 'http://localhost:3013', breaker: new CircuitBreaker(proxyRequest) }
}

// Health endpoint
fastify.get('/health', async () => ({
  status: 'ok',
  services: Object.entries(services).map(([name, service]) => ({
    name,
    circuit: service.breaker.status
  }))
}))

// Dynamic routing
fastify.all('/api/:service/*', async (request, reply) => {
  const { service } = request.params
  const serviceConfig = services[service]
  
  if (!serviceConfig) {
    return reply.code(404).send({ error: 'Service not found' })
  }
  
  return serviceConfig.breaker.fire(request, reply, serviceConfig.url)
})

fastify.listen({ port: 3001 })
```

### 4. Service Implementation Pattern

```javascript
// bookmark-service/index.js
const fastify = require('fastify')()
const { Pool } = require('pg')
const Redis = require('ioredis')

// Isolated database connection
const db = new Pool({
  connectionString: process.env.BOOKMARK_DB_URL,
  max: 10
})

// Redis for caching and events
const redis = new Redis(process.env.REDIS_URL)
const pubsub = new Redis(process.env.REDIS_URL)

// Health check
fastify.get('/health', async () => {
  try {
    await db.query('SELECT 1')
    await redis.ping()
    return { status: 'healthy' }
  } catch (error) {
    throw { statusCode: 503, message: 'Service unhealthy' }
  }
})

// Bookmark endpoints
fastify.get('/bookmarks', async (request) => {
  const { userId } = request.user
  
  // Check cache first
  const cached = await redis.get(`bookmarks:${userId}`)
  if (cached) return JSON.parse(cached)
  
  // Query database
  const result = await db.query(
    'SELECT * FROM bookmarks WHERE user_id = $1',
    [userId]
  )
  
  // Cache for 5 minutes
  await redis.setex(`bookmarks:${userId}`, 300, JSON.stringify(result.rows))
  
  return result.rows
})

// Event publishing
fastify.post('/bookmarks', async (request) => {
  const bookmark = await createBookmark(request.body)
  
  // Publish event for other services
  await pubsub.publish('bookmark:created', JSON.stringify({
    bookmarkId: bookmark.id,
    userId: bookmark.user_id,
    timestamp: Date.now()
  }))
  
  return bookmark
})

fastify.listen({ port: 3011 })
```

### 5. Deployment with Docker Compose

```yaml
version: '3.8'

services:
  gateway:
    build: ./gateway
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 10s
      timeout: 3s
      retries: 3
    restart: unless-stopped
    depends_on:
      auth-service:
        condition: service_healthy
      bookmark-service:
        condition: service_healthy

  auth-service:
    build: ./services/auth
    environment:
      - AUTH_DB_URL=postgresql://auth_user:pass@postgres:5432/auth_db
      - REDIS_URL=redis://redis:6379
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3010/health"]
    restart: unless-stopped
    
  bookmark-service:
    build: ./services/bookmarks
    environment:
      - BOOKMARK_DB_URL=postgresql://bookmark_user:pass@postgres:5432/bookmark_db
      - REDIS_URL=redis://redis:6379
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3011/health"]
    restart: unless-stopped

  # Use separate databases
  postgres:
    image: postgres:16-alpine
    volumes:
      - ./init-scripts:/docker-entrypoint-initdb.d
    environment:
      - POSTGRES_MULTIPLE_DATABASES=auth_db,bookmark_db,import_db,task_db
      
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
```

### 6. Migration Strategy

#### Phase 1: New Gateway (1 week)
1. Create minimal API gateway
2. Proxy all requests to existing monolith
3. Add health checks and monitoring
4. Deploy alongside existing system

#### Phase 2: Extract Services (2-3 weeks)
1. Start with Auth service (most isolated)
2. Then Bookmarks (core functionality)
3. Import service (can run async)
4. A2A tasks (already somewhat separate)

#### Phase 3: Cutover (1 week)
1. Switch frontend to use new gateway
2. Monitor for issues
3. Keep old system running as backup
4. Gradual traffic shift

### 7. Monitoring Stack

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'gateway'
    static_configs:
      - targets: ['gateway:3001']
      
  - job_name: 'services'
    static_configs:
      - targets: 
        - 'auth-service:3010'
        - 'bookmark-service:3011'
        - 'import-service:3012'
        - 'task-service:3013'
```

### 8. Benefits of This Approach

1. **Incremental Migration**: No big bang rewrite
2. **Service Isolation**: One service crash doesn't take down others
3. **Independent Scaling**: Scale only what needs scaling
4. **Technology Freedom**: Each service can use different tech
5. **Simple Gateway**: Minimal code = minimal bugs
6. **Easy Rollback**: Can switch back to monolith instantly
7. **True High Availability**: Multiple instances of each service

### 9. Example Service Communication

```javascript
// Import completes, publishes event
await redis.publish('import:completed', JSON.stringify({
  importId: '123',
  bookmarkIds: [1, 2, 3],
  userId: 'abc'
}))

// Validation service subscribes and processes
redis.subscribe('import:completed', async (message) => {
  const { bookmarkIds } = JSON.parse(message)
  await validateBookmarks(bookmarkIds)
})
```

### 10. Production Checklist

- [ ] Each service has health endpoint
- [ ] Circuit breakers configured
- [ ] Retry policies in place
- [ ] Timeouts on all external calls
- [ ] Structured logging with correlation IDs
- [ ] Metrics exported to Prometheus
- [ ] Alerts configured in Grafana
- [ ] Database connection pooling
- [ ] Redis connection pooling
- [ ] Graceful shutdown handlers
- [ ] Memory limits configured
- [ ] CPU limits configured
- [ ] Horizontal pod autoscaling
- [ ] Database backups automated
- [ ] Disaster recovery tested