import express from 'express';
import db from '../db/index.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/bookmarks
 * Get user's bookmarks with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, isDeadLink } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT b.*, 
             bm.category, 
             bm.subcategory,
             array_agg(DISTINCT t.name) AS tags
      FROM bookmarks b
      LEFT JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.user_id = $1 AND b.is_deleted = false
    `;
    
    const params = [req.user.userId];
    let paramIndex = 2;
    
    if (search) {
      query += ` AND (b.title ILIKE $${paramIndex} OR b.description ILIKE $${paramIndex} OR b.url ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (category) {
      query += ` AND bm.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (isDeadLink !== undefined) {
      query += ` AND b.is_dead = $${paramIndex}`;
      params.push(isDeadLink === 'true');
      paramIndex++;
    }
    
    query += ` GROUP BY b.id, bm.category, bm.subcategory`;
    query += ` ORDER BY b.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT b.id) as total
      FROM bookmarks b
      LEFT JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
      WHERE b.user_id = $1 AND b.is_deleted = false
      ${search ? `AND (b.title ILIKE $2 OR b.description ILIKE $2 OR b.url ILIKE $2)` : ''}
      ${category ? `AND bm.category = $${search ? 3 : 2}` : ''}
      ${isDeadLink !== undefined ? `AND b.is_dead = $${params.length - 1}` : ''}
    `;
    
    const countResult = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countResult.rows[0]?.total || 0);
    
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
    logError(error, { context: 'GET /api/bookmarks', userId: req.user.userId });
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

/**
 * POST /api/bookmarks
 * Create a new bookmark
 */
router.post('/', async (req, res) => {
  try {
    const { url, title, description, tags = [], collectionId } = req.body;
    
    if (!url || !title) {
      return res.status(400).json({ error: 'URL and title are required' });
    }
    
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Create bookmark
      const bookmarkResult = await client.query(
        `INSERT INTO bookmarks (user_id, url, title, description, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [req.user.userId, url, title, description]
      );
      
      const bookmark = bookmarkResult.rows[0];
      
      // Add tags
      if (tags.length > 0) {
        for (const tagName of tags) {
          // Get or create tag
          const tagResult = await client.query(
            `INSERT INTO tags (name, user_id)
             VALUES ($1, $2)
             ON CONFLICT (name, user_id) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [tagName.toLowerCase(), req.user.userId]
          );
          
          // Link tag to bookmark
          await client.query(
            'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)',
            [bookmark.id, tagResult.rows[0].id]
          );
        }
      }
      
      // Add to collection if specified
      if (collectionId) {
        await client.query(
          'INSERT INTO bookmark_collections (bookmark_id, collection_id) VALUES ($1, $2)',
          [bookmark.id, collectionId]
        );
      }
      
      await client.query('COMMIT');
      
      logInfo('Bookmark created', { bookmarkId: bookmark.id, userId: req.user.userId });
      res.status(201).json(bookmark);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logError(error, { context: 'POST /api/bookmarks', userId: req.user.userId });
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

/**
 * PUT /api/bookmarks/:id
 * Update a bookmark
 */
router.put('/:id', async (req, res) => {
  try {
    const { title, description, tags } = req.body;
    const bookmarkId = req.params.id;
    
    const result = await db.query(
      `UPDATE bookmarks 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [title, description, bookmarkId, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logError(error, { context: 'PUT /api/bookmarks/:id', userId: req.user.userId });
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

/**
 * DELETE /api/bookmarks/:id
 * Soft delete a bookmark
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE bookmarks 
       SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.user.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    res.json({ message: 'Bookmark deleted successfully' });
  } catch (error) {
    logError(error, { context: 'DELETE /api/bookmarks/:id', userId: req.user.userId });
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

export default router;