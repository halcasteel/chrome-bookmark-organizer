import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import unifiedLogger from './services/unifiedLogger.js';
import websocketService from './services/websocketService.js';

// Import routes
import authRoutes from './routes/auth.js';
import bookmarkRoutes from './routes/bookmarks.js';
import tagRoutes from './routes/tags.js';
import collectionRoutes from './routes/collections.js';
import importRoutes from './routes/import.js';
import searchRoutes from './routes/search.js';
import statsRoutes from './routes/stats.js';
import orchestratorRoutes from './routes/orchestrator.js';
import adminRoutes from './routes/admin.js';
import validationRoutes from './routes/validation.js';
import logRoutes from './routes/logs.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Add unified logging middleware
app.use(unifiedLogger.expressMiddleware());

// Global middleware
app.use(helmet());
app.use(compression());

// Configure CORS with multiple origins support
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:80'];
    
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      unifiedLogger.warn('CORS request blocked', { service: 'backend', source: 'cors', origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/bookmarks', authenticate, bookmarkRoutes);
app.use('/api/tags', authenticate, tagRoutes);
app.use('/api/collections', authenticate, collectionRoutes);
app.use('/api/import', authenticate, importRoutes);
app.use('/api/search', authenticate, searchRoutes);
app.use('/api/stats', authenticate, statsRoutes);
app.use('/api/orchestrator', authenticate, orchestratorRoutes);
app.use('/api/admin', authenticate, adminRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/logs', logRoutes);

// Public share routes (no auth required)
app.get('/api/public/collections/:shareToken', async (req, res) => {
  // Handle public collection viewing
});

// Error handling
app.use(errorHandler);

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket service
websocketService.initialize(httpServer);

// Initialize unified logger WebSocket for real-time log streaming
unifiedLogger.startWebSocketServer(httpServer);

// Register this service with the logger
unifiedLogger.registerService('backend', {
  port: PORT,
  environment: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '1.0.0'
});

// Start server
httpServer.listen(PORT, () => {
  unifiedLogger.info('Backend server started', {
    service: 'backend',
    source: 'server',
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'Connected' : 'Not configured',
    redis: process.env.REDIS_URL ? 'Connected' : 'Not configured',
    nodeVersion: process.version,
    features: {
      ai: !!process.env.OPENAI_API_KEY,
      websockets: true,
      twoFactor: process.env.ENABLE_2FA !== 'false'
    }
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  unifiedLogger.info('SIGTERM signal received: closing HTTP server', {
    service: 'backend',
    source: 'process'
  });
  httpServer.close(() => {
    unifiedLogger.info('HTTP server closed', {
      service: 'backend',
      source: 'process'
    });
    process.exit(0);
  });
});

// Process error handlers are already in unifiedLogger.js