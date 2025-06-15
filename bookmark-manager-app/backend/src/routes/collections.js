import express from 'express';
import db from '../config/database.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/collections
 * Get user's collections
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, COUNT(bc.bookmark_id) as bookmark_count
       FROM collections c
       LEFT JOIN bookmark_collections bc ON c.id = bc.collection_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user.userId]
    );
    
    res.json({ collections: result.rows });
  } catch (error) {
    logError(error, { context: 'GET /api/collections' });
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

/**
 * POST /api/collections
 * Create new collection
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, isPublic = false } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Collection name is required' });
    }
    
    const result = await db.query(
      `INSERT INTO collections (user_id, name, description, is_public, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [req.user.userId, name, description, isPublic]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError(error, { context: 'POST /api/collections' });
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

/**
 * PUT /api/collections/:id
 * Update collection
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;
    
    const result = await db.query(
      `UPDATE collections 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_public = COALESCE($3, is_public),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, description, isPublic, req.params.id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logError(error, { context: 'PUT /api/collections/:id' });
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

/**
 * DELETE /api/collections/:id
 * Delete collection
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    logError(error, { context: 'DELETE /api/collections/:id' });
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

export default router;