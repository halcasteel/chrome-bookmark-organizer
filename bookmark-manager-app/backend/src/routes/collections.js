import express from 'express';
import db from '../config/database.js';
import unifiedLogger from '../services/unifiedLogger.js';

const router = express.Router();

/**
 * GET /api/collections
 * Get user's collections
 */
router.get('/', async (req, res) => {
  try {
    unifiedLogger.info('Fetching user collections', {
      service: 'api',
      source: 'GET /collections',
      userId: req.user.userId
    });
    const result = await db.query(
      `SELECT c.*, COUNT(bc.bookmark_id) as bookmark_count
       FROM collections c
       LEFT JOIN bookmark_collections bc ON c.id = bc.collection_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user.userId]
    );
    
    unifiedLogger.info('Collections retrieved successfully', {
      service: 'api',
      source: 'GET /collections',
      userId: req.user.userId,
      collectionCount: result.rows.length
    });
    
    res.json({ collections: result.rows });
  } catch (error) {
    unifiedLogger.error('Failed to fetch collections', error, {
      service: 'api',
      source: 'GET /collections',
      userId: req.user.userId
    });
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
    
    unifiedLogger.info('Creating new collection', {
      service: 'api',
      source: 'POST /collections',
      userId: req.user.userId,
      collectionName: name,
      isPublic
    });
    
    if (!name) {
      unifiedLogger.warn('Collection creation failed - missing name', {
        service: 'api',
        source: 'POST /collections',
        userId: req.user.userId
      });
      return res.status(400).json({ error: 'Collection name is required' });
    }
    
    const result = await db.query(
      `INSERT INTO collections (user_id, name, description, is_public, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING *`,
      [req.user.userId, name, description, isPublic]
    );
    
    unifiedLogger.info('Collection created successfully', {
      service: 'api',
      source: 'POST /collections',
      userId: req.user.userId,
      collectionId: result.rows[0].id,
      collectionName: result.rows[0].name
    });
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    unifiedLogger.error('Failed to create collection', error, {
      service: 'api',
      source: 'POST /collections',
      userId: req.user.userId,
      collectionData: req.body
    });
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
    const collectionId = req.params.id;
    
    unifiedLogger.info('Updating collection', {
      service: 'api',
      source: 'PUT /collections/:id',
      userId: req.user.userId,
      collectionId,
      hasName: !!name,
      hasDescription: !!description,
      hasIsPublic: isPublic !== undefined
    });
    
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
      unifiedLogger.warn('Update failed - collection not found', {
        service: 'api',
        source: 'PUT /collections/:id',
        userId: req.user.userId,
        collectionId
      });
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    unifiedLogger.info('Collection updated successfully', {
      service: 'api',
      source: 'PUT /collections/:id',
      userId: req.user.userId,
      collectionId,
      updatedName: result.rows[0].name,
      updatedIsPublic: result.rows[0].is_public
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    unifiedLogger.error('Failed to update collection', error, {
      service: 'api',
      source: 'PUT /collections/:id',
      userId: req.user.userId,
      collectionId: req.params.id,
      updateData: req.body
    });
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

/**
 * DELETE /api/collections/:id
 * Delete collection
 */
router.delete('/:id', async (req, res) => {
  try {
    const collectionId = req.params.id;
    
    unifiedLogger.warn('Deleting collection', {
      service: 'api',
      source: 'DELETE /collections/:id',
      userId: req.user.userId,
      collectionId
    });
    const result = await db.query(
      'DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id',
      [collectionId, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      unifiedLogger.warn('Delete failed - collection not found', {
        service: 'api',
        source: 'DELETE /collections/:id',
        userId: req.user.userId,
        collectionId
      });
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    unifiedLogger.info('Collection deleted successfully', {
      service: 'api',
      source: 'DELETE /collections/:id',
      userId: req.user.userId,
      collectionId
    });
    
    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    unifiedLogger.error('Failed to delete collection', error, {
      service: 'api',
      source: 'DELETE /collections/:id',
      userId: req.user.userId,
      collectionId: req.params.id
    });
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

export default router;