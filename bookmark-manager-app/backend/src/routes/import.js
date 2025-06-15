import express from 'express';
import multer from 'multer';
import importService from '../services/importService.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept HTML and JSON files
    if (file.mimetype === 'text/html' || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error('Only HTML and JSON files are allowed'));
    }
  },
});

/**
 * POST /api/import/upload
 * Import bookmarks from uploaded file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    logInfo('Bookmark import started', {
      userId: req.user.userId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
    });
    
    // Save file temporarily
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `import-${Date.now()}-${req.file.originalname}`);
    await fs.writeFile(tempPath, req.file.buffer);
    
    // Process the import
    const result = await importService.importFromFile(req.user.userId, tempPath);
    
    // Clean up temp file
    await fs.unlink(tempPath);
    
    res.json({
      message: 'Import completed',
      importId: result.importId,
      total: result.total,
      imported: result.imported,
      failed: result.failed,
      duplicates: result.duplicates,
    });
  } catch (error) {
    logError(error, { context: 'POST /api/import/upload' });
    res.status(500).json({ error: 'Failed to import bookmarks' });
  }
});

/**
 * GET /api/import/status/:importId
 * Get import status
 */
router.get('/status/:importId', async (req, res) => {
  try {
    const status = await importService.getImportStatus(req.params.importId);
    
    if (!status) {
      return res.status(404).json({ error: 'Import not found' });
    }
    
    res.json(status);
  } catch (error) {
    logError(error, { context: 'GET /api/import/status/:importId' });
    res.status(500).json({ error: 'Failed to get import status' });
  }
});

/**
 * GET /api/import/history
 * Get import history
 */
router.get('/history', async (req, res) => {
  try {
    const history = await importService.getImportHistory(req.user.userId);
    res.json({ imports: history });
  } catch (error) {
    logError(error, { context: 'GET /api/import/history' });
    res.status(500).json({ error: 'Failed to get import history' });
  }
});

export default router;