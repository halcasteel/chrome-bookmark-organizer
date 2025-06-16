import express from 'express';
import { query } from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';

const router = express.Router();

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    unifiedLogger.warn('Admin access denied', {
      service: 'api',
      source: 'admin-middleware',
      userId: req.user?.id,
      userRole: req.user?.role,
      path: req.path
    });
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
    unifiedLogger.info('Fetching all users with stats', {
      service: 'api',
      source: 'GET /admin/users',
      adminId: req.user.id
    });
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
    
    unifiedLogger.info('Users retrieved successfully', {
      service: 'api',
      source: 'GET /admin/users',
      adminId: req.user.id,
      userCount: result.rows.length
    });
    
    res.json({ users: result.rows });
  } catch (error) {
    unifiedLogger.error('Failed to get users', error, {
      service: 'api',
      source: 'GET /admin/users',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * GET /api/admin/stats
 * Get system-wide statistics
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    unifiedLogger.info('Fetching system-wide statistics', {
      service: 'api',
      source: 'GET /admin/stats',
      adminId: req.user.id
    });
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
    
    const stats = {
      totalBookmarks: totalBookmarks.rows[0].total,
      status: bookmarkStatus.rows[0],
      recentImports: recentImports.rows,
      categories: categories.rows
    };
    
    unifiedLogger.info('System stats retrieved successfully', {
      service: 'api',
      source: 'GET /admin/stats',
      adminId: req.user.id,
      totalBookmarks: stats.totalBookmarks,
      categoryCount: stats.categories.length
    });
    
    res.json(stats);
  } catch (error) {
    unifiedLogger.error('Failed to get statistics', error, {
      service: 'api',
      source: 'GET /admin/stats',
      adminId: req.user.id
    });
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
    
    unifiedLogger.info('Bookmark transfer requested', {
      service: 'api',
      source: 'POST /admin/users/:userId/bookmarks/transfer',
      adminId: req.user.id,
      fromUserId: userId,
      toUserId: targetUserId
    });
    
    if (!targetUserId) {
      unifiedLogger.warn('Bookmark transfer failed - missing target user', {
        service: 'api',
        source: 'POST /admin/users/:userId/bookmarks/transfer',
        adminId: req.user.id,
        fromUserId: userId
      });
      return res.status(400).json({ error: 'Target user ID required' });
    }
    
    // Verify both users exist
    const users = await query(
      'SELECT id FROM users WHERE id IN ($1, $2)',
      [userId, targetUserId]
    );
    
    if (users.rows.length !== 2) {
      unifiedLogger.warn('Bookmark transfer failed - users not found', {
        service: 'api',
        source: 'POST /admin/users/:userId/bookmarks/transfer',
        adminId: req.user.id,
        fromUserId: userId,
        toUserId: targetUserId,
        foundUsers: users.rows.length
      });
      return res.status(404).json({ error: 'One or both users not found' });
    }
    
    // Transfer bookmarks
    const result = await query(
      'UPDATE bookmarks SET user_id = $1 WHERE user_id = $2 RETURNING id',
      [targetUserId, userId]
    );
    
    unifiedLogger.info('Bookmarks transferred successfully', {
      service: 'api',
      source: 'POST /admin/users/:userId/bookmarks/transfer',
      adminId: req.user.id,
      fromUserId: userId,
      toUserId: targetUserId,
      bookmarkCount: result.rows.length
    });
    
    res.json({
      message: 'Bookmarks transferred successfully',
      count: result.rows.length
    });
  } catch (error) {
    unifiedLogger.error('Failed to transfer bookmarks', error, {
      service: 'api',
      source: 'POST /admin/users/:userId/bookmarks/transfer',
      adminId: req.user.id,
      fromUserId: req.params.userId,
      toUserId: req.body.targetUserId
    });
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
    
    unifiedLogger.warn('Hard delete bookmark requested', {
      service: 'api',
      source: 'DELETE /admin/bookmarks/:id',
      adminId: req.user.id,
      bookmarkId: id
    });
    
    // Delete related data first
    await query('DELETE FROM bookmark_tags WHERE bookmark_id = $1', [id]);
    await query('DELETE FROM bookmark_metadata WHERE bookmark_id = $1', [id]);
    await query('DELETE FROM bookmark_collections WHERE bookmark_id = $1', [id]);
    await query('DELETE FROM bookmark_embeddings WHERE bookmark_id = $1', [id]);
    
    // Delete the bookmark
    const result = await query('DELETE FROM bookmarks WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      unifiedLogger.warn('Hard delete failed - bookmark not found', {
        service: 'api',
        source: 'DELETE /admin/bookmarks/:id',
        adminId: req.user.id,
        bookmarkId: id
      });
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    unifiedLogger.warn('Bookmark permanently deleted', {
      service: 'api',
      source: 'DELETE /admin/bookmarks/:id',
      adminId: req.user.id,
      bookmarkId: id,
      deletedBookmark: {
        url: result.rows[0].url,
        title: result.rows[0].title
      }
    });
    
    res.json({ 
      message: 'Bookmark permanently deleted',
      bookmark: result.rows[0]
    });
  } catch (error) {
    unifiedLogger.error('Failed to delete bookmark', error, {
      service: 'api',
      source: 'DELETE /admin/bookmarks/:id',
      adminId: req.user.id,
      bookmarkId: req.params.id
    });
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

export default router;