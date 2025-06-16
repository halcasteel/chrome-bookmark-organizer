import express from 'express';
import db from '../config/database.js';
import unifiedLogger from '../services/unifiedLogger.js';

const router = express.Router();

/**
 * GET /api/tags
 * Get user's tags with usage count
 */
router.get('/', async (req, res) => {
  try {
    unifiedLogger.info('Fetching user tags', {
      service: 'api',
      source: 'GET /tags',
      userId: req.user.userId
    });
    const result = await db.query(
      `SELECT t.*, COUNT(bt.bookmark_id) as usage_count
       FROM tags t
       LEFT JOIN bookmark_tags bt ON t.id = bt.tag_id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY usage_count DESC, t.name ASC`,
      [req.user.userId]
    );
    
    unifiedLogger.info('Tags retrieved successfully', {
      service: 'api',
      source: 'GET /tags',
      userId: req.user.userId,
      tagCount: result.rows.length
    });
    
    res.json({ tags: result.rows });
  } catch (error) {
    unifiedLogger.error('Failed to fetch tags', error, {
      service: 'api',
      source: 'GET /tags',
      userId: req.user.userId
    });
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

/**
 * POST /api/tags
 * Create new tag
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    unifiedLogger.info('Creating new tag', {
      service: 'api',
      source: 'POST /tags',
      userId: req.user.userId,
      tagName: name
    });
    
    if (!name) {
      unifiedLogger.warn('Tag creation failed - missing name', {
        service: 'api',
        source: 'POST /tags',
        userId: req.user.userId
      });
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const result = await db.query(
      `INSERT INTO tags (name, user_id, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (name, user_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name.toLowerCase(), req.user.userId]
    );
    
    unifiedLogger.info('Tag created successfully', {
      service: 'api',
      source: 'POST /tags',
      userId: req.user.userId,
      tagId: result.rows[0].id,
      tagName: result.rows[0].name
    });
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    unifiedLogger.error('Failed to create tag', error, {
      service: 'api',
      source: 'POST /tags',
      userId: req.user.userId,
      tagName: req.body.name
    });
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

/**
 * DELETE /api/tags/:id
 * Delete tag
 */
router.delete('/:id', async (req, res) => {
  try {
    const tagId = req.params.id;
    
    unifiedLogger.info('Deleting tag', {
      service: 'api',
      source: 'DELETE /tags/:id',
      userId: req.user.userId,
      tagId
    });
    const result = await db.query(
      'DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id',
      [tagId, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      unifiedLogger.warn('Tag deletion failed - not found', {
        service: 'api',
        source: 'DELETE /tags/:id',
        userId: req.user.userId,
        tagId
      });
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    unifiedLogger.info('Tag deleted successfully', {
      service: 'api',
      source: 'DELETE /tags/:id',
      userId: req.user.userId,
      tagId
    });
    
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    unifiedLogger.error('Failed to delete tag', error, {
      service: 'api',
      source: 'DELETE /tags/:id',
      userId: req.user.userId,
      tagId: req.params.id
    });
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

export default router;