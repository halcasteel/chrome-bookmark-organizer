import express from 'express';
import { query } from '../db/index.js';
import validationService from '../services/validationService.js';
import unifiedLogger from '../services/unifiedLogger.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/validation/status
 * Get validation service status
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    unifiedLogger.info('Fetching validation service status', {
      service: 'api',
      source: 'GET /validation/status',
      userId: req.user.id
    });

    const stats = await validationService.getQueueStats();
    
    unifiedLogger.info('Validation status retrieved', {
      service: 'api',
      source: 'GET /validation/status',
      userId: req.user.id,
      queueStats: stats
    });
    
    res.json({
      status: 'active',
      queue: stats
    });
  } catch (error) {
    unifiedLogger.error('Failed to get validation status', error, {
      service: 'api',
      source: 'GET /validation/status',
      userId: req.user.id
    });
    res.json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/validation/unvalidated
 * Get all unvalidated bookmarks for the current user
 */
router.get('/unvalidated', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    unifiedLogger.info('Fetching unvalidated bookmarks', {
      service: 'api',
      source: 'GET /validation/unvalidated',
      userId: req.user.id,
      page,
      limit
    });
    
    const result = await query(`
      SELECT 
        b.id, b.url, b.title, b.description, b.created_at,
        b.is_valid, b.is_dead, b.check_attempts, b.last_checked,
        b.validation_errors, b.http_status
      FROM bookmarks b
      WHERE 
        b.user_id = $1 AND 
        b.is_deleted = false AND
        (b.is_valid = false OR b.last_checked IS NULL)
      ORDER BY b.created_at DESC
      LIMIT $2 OFFSET $3
    `, [req.user.id, limit, offset]);
    
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM bookmarks
      WHERE 
        user_id = $1 AND 
        is_deleted = false AND
        (is_valid = false OR last_checked IS NULL)
    `, [req.user.id]);
    
    const total = parseInt(countResult.rows[0].total);
    
    unifiedLogger.info('Unvalidated bookmarks retrieved', {
      service: 'api',
      source: 'GET /validation/unvalidated',
      userId: req.user.id,
      bookmarkCount: result.rows.length,
      totalUnvalidated: total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.json({
      bookmarks: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    unifiedLogger.error('Failed to fetch unvalidated bookmarks', error, {
      service: 'api',
      source: 'GET /validation/unvalidated',
      userId: req.user.id,
      page: req.query.page,
      limit: req.query.limit
    });
    res.status(500).json({ error: 'Failed to fetch unvalidated bookmarks' });
  }
});

/**
 * POST /api/validation/validate/:id
 * Manually trigger validation for a specific bookmark
 */
router.post('/validate/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    unifiedLogger.info('Manual bookmark validation requested', {
      service: 'api',
      source: 'POST /validation/validate/:id',
      userId: req.user.id,
      bookmarkId: id
    });
    
    // Verify ownership
    const ownerCheck = await query(
      'SELECT user_id FROM bookmarks WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      unifiedLogger.warn('Validation failed - bookmark not found', {
        service: 'api',
        source: 'POST /validation/validate/:id',
        userId: req.user.id,
        bookmarkId: id
      });
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      unifiedLogger.warn('Validation denied - unauthorized', {
        service: 'api',
        source: 'POST /validation/validate/:id',
        userId: req.user.id,
        bookmarkId: id,
        ownerId: ownerCheck.rows[0].user_id,
        isAdmin: req.user.role === 'admin'
      });
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Reset validation attempts for manual validation
    await query(
      'UPDATE bookmarks SET check_attempts = 0 WHERE id = $1',
      [id]
    );
    
    // Validate the bookmark
    const result = await validationService.validateBookmark(id);
    
    unifiedLogger.info('Bookmark validation completed', {
      service: 'api',
      source: 'POST /validation/validate/:id',
      userId: req.user.id,
      bookmarkId: id,
      isValid: result.is_valid,
      isDead: result.is_dead
    });
    
    res.json({
      message: 'Validation completed',
      bookmark: result
    });
  } catch (error) {
    unifiedLogger.error('Failed to validate bookmark', error, {
      service: 'api',
      source: 'POST /validation/validate/:id',
      userId: req.user.id,
      bookmarkId: req.params.id
    });
    res.status(500).json({ error: 'Failed to validate bookmark' });
  }
});

/**
 * POST /api/validation/bulk-validate
 * Validate multiple bookmarks
 */
router.post('/bulk-validate', authenticate, async (req, res) => {
  try {
    const { bookmarkIds } = req.body;
    
    unifiedLogger.info('Bulk validation requested', {
      service: 'api',
      source: 'POST /validation/bulk-validate',
      userId: req.user.id,
      bookmarkCount: bookmarkIds?.length || 0
    });
    
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      unifiedLogger.warn('Bulk validation failed - invalid bookmarkIds', {
        service: 'api',
        source: 'POST /validation/bulk-validate',
        userId: req.user.id,
        hasBookmarkIds: !!bookmarkIds,
        isArray: Array.isArray(bookmarkIds)
      });
      return res.status(400).json({ error: 'bookmarkIds array required' });
    }
    
    // Verify ownership of all bookmarks
    const ownerCheck = await query(
      'SELECT id FROM bookmarks WHERE id = ANY($1) AND (user_id = $2 OR $3 = true)',
      [bookmarkIds, req.user.id, req.user.role === 'admin']
    );
    
    if (ownerCheck.rows.length !== bookmarkIds.length) {
      unifiedLogger.warn('Bulk validation denied - unauthorized for some bookmarks', {
        service: 'api',
        source: 'POST /validation/bulk-validate',
        userId: req.user.id,
        requestedCount: bookmarkIds.length,
        authorizedCount: ownerCheck.rows.length
      });
      return res.status(403).json({ error: 'Unauthorized for some bookmarks' });
    }
    
    // Reset validation attempts
    await query(
      'UPDATE bookmarks SET check_attempts = 0 WHERE id = ANY($1)',
      [bookmarkIds]
    );
    
    // Start validation process
    const results = await Promise.allSettled(
      bookmarkIds.map(id => validationService.validateBookmark(id))
    );
    
    const summary = {
      total: results.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.is_valid).length,
      failed: results.filter(r => r.status === 'rejected' || !r.value?.is_valid).length
    };
    
    unifiedLogger.info('Bulk validation completed', {
      service: 'api',
      source: 'POST /validation/bulk-validate',
      userId: req.user.id,
      summary
    });
    
    res.json({
      message: 'Bulk validation completed',
      summary,
      results: results.map((r, i) => ({
        bookmarkId: bookmarkIds[i],
        status: r.status,
        isValid: r.value?.is_valid || false,
        error: r.reason?.message
      }))
    });
  } catch (error) {
    unifiedLogger.error('Failed in bulk validation', error, {
      service: 'api',
      source: 'POST /validation/bulk-validate',
      userId: req.user.id,
      bookmarkCount: req.body.bookmarkIds?.length
    });
    res.status(500).json({ error: 'Failed to validate bookmarks' });
  }
});

/**
 * POST /api/validation/archive
 * Archive selected bookmarks
 */
router.post('/archive', authenticate, async (req, res) => {
  try {
    const { bookmarkIds } = req.body;
    
    unifiedLogger.info('Archiving bookmarks requested', {
      service: 'api',
      source: 'POST /validation/archive',
      userId: req.user.id,
      bookmarkCount: bookmarkIds?.length || 0
    });
    
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      unifiedLogger.warn('Archive failed - invalid bookmarkIds', {
        service: 'api',
        source: 'POST /validation/archive',
        userId: req.user.id
      });
      return res.status(400).json({ error: 'bookmarkIds array required' });
    }
    
    const result = await query(
      `UPDATE bookmarks 
       SET is_archived = true, archived_at = NOW(), archived_by = $1
       WHERE id = ANY($2) AND user_id = $3 AND is_deleted = false
       RETURNING id`,
      [req.user.id, bookmarkIds, req.user.id]
    );
    
    unifiedLogger.info('Bookmarks archived successfully', {
      service: 'api',
      source: 'POST /validation/archive',
      userId: req.user.id,
      archivedCount: result.rowCount
    });
    
    res.json({
      message: 'Bookmarks archived successfully',
      count: result.rowCount
    });
  } catch (error) {
    unifiedLogger.error('Failed to archive bookmarks', error, {
      service: 'api',
      source: 'POST /validation/archive',
      userId: req.user.id,
      bookmarkCount: req.body.bookmarkIds?.length
    });
    res.status(500).json({ error: 'Failed to archive bookmarks' });
  }
});

/**
 * POST /api/validation/unarchive
 * Restore archived bookmarks
 */
router.post('/unarchive', authenticate, async (req, res) => {
  try {
    const { bookmarkIds } = req.body;
    
    unifiedLogger.info('Unarchiving bookmarks requested', {
      service: 'api',
      source: 'POST /validation/unarchive',
      userId: req.user.id,
      bookmarkCount: bookmarkIds?.length || 0
    });
    
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      unifiedLogger.warn('Unarchive failed - invalid bookmarkIds', {
        service: 'api',
        source: 'POST /validation/unarchive',
        userId: req.user.id
      });
      return res.status(400).json({ error: 'bookmarkIds array required' });
    }
    
    const result = await query(
      `UPDATE bookmarks 
       SET is_archived = false, archived_at = NULL, archived_by = NULL
       WHERE id = ANY($1) AND user_id = $2
       RETURNING id`,
      [bookmarkIds, req.user.id]
    );
    
    unifiedLogger.info('Bookmarks restored successfully', {
      service: 'api',
      source: 'POST /validation/unarchive',
      userId: req.user.id,
      restoredCount: result.rowCount
    });
    
    res.json({
      message: 'Bookmarks restored successfully',
      count: result.rowCount
    });
  } catch (error) {
    unifiedLogger.error('Failed to restore bookmarks', error, {
      service: 'api',
      source: 'POST /validation/unarchive',
      userId: req.user.id,
      bookmarkCount: req.body.bookmarkIds?.length
    });
    res.status(500).json({ error: 'Failed to restore bookmarks' });
  }
});

/**
 * DELETE /api/validation/bulk-delete
 * Permanently delete bookmarks (admin only)
 */
router.delete('/bulk-delete', authenticate, async (req, res) => {
  try {
    const { bookmarkIds } = req.body;
    
    unifiedLogger.warn('Bulk delete requested', {
      service: 'api',
      source: 'DELETE /validation/bulk-delete',
      userId: req.user.id,
      userRole: req.user.role,
      bookmarkCount: bookmarkIds?.length || 0
    });
    
    if (req.user.role !== 'admin') {
      unifiedLogger.warn('Bulk delete denied - admin required', {
        service: 'api',
        source: 'DELETE /validation/bulk-delete',
        userId: req.user.id,
        userRole: req.user.role
      });
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    if (!Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      unifiedLogger.warn('Bulk delete failed - invalid bookmarkIds', {
        service: 'api',
        source: 'DELETE /validation/bulk-delete',
        userId: req.user.id
      });
      return res.status(400).json({ error: 'bookmarkIds array required' });
    }
    
    // Delete related data first
    await query('DELETE FROM bookmark_tags WHERE bookmark_id = ANY($1)', [bookmarkIds]);
    await query('DELETE FROM bookmark_metadata WHERE bookmark_id = ANY($1)', [bookmarkIds]);
    await query('DELETE FROM bookmark_collections WHERE bookmark_id = ANY($1)', [bookmarkIds]);
    await query('DELETE FROM bookmark_embeddings WHERE bookmark_id = ANY($1)', [bookmarkIds]);
    
    // Delete bookmarks
    const result = await query(
      'DELETE FROM bookmarks WHERE id = ANY($1) RETURNING id',
      [bookmarkIds]
    );
    
    unifiedLogger.warn('Bookmarks permanently deleted', {
      service: 'api',
      source: 'DELETE /validation/bulk-delete',
      adminId: req.user.id,
      deletedCount: result.rowCount
    });
    
    res.json({
      message: 'Bookmarks permanently deleted',
      count: result.rowCount
    });
  } catch (error) {
    unifiedLogger.error('Failed to delete bookmarks', error, {
      service: 'api',
      source: 'DELETE /validation/bulk-delete',
      adminId: req.user.id,
      bookmarkCount: req.body.bookmarkIds?.length
    });
    res.status(500).json({ error: 'Failed to delete bookmarks' });
  }
});

/**
 * PATCH /api/validation/:id/status
 * Update validation status manually
 */
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_valid, validation_error } = req.body;
    
    unifiedLogger.info('Manual validation status update requested', {
      service: 'api',
      source: 'PATCH /validation/:id/status',
      userId: req.user.id,
      bookmarkId: id,
      newStatus: is_valid,
      hasError: !!validation_error
    });
    
    // Verify ownership
    const ownerCheck = await query(
      'SELECT user_id FROM bookmarks WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      unifiedLogger.warn('Status update failed - bookmark not found', {
        service: 'api',
        source: 'PATCH /validation/:id/status',
        userId: req.user.id,
        bookmarkId: id
      });
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      unifiedLogger.warn('Status update denied - unauthorized', {
        service: 'api',
        source: 'PATCH /validation/:id/status',
        userId: req.user.id,
        bookmarkId: id,
        ownerId: ownerCheck.rows[0].user_id
      });
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Update status
    const result = await query(
      `UPDATE bookmarks 
       SET is_valid = $1, 
           validation_errors = CASE 
             WHEN $2::text IS NOT NULL 
             THEN COALESCE(validation_errors, '[]'::jsonb) || jsonb_build_object(
               'manual', true,
               'message', $2,
               'timestamp', NOW()
             )::jsonb
             ELSE validation_errors
           END,
           last_checked = NOW()
       WHERE id = $3
       RETURNING *`,
      [is_valid, validation_error, id]
    );
    
    unifiedLogger.info('Validation status updated successfully', {
      service: 'api',
      source: 'PATCH /validation/:id/status',
      userId: req.user.id,
      bookmarkId: id,
      newStatus: is_valid
    });
    
    res.json({
      message: 'Validation status updated',
      bookmark: result.rows[0]
    });
  } catch (error) {
    unifiedLogger.error('Failed to update validation status', error, {
      service: 'api',
      source: 'PATCH /validation/:id/status',
      userId: req.user.id,
      bookmarkId: req.params.id
    });
    res.status(500).json({ error: 'Failed to update validation status' });
  }
});

/**
 * POST /api/validation/:id/categorize
 * Manually set category and tags
 */
router.post('/:id/categorize', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { category, subcategory, tags, priority } = req.body;
    
    unifiedLogger.info('Manual categorization requested', {
      service: 'api',
      source: 'POST /validation/:id/categorize',
      userId: req.user.id,
      bookmarkId: id,
      category,
      subcategory,
      tagCount: tags?.length || 0,
      priority
    });
    
    // Verify ownership
    const ownerCheck = await query(
      'SELECT user_id FROM bookmarks WHERE id = $1',
      [id]
    );
    
    if (ownerCheck.rows.length === 0) {
      unifiedLogger.warn('Categorization failed - bookmark not found', {
        service: 'api',
        source: 'POST /validation/:id/categorize',
        userId: req.user.id,
        bookmarkId: id
      });
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    if (ownerCheck.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
      unifiedLogger.warn('Categorization denied - unauthorized', {
        service: 'api',
        source: 'POST /validation/:id/categorize',
        userId: req.user.id,
        bookmarkId: id,
        ownerId: ownerCheck.rows[0].user_id
      });
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Update bookmark tags
    if (Array.isArray(tags)) {
      await query(
        'UPDATE bookmarks SET ai_tags = $1 WHERE id = $2',
        [tags, id]
      );
    }
    
    // Update or create metadata
    await query(`
      INSERT INTO bookmark_metadata (bookmark_id, category, subcategory, priority)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (bookmark_id) 
      DO UPDATE SET 
        category = EXCLUDED.category,
        subcategory = EXCLUDED.subcategory,
        priority = EXCLUDED.priority
    `, [id, category, subcategory, priority || 'medium']);
    
    unifiedLogger.info('Categorization updated successfully', {
      service: 'api',
      source: 'POST /validation/:id/categorize',
      userId: req.user.id,
      bookmarkId: id,
      category,
      subcategory
    });
    
    res.json({
      message: 'Categorization updated successfully'
    });
  } catch (error) {
    unifiedLogger.error('Failed to update categorization', error, {
      service: 'api',
      source: 'POST /validation/:id/categorize',
      userId: req.user.id,
      bookmarkId: req.params.id,
      categoryData: req.body
    });
    res.status(500).json({ error: 'Failed to update categorization' });
  }
});

/**
 * GET /api/validation/stats
 * Get validation statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    unifiedLogger.info('Fetching validation statistics', {
      service: 'api',
      source: 'GET /validation/stats',
      userId: req.user.id,
      isAdmin: req.user.role === 'admin'
    });
    
    const stats = await validationService.getValidationStats();
    
    // Get user-specific stats
    const userStats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_valid = true) as valid,
        COUNT(*) FILTER (WHERE is_valid = false) as invalid,
        COUNT(*) FILTER (WHERE is_dead = true) as dead,
        COUNT(*) FILTER (WHERE last_checked IS NULL) as unchecked,
        COUNT(*) FILTER (WHERE enriched = true) as enriched,
        COUNT(*) FILTER (WHERE is_archived = true) as archived
      FROM bookmarks
      WHERE user_id = $1 AND is_deleted = false
    `, [req.user.id]);
    
    unifiedLogger.info('Validation stats retrieved', {
      service: 'api',
      source: 'GET /validation/stats',
      userId: req.user.id,
      userStats: userStats.rows[0],
      includesSystemStats: req.user.role === 'admin'
    });
    
    res.json({
      system: req.user.role === 'admin' ? stats : null,
      user: userStats.rows[0]
    });
  } catch (error) {
    unifiedLogger.error('Failed to fetch validation stats', error, {
      service: 'api',
      source: 'GET /validation/stats',
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

export default router;