import { query, transaction } from '../config/database.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { BookmarkImportService } from '../services/bookmarkImportService.js';
import { validationResult } from 'express-validator';

const embeddingService = new EmbeddingService();
const importService = new BookmarkImportService();

// Get all bookmarks for a user
export async function getBookmarks(req, res) {
  try {
    const { page = 1, limit = 50, tag, search, isDead } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE b.user_id = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (tag) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM bookmark_tags bt 
        JOIN tags t ON bt.tag_id = t.id 
        WHERE bt.bookmark_id = b.id AND t.name = $${paramIndex}
      )`;
      params.push(tag);
      paramIndex++;
    }

    if (isDead !== undefined) {
      whereClause += ` AND b.is_dead = $${paramIndex}`;
      params.push(isDead === 'true');
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (
        b.title ILIKE $${paramIndex} OR 
        b.url ILIKE $${paramIndex} OR 
        b.description ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Add pagination params
    params.push(limit);
    params.push(offset);

    const result = await query(
      `SELECT 
        b.*,
        array_agg(
          json_build_object('id', t.id, 'name', t.name, 'color', t.color)
        ) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM bookmarks b
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      ${whereClause}
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(DISTINCT b.id) as total
       FROM bookmarks b
       LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
       LEFT JOIN tags t ON bt.tag_id = t.id
       ${whereClause}`,
      params.slice(0, -2) // Remove limit and offset
    );

    res.json({
      bookmarks: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
}

// Create a new bookmark
export async function createBookmark(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { url, title, description, tags = [] } = req.body;

    const bookmarkResult = await transaction(async (client) => {
      // Insert bookmark
      const insertResult = await client.query(
        `INSERT INTO bookmarks (user_id, url, title, description)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.user.id, url, title, description]
      );

      const bookmark = insertResult.rows[0];

      // Handle tags
      const tagObjects = [];
      for (const tagName of tags) {
        const tagResult = await client.query(
          `INSERT INTO tags (user_id, name)
           VALUES ($1, $2)
           ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING *`,
          [req.user.id, tagName]
        );

        const tag = tagResult.rows[0];
        tagObjects.push(tag);

        // Link bookmark to tag
        await client.query(
          `INSERT INTO bookmark_tags (bookmark_id, tag_id)
           VALUES ($1, $2)`,
          [bookmark.id, tag.id]
        );
      }

      bookmark.tags = tagObjects;
      return bookmark;
    });

    // Generate embedding asynchronously
    embeddingService.generateBookmarkEmbedding(bookmarkResult)
      .then(embedding => embeddingService.updateBookmarkEmbedding(bookmarkResult.id, embedding))
      .catch(console.error);

    res.status(201).json(bookmarkResult);
  } catch (error) {
    console.error('Error creating bookmark:', error);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
}

// Update a bookmark
export async function updateBookmark(req, res) {
  try {
    const { id } = req.params;
    const { title, description, tags } = req.body;

    const result = await transaction(async (client) => {
      // Update bookmark
      const updateResult = await client.query(
        `UPDATE bookmarks
         SET title = COALESCE($1, title),
             description = COALESCE($2, description)
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [title, description, id, req.user.id]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('Bookmark not found');
      }

      const bookmark = updateResult.rows[0];

      // Update tags if provided
      if (tags !== undefined) {
        // Remove existing tags
        await client.query(
          'DELETE FROM bookmark_tags WHERE bookmark_id = $1',
          [id]
        );

        // Add new tags
        const tagObjects = [];
        for (const tagName of tags) {
          const tagResult = await client.query(
            `INSERT INTO tags (user_id, name)
             VALUES ($1, $2)
             ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING *`,
            [req.user.id, tagName]
          );

          const tag = tagResult.rows[0];
          tagObjects.push(tag);

          await client.query(
            `INSERT INTO bookmark_tags (bookmark_id, tag_id)
             VALUES ($1, $2)`,
            [bookmark.id, tag.id]
          );
        }

        bookmark.tags = tagObjects;
      }

      return bookmark;
    });

    // Update embedding if title or description changed
    if (title || description) {
      embeddingService.generateBookmarkEmbedding(result)
        .then(embedding => embeddingService.updateBookmarkEmbedding(result.id, embedding))
        .catch(console.error);
    }

    res.json(result);
  } catch (error) {
    console.error('Error updating bookmark:', error);
    if (error.message === 'Bookmark not found') {
      res.status(404).json({ error: 'Bookmark not found' });
    } else {
      res.status(500).json({ error: 'Failed to update bookmark' });
    }
  }
}

// Delete a bookmark
export async function deleteBookmark(req, res) {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    res.json({ message: 'Bookmark deleted successfully' });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
}

// Search bookmarks using semantic search
export async function searchBookmarks(req, res) {
  try {
    const { q, limit = 20, threshold = 0.7 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = await embeddingService.searchBookmarks(
      req.user.id,
      q,
      parseInt(limit),
      parseFloat(threshold)
    );

    res.json({ results });
  } catch (error) {
    console.error('Error searching bookmarks:', error);
    res.status(500).json({ error: 'Failed to search bookmarks' });
  }
}

// Import bookmarks from HTML file
export async function importBookmarks(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const htmlContent = req.file.buffer.toString('utf-8');
    const result = await importService.importBookmarks(
      req.user.id,
      htmlContent,
      req.file.originalname
    );

    res.json(result);
  } catch (error) {
    console.error('Error importing bookmarks:', error);
    res.status(500).json({ error: 'Failed to import bookmarks' });
  }
}

// Get import history
export async function getImportHistory(req, res) {
  try {
    const history = await importService.getImportHistory(req.user.id);
    res.json(history);
  } catch (error) {
    console.error('Error fetching import history:', error);
    res.status(500).json({ error: 'Failed to fetch import history' });
  }
}

// Find duplicate bookmarks
export async function findDuplicates(req, res) {
  try {
    const { threshold = 0.85 } = req.query;

    const result = await query(
      `SELECT 
        b1.id as original_id,
        b1.url as original_url,
        b1.title as original_title,
        b2.id as duplicate_id,
        b2.url as duplicate_url,
        b2.title as duplicate_title,
        1 - (b1.embedding <=> b2.embedding) as similarity
      FROM bookmarks b1
      JOIN bookmarks b2 ON b1.user_id = b2.user_id AND b1.id < b2.id
      WHERE b1.user_id = $1
        AND b1.embedding IS NOT NULL
        AND b2.embedding IS NOT NULL
        AND 1 - (b1.embedding <=> b2.embedding) >= $2
      ORDER BY similarity DESC
      LIMIT 50`,
      [req.user.id, parseFloat(threshold)]
    );

    res.json({ duplicates: result.rows });
  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({ error: 'Failed to find duplicates' });
  }
}