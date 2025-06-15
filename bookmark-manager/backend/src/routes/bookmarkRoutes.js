import { Router } from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as bookmarkController from '../controllers/bookmarkController.js';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// All routes require authentication
router.use(authenticate);

// Bookmark CRUD operations
router.get('/', bookmarkController.getBookmarks);

router.post('/',
  [
    body('url').isURL().withMessage('Invalid URL'),
    body('title').notEmpty().trim().withMessage('Title is required'),
    body('description').optional().trim(),
    body('tags').optional().isArray().withMessage('Tags must be an array')
  ],
  bookmarkController.createBookmark
);

router.put('/:id',
  [
    body('title').optional().notEmpty().trim(),
    body('description').optional().trim(),
    body('tags').optional().isArray()
  ],
  bookmarkController.updateBookmark
);

router.delete('/:id', bookmarkController.deleteBookmark);

// Search and import
router.get('/search', bookmarkController.searchBookmarks);
router.post('/import', upload.single('file'), bookmarkController.importBookmarks);
router.get('/import-history', bookmarkController.getImportHistory);

// Duplicate detection
router.get('/duplicates', bookmarkController.findDuplicates);

export default router;