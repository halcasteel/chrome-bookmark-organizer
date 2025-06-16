import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Unified Logger - Enhanced winston logger with structured logging
 * 
 * Provides standardized logging across all services with:
 * - Structured logging with service/method context
 * - Consistent error formatting
 * - Request correlation
 * - Performance metrics
 * - Multiple output targets
 */

// Define custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow', 
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston about the colors
winston.addColors(colors);

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service, method, error, stack, ...meta } = info;
    
    // Build the base log message
    let logMessage = `${timestamp} [${level.toUpperCase()}]`;
    
    // Add service context if provided
    if (service) {
      logMessage += ` [${service}`;
      if (method) {
        logMessage += `.${method}`;
      }
      logMessage += ']';
    }
    
    logMessage += ` ${message}`;
    
    // Add metadata if present
    const metaKeys = Object.keys(meta);
    if (metaKeys.length > 0) {
      const metaStr = metaKeys
        .map(key => `${key}=${JSON.stringify(meta[key])}`)
        .join(' ');
      logMessage += ` | ${metaStr}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    return logMessage;
  })
);

// JSON format for file logging
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  customFormat
);

// Create transports
const transports = [
  // Console transport with colored output
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  }),
  
  // File transport for errors only
  new winston.transports.File({
    filename: path.join(__dirname, '../../../logs/error.log'),
    level: 'error',
    format: jsonFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 10,
    tailable: true
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../../logs/combined.log'),
    format: jsonFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 10,
    tailable: true
  }),
  
  // HTTP requests log
  new winston.transports.File({
    filename: path.join(__dirname, '../../../logs/http.log'),
    level: 'http',
    format: jsonFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    tailable: true
  })
];

// Create the main logger instance
const baseLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true
});

/**
 * Unified Logger Class
 * Provides standardized logging methods with consistent structure
 */
class UnifiedLogger {
  constructor() {
    this.logger = baseLogger;
  }

  /**
   * Log info level message
   * @param {string} message - The log message
   * @param {object} context - Additional context data
   */
  info(message, context = {}) {
    this.logger.info(message, {
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log warning level message
   * @param {string} message - The log message
   * @param {object} context - Additional context data
   */
  warn(message, context = {}) {
    this.logger.warn(message, {
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log error level message
   * @param {string} message - The log message
   * @param {object} context - Additional context data including error details
   */
  error(message, context = {}) {
    this.logger.error(message, {
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log debug level message
   * @param {string} message - The log message
   * @param {object} context - Additional context data
   */
  debug(message, context = {}) {
    this.logger.debug(message, {
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log HTTP level message (for request logging)
   * @param {string} message - The log message
   * @param {object} context - Additional context data
   */
  http(message, context = {}) {
    this.logger.http(message, {
      ...context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create a child logger with persistent context
   * @param {object} context - Context to add to all log messages
   * @returns {UnifiedLogger} Child logger instance
   */
  child(context = {}) {
    const childLogger = this.logger.child(context);
    const child = new UnifiedLogger();
    child.logger = childLogger;
    return child;
  }

  /**
   * Start performance timing
   * @param {string} label - Timer label
   * @returns {function} Function to call to end timing
   */
  startTimer(label) {
    const start = process.hrtime.bigint();
    return (context = {}) => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      
      this.info(`Performance: ${label}`, {
        ...context,
        duration: `${duration.toFixed(2)}ms`,
        performanceMetric: true
      });
      
      return duration;
    };
  }

  /**
   * Log database operation
   * @param {string} operation - Database operation type
   * @param {object} context - Operation context
   */
  database(operation, context = {}) {
    this.debug(`Database: ${operation}`, {
      ...context,
      category: 'database'
    });
  }

  /**
   * Log API request/response
   * @param {string} message - Request message
   * @param {object} context - Request context
   */
  request(message, context = {}) {
    this.http(`API: ${message}`, {
      ...context,
      category: 'api'
    });
  }

  /**
   * Log security events
   * @param {string} event - Security event type
   * @param {object} context - Event context
   */
  security(event, context = {}) {
    this.warn(`Security: ${event}`, {
      ...context,
      category: 'security',
      severity: 'high'
    });
  }
}

// Create and export singleton instance
const unifiedLogger = new UnifiedLogger();

// Ensure logs directory exists
import fs from 'fs';
const logsDir = path.join(__dirname, '../../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default unifiedLogger;