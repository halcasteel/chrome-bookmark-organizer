import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/authController.js';

const router = Router();

// Public routes
router.post('/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
    body('username').isLength({ min: 3, max: 30 }).trim()
      .withMessage('Username must be between 3 and 30 characters'),
    body('password').isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
  ],
  authController.register
);

router.post('/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  authController.login
);

// Protected routes
router.get('/me', authenticate, authController.getMe);
router.put('/profile', authenticate, authController.updateProfile);

export default router;