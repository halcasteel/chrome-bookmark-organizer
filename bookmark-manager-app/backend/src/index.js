import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { rateLimit } from 'express-rate-limit';
import logger, { addRequestId, logHttpRequest } from './utils/logger.js';

// Import routes
import authRoutes from './routes/auth.js';
import bookmarkRoutes from './routes/bookmarks.js';
import tagRoutes from './routes/tags.js';
import collectionRoutes from './routes/collections.js';
import importRoutes from './routes/import.js';
import searchRoutes from './routes/search.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Add request ID to all requests
app.use(addRequestId);

// Log all HTTP requests
app.use(logHttpRequest);

// Global middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
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

// Public share routes (no auth required)
app.get('/api/public/collections/:shareToken', async (req, res) => {
  // Handle public collection viewing
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'Connected' : 'Not configured',
    nodeVersion: process.version,
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});