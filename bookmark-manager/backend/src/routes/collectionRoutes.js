import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as collectionController from '../controllers/collectionController.js';

const router = Router();

// All routes require authentication except public collection viewing
router.get('/public/:shareToken', collectionController.getPublicCollection);

// Protected routes
router.use(authenticate);

router.get('/', collectionController.getCollections);
router.post('/',
  [
    body('name').notEmpty().trim().withMessage('Collection name is required'),
    body('description').optional().trim(),
    body('isPublic').optional().isBoolean()
  ],
  collectionController.createCollection
);

router.get('/:id', collectionController.getCollection);
router.put('/:id',
  [
    body('name').optional().notEmpty().trim(),
    body('description').optional().trim(),
    body('isPublic').optional().isBoolean()
  ],
  collectionController.updateCollection
);

router.delete('/:id', collectionController.deleteCollection);

// Bookmark management in collections
router.post('/:id/bookmarks',
  [
    body('bookmarkId').isUUID().withMessage('Valid bookmark ID is required')
  ],
  collectionController.addBookmarkToCollection
);

router.delete('/:id/bookmarks/:bookmarkId', collectionController.removeBookmarkFromCollection);

// Share collection
router.post('/:id/share', collectionController.shareCollection);

export default router;