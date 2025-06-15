import express from 'express';
import { query } from '../db/index.js';
import { logError } from '../utils/logger.js';

const router = express.Router();

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/admin/users
 * Get all users with bookmark counts
 */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.created_at,
        u.last_login,
        COUNT(DISTINCT b.id) as bookmark_count,
        COUNT(DISTINCT b.id) FILTER (WHERE b.is_dead = true) as dead_bookmark_count,
        COUNT(DISTINCT b.id) FILTER (WHERE b.enriched = true) as enriched_count,
        MAX(b.created_at) as last_bookmark_added
      FROM users u
      LEFT JOIN bookmarks b ON u.id = b.user_id AND b.is_deleted = false
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    
    res.json({ users: result.rows });
  } catch (error) {
    logError(error, { context: 'GET /api/admin/users' });
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * GET /api/admin/stats
 * Get system-wide statistics
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    // Total bookmarks
    const totalBookmarks = await query(`
      SELECT COUNT(*) as total FROM bookmarks WHERE is_deleted = false
    `);
    
    // Bookmarks by status
    const bookmarkStatus = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_valid = true) as valid,
        COUNT(*) FILTER (WHERE is_valid = false) as invalid,
        COUNT(*) FILTER (WHERE is_dead = true) as dead,
        COUNT(*) FILTER (WHERE enriched = true) as enriched
      FROM bookmarks WHERE is_deleted = false
    `);
    
    // Recent imports
    const recentImports = await query(`
      SELECT 
        ih.id,
        ih.filename,
        ih.total_bookmarks,
        ih.new_bookmarks,
        ih.status,
        ih.created_at,
        u.email as user_email
      FROM import_history ih
      JOIN users u ON ih.user_id = u.id
      ORDER BY ih.created_at DESC
      LIMIT 10
    `);
    
    // Bookmarks by category
    const categories = await query(`
      SELECT 
        bm.category,
        COUNT(DISTINCT b.id) as count
      FROM bookmarks b
      JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
      WHERE b.is_deleted = false AND bm.category IS NOT NULL
      GROUP BY bm.category
      ORDER BY count DESC
    `);
    
    res.json({
      totalBookmarks: totalBookmarks.rows[0].total,
      status: bookmarkStatus.rows[0],
      recentImports: recentImports.rows,
      categories: categories.rows
    });
  } catch (error) {
    logError(error, { context: 'GET /api/admin/stats' });
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * POST /api/admin/users/:userId/bookmarks/transfer
 * Transfer bookmarks from one user to another
 */
router.post('/users/:userId/bookmarks/transfer', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { targetUserId } = req.body;
    
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID required' });
    }
    
    // Verify both users exist
    const users = await query(
      'SELECT id FROM users WHERE id IN ($1, $2)',
      [userId, targetUserId]
    );
    
    if (users.rows.length !== 2) {
      return res.status(404).json({ error: 'One or both users not found' });
    }
    
    // Transfer bookmarks
    const result = await query(
      'UPDATE bookmarks SET user_id = $1 WHERE user_id = $2 RETURNING id',
      [targetUserId, userId]
    );
    
    res.json({
      message: 'Bookmarks transferred successfully',
      count: result.rows.length
    });
  } catch (error) {
    logError(error, { context: 'POST /api/admin/users/:userId/bookmarks/transfer' });
    res.status(500).json({ error: 'Failed to transfer bookmarks' });
  }
});

/**
 * DELETE /api/admin/bookmarks/:id
 * Hard delete a bookmark (admin only)
 */
router.delete('/bookmarks/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete related data first
    await query('DELETE FROM bookmark_tags WHERE bookmark_id = $1', [id]);
    await query('DELETE FROM bookmark_metadata WHERE bookmark_id = $1', [id]);
    await query('DELETE FROM bookmark_collections WHERE bookmark_id = $1', [id]);
    await query('DELETE FROM bookmark_embeddings WHERE bookmark_id = $1', [id]);
    
    // Delete the bookmark
    const result = await query('DELETE FROM bookmarks WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    res.json({ 
      message: 'Bookmark permanently deleted',
      bookmark: result.rows[0]
    });
  } catch (error) {
    logError(error, { context: 'DELETE /api/admin/bookmarks/:id' });
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

export default router;