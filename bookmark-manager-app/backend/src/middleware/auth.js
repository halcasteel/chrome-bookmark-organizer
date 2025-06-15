import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, email, name, role, two_factor_enabled, two_factor_verified FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
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
      return res.status(403).json({ 
        error: 'Access restricted to @az1.ai email addresses only' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
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