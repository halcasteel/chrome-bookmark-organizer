import express from 'express';
import { query } from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';
import aiLogAnalysisService from '../services/aiLogAnalysisService.js';

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

/**
 * GET /api/admin/health
 * Get system health status
 */
router.get('/health', requireAdmin, async (req, res) => {
  try {
    unifiedLogger.info('Fetching system health status', {
      service: 'api',
      source: 'GET /admin/health',
      adminId: req.user.id
    });

    // Check database connection
    let database = { ok: true };
    try {
      await query('SELECT 1');
    } catch (error) {
      database = { ok: false, error: error.message };
    }

    // Check Redis (placeholder - implement when Redis is available)
    const redis = { ok: true };

    // Get log ingestion stats
    const recentLogsResult = await query(`
      SELECT COUNT(*) as count 
      FROM system_logs 
      WHERE timestamp >= NOW() - INTERVAL '1 hour'
    `);

    const errorLogsResult = await query(`
      SELECT COUNT(*) as count 
      FROM system_logs 
      WHERE level = 'error' AND timestamp >= NOW() - INTERVAL '1 hour'
    `);

    const recentLogs = parseInt(recentLogsResult.rows[0].count) || 0;
    const errorLogs = parseInt(errorLogsResult.rows[0].count) || 0;
    const errorRate = recentLogs > 0 ? (errorLogs / recentLogs) * 100 : 0;

    const health = {
      database,
      redis,
      logIngestion: {
        ok: recentLogs > 0,
        recentLogs,
        errorRate
      },
      services: {
        backend: {
          ok: true,
          uptime: process.uptime()
        },
        workers: {
          ok: true
        }
      }
    };

    res.json(health);
  } catch (error) {
    unifiedLogger.error('Failed to get health status', error, {
      service: 'api',
      source: 'GET /admin/health',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get health status' });
  }
});

/**
 * GET /api/admin/logs
 * Get system logs with filtering
 */
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const { limit = '200', level, service, search } = req.query;
    
    unifiedLogger.info('Fetching system logs', {
      service: 'api',
      source: 'GET /admin/logs',
      adminId: req.user.id,
      filters: { limit, level, service, search }
    });

    let whereConditions = [];
    let params = [];
    let paramCount = 0;

    if (level) {
      paramCount++;
      whereConditions.push(`level = $${paramCount}`);
      params.push(level);
    }

    if (service) {
      paramCount++;
      whereConditions.push(`service = $${paramCount}`);
      params.push(service);
    }

    if (search) {
      paramCount++;
      whereConditions.push(`(message ILIKE $${paramCount} OR error_message ILIKE $${paramCount})`);
      params.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    paramCount++;
    const limitClause = `LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    const logsResult = await query(`
      SELECT 
        id,
        timestamp,
        level,
        service,
        source,
        message,
        error_message,
        error_stack,
        metadata,
        user_id,
        request_id,
        duration_ms,
        status_code
      FROM system_logs
      ${whereClause}
      ORDER BY timestamp DESC
      ${limitClause}
    `, params);

    res.json(logsResult.rows);
  } catch (error) {
    unifiedLogger.error('Failed to get logs', error, {
      service: 'api',
      source: 'GET /admin/logs',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

/**
 * GET /api/admin/analytics
 * Get log analytics data
 */
router.get('/analytics', requireAdmin, async (req, res) => {
  try {
    const { timeRange = '24h', groupBy = 'hour' } = req.query;
    
    unifiedLogger.info('Fetching log analytics', {
      service: 'api',
      source: 'GET /admin/analytics',
      adminId: req.user.id,
      timeRange,
      groupBy
    });

    const intervals = {
      '5m': '5 minutes',
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days'
    };

    const interval = intervals[timeRange] || '24 hours';
    const groupByFormat = groupBy === 'hour' ? 'YYYY-MM-DD HH24:00:00' : 'YYYY-MM-DD';

    // Time series data
    const timeSeriesResult = await query(`
      SELECT 
        TO_CHAR(timestamp, '${groupByFormat}') as time,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE level = 'error') as errors,
        COUNT(*) FILTER (WHERE level = 'warn') as warnings,
        COUNT(*) FILTER (WHERE level = 'info') as info,
        COUNT(*) FILTER (WHERE level = 'debug') as debug
      FROM system_logs
      WHERE timestamp >= NOW() - INTERVAL '${interval}'
      GROUP BY TO_CHAR(timestamp, '${groupByFormat}')
      ORDER BY time
    `);

    // Service breakdown
    const serviceBreakdownResult = await query(`
      SELECT 
        service,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE level = 'error') as errors,
        AVG(duration_ms) as avg_duration
      FROM system_logs
      WHERE timestamp >= NOW() - INTERVAL '${interval}'
      GROUP BY service
      ORDER BY count DESC
    `);

    // Error patterns
    const errorPatternsResult = await query(`
      SELECT 
        error_type,
        COUNT(*) as count,
        COUNT(DISTINCT service) as affected_services,
        MAX(timestamp) as last_occurrence
      FROM system_logs
      WHERE timestamp >= NOW() - INTERVAL '${interval}' AND level = 'error'
      GROUP BY error_type
      ORDER BY count DESC
      LIMIT 10
    `);

    const analytics = {
      timeSeries: timeSeriesResult.rows,
      serviceBreakdown: serviceBreakdownResult.rows,
      errorPatterns: errorPatternsResult.rows
    };

    res.json(analytics);
  } catch (error) {
    unifiedLogger.error('Failed to get analytics', error, {
      service: 'api',
      source: 'GET /admin/analytics',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

/**
 * GET /api/admin/ai-insights
 * Get AI-powered log insights
 */
router.get('/ai-insights', requireAdmin, async (req, res) => {
  try {
    const { timeRange = '1h' } = req.query;
    
    unifiedLogger.info('Fetching AI insights', {
      service: 'api',
      source: 'GET /admin/ai-insights',
      adminId: req.user.id,
      timeRange
    });

    const intervals = {
      '5m': '5 minutes',
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days'
    };

    const interval = intervals[timeRange] || '1 hour';

    // Get AI insights from database
    const insightsResult = await query(`
      SELECT 
        id,
        created_at,
        period_start,
        period_end,
        analysis_type,
        severity,
        title,
        description,
        affected_services,
        recommendations,
        confidence_score,
        metadata
      FROM log_ai_analysis
      WHERE period_start >= NOW() - INTERVAL '${interval}'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    // Get last analysis time
    const lastAnalysisResult = await query(`
      SELECT MAX(created_at) as last_analysis
      FROM log_ai_analysis
    `);

    const insights = insightsResult.rows.map(row => ({
      ...row,
      status: 'new' // Default status, can be enhanced with actual status tracking
    }));

    res.json({
      insights,
      lastAnalysis: lastAnalysisResult.rows[0]?.last_analysis
    });
  } catch (error) {
    unifiedLogger.error('Failed to get AI insights', error, {
      service: 'api',
      source: 'GET /admin/ai-insights',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get AI insights' });
  }
});

/**
 * POST /api/admin/ai-insights/analyze
 * Trigger AI analysis of logs
 */
router.post('/ai-insights/analyze', requireAdmin, async (req, res) => {
  try {
    const { timeRange = '1h' } = req.body;
    
    unifiedLogger.info('Triggering AI log analysis', {
      service: 'api',
      source: 'POST /admin/ai-insights/analyze',
      adminId: req.user.id,
      timeRange
    });

    const result = await aiLogAnalysisService.analyzeRecentLogs(timeRange, 'auto');
    
    res.json({
      message: 'Analysis completed',
      insights: result.insights || [],
      analysisTime: result.analysisTime
    });
  } catch (error) {
    unifiedLogger.error('Failed to trigger AI analysis', error, {
      service: 'api',
      source: 'POST /admin/ai-insights/analyze',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to trigger AI analysis' });
  }
});

/**
 * PATCH /api/admin/ai-insights/:id/acknowledge
 * Acknowledge an AI insight
 */
router.patch('/ai-insights/:id/acknowledge', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    unifiedLogger.info('Acknowledging AI insight', {
      service: 'api',
      source: 'PATCH /admin/ai-insights/:id/acknowledge',
      adminId: req.user.id,
      insightId: id
    });

    // This would update the insight status in the database
    // For now, just return success since we don't have status tracking yet
    res.json({ message: 'Insight acknowledged' });
  } catch (error) {
    unifiedLogger.error('Failed to acknowledge insight', error, {
      service: 'api',
      source: 'PATCH /admin/ai-insights/:id/acknowledge',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to acknowledge insight' });
  }
});

/**
 * PATCH /api/admin/ai-insights/:id/resolve
 * Resolve an AI insight
 */
router.patch('/ai-insights/:id/resolve', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    unifiedLogger.info('Resolving AI insight', {
      service: 'api',
      source: 'PATCH /admin/ai-insights/:id/resolve',
      adminId: req.user.id,
      insightId: id
    });

    // This would update the insight status in the database
    // For now, just return success since we don't have status tracking yet
    res.json({ message: 'Insight resolved' });
  } catch (error) {
    unifiedLogger.error('Failed to resolve insight', error, {
      service: 'api',
      source: 'PATCH /admin/ai-insights/:id/resolve',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to resolve insight' });
  }
});

/**
 * GET /api/admin/users/activity
 * Get user activity data
 */
router.get('/users/activity', requireAdmin, async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    unifiedLogger.info('Fetching user activity', {
      service: 'api',
      source: 'GET /admin/users/activity',
      adminId: req.user.id,
      timeRange
    });

    const intervals = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };

    const interval = intervals[timeRange] || '24 hours';

    // Recent activities (from logs)
    const recentActivitiesResult = await query(`
      SELECT 
        sl.id,
        sl.user_id,
        u.email as username,
        sl.source as action,
        sl.message as details,
        sl.timestamp,
        sl.metadata->>'ip_address' as ipAddress
      FROM system_logs sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE sl.timestamp >= NOW() - INTERVAL '${interval}'
        AND sl.user_id IS NOT NULL
      ORDER BY sl.timestamp DESC
      LIMIT 50
    `);

    // Activity summary
    const totalUsersResult = await query('SELECT COUNT(*) as count FROM users');
    const activeTodayResult = await query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM system_logs
      WHERE timestamp >= CURRENT_DATE AND user_id IS NOT NULL
    `);
    const totalActionsResult = await query(`
      SELECT COUNT(*) as count
      FROM system_logs
      WHERE timestamp >= NOW() - INTERVAL '${interval}' AND user_id IS NOT NULL
    `);

    // Top users
    const topUsersResult = await query(`
      SELECT 
        sl.user_id,
        u.email as username,
        COUNT(*) as totalActions,
        MAX(sl.timestamp) as lastActive,
        MODE() WITHIN GROUP (ORDER BY sl.source) as favoriteAction
      FROM system_logs sl
      LEFT JOIN users u ON sl.user_id = u.id
      WHERE sl.timestamp >= NOW() - INTERVAL '${interval}'
        AND sl.user_id IS NOT NULL
      GROUP BY sl.user_id, u.email
      ORDER BY totalActions DESC
      LIMIT 10
    `);

    // User stats
    const userStatsResult = await query(`
      SELECT 
        u.email as username,
        COUNT(DISTINCT CASE WHEN sl.source = 'login' THEN sl.id END) as loginCount,
        COUNT(DISTINCT b.id) as bookmarkCount,
        COUNT(DISTINCT CASE WHEN sl.source = 'search' THEN sl.id END) as searchCount,
        COUNT(DISTINCT CASE WHEN sl.source = 'import' THEN sl.id END) as importCount,
        COALESCE(MAX(CASE WHEN sl.source = 'login' THEN sl.timestamp END), u.last_login) as lastLogin
      FROM users u
      LEFT JOIN system_logs sl ON u.id = sl.user_id AND sl.timestamp >= NOW() - INTERVAL '${interval}'
      LEFT JOIN bookmarks b ON u.id = b.user_id AND b.is_deleted = false
      GROUP BY u.id, u.email, u.last_login
      ORDER BY u.created_at DESC
      LIMIT 20
    `);

    const totalUsers = parseInt(totalUsersResult.rows[0].count);
    const activeToday = parseInt(activeTodayResult.rows[0].count);
    const totalActions = parseInt(totalActionsResult.rows[0].count);
    const avgActionsPerUser = activeToday > 0 ? totalActions / activeToday : 0;

    const data = {
      recentActivities: recentActivitiesResult.rows,
      topUsers: topUsersResult.rows,
      activitySummary: {
        totalUsers,
        activeToday,
        totalActions,
        avgActionsPerUser,
        peakHour: '14:00', // Placeholder
        mostCommonAction: 'search' // Placeholder
      },
      userStats: userStatsResult.rows
    };

    res.json(data);
  } catch (error) {
    unifiedLogger.error('Failed to get user activity', error, {
      service: 'api',
      source: 'GET /admin/users/activity',
      adminId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get user activity' });
  }
});

export default router;