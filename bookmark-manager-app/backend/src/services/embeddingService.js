import OpenAI from 'openai';
import { query, createEmbedding } from '../db/index.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Local embedding fallback using TF-IDF (for when OpenAI is not available)
class LocalEmbedder {
  constructor() {
    this.vocabulary = new Map();
    this.idf = new Map();
    this.dimension = 1536; // Match OpenAI's dimension
  }

  // Simple TF-IDF based embedding for local/offline use
  generateEmbedding(text) {
    // This is a placeholder - in production you'd use a proper local embedding model
    // For now, return a random vector for testing
    const embedding = new Array(this.dimension).fill(0).map(() => Math.random() * 0.1);
    return embedding;
  }
}

const localEmbedder = new LocalEmbedder();

export class EmbeddingService {
  constructor() {
    this.useOpenAI = !!process.env.OPENAI_API_KEY;
    this.batchSize = 100;
    this.embeddingCache = new Map();
  }

  // Generate embedding for a single text
  async generateEmbedding(text) {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Check cache
    const cacheKey = this.getCacheKey(text);
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey);
    }

    try {
      let embedding;

      if (this.useOpenAI) {
        // Use OpenAI API
        const response = await openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: text.slice(0, 8191), // OpenAI's token limit
        });
        
        embedding = response.data[0].embedding;
      } else {
        // Use local embedder
        logger.info('Using local embedder (OpenAI API key not configured)');
        embedding = localEmbedder.generateEmbedding(text);
      }

      // Cache the result
      this.embeddingCache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      
      // Fallback to local embedder if OpenAI fails
      if (this.useOpenAI) {
        logger.info('Falling back to local embedder');
        return localEmbedder.generateEmbedding(text);
      }
      
      throw error;
    }
  }

  // Generate embeddings for multiple texts
  async generateEmbeddings(texts) {
    const results = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      results.push(...batchEmbeddings);
    }
    
    return results;
  }

  // Create embedding text from bookmark data
  createBookmarkText(bookmark) {
    const parts = [
      bookmark.title,
      bookmark.description,
      bookmark.domain,
      bookmark.keywords?.join(' '),
      bookmark.ogTitle,
      bookmark.ogDescription,
      bookmark.contentSnippet
    ].filter(Boolean);
    
    return parts.join(' | ').slice(0, 8000); // Keep under token limit
  }

  // Store embedding in database
  async storeEmbedding(bookmarkId, embedding) {
    const sql = `
      INSERT INTO bookmark_embeddings (bookmark_id, embedding)
      VALUES ($1, $2)
      ON CONFLICT (bookmark_id) 
      DO UPDATE SET embedding = $2, created_at = CURRENT_TIMESTAMP
      RETURNING id
    `;
    
    const result = await query(sql, [bookmarkId, createEmbedding(embedding)]);
    return result.rows[0];
  }

  // Process bookmark for embedding
  async processBookmark(bookmark) {
    try {
      // Create text representation
      const text = this.createBookmarkText(bookmark);
      
      // Generate embedding
      const embedding = await this.generateEmbedding(text);
      
      // Store in database
      await this.storeEmbedding(bookmark.id, embedding);
      
      logger.info(`Processed embedding for bookmark ${bookmark.id}`);
      return true;
    } catch (error) {
      logger.error(`Error processing bookmark ${bookmark.id}:`, error);
      return false;
    }
  }

  // Process multiple bookmarks
  async processBookmarks(bookmarks) {
    const results = {
      successful: 0,
      failed: 0
    };
    
    // Process in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < bookmarks.length; i += concurrency) {
      const batch = bookmarks.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(bookmark => this.processBookmark(bookmark))
      );
      
      batchResults.forEach(success => {
        if (success) results.successful++;
        else results.failed++;
      });
    }
    
    return results;
  }

  // Search similar bookmarks using vector similarity
  async searchSimilar(queryText, userId, options = {}) {
    const {
      limit = 20,
      threshold = 0.5
    } = options;
    
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(queryText);
    
    // Search in database
    const sql = `
      SELECT * FROM search_bookmarks_semantic($1, $2, $3, $4)
    `;
    
    const result = await query(sql, [
      createEmbedding(queryEmbedding),
      userId,
      threshold,
      limit
    ]);
    
    return result.rows;
  }

  // Get cache key for text
  getCacheKey(text) {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `embed_${hash}`;
  }

  // Clear embedding cache
  clearCache() {
    this.embeddingCache.clear();
    logger.info('Embedding cache cleared');
  }
}

// Export singleton instance
export default new EmbeddingService();