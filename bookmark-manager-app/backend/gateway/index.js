import express from 'express';
import httpProxy from 'http-proxy-middleware';
import CircuitBreaker from 'opossum';
import cors from 'cors';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Simple, minimal gateway that just works
const app = express();
const PORT = process.env.GATEWAY_PORT || 3001;

// Rate limiter - prevent abuse
const rateLimiter = new RateLimiterMemory({
  points: 100, // requests
  duration: 60, // per minute
});

// Service registry - where to route requests
const services = {
  auth: {
    url: process.env.AUTH_SERVICE_URL || 'http://localhost:3010',
    timeout: 5000,
  },
  bookmarks: {
    url: process.env.BOOKMARK_SERVICE_URL || 'http://localhost:3011',
    timeout: 10000,
  },
  import: {
    url: process.env.IMPORT_SERVICE_URL || 'http://localhost:3012',
    timeout: 30000, // imports can take longer
  },
  tasks: {
    url: process.env.TASK_SERVICE_URL || 'http://localhost:3013',
    timeout: 10000,
  },
};

// Circuit breakers for each service
const breakers = {};
Object.keys(services).forEach(name => {
  breakers[name] = new CircuitBreaker(proxyRequest, {
    timeout: services[name].timeout,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  });
  
  // Circuit breaker events
  breakers[name].on('open', () => {
    console.error(`Circuit breaker OPEN for ${name} service`);
  });
  
  breakers[name].on('halfOpen', () => {
    console.log(`Circuit breaker HALF-OPEN for ${name} service`);
  });
});

// Proxy function wrapped in circuit breaker
async function proxyRequest(req, res, service) {
  const { createProxyMiddleware } = await import('http-proxy-middleware');
  
  const proxy = createProxyMiddleware({
    target: service.url,
    changeOrigin: true,
    timeout: service.timeout,
    proxyTimeout: service.timeout,
    onError: (err, req, res) => {
      console.error(`Proxy error for ${service.url}:`, err.message);
      res.status(502).json({
        error: 'Service temporarily unavailable',
        service: service.url,
      });
    },
  });
  
  return new Promise((resolve, reject) => {
    proxy(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check - gateway itself
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {},
  };
  
  // Check each circuit breaker
  Object.keys(breakers).forEach(name => {
    health.services[name] = {
      state: breakers[name].opened ? 'open' : 'closed',
      stats: breakers[name].stats,
    };
  });
  
  res.json(health);
});

// Rate limiting middleware
app.use(async (req, res, next) => {
  try {
    const key = req.ip;
    await rateLimiter.consume(key);
    next();
  } catch (rateLimiterRes) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.round(rateLimiterRes.msBeforeNext / 1000) || 60,
    });
  }
});

// Main routing - extract service name from path
app.use('/api/:service/*', async (req, res) => {
  const { service } = req.params;
  const serviceConfig = services[service];
  
  if (!serviceConfig) {
    return res.status(404).json({
      error: 'Service not found',
      available: Object.keys(services),
    });
  }
  
  const breaker = breakers[service];
  
  try {
    // Circuit breaker handles the request
    await breaker.fire(req, res, serviceConfig);
  } catch (error) {
    if (breaker.opened) {
      res.status(503).json({
        error: 'Service circuit breaker is OPEN',
        service,
        retryAfter: 30,
      });
    } else {
      res.status(502).json({
        error: 'Service error',
        service,
      });
    }
  }
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
  console.log('Registered services:', Object.keys(services));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit - let the process manager restart if needed
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the process manager restart if needed
});

export default app;