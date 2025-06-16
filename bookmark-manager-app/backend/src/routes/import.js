import express from 'express';
import multer from 'multer';
import importService from '../services/importService.js';
import importServiceAsync from '../services/importServiceAsync.js';
import streamingImportService from '../services/streamingImportService.js';
import unifiedLogger from '../services/unifiedLogger.js';

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
      unifiedLogger.warn('Import failed - no file uploaded', {
        service: 'api',
        source: 'POST /import/upload',
        userId: req.user.id
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    unifiedLogger.info('Bookmark import started', {
      service: 'api',
      source: 'POST /import/upload',
      userId: req.user.id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / 1024 / 1024).toFixed(2)
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
    
    unifiedLogger.info('Import completed successfully', {
      service: 'api',
      source: 'POST /import/upload',
      userId: req.user.id,
      importId: result.importId,
      total: result.total,
      imported: result.imported,
      failed: result.failed,
      fileName: req.file.originalname
    });
    
    res.json({
      message: 'Import completed',
      importId: result.importId,
      total: result.total,
      new: result.imported,
      updated: 0,
      failed: result.failed,
    });
  } catch (error) {
    unifiedLogger.error('Failed to import bookmarks', error, {
      service: 'api',
      source: 'POST /import/upload',
      userId: req.user.id,
      fileName: req.file?.originalname,
      fileSize: req.file?.size
    });
    res.status(500).json({ error: 'Failed to import bookmarks' });
  }
});

/**
 * GET /api/import/status/:importId
 * Get import status
 */
router.get('/status/:importId', async (req, res) => {
  try {
    const importId = req.params.importId;
    
    unifiedLogger.debug('Checking import status', {
      service: 'api',
      source: 'GET /import/status/:importId',
      userId: req.user.id,
      importId
    });
    const status = await importService.getImportStatus(importId);
    
    if (!status) {
      unifiedLogger.warn('Import not found', {
        service: 'api',
        source: 'GET /import/status/:importId',
        userId: req.user.id,
        importId
      });
      return res.status(404).json({ error: 'Import not found' });
    }
    
    unifiedLogger.debug('Import status retrieved', {
      service: 'api',
      source: 'GET /import/status/:importId',
      userId: req.user.id,
      importId,
      status: status.status
    });
    
    res.json(status);
  } catch (error) {
    unifiedLogger.error('Failed to get import status', error, {
      service: 'api',
      source: 'GET /import/status/:importId',
      userId: req.user.id,
      importId: req.params.importId
    });
    res.status(500).json({ error: 'Failed to get import status' });
  }
});

/**
 * GET /api/import/history
 * Get import history
 */
router.get('/history', async (req, res) => {
  try {
    unifiedLogger.info('Fetching import history', {
      service: 'api',
      source: 'GET /import/history',
      userId: req.user.id
    });
    const history = await importService.getImportHistory(req.user.id);
    
    unifiedLogger.info('Import history retrieved', {
      service: 'api',
      source: 'GET /import/history',
      userId: req.user.id,
      importCount: history.length
    });
    
    res.json({ imports: history });
  } catch (error) {
    unifiedLogger.error('Failed to get import history', error, {
      service: 'api',
      source: 'GET /import/history',
      userId: req.user.id
    });
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
      unifiedLogger.warn('Async import failed - no file uploaded', {
        service: 'api',
        source: 'POST /import/upload-async',
        userId: req.user.id
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    unifiedLogger.info('Async bookmark import started', {
      service: 'api',
      source: 'POST /import/upload-async',
      userId: req.user.id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / 1024 / 1024).toFixed(2)
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
    
    unifiedLogger.info('Async import initiated successfully', {
      service: 'api',
      source: 'POST /import/upload-async',
      userId: req.user.id,
      importId: result.importId,
      fileName: req.file.originalname
    });
    
    res.json(result);
  } catch (error) {
    unifiedLogger.error('Failed to start async import', error, {
      service: 'api',
      source: 'POST /import/upload-async',
      userId: req.user.id,
      fileName: req.file?.originalname,
      fileSize: req.file?.size
    });
    res.status(500).json({ error: 'Failed to import bookmarks' });
  }
});

/**
 * GET /api/import/progress/:importId
 * Get detailed import progress including validation and enrichment
 */
router.get('/progress/:importId', async (req, res) => {
  try {
    const importId = req.params.importId;
    
    unifiedLogger.debug('Fetching import progress', {
      service: 'api',
      source: 'GET /import/progress/:importId',
      userId: req.user.id,
      importId
    });
    const progress = await importServiceAsync.getImportProgress(importId);
    
    if (!progress) {
      unifiedLogger.warn('Import progress not found', {
        service: 'api',
        source: 'GET /import/progress/:importId',
        userId: req.user.id,
        importId
      });
      return res.status(404).json({ error: 'Import not found' });
    }
    
    unifiedLogger.debug('Import progress retrieved', {
      service: 'api',
      source: 'GET /import/progress/:importId',
      userId: req.user.id,
      importId,
      progress: progress.progress
    });
    
    res.json(progress);
  } catch (error) {
    unifiedLogger.error('Failed to get import progress', error, {
      service: 'api',
      source: 'GET /import/progress/:importId',
      userId: req.user.id,
      importId: req.params.importId
    });
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
      unifiedLogger.warn('Streaming import failed - no file uploaded', {
        service: 'api',
        source: 'POST /import/upload/streaming',
        userId: req.user.id
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    unifiedLogger.info('Streaming bookmark import started', {
      service: 'api',
      source: 'POST /import/upload/streaming',
      userId: req.user.id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / 1024 / 1024).toFixed(2)
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
    
    unifiedLogger.info('Streaming import initiated successfully', {
      service: 'api',
      source: 'POST /import/upload/streaming',
      userId: req.user.id,
      importId: result.importId,
      status: result.status,
      fileName: req.file.originalname
    });
    
    res.json({
      message: 'Import started in streaming mode',
      importId: result.importId,
      status: result.status
    });
  } catch (error) {
    unifiedLogger.error('Failed to start streaming import', error, {
      service: 'api',
      source: 'POST /import/upload/streaming',
      userId: req.user.id,
      fileName: req.file?.originalname,
      fileSize: req.file?.size
    });
    res.status(500).json({ error: 'Failed to start streaming import' });
  }
});

/**
 * GET /api/import/stream-progress/:importId
 * Get streaming import progress
 */
router.get('/stream-progress/:importId', async (req, res) => {
  try {
    const importId = req.params.importId;
    
    unifiedLogger.debug('Fetching streaming import progress', {
      service: 'api',
      source: 'GET /import/stream-progress/:importId',
      userId: req.user.id,
      importId
    });
    const progress = await streamingImportService.getImportProgress(importId);
    
    if (!progress) {
      unifiedLogger.warn('Streaming import not found', {
        service: 'api',
        source: 'GET /import/stream-progress/:importId',
        userId: req.user.id,
        importId
      });
      return res.status(404).json({ error: 'Import not found' });
    }
    
    unifiedLogger.debug('Streaming progress retrieved', {
      service: 'api',
      source: 'GET /import/stream-progress/:importId',
      userId: req.user.id,
      importId,
      progress: progress.progress
    });
    
    res.json(progress);
  } catch (error) {
    unifiedLogger.error('Failed to get streaming progress', error, {
      service: 'api',
      source: 'GET /import/stream-progress/:importId',
      userId: req.user.id,
      importId: req.params.importId
    });
    res.status(500).json({ error: 'Failed to get streaming progress' });
  }
});

export default router;