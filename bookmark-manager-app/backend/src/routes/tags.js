import express from 'express';
import db from '../config/database.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/tags
 * Get user's tags with usage count
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, COUNT(bt.bookmark_id) as usage_count
       FROM tags t
       LEFT JOIN bookmark_tags bt ON t.id = bt.tag_id
       WHERE t.user_id = $1
       GROUP BY t.id
       ORDER BY usage_count DESC, t.name ASC`,
      [req.user.userId]
    );
    
    res.json({ tags: result.rows });
  } catch (error) {
    logError(error, { context: 'GET /api/tags' });
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
    
    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const result = await db.query(
      `INSERT INTO tags (name, user_id, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (name, user_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name.toLowerCase(), req.user.userId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError(error, { context: 'POST /api/tags' });
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

/**
 * DELETE /api/tags/:id
 * Delete tag
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }
    
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    logError(error, { context: 'DELETE /api/tags/:id' });
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

export default router;