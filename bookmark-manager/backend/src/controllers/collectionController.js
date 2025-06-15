import { query, transaction } from '../config/database.js';
import { validationResult } from 'express-validator';
import crypto from 'crypto';

// Get all collections for a user
export async function getCollections(req, res) {
  try {
    const result = await query(
      `SELECT 
        c.*,
        COUNT(DISTINCT cb.bookmark_id) as bookmark_count
      FROM collections c
      LEFT JOIN collection_bookmarks cb ON c.id = cb.collection_id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
}

// Get a specific collection
export async function getCollection(req, res) {
  try {
    const { id } = req.params;

    const collectionResult = await query(
      'SELECT * FROM collections WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (collectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const collection = collectionResult.rows[0];

    // Get bookmarks in collection
    const bookmarksResult = await query(
      `SELECT 
        b.*,
        cb.position,
        array_agg(
          json_build_object('id', t.id, 'name', t.name, 'color', t.color)
        ) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM collection_bookmarks cb
      JOIN bookmarks b ON cb.bookmark_id = b.id
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE cb.collection_id = $1
      GROUP BY b.id, cb.position
      ORDER BY cb.position, cb.created_at`,
      [id]
    );

    collection.bookmarks = bookmarksResult.rows;
    res.json(collection);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
}

// Create a new collection
export async function createCollection(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, isPublic = false } = req.body;

    const result = await query(
      `INSERT INTO collections (user_id, name, description, is_public)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, name, description, isPublic]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
}

// Update a collection
export async function updateCollection(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, isPublic } = req.body;

    const result = await query(
      `UPDATE collections
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_public = COALESCE($3, is_public)
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [name, description, isPublic, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating collection:', error);
    res.status(500).json({ error: 'Failed to update collection' });
  }
}

// Delete a collection
export async function deleteCollection(req, res) {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
}

// Add bookmark to collection
export async function addBookmarkToCollection(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { bookmarkId } = req.body;

    await transaction(async (client) => {
      // Verify collection ownership
      const collectionResult = await client.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (collectionResult.rows.length === 0) {
        throw new Error('Collection not found');
      }

      // Verify bookmark ownership
      const bookmarkResult = await client.query(
        'SELECT id FROM bookmarks WHERE id = $1 AND user_id = $2',
        [bookmarkId, req.user.id]
      );

      if (bookmarkResult.rows.length === 0) {
        throw new Error('Bookmark not found');
      }

      // Get max position
      const positionResult = await client.query(
        'SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM collection_bookmarks WHERE collection_id = $1',
        [id]
      );

      // Add bookmark to collection
      await client.query(
        `INSERT INTO collection_bookmarks (collection_id, bookmark_id, position)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, bookmarkId, positionResult.rows[0].next_position]
      );
    });

    res.json({ message: 'Bookmark added to collection' });
  } catch (error) {
    console.error('Error adding bookmark to collection:', error);
    if (error.message === 'Collection not found' || error.message === 'Bookmark not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to add bookmark to collection' });
    }
  }
}

// Remove bookmark from collection
export async function removeBookmarkFromCollection(req, res) {
  try {
    const { id, bookmarkId } = req.params;

    const result = await query(
      `DELETE FROM collection_bookmarks 
       WHERE collection_id = $1 AND bookmark_id = $2
       AND EXISTS (SELECT 1 FROM collections WHERE id = $1 AND user_id = $3)
       RETURNING collection_id`,
      [id, bookmarkId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bookmark not found in collection' });
    }

    res.json({ message: 'Bookmark removed from collection' });
  } catch (error) {
    console.error('Error removing bookmark from collection:', error);
    res.status(500).json({ error: 'Failed to remove bookmark from collection' });
  }
}

// Share a collection
export async function shareCollection(req, res) {
  try {
    const { id } = req.params;

    // Generate share token
    const shareToken = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `UPDATE collections
       SET share_token = $1, is_public = true
       WHERE id = $2 AND user_id = $3
       RETURNING id, share_token`,
      [shareToken, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({
      shareUrl: `${process.env.FRONTEND_URL}/collections/shared/${shareToken}`,
      shareToken
    });
  } catch (error) {
    console.error('Error sharing collection:', error);
    res.status(500).json({ error: 'Failed to share collection' });
  }
}

// Get public collection by share token
export async function getPublicCollection(req, res) {
  try {
    const { shareToken } = req.params;

    const collectionResult = await query(
      'SELECT id, name, description, created_at FROM collections WHERE share_token = $1 AND is_public = true',
      [shareToken]
    );

    if (collectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const collection = collectionResult.rows[0];

    // Get bookmarks in collection
    const bookmarksResult = await query(
      `SELECT 
        b.url,
        b.title,
        b.description,
        b.favicon_url,
        cb.position
      FROM collection_bookmarks cb
      JOIN bookmarks b ON cb.bookmark_id = b.id
      WHERE cb.collection_id = $1 AND b.is_dead = false
      ORDER BY cb.position, cb.created_at`,
      [collection.id]
    );

    collection.bookmarks = bookmarksResult.rows;
    res.json(collection);
  } catch (error) {
    console.error('Error fetching public collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
}