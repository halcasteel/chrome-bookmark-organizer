import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query } from '../db/index.js';
import { requireAz1Email } from '../middleware/auth.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required().regex(/@az1\.ai$/),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(100).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  twoFactorCode: Joi.string().length(6).optional(),
});

// Register new user
router.post('/register', requireAz1Email, async (req, res) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, name } = value;

    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate 2FA secret
    const secret = speakeasy.generateSecret({
      name: `Bookmarks Manager (${email})`,
      issuer: 'AZ1.AI',
    });

    // Create user
    const result = await query(
      `INSERT INTO users (email, password_hash, name, two_factor_secret, two_factor_enabled, created_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) 
       RETURNING id, email, name`,
      [email, passwordHash, name, secret.base32, false]
    );

    const user = result.rows[0];

    // Generate QR code for 2FA setup
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(201).json({
      message: 'User registered successfully. Please set up 2FA to continue.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      twoFactorSetup: {
        secret: secret.base32,
        qrCode: qrCodeUrl,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Enable 2FA
router.post('/enable-2fa', requireAz1Email, async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;

    // Get user
    const userResult = await query(
      'SELECT id, password_hash, two_factor_secret FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify 2FA code
    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: twoFactorCode,
      window: 2,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid 2FA code' });
    }

    // Enable 2FA
    await query(
      'UPDATE users SET two_factor_enabled = true, two_factor_verified = true WHERE id = $1',
      [user.id]
    );

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    console.error('2FA enable error:', error);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, twoFactorCode } = value;
    
    // Ensure twoFactorCode is trimmed if provided
    const trimmedTwoFactorCode = twoFactorCode ? twoFactorCode.trim() : twoFactorCode;

    // Check email domain
    if (!email.endsWith('@az1.ai')) {
      return res.status(403).json({ 
        error: 'Access restricted to @az1.ai email addresses only' 
      });
    }

    // Get user
    const userResult = await query(
      `SELECT id, email, name, role, password_hash, two_factor_enabled, 
              two_factor_secret, two_factor_verified 
       FROM users WHERE email = $1`,
      [email]
    );


    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if 2FA is enabled for this user
    if (user.two_factor_enabled) {
      // If 2FA is enabled, verify the code
      if (!trimmedTwoFactorCode) {
        return res.status(400).json({ 
          error: '2FA code required',
          requires2FA: true 
        });
      }

      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: trimmedTwoFactorCode,
        window: 2,
      });

      if (!verified) {
        return res.status(401).json({ error: 'Invalid 2FA code' });
      }

      // Update last login with 2FA verified
      await query(
        'UPDATE users SET two_factor_verified = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
    } else {
      // No 2FA required, just update last login
      await query(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        role: user.role,
        twoFactorVerified: true 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await query(
      'SELECT id, email, name, role, two_factor_enabled FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Generate new 2FA recovery codes
router.post('/recovery-codes', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Generate 10 recovery codes
    const recoveryCodes = Array.from({ length: 10 }, () => 
      speakeasy.generateSecret({ length: 8 }).base32.toLowerCase()
    );

    // Hash and store recovery codes
    const hashedCodes = await Promise.all(
      recoveryCodes.map(code => bcrypt.hash(code, 10))
    );

    await query(
      'UPDATE users SET recovery_codes = $1 WHERE id = $2',
      [JSON.stringify(hashedCodes), decoded.userId]
    );

    res.json({ 
      recoveryCodes,
      message: 'Save these recovery codes in a safe place. Each code can only be used once.' 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate recovery codes' });
  }
});

export default router;