import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import unifiedLogger from './services/unifiedLogger.js';
import websocketService from './services/websocketService.js';
import logIngestionService from './services/logIngestionService.js';
import aiLogAnalysisService from './services/aiLogAnalysisService.js';
import agentInitializationService from './services/agentInitializationService.js';
import a2aTaskManager from './services/a2aTaskManager.js';
import browserPool from './services/browserPool.js';

// Import routes
import authRoutes from './routes/auth.js';
import bookmarkRoutes from './routes/bookmarks.js';
import tagRoutes from './routes/tags.js';
import collectionRoutes from './routes/collections.js';
import importRoutes from './routes/import.js';
import importA2ARoutes from './routes/importA2A.js';
import searchRoutes from './routes/search.js';
import statsRoutes from './routes/stats.js';
import orchestratorRoutes from './routes/orchestrator.js';
import adminRoutes from './routes/admin.js';
import validationRoutes from './routes/validation.js';
import logRoutes from './routes/logs.js';
import { testManagementRouter, initializeTestWebSocket } from './routes/testManagement.js';
import agentRoutes, { agentDiscoveryHandler } from './routes/agents.js';

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

// Rate limiting - increased for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // increased to 1000 for development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
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
app.use('/api/import', authenticate, importRoutes); // Old import routes (still active)
app.use('/api/import/a2a', authenticate, importA2ARoutes); // New A2A import routes
app.use('/api/search', authenticate, searchRoutes);
app.use('/api/stats', authenticate, statsRoutes);
app.use('/api/orchestrator', authenticate, orchestratorRoutes);
app.use('/api/admin', authenticate, adminRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/test-management', authenticate, testManagementRouter);

// A2A Agent routes
app.use('/api/agents', authenticate, agentRoutes);

// A2A Discovery endpoint (no auth required for public discovery)
app.get('/.well-known/agent.json', agentDiscoveryHandler);

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

// Initialize Test Management WebSocket
initializeTestWebSocket(httpServer);

// Initialize log ingestion service
logIngestionService.start().then(() => {
  unifiedLogger.info('Log ingestion service started', {
    service: 'backend',
    source: 'logIngestion'
  });
}).catch(err => {
  unifiedLogger.error('Failed to start log ingestion service', {
    service: 'backend',
    source: 'logIngestion',
    error: err.message
  });
});

// Initialize AI log analysis service
aiLogAnalysisService.initialize().then(() => {
  unifiedLogger.info('AI log analysis service started', {
    service: 'backend',
    source: 'aiLogAnalysis'
  });
}).catch(err => {
  unifiedLogger.error('Failed to start AI log analysis service', {
    service: 'backend',
    source: 'aiLogAnalysis',
    error: err.message
  });
});

// Register this service with the logger
unifiedLogger.registerService('backend', {
  port: PORT,
  environment: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '1.0.0'
});

// Initialize A2A system before starting server
async function startServer() {
  try {
    // Initialize A2A Task Manager
    unifiedLogger.info('Initializing A2A Task Manager', {
      service: 'backend',
      source: 'startup'
    });
    
    // Task manager initialization is lightweight - just sets up internal state
    
    // Initialize and register all A2A agents
    unifiedLogger.info('Initializing A2A agents', {
      service: 'backend',
      source: 'startup'
    });
    
    await agentInitializationService.initialize();
    
    unifiedLogger.info('A2A system initialized successfully', {
      service: 'backend',
      source: 'startup',
      agentCount: agentInitializationService.getAgents().size,
      agents: Array.from(agentInitializationService.getAgents().keys())
    });
    
    // Start HTTP server
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
          twoFactor: process.env.ENABLE_2FA !== 'false',
          a2aAgents: true
        },
        a2aAgents: Array.from(agentInitializationService.getAgents().keys())
      });
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to start server', {
      service: 'backend',
      source: 'startup',
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  unifiedLogger.info('SIGTERM signal received: closing HTTP server', {
    service: 'backend',
    source: 'process'
  });
  
  // Shutdown A2A agents first
  try {
    await agentInitializationService.shutdown();
    unifiedLogger.info('A2A agents shutdown complete', {
      service: 'backend',
      source: 'process'
    });
  } catch (error) {
    unifiedLogger.error('Error shutting down A2A agents', {
      service: 'backend',
      source: 'process',
      error: error.message
    });
  }
  
  // Shutdown browser pool
  try {
    await browserPool.shutdown();
    unifiedLogger.info('Browser pool shutdown complete', {
      service: 'backend',
      source: 'process',
      stats: browserPool.getStats()
    });
  } catch (error) {
    unifiedLogger.error('Error shutting down browser pool', {
      service: 'backend',
      source: 'process',
      error: error.message
    });
  }
  
  httpServer.close(() => {
    unifiedLogger.info('HTTP server closed', {
      service: 'backend',
      source: 'process'
    });
    process.exit(0);
  });
});

// Process error handlers are already in unifiedLogger.js