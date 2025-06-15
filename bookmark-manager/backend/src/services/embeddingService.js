import OpenAI from 'openai';
import { query } from '../config/database.js';
import { pgvector } from 'pgvector/pg';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class EmbeddingService {
  // Generate embedding for text using OpenAI
  async generateEmbedding(text) {
    try {
      // Limit text length to avoid token limits
      const truncatedText = text.substring(0, 8000);
      
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: truncatedText,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  // Generate embedding for a bookmark
  async generateBookmarkEmbedding(bookmark) {
    // Combine relevant fields for embedding
    const textForEmbedding = [
      bookmark.title,
      bookmark.url,
      bookmark.description || '',
    ].join(' ');
    
    return this.generateEmbedding(textForEmbedding);
  }

  // Update bookmark embedding in database
  async updateBookmarkEmbedding(bookmarkId, embedding) {
    const embeddingString = pgvector.toSql(embedding);
    
    await query(
      'UPDATE bookmarks SET embedding = $1 WHERE id = $2',
      [embeddingString, bookmarkId]
    );
  }

  // Search bookmarks using semantic similarity
  async searchBookmarks(userId, queryText, limit = 20, threshold = 0.7) {
    try {
      // Generate embedding for search query
      const queryEmbedding = await this.generateEmbedding(queryText);
      const embeddingString = pgvector.toSql(queryEmbedding);
      
      // Search using the database function
      const result = await query(
        `SELECT 
          b.id,
          b.url,
          b.title,
          b.description,
          b.favicon_url,
          b.created_at,
          b.updated_at,
          1 - (b.embedding <=> $1) as similarity,
          array_agg(
            json_build_object('id', t.id, 'name', t.name, 'color', t.color)
          ) FILTER (WHERE t.id IS NOT NULL) as tags
        FROM bookmarks b
        LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
        LEFT JOIN tags t ON bt.tag_id = t.id
        WHERE b.user_id = $2
          AND b.embedding IS NOT NULL
          AND b.is_dead = FALSE
          AND 1 - (b.embedding <=> $1) >= $3
        GROUP BY b.id, b.embedding
        ORDER BY b.embedding <=> $1
        LIMIT $4`,
        [embeddingString, userId, threshold, limit]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error searching bookmarks:', error);
      throw new Error('Failed to search bookmarks');
    }
  }

  // Find similar bookmarks (for duplicate detection)
  async findSimilarBookmarks(userId, bookmarkId, threshold = 0.85) {
    try {
      const result = await query(
        `SELECT 
          b2.id,
          b2.url,
          b2.title,
          b2.description,
          1 - (b1.embedding <=> b2.embedding) as similarity
        FROM bookmarks b1
        CROSS JOIN bookmarks b2
        WHERE b1.id = $1
          AND b1.user_id = $2
          AND b2.user_id = $2
          AND b1.id != b2.id
          AND b1.embedding IS NOT NULL
          AND b2.embedding IS NOT NULL
          AND 1 - (b1.embedding <=> b2.embedding) >= $3
        ORDER BY b1.embedding <=> b2.embedding
        LIMIT 10`,
        [bookmarkId, userId, threshold]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error finding similar bookmarks:', error);
      throw new Error('Failed to find similar bookmarks');
    }
  }

  // Batch update embeddings for multiple bookmarks
  async batchUpdateEmbeddings(userId) {
    try {
      // Get bookmarks without embeddings
      const result = await query(
        `SELECT id, title, url, description 
         FROM bookmarks 
         WHERE user_id = $1 AND embedding IS NULL 
         LIMIT 100`,
        [userId]
      );
      
      const bookmarks = result.rows;
      let updatedCount = 0;
      
      for (const bookmark of bookmarks) {
        try {
          const embedding = await this.generateBookmarkEmbedding(bookmark);
          await this.updateBookmarkEmbedding(bookmark.id, embedding);
          updatedCount++;
          
          // Add delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error updating embedding for bookmark ${bookmark.id}:`, error);
        }
      }
      
      return { updatedCount, totalCount: bookmarks.length };
    } catch (error) {
      console.error('Error batch updating embeddings:', error);
      throw new Error('Failed to batch update embeddings');
    }
  }
}