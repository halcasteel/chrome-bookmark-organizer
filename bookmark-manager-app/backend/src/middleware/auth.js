import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';

export const authenticate = async (req, res, next) => {
  const requestId = req.id || Date.now().toString();
  
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      unifiedLogger.warn('Authentication failed - no token provided', {
        service: 'auth-middleware',
        source: 'authenticate',
        requestId,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Authentication required' });
    }

    unifiedLogger.debug('Attempting to verify JWT token', {
      service: 'auth-middleware',
      source: 'authenticate',
      requestId,
      tokenLength: token.length
    });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, email, name, role, two_factor_enabled, two_factor_verified FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      unifiedLogger.warn('Authentication failed - user not found', {
        service: 'auth-middleware',
        source: 'authenticate',
        requestId,
        userId: decoded.userId
      });
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check if user has 2FA enabled and verified
    // Commented out - 2FA is now optional
    // if (!user.two_factor_enabled || !user.two_factor_verified) {
    //   return res.status(401).json({ 
    //     error: '2FA required',
    //     requires2FA: true 
    //   });
    // }

    // Verify email domain
    if (!user.email.endsWith('@az1.ai')) {
      unifiedLogger.warn('Authentication failed - invalid email domain', {
        service: 'auth-middleware',
        source: 'authenticate',
        requestId,
        email: user.email,
        userId: user.id
      });
      return res.status(403).json({ 
        error: 'Access restricted to @az1.ai email addresses only' 
      });
    }

    unifiedLogger.info('Authentication successful', {
      service: 'auth-middleware',
      source: 'authenticate',
      requestId,
      userId: user.id,
      email: user.email,
      role: user.role
    });

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      unifiedLogger.warn('Authentication failed - invalid token', {
        service: 'auth-middleware',
        source: 'authenticate',
        requestId,
        error: error.message
      });
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      unifiedLogger.warn('Authentication failed - token expired', {
        service: 'auth-middleware',
        source: 'authenticate',
        requestId,
        error: error.message
      });
      return res.status(401).json({ error: 'Token expired' });
    }
    
    unifiedLogger.error('Authentication error', {
      service: 'auth-middleware',
      source: 'authenticate',
      requestId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const requireAz1Email = (req, res, next) => {
  const email = req.body.email || req.user?.email;
  
  if (!email || !email.endsWith('@az1.ai')) {
    return res.status(403).json({ 
      error: 'Access restricted to @az1.ai email addresses only' 
    });
  }
  
  next();
};

export const requireAdmin = (req, res, next) => {
  const requestId = req.id || Date.now().toString();
  
  if (!req.user) {
    unifiedLogger.warn('Admin access denied - no authenticated user', {
      service: 'auth-middleware',
      source: 'requireAdmin',
      requestId,
      path: req.path,
      method: req.method
    });
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin') {
    unifiedLogger.warn('Admin access denied - insufficient privileges', {
      service: 'auth-middleware',
      source: 'requireAdmin',
      requestId,
      userId: req.user.id,
      email: req.user.email,
      role: req.user.role,
      path: req.path
    });
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  unifiedLogger.debug('Admin access granted', {
    service: 'auth-middleware',
    source: 'requireAdmin',
    requestId,
    userId: req.user.id,
    email: req.user.email
  });
  
  next();
};