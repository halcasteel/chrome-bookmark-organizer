import unifiedLogger from '../services/unifiedLogger.js';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const errorHandler = (err, req, res, next) => {
  unifiedLogger.info('Error handler middleware invoked', {
    service: 'middleware',
    method: 'errorHandler',
    url: req.originalUrl,
    method: req.method,
    errorName: err.name,
    statusCode: err.statusCode
  });
  
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  
  // Log the error
  unifiedLogger.error('Request error occurred', {
    service: 'middleware',
    method: 'errorHandler',
    url: req.originalUrl,
    httpMethod: req.method,
    ip: req.ip,
    userId: req.user?.userId,
    statusCode,
    errorName: err.name,
    errorMessage: err.message,
    error: err.message,
    stack: err.stack
  });
  
  // Specific error handling
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.code === '23505') { // PostgreSQL unique violation
    statusCode = 409;
    message = 'Resource already exists';
  } else if (err.code === '23503') { // PostgreSQL foreign key violation
    statusCode = 400;
    message = 'Invalid reference';
  }
  
  // Send error response
  const errorResponse = {
    error: {
      message,
      status: statusCode,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err,
      }),
    },
    timestamp: new Date().toISOString(),
  };
  
  unifiedLogger.info('Sending error response', {
    service: 'middleware',
    method: 'errorHandler',
    statusCode,
    message,
    url: req.originalUrl
  });
  
  res.status(statusCode).json(errorResponse);
};

/**
 * Handle 404 errors
 */
export const notFoundHandler = (req, res, next) => {
  unifiedLogger.warn('Route not found', {
    service: 'middleware',
    method: 'notFoundHandler',
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

/**
 * Async error wrapper to catch errors in async route handlers
 * @param {Function} fn - Async function
 * @returns {Function} Express middleware function
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((error) => {
    unifiedLogger.error('Async handler caught error', {
      service: 'middleware',
      method: 'asyncHandler',
      url: req.originalUrl,
      httpMethod: req.method,
      error: error.message,
      stack: error.stack
    });
    next(error);
  });
};