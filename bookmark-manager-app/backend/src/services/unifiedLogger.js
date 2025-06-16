import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { EventEmitter } from 'events';
import { WebSocketServer } from 'ws';

// Safe JSON stringifier that handles circular references
function safeStringify(obj, indent = 2) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
    }
    // Limit string length to prevent huge logs
    if (typeof value === 'string' && value.length > 1000) {
      return value.substring(0, 1000) + '... [truncated]';
    }
    return value;
  }, indent);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Unified Logger Service - Central logging for entire application stack
// ============================================================================

class UnifiedLoggerService extends EventEmitter {
  constructor() {
    super();
    this.logDir = path.join(__dirname, '../../../logs');
    this.ensureLogDirectory();
    
    // Create the main unified logger
    this.logger = this.createUnifiedLogger();
    
    // Track active services and their health
    this.services = new Map();
    
    // WebSocket for real-time log streaming
    this.wss = null;
    
    // Start log rotation
    this.startLogRotation();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  createUnifiedLogger() {
    // Custom format that includes all context
    const unifiedFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'service'] }),
      winston.format.json()
    );

    // Pretty print for console with safer serialization
    const consoleFormat = winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
      winston.format.colorize({ all: true }),
      winston.format.printf(({ timestamp, level, service, source, message, metadata }) => {
        try {
          const serviceName = service ? `[${service}]` : '';
          const sourceName = source ? `[${source}]` : '';
          
          // Safer metadata serialization using our safeStringify function
          let meta = '';
          if (metadata && Object.keys(metadata).length) {
            try {
              // Use safeStringify to handle circular references
              const safeMetadata = JSON.parse(safeStringify(metadata));
              meta = '\n  ' + safeStringify(safeMetadata, 2).split('\n').join('\n  ');
            } catch (e) {
              meta = '\n  [Metadata serialization error]';
            }
          }
          
          return `${timestamp} ${level} ${serviceName}${sourceName} ${message}${meta}`;
        } catch (error) {
          // Fallback if formatting fails
          return `${timestamp} ${level} ${message} [Format error: ${error.message}]`;
        }
      })
    );

    return winston.createLogger({
      level: process.env.LOG_LEVEL || 'debug',
      format: unifiedFormat,
      defaultMeta: { 
        environment: process.env.NODE_ENV || 'development',
        hostname: process.env.HOSTNAME || 'localhost'
      },
      transports: [
        // Unified log file - everything goes here
        new winston.transports.File({
          filename: path.join(this.logDir, 'unified.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 10,
          tailable: true
        }),
        
        // Error-only file for quick error scanning
        new winston.transports.File({
          filename: path.join(this.logDir, 'errors.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        
        // Service-specific logs
        new winston.transports.File({
          filename: path.join(this.logDir, 'services.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        
        // Console output with pretty formatting
        new winston.transports.Console({
          format: consoleFormat
        })
      ]
    });
  }

  // ============================================================================
  // Service Registration and Health Tracking
  // ============================================================================

  registerService(name, metadata = {}) {
    this.services.set(name, {
      name,
      startedAt: new Date(),
      status: 'starting',
      lastHeartbeat: new Date(),
      metadata
    });
    
    this.log('info', `Service registered: ${name}`, {
      service: 'logger',
      source: 'service-manager',
      serviceInfo: metadata
    });
  }

  updateServiceStatus(name, status, details = {}) {
    const service = this.services.get(name);
    if (service) {
      service.status = status;
      service.lastHeartbeat = new Date();
      Object.assign(service, details);
    }
  }

  // ============================================================================
  // Core Logging Methods with Source Tracking
  // ============================================================================

  log(level, message, context = {}) {
    const logEntry = {
      level,
      message,
      service: context.service || 'unknown',
      source: context.source || 'unknown',
      timestamp: new Date().toISOString(),
      ...context
    };

    // Log to Winston
    this.logger.log(level, message, logEntry);
    
    // Emit for real-time streaming
    this.emit('log', logEntry);
    
    // Stream via WebSocket if connected
    if (this.wss) {
      this.broadcastLog(logEntry);
    }
  }

  // Convenience methods with automatic source detection
  error(message, error, context = {}) {
    const errorContext = {
      ...context,
      error: {
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
        type: error?.constructor?.name
      },
      stackTrace: this.getStackTrace()
    };
    
    this.log('error', message, errorContext);
  }

  warn(message, context = {}) {
    this.log('warn', message, { ...context, stackTrace: this.getStackTrace() });
  }

  info(message, context = {}) {
    this.log('info', message, context);
  }

  debug(message, context = {}) {
    this.log('debug', message, context);
  }

  // ============================================================================
  // Specialized Logging Methods
  // ============================================================================

  // HTTP Request logging
  logHttpRequest(req, res, responseTime) {
    const context = {
      service: 'backend',
      source: 'http-server',
      request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.id
      },
      response: {
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`
      },
      user: req.user ? { id: req.user.id, email: req.user.email } : null
    };
    
    const level = res.statusCode >= 500 ? 'error' : 
                  res.statusCode >= 400 ? 'warn' : 'info';
    
    this.log(level, `${req.method} ${req.originalUrl} ${res.statusCode}`, context);
  }

  // Database query logging
  logDatabaseQuery(query, params, result, duration) {
    const context = {
      service: 'backend',
      source: 'database',
      database: {
        query: query.substring(0, 200), // Truncate long queries
        params: params?.length || 0,
        rowCount: result?.rowCount || 0,
        duration: `${duration}ms`
      }
    };
    
    this.log('debug', 'Database query executed', context);
  }

  // Worker/Queue logging
  logJobExecution(jobType, jobId, status, details = {}) {
    const context = {
      service: 'backend',
      source: `worker-${jobType}`,
      job: {
        id: jobId,
        type: jobType,
        status,
        ...details
      }
    };
    
    const level = status === 'failed' ? 'error' : 
                  status === 'completed' ? 'info' : 'debug';
    
    this.log(level, `Job ${status}: ${jobType}`, context);
  }

  // Frontend logging (received via API)
  logFrontendEvent(type, message, context = {}) {
    const frontendContext = {
      service: 'frontend',
      source: context.component || 'unknown',
      browser: context.userAgent,
      url: context.url,
      ...context
    };
    
    const level = type === 'error' ? 'error' : 
                  type === 'warning' ? 'warn' : 'info';
    
    this.log(level, message, frontendContext);
  }

  // Performance logging
  logPerformance(operation, duration, context = {}) {
    const perfContext = {
      service: context.service || 'backend',
      source: 'performance',
      performance: {
        operation,
        duration: `${duration}ms`,
        slow: duration > 1000
      },
      ...context
    };
    
    const level = duration > 5000 ? 'warn' : 'debug';
    this.log(level, `Performance: ${operation}`, perfContext);
  }

  // ============================================================================
  // Real-time Log Streaming
  // ============================================================================

  startWebSocketServer(server) {
    this.wss = new WebSocketServer({ server, path: '/logs' });
    
    this.wss.on('connection', (ws) => {
      this.log('info', 'Log viewer connected', {
        service: 'logger',
        source: 'websocket'
      });
      
      // Send recent logs on connection
      this.sendRecentLogs(ws);
      
      ws.on('close', () => {
        this.log('info', 'Log viewer disconnected', {
          service: 'logger',
          source: 'websocket'
        });
      });
    });
  }

  broadcastLog(logEntry) {
    if (!this.wss) return;
    
    const message = JSON.stringify(logEntry);
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  async sendRecentLogs(ws) {
    // Read last 100 lines from unified log
    try {
      const logFile = path.join(this.logDir, 'unified.log');
      const logs = await this.tailFile(logFile, 100);
      
      logs.forEach(log => {
        if (ws.readyState === 1) {
          ws.send(log);
        }
      });
    } catch (error) {
      this.error('Failed to send recent logs', error, {
        service: 'logger',
        source: 'websocket'
      });
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getStackTrace() {
    const stack = new Error().stack;
    const lines = stack.split('\n').slice(3, 6); // Skip logger frames
    return lines.map(line => line.trim()).filter(line => line);
  }

  async tailFile(filepath, lines) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filepath, { encoding: 'utf8' });
      const chunks = [];
      
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        const content = chunks.join('');
        const allLines = content.trim().split('\n');
        const lastLines = allLines.slice(-lines);
        resolve(lastLines);
      });
      stream.on('error', reject);
    });
  }

  startLogRotation() {
    // Daily log rotation check
    setInterval(() => {
      this.log('info', 'Log rotation check', {
        service: 'logger',
        source: 'rotation',
        stats: this.getLogStats()
      });
    }, 24 * 60 * 60 * 1000);
  }

  getLogStats() {
    const stats = {};
    const logFiles = ['unified.log', 'errors.log', 'services.log'];
    
    logFiles.forEach(file => {
      try {
        const filepath = path.join(this.logDir, file);
        const stat = fs.statSync(filepath);
        stats[file] = {
          size: `${(stat.size / 1024 / 1024).toFixed(2)}MB`,
          modified: stat.mtime
        };
      } catch (error) {
        stats[file] = { error: 'File not found' };
      }
    });
    
    return stats;
  }

  // ============================================================================
  // Express Middleware
  // ============================================================================

  expressMiddleware() {
    return (req, res, next) => {
      // Add request ID
      req.id = req.headers['x-request-id'] || 
               `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Track request start time
      req._startTime = Date.now();
      
      // Log request on response finish
      const originalEnd = res.end;
      res.end = (...args) => {
        res.end = originalEnd;
        res.end(...args);
        
        const responseTime = Date.now() - req._startTime;
        this.logHttpRequest(req, res, responseTime);
      };
      
      // Add logger to request for use in routes
      req.logger = {
        error: (msg, error) => this.error(msg, error, {
          service: 'backend',
          source: req.route?.path || 'unknown',
          requestId: req.id
        }),
        warn: (msg, ctx) => this.warn(msg, {
          service: 'backend',
          source: req.route?.path || 'unknown',
          requestId: req.id,
          ...ctx
        }),
        info: (msg, ctx) => this.info(msg, {
          service: 'backend',
          source: req.route?.path || 'unknown',
          requestId: req.id,
          ...ctx
        }),
        debug: (msg, ctx) => this.debug(msg, {
          service: 'backend',
          source: req.route?.path || 'unknown',
          requestId: req.id,
          ...ctx
        })
      };
      
      next();
    };
  }
}

// Create singleton instance
const unifiedLogger = new UnifiedLoggerService();

// ============================================================================
// Database Query Logger
// ============================================================================

export function createDatabaseLogger(pool) {
  const originalQuery = pool.query.bind(pool);
  
  pool.query = async (...args) => {
    const start = Date.now();
    const query = args[0];
    const params = args[1];
    
    try {
      const result = await originalQuery(...args);
      const duration = Date.now() - start;
      
      unifiedLogger.logDatabaseQuery(query, params, result, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      unifiedLogger.error('Database query failed', error, {
        service: 'backend',
        source: 'database',
        query: query.substring(0, 200),
        duration: `${duration}ms`
      });
      throw error;
    }
  };
  
  return pool;
}

// ============================================================================
// Frontend Logger Endpoint
// ============================================================================

export function createFrontendLoggerEndpoint() {
  return (req, res) => {
    const { type, message, context } = req.body;
    
    unifiedLogger.logFrontendEvent(type, message, {
      ...context,
      userAgent: req.get('user-agent'),
      ip: req.ip,
      userId: req.user?.id
    });
    
    res.json({ success: true });
  };
}

// ============================================================================
// Process Logger
// ============================================================================

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  unifiedLogger.error('Uncaught Exception', error, {
    service: 'backend',
    source: 'process',
    fatal: true
  });
  process.exit(1);
});

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  unifiedLogger.error('Unhandled Promise Rejection', reason, {
    service: 'backend',
    source: 'process',
    promise: promise.toString()
  });
});

// Log process exit
process.on('exit', (code) => {
  unifiedLogger.info(`Process exiting with code ${code}`, {
    service: 'backend',
    source: 'process',
    code
  });
});

export default unifiedLogger;