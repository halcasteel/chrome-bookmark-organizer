import express from 'express';
import { query, getClient } from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';
import a2aTaskManager from '../services/a2aTaskManager.js';

const router = express.Router();

/**
 * GET /api/bookmarks
 * Get user's bookmarks with pagination
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, isDeadLink, userId } = req.query;
    const offset = (page - 1) * limit;
    
    unifiedLogger.info('Fetching bookmarks', {
      service: 'api',
      source: 'GET /bookmarks',
      userId: req.user.id,
      isAdmin: req.user.role === 'admin',
      filters: { page, limit, search, category, isDeadLink, userId }
    });
    
    // Admin can view all bookmarks or filter by userId
    const isAdmin = req.user.role === 'admin';
    const targetUserId = isAdmin && userId ? userId : req.user.id;
    
    let sql = `
      SELECT b.*, 
             bm.category, 
             bm.subcategory,
             array_agg(DISTINCT t.name) AS tags,
             u.email as user_email
      FROM bookmarks b
      LEFT JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE b.is_deleted = false
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // If not admin or if admin wants specific user's bookmarks
    if (!isAdmin || userId) {
      sql += ` AND b.user_id = $${paramIndex}`;
      params.push(targetUserId);
      paramIndex++;
    }
    
    if (search) {
      sql += ` AND (b.title ILIKE $${paramIndex} OR b.description ILIKE $${paramIndex} OR b.url ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (category) {
      sql += ` AND bm.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (isDeadLink !== undefined) {
      sql += ` AND b.is_dead = $${paramIndex}`;
      params.push(isDeadLink === 'true');
      paramIndex++;
    }
    
    sql += ` GROUP BY b.id, bm.category, bm.subcategory, u.email`;
    sql += ` ORDER BY b.created_at DESC`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await query(sql, params);
    
    // Get total count
    let countSql = `
      SELECT COUNT(DISTINCT b.id) as total
      FROM bookmarks b
      LEFT JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
      WHERE b.is_deleted = false
    `;
    
    const countParams = params.slice(0, -2); // Remove limit and offset
    
    // Apply the same filters as the main query
    if (!isAdmin || userId) {
      countSql += ` AND b.user_id = $1`;
    }
    
    if (search) {
      const searchIndex = (!isAdmin || userId) ? 2 : 1;
      countSql += ` AND (b.title ILIKE $${searchIndex} OR b.description ILIKE $${searchIndex} OR b.url ILIKE $${searchIndex})`;
    }
    
    if (category) {
      const categoryIndex = params.indexOf(category) + 1;
      countSql += ` AND bm.category = $${categoryIndex}`;
    }
    
    if (isDeadLink !== undefined) {
      const deadLinkIndex = params.indexOf(isDeadLink === 'true') + 1;
      countSql += ` AND b.is_dead = $${deadLinkIndex}`;
    }
    
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0]?.total || 0);
    
    unifiedLogger.info('Bookmarks retrieved successfully', {
      service: 'api',
      source: 'GET /bookmarks',
      userId: req.user.id,
      bookmarkCount: result.rows.length,
      totalCount: total,
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
    unifiedLogger.error('Failed to fetch bookmarks', error, {
      service: 'api',
      source: 'GET /bookmarks',
      userId: req.user.id,
      filters: req.query
    });
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
    
    unifiedLogger.info('Creating new bookmark', {
      service: 'api',
      source: 'POST /bookmarks',
      userId: req.user.id,
      url,
      title,
      tagCount: tags.length,
      hasCollection: !!collectionId
    });
    
    if (!url || !title) {
      unifiedLogger.warn('Bookmark creation failed - missing required fields', {
        service: 'api',
        source: 'POST /bookmarks',
        userId: req.user.id,
        hasUrl: !!url,
        hasTitle: !!title
      });
      return res.status(400).json({ error: 'URL and title are required' });
    }
    
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Create bookmark
      const bookmarkResult = await client.query(
        `INSERT INTO bookmarks (user_id, url, title, description, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
        [req.user.id, url, title, description]
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
            [tagName.toLowerCase(), req.user.id]
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
      
      // Queue the bookmark for validation and enrichment using A2A Task Manager directly
      const task = await a2aTaskManager.createTask('reprocess', {
        bookmarkIds: [bookmark.id],
        userId: req.user.id,
        priority: 'normal'
      });
      
      unifiedLogger.info('Bookmark created and queued for A2A workflow', {
        service: 'api',
        source: 'POST /bookmarks',
        userId: req.user.id,
        bookmarkId: bookmark.id,
        taskId: task.id,
        workflowType: 'reprocess',
        url: bookmark.url,
        title: bookmark.title,
        tagCount: tags.length,
        collectionId
      });
      
      res.status(201).json(bookmark);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    unifiedLogger.error('Failed to create bookmark', error, {
      service: 'api',
      source: 'POST /bookmarks',
      userId: req.user.id,
      bookmarkData: req.body
    });
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

/**
 * GET /api/bookmarks/:id
 * Get a single bookmark by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const bookmarkId = req.params.id;
    const isAdmin = req.user.role === 'admin';
    
    unifiedLogger.info('Fetching single bookmark', {
      service: 'api',
      source: 'GET /bookmarks/:id',
      userId: req.user.id,
      bookmarkId,
      isAdmin
    });
    
    let sql = `SELECT b.*, 
              bm.category, 
              bm.subcategory,
              array_agg(DISTINCT t.name) AS tags,
              u.email as user_email
       FROM bookmarks b
       LEFT JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
       LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
       LEFT JOIN tags t ON bt.tag_id = t.id
       LEFT JOIN users u ON b.user_id = u.id
       WHERE b.id = $1 AND b.is_deleted = false`;
    
    const params = [bookmarkId];
    
    // Non-admin users can only see their own bookmarks
    if (!isAdmin) {
      sql += ' AND b.user_id = $2';
      params.push(req.user.id);
    }
    
    sql += ' GROUP BY b.id, bm.category, bm.subcategory, u.email';
    
    const result = await query(sql, params);
    
    if (result.rows.length === 0) {
      unifiedLogger.warn('Bookmark not found', {
        service: 'api',
        source: 'GET /bookmarks/:id',
        userId: req.user.id,
        bookmarkId,
        isAdmin
      });
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    unifiedLogger.info('Bookmark retrieved successfully', {
      service: 'api',
      source: 'GET /bookmarks/:id',
      userId: req.user.id,
      bookmarkId,
      bookmarkOwnerId: result.rows[0].user_id
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    unifiedLogger.error('Failed to get bookmark', error, {
      service: 'api',
      source: 'GET /bookmarks/:id',
      userId: req.user.id,
      bookmarkId: req.params.id
    });
    res.status(500).json({ error: 'Failed to get bookmark' });
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
    
    unifiedLogger.info('Updating bookmark', {
      service: 'api',
      source: 'PUT /bookmarks/:id',
      userId: req.user.id,
      bookmarkId,
      hasTitle: !!title,
      hasDescription: !!description,
      hasTags: !!tags
    });
    
    const result = await query(
      `UPDATE bookmarks 
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [title, description, bookmarkId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      unifiedLogger.warn('Update failed - bookmark not found', {
        service: 'api',
        source: 'PUT /bookmarks/:id',
        userId: req.user.id,
        bookmarkId
      });
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    unifiedLogger.info('Bookmark updated successfully', {
      service: 'api',
      source: 'PUT /bookmarks/:id',
      userId: req.user.id,
      bookmarkId,
      updatedTitle: result.rows[0].title,
      updatedDescription: result.rows[0].description
    });
    
    res.json(result.rows[0]);
  } catch (error) {
    unifiedLogger.error('Failed to update bookmark', error, {
      service: 'api',
      source: 'PUT /bookmarks/:id',
      userId: req.user.id,
      bookmarkId: req.params.id,
      updateData: req.body
    });
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

/**
 * DELETE /api/bookmarks/:id
 * Soft delete a bookmark
 */
router.delete('/:id', async (req, res) => {
  try {
    const bookmarkId = req.params.id;
    
    unifiedLogger.info('Soft deleting bookmark', {
      service: 'api',
      source: 'DELETE /bookmarks/:id',
      userId: req.user.id,
      bookmarkId
    });
    const result = await query(
      `UPDATE bookmarks 
       SET is_deleted = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [bookmarkId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      unifiedLogger.warn('Delete failed - bookmark not found', {
        service: 'api',
        source: 'DELETE /bookmarks/:id',
        userId: req.user.id,
        bookmarkId
      });
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    unifiedLogger.info('Bookmark deleted successfully', {
      service: 'api',
      source: 'DELETE /bookmarks/:id',
      userId: req.user.id,
      bookmarkId
    });
    
    res.json({ message: 'Bookmark deleted successfully' });
  } catch (error) {
    unifiedLogger.error('Failed to delete bookmark', error, {
      service: 'api',
      source: 'DELETE /bookmarks/:id',
      userId: req.user.id,
      bookmarkId: req.params.id
    });
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

export default router;