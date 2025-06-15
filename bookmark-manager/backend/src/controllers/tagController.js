import { query } from '../config/database.js';
import { validationResult } from 'express-validator';

// Get all tags for a user
export async function getTags(req, res) {
  try {
    const result = await query(
      `SELECT 
        t.*,
        COUNT(DISTINCT bt.bookmark_id) as bookmark_count
      FROM tags t
      LEFT JOIN bookmark_tags bt ON t.id = bt.tag_id
      WHERE t.user_id = $1
      GROUP BY t.id
      ORDER BY bookmark_count DESC, t.name ASC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
}

// Create a new tag
export async function createTag(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, color = '#808080' } = req.body;

    const result = await query(
      `INSERT INTO tags (user_id, name, color)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, name, color]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating tag:', error);
    if (error.code === '23505') { // Unique violation
      res.status(409).json({ error: 'Tag already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create tag' });
    }
  }
}

// Update a tag
export async function updateTag(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, color } = req.body;

    const result = await query(
      `UPDATE tags
       SET name = COALESCE($1, name),
           color = COALESCE($2, color)
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [name, color, id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating tag:', error);
    if (error.code === '23505') { // Unique violation
      res.status(409).json({ error: 'Tag name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update tag' });
    }
  }
}

// Delete a tag
export async function deleteTag(req, res) {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM tags WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
}

// Get bookmarks by tag
export async function getBookmarksByTag(req, res) {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verify tag ownership
    const tagResult = await query(
      'SELECT name FROM tags WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (tagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const tag = tagResult.rows[0];

    // Get bookmarks with this tag
    const bookmarksResult = await query(
      `SELECT 
        b.*,
        array_agg(
          json_build_object('id', t.id, 'name', t.name, 'color', t.color)
        ) FILTER (WHERE t.id IS NOT NULL) as tags
      FROM bookmarks b
      JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN bookmark_tags bt2 ON b.id = bt2.bookmark_id
      LEFT JOIN tags t ON bt2.tag_id = t.id
      WHERE bt.tag_id = $1 AND b.user_id = $2
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT $3 OFFSET $4`,
      [id, req.user.id, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM bookmarks b
       JOIN bookmark_tags bt ON b.id = bt.bookmark_id
       WHERE bt.tag_id = $1 AND b.user_id = $2`,
      [id, req.user.id]
    );

    res.json({
      tag,
      bookmarks: bookmarksResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bookmarks by tag:', error);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
}