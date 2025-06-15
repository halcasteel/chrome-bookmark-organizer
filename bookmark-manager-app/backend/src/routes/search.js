import express from 'express';
import db from '../config/database.js';
import { logInfo, logError } from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/search
 * Search bookmarks with various filters
 */
router.post('/', async (req, res) => {
  try {
    const {
      query,
      category,
      tags,
      dateFrom,
      dateTo,
      isDeadLink,
      limit = 20,
      offset = 0,
    } = req.body;
    
    let searchQuery = `
      SELECT DISTINCT b.*,
             bm.category,
             bm.subcategory,
             array_agg(DISTINCT t.name) AS tags,
             ts_rank(to_tsvector('english', b.title || ' ' || COALESCE(b.description, '')), 
                     to_tsquery('english', $2)) AS rank
      FROM bookmarks b
      LEFT JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
      LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
      LEFT JOIN tags t ON bt.tag_id = t.id
      WHERE b.user_id = $1 AND b.is_deleted = false
    `;
    
    const params = [req.user.userId];
    let paramIndex = 2;
    
    if (query) {
      // Convert query to PostgreSQL full-text search format
      const tsQuery = query.split(' ').join(' & ');
      params.push(tsQuery);
      searchQuery += ` AND to_tsvector('english', b.title || ' ' || COALESCE(b.description, '')) @@ to_tsquery('english', $${paramIndex})`;
      paramIndex++;
    } else {
      params.push(''); // Placeholder for rank calculation
      paramIndex++;
    }
    
    if (category) {
      searchQuery += ` AND bm.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (tags && tags.length > 0) {
      searchQuery += ` AND t.name = ANY($${paramIndex})`;
      params.push(tags);
      paramIndex++;
    }
    
    if (dateFrom) {
      searchQuery += ` AND b.created_at >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }
    
    if (dateTo) {
      searchQuery += ` AND b.created_at <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }
    
    if (isDeadLink !== undefined) {
      searchQuery += ` AND b.is_dead = $${paramIndex}`;
      params.push(isDeadLink);
      paramIndex++;
    }
    
    searchQuery += ` GROUP BY b.id, bm.category, bm.subcategory`;
    searchQuery += ` ORDER BY rank DESC, b.created_at DESC`;
    searchQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await db.query(searchQuery, params);
    
    res.json({
      results: result.rows,
      query,
      limit,
      offset,
    });
  } catch (error) {
    logError(error, { context: 'POST /api/search' });
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * POST /api/search/semantic
 * Semantic search using embeddings
 */
router.post('/semantic', async (req, res) => {
  try {
    const { query, limit = 20, similarityThreshold = 0.7 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // This is a placeholder - actual implementation would:
    // 1. Generate embedding for the query using OpenAI
    // 2. Search using pgvector similarity
    
    res.json({
      message: 'Semantic search endpoint - implementation pending',
      query,
      results: [],
    });
  } catch (error) {
    logError(error, { context: 'POST /api/search/semantic' });
    res.status(500).json({ error: 'Semantic search failed' });
  }
});

/**
 * GET /api/search/suggestions
 * Get search suggestions based on user's bookmarks
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }
    
    const result = await db.query(
      `SELECT DISTINCT title
       FROM bookmarks
       WHERE user_id = $1 
         AND is_deleted = false
         AND title ILIKE $2
       ORDER BY title
       LIMIT 10`,
      [req.user.userId, `%${q}%`]
    );
    
    res.json({
      suggestions: result.rows.map(row => row.title),
    });
  } catch (error) {
    logError(error, { context: 'GET /api/search/suggestions' });
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

export default router;