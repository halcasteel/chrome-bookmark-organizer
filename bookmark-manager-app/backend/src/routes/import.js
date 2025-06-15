import express from 'express';
import multer from 'multer';
import importService from '../services/importService.js';
import importServiceAsync from '../services/importServiceAsync.js';
import streamingImportService from '../services/streamingImportService.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for large bookmark files
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
      userId: req.user.id,
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
    const result = await importService.importFromFile(req.user.id, tempPath);
    
    // Clean up temp file
    await fs.unlink(tempPath);
    
    res.json({
      message: 'Import completed',
      importId: result.importId,
      total: result.total,
      new: result.imported,
      updated: 0,
      failed: result.failed,
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
    const history = await importService.getImportHistory(req.user.id);
    res.json({ imports: history });
  } catch (error) {
    logError(error, { context: 'GET /api/import/history' });
    res.status(500).json({ error: 'Failed to get import history' });
  }
});

/**
 * POST /api/import/upload-async
 * Import bookmarks asynchronously - fast response
 */
router.post('/upload-async', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    logInfo('Async bookmark import started', {
      userId: req.user.id,
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
    
    // Use async import service
    const result = await importServiceAsync.importFromFile(req.user.id, tempPath);
    
    // Clean up temp file
    await fs.unlink(tempPath);
    
    res.json(result);
  } catch (error) {
    logError(error, { context: 'POST /api/import/upload-async' });
    res.status(500).json({ error: 'Failed to import bookmarks' });
  }
});

/**
 * GET /api/import/progress/:importId
 * Get detailed import progress including validation and enrichment
 */
router.get('/progress/:importId', async (req, res) => {
  try {
    const progress = await importServiceAsync.getImportProgress(req.params.importId);
    
    if (!progress) {
      return res.status(404).json({ error: 'Import not found' });
    }
    
    res.json(progress);
  } catch (error) {
    logError(error, { context: 'GET /api/import/progress/:importId' });
    res.status(500).json({ error: 'Failed to get import progress' });
  }
});

/**
 * POST /api/import/upload/streaming
 * Import bookmarks using streaming for large files
 */
router.post('/upload/streaming', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    logInfo('Streaming bookmark import started', {
      userId: req.user.id,
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
    
    // Use streaming import service
    const result = await streamingImportService.startStreamingImport(req.user.id, tempPath);
    
    // Don't delete temp file yet - streaming service will handle it
    
    res.json({
      message: 'Import started in streaming mode',
      importId: result.importId,
      status: result.status
    });
  } catch (error) {
    logError(error, { context: 'POST /api/import/upload/streaming' });
    res.status(500).json({ error: 'Failed to start streaming import' });
  }
});

/**
 * GET /api/import/stream-progress/:importId
 * Get streaming import progress
 */
router.get('/stream-progress/:importId', async (req, res) => {
  try {
    const progress = await streamingImportService.getImportProgress(req.params.importId);
    
    if (!progress) {
      return res.status(404).json({ error: 'Import not found' });
    }
    
    res.json(progress);
  } catch (error) {
    logError(error, { context: 'GET /api/import/stream-progress/:importId' });
    res.status(500).json({ error: 'Failed to get streaming progress' });
  }
});

export default router;