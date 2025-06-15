import express from 'express';
import { query } from '../db/index.js';
import { logError } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/stats/dashboard
 * Get dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get total bookmarks
    const bookmarksResult = await query(
      'SELECT COUNT(*) as total FROM bookmarks WHERE user_id = $1 AND is_deleted = false',
      [userId]
    );
    
    // Get total collections
    const collectionsResult = await query(
      'SELECT COUNT(*) as total FROM collections WHERE user_id = $1',
      [userId]
    );
    
    // Get total tags
    const tagsResult = await query(
      'SELECT COUNT(*) as total FROM tags WHERE user_id = $1',
      [userId]
    );
    
    // Get recent imports (last 7 days)
    const importsResult = await query(
      `SELECT COUNT(*) as total FROM import_history 
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'`,
      [userId]
    );
    
    // Get domain stats
    const domainStatsResult = await query(
      `SELECT domain, COUNT(*) as count 
       FROM bookmarks 
       WHERE user_id = $1 AND is_deleted = false AND domain IS NOT NULL
       GROUP BY domain 
       ORDER BY count DESC 
       LIMIT 10`,
      [userId]
    );
    
    res.json({
      totalBookmarks: parseInt(bookmarksResult.rows[0]?.total || 0),
      totalCollections: parseInt(collectionsResult.rows[0]?.total || 0),
      totalTags: parseInt(tagsResult.rows[0]?.total || 0),
      recentImports: parseInt(importsResult.rows[0]?.total || 0),
      domainStats: domainStatsResult.rows,
      bookmarkChange: 0, // TODO: Calculate percentage change
      recentActivity: [] // TODO: Add activity tracking
    });
  } catch (error) {
    logError(error, { context: 'GET /api/stats/dashboard', userId: req.user.id });
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;