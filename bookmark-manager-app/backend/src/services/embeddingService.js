import OpenAI from 'openai';
import { query, createEmbedding } from '../db/index.js';
import unifiedLogger from './unifiedLogger.js';

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

    unifiedLogger.info('EmbeddingService initialized', {
      service: 'embeddingService',
      source: 'constructor',
      useOpenAI: this.useOpenAI,
      batchSize: this.batchSize
    });
  }

  // Generate embedding for a single text
  async generateEmbedding(text) {
    const startTime = Date.now();

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    unifiedLogger.debug('Generating embedding', {
      service: 'embeddingService',
      source: 'generateEmbedding',
      textLength: text.length,
      useOpenAI: this.useOpenAI
    });

    // Check cache
    const cacheKey = this.getCacheKey(text);
    if (this.embeddingCache.has(cacheKey)) {
      unifiedLogger.debug('Embedding found in cache', {
        service: 'embeddingService',
        source: 'generateEmbedding',
        cacheKey
      });
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
        unifiedLogger.info('Using local embedder (OpenAI API key not configured)', {
          service: 'embeddingService',
          source: 'generateEmbedding'
        });
        embedding = localEmbedder.generateEmbedding(text);
      }

      // Cache the result
      this.embeddingCache.set(cacheKey, embedding);

      unifiedLogger.debug('Embedding generated successfully', {
        service: 'embeddingService',
        source: 'generateEmbedding',
        duration: Date.now() - startTime,
        cached: true
      });
      
      return embedding;
    } catch (error) {
      unifiedLogger.error('Error generating embedding', {
        service: 'embeddingService',
        source: 'generateEmbedding',
        error: error.message,
        stack: error.stack,
        textLength: text.length
      });
      
      // Fallback to local embedder if OpenAI fails
      if (this.useOpenAI) {
        unifiedLogger.info('Falling back to local embedder', {
          service: 'embeddingService',
          source: 'generateEmbedding'
        });
        return localEmbedder.generateEmbedding(text);
      }
      
      throw error;
    }
  }

  // Generate embeddings for multiple texts
  async generateEmbeddings(texts) {
    const startTime = Date.now();
    unifiedLogger.info('Generating embeddings for multiple texts', {
      service: 'embeddingService',
      source: 'generateEmbeddings',
      count: texts.length,
      batchSize: this.batchSize
    });

    const results = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchEmbeddings = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      results.push(...batchEmbeddings);

      unifiedLogger.debug('Batch processed', {
        service: 'embeddingService',
        source: 'generateEmbeddings',
        batchIndex: i / this.batchSize,
        processedCount: Math.min(i + this.batchSize, texts.length)
      });
    }

    unifiedLogger.info('All embeddings generated', {
      service: 'embeddingService',
      source: 'generateEmbeddings',
      totalCount: results.length,
      duration: Date.now() - startTime
    });
    
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
    const startTime = Date.now();
    unifiedLogger.debug('Storing embedding in database', {
      service: 'embeddingService',
      source: 'storeEmbedding',
      bookmarkId
    });

    const sql = `
      INSERT INTO bookmark_embeddings (bookmark_id, embedding)
      VALUES ($1, $2)
      ON CONFLICT (bookmark_id) 
      DO UPDATE SET embedding = $2, created_at = CURRENT_TIMESTAMP
      RETURNING id
    `;
    
    const result = await query(sql, [bookmarkId, createEmbedding(embedding)]);

    unifiedLogger.debug('Embedding stored successfully', {
      service: 'embeddingService',
      source: 'storeEmbedding',
      bookmarkId,
      embeddingId: result.rows[0].id,
      duration: Date.now() - startTime
    });

    return result.rows[0];
  }

  // Process bookmark for embedding
  async processBookmark(bookmark) {
    const startTime = Date.now();
    try {
      unifiedLogger.debug('Processing bookmark for embedding', {
        service: 'embeddingService',
        source: 'processBookmark',
        bookmarkId: bookmark.id,
        title: bookmark.title
      });

      // Create text representation
      const text = this.createBookmarkText(bookmark);
      
      // Generate embedding
      const embedding = await this.generateEmbedding(text);
      
      // Store in database
      await this.storeEmbedding(bookmark.id, embedding);
      
      unifiedLogger.info('Processed embedding for bookmark', {
        service: 'embeddingService',
        source: 'processBookmark',
        bookmarkId: bookmark.id,
        duration: Date.now() - startTime
      });
      return true;
    } catch (error) {
      unifiedLogger.error('Error processing bookmark', {
        service: 'embeddingService',
        source: 'processBookmark',
        error: error.message,
        stack: error.stack,
        bookmarkId: bookmark.id
      });
      return false;
    }
  }

  // Process multiple bookmarks
  async processBookmarks(bookmarks) {
    const startTime = Date.now();
    unifiedLogger.info('Processing multiple bookmarks for embeddings', {
      service: 'embeddingService',
      source: 'processBookmarks',
      count: bookmarks.length
    });

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

    unifiedLogger.info('Finished processing bookmarks', {
      service: 'embeddingService',
      source: 'processBookmarks',
      results,
      duration: Date.now() - startTime,
      avgTimePerBookmark: Math.round((Date.now() - startTime) / bookmarks.length)
    });
    
    return results;
  }

  // Search similar bookmarks using vector similarity
  async searchSimilar(queryText, userId, options = {}) {
    const startTime = Date.now();
    const {
      limit = 20,
      threshold = 0.5
    } = options;

    unifiedLogger.debug('Searching similar bookmarks', {
      service: 'embeddingService',
      source: 'searchSimilar',
      queryLength: queryText.length,
      userId,
      options
    });
    
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

    unifiedLogger.info('Similar bookmarks search completed', {
      service: 'embeddingService',
      source: 'searchSimilar',
      resultCount: result.rows.length,
      duration: Date.now() - startTime
    });
    
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
    const cacheSize = this.embeddingCache.size;
    this.embeddingCache.clear();
    unifiedLogger.info('Embedding cache cleared', {
      service: 'embeddingService',
      source: 'clearCache',
      clearedEntries: cacheSize
    });
  }
}

// Export singleton instance
export default new EmbeddingService();