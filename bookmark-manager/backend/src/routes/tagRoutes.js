import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as tagController from '../controllers/tagController.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', tagController.getTags);
router.post('/',
  [
    body('name').notEmpty().trim().withMessage('Tag name is required'),
    body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Invalid color format')
  ],
  tagController.createTag
);

router.put('/:id',
  [
    body('name').optional().notEmpty().trim(),
    body('color').optional().matches(/^#[0-9A-F]{6}$/i)
  ],
  tagController.updateTag
);

router.delete('/:id', tagController.deleteTag);

// Get bookmarks by tag
router.get('/:id/bookmarks', tagController.getBookmarksByTag);

export default router;