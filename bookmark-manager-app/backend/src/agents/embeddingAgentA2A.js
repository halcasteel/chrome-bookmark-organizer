import { A2AAgent } from './baseAgent.js';
import db from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';
import embeddingService from '../services/embeddingService.js';
import { processInParallel } from '../utils/concurrencyUtils.js';

/**
 * A2A Embedding Agent
 * 
 * Generates vector embeddings for bookmarks to enable semantic search
 * and similarity-based recommendations. Uses OpenAI embeddings API
 * or falls back to local embeddings.
 * 
 * Follows Google-standard A2A patterns:
 * - Immutable artifacts between agents
 * - Real database operations
 * - Progress reporting via reportProgress()
 * - No mocks, only real services
 */
export class EmbeddingAgent extends A2AAgent {
  constructor() {
    super({
      agentType: 'embedding',
      version: '1.0.0',
      capabilities: {
        description: 'Generates semantic embeddings for bookmarks to enable AI-powered search',
        inputs: {
          bookmarkIds: { type: 'array', required: true, description: 'Array of bookmark IDs to generate embeddings for' },
          userId: { type: 'string', required: true, description: 'User ID for authorization' },
          regenerate: { type: 'boolean', required: false, description: 'Force regeneration of existing embeddings' },
          enrichmentResults: { type: 'array', required: false, description: 'Enrichment results from EnrichmentAgent' }
        },
        outputs: {
          type: 'bookmark_embedding_result',
          embeddedCount: { type: 'number', description: 'Number of bookmarks successfully embedded' },
          failedCount: { type: 'number', description: 'Number of bookmarks that failed embedding' },
          embeddingResults: { type: 'array', items: 'object', description: 'Detailed embedding results per bookmark' },
          vectorDimensions: { type: 'number', description: 'Dimension of generated vectors' }
        }
      }
    });
    
    this.batchSize = 20; // Process 20 bookmarks at a time
    this.concurrency = 5; // Process 5 batches concurrently
  }

  /**
   * Process embedding task
   * @param {Object} task - A2A task to process
   * @returns {Object} - Task result with embedding artifacts
   */
  async processTask(task) {
    unifiedLogger.info('Processing embedding task', {
      service: this.agentType,
      method: 'processTask',
      taskId: task.id,
      bookmarkCount: task.context.bookmarkIds?.length || 0
    });
    
    try {
      // Execute embedding action
      const result = await this.executeAction(task);
      
      // Create embedding artifact
      const artifact = {
        type: 'bookmark_embedding_result',
        data: result
      };
      
      // Complete task with artifact
      return {
        status: 'completed',
        artifacts: [artifact]
      };
      
    } catch (error) {
      unifiedLogger.error('Embedding task failed', {
        service: this.agentType,
        method: 'processTask',
        taskId: task.id,
        error: error.message,
        stack: error.stack
      });
      
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Execute embedding action
   * @param {Object} task - Task context with bookmarkIds and userId
   * @returns {Object} - Embedding results
   */
  async executeAction(task) {
    const { bookmarkIds, userId, regenerate = false } = task.context;
    
    if (!bookmarkIds || bookmarkIds.length === 0) {
      return {
        embeddedCount: 0,
        failedCount: 0,
        embeddingResults: [],
        vectorDimensions: 0
      };
    }
    
    // Initial progress
    await this.reportProgress(task.id, 5, 'Starting bookmark embedding generation');
    
    // Check which bookmarks need embeddings
    const bookmarksToProcess = await this.getBookmarksNeedingEmbeddings(
      bookmarkIds,
      userId,
      regenerate
    );
    
    if (bookmarksToProcess.length === 0) {
      unifiedLogger.info('All bookmarks already have embeddings', {
        service: this.agentType,
        method: 'executeAction',
        bookmarkCount: bookmarkIds.length
      });
      return {
        embeddedCount: 0,
        failedCount: 0,
        embeddingResults: [],
        vectorDimensions: 1536 // OpenAI ada-002 dimension
      };
    }
    
    await this.reportProgress(
      task.id, 
      10, 
      `Found ${bookmarksToProcess.length} bookmarks needing embeddings`
    );
    
    // Generate embeddings in batches
    const results = await this.generateEmbeddingsInBatches(
      bookmarksToProcess,
      task
    );
    
    // Calculate summary
    const embeddedCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    unifiedLogger.info('Embedding generation completed', {
      service: this.agentType,
      method: 'executeAction',
      taskId: task.id,
      embeddedCount,
      failedCount,
      totalProcessed: results.length
    });
    
    await this.reportProgress(task.id, 100, 'Embedding generation completed');
    
    return {
      embeddedCount,
      failedCount,
      embeddingResults: results,
      vectorDimensions: 1536 // OpenAI ada-002 dimension
    };
  }

  /**
   * Get bookmarks that need embeddings
   * @param {Array} bookmarkIds - Bookmark IDs to check
   * @param {string} userId - User ID for authorization
   * @param {boolean} regenerate - Force regeneration
   * @returns {Array} - Bookmarks needing embeddings
   */
  async getBookmarksNeedingEmbeddings(bookmarkIds, userId, regenerate) {
    let query;
    let params;
    
    if (regenerate) {
      // Get all bookmarks
      query = `
        SELECT b.id, b.url, b.title, b.description, b.ai_summary, b.ai_tags
        FROM bookmarks b
        WHERE b.id = ANY($1) AND b.user_id = $2 AND b.is_deleted = false
      `;
      params = [bookmarkIds, userId];
    } else {
      // Get only bookmarks without embeddings
      query = `
        SELECT b.id, b.url, b.title, b.description, b.ai_summary, b.ai_tags
        FROM bookmarks b
        LEFT JOIN bookmark_embeddings be ON b.id = be.bookmark_id
        WHERE b.id = ANY($1) AND b.user_id = $2 AND b.is_deleted = false
          AND be.id IS NULL
      `;
      params = [bookmarkIds, userId];
    }
    
    const result = await db.query(query, params);
    
    unifiedLogger.debug('Bookmarks needing embeddings', {
      service: this.agentType,
      method: 'getBookmarksNeedingEmbeddings',
      totalRequested: bookmarkIds.length,
      needingEmbeddings: result.rows.length,
      regenerate
    });
    
    return result.rows;
  }

  /**
   * Generate embeddings in batches with progress reporting
   * @param {Array} bookmarks - Bookmarks to process
   * @param {Object} task - Task for progress reporting
   * @returns {Array} - Embedding results
   */
  async generateEmbeddingsInBatches(bookmarks, task) {
    const results = [];
    const batches = this.createBatches(bookmarks, this.batchSize);
    let processedCount = 0;
    
    // Process batches with concurrency control
    const batchResults = await processInParallel(
      batches,
      async (batch, index) => {
        const batchStartTime = Date.now();
        
        unifiedLogger.debug('Processing embedding batch', {
          service: this.agentType,
          method: 'generateEmbeddingsInBatches',
          batchIndex: index,
          batchSize: batch.length
        });
        
        const batchEmbeddings = await Promise.all(
          batch.map(bookmark => this.generateEmbeddingForBookmark(bookmark))
        );
        
        processedCount += batch.length;
        const progress = 10 + Math.floor((processedCount / bookmarks.length) * 85);
        
        await this.reportProgress(
          task.id,
          progress,
          `Generated embeddings for ${processedCount}/${bookmarks.length} bookmarks`
        );
        
        unifiedLogger.debug('Batch embedding completed', {
          service: this.agentType,
          method: 'generateEmbeddingsInBatches',
          batchIndex: index,
          duration: Date.now() - batchStartTime,
          successCount: batchEmbeddings.filter(r => r.success).length
        });
        
        return batchEmbeddings;
      },
      this.concurrency
    );
    
    // Flatten results
    batchResults.forEach(batch => results.push(...batch));
    
    return results;
  }

  /**
   * Generate embedding for a single bookmark
   * @param {Object} bookmark - Bookmark to process
   * @returns {Object} - Embedding result
   */
  async generateEmbeddingForBookmark(bookmark) {
    try {
      // Use the existing embedding service
      const embedding = await embeddingService.generateEmbedding(bookmark);
      
      return {
        bookmarkId: bookmark.id,
        success: true,
        vectorDimensions: embedding.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      unifiedLogger.error('Failed to generate embedding for bookmark', {
        service: this.agentType,
        method: 'generateEmbeddingForBookmark',
        bookmarkId: bookmark.id,
        error: error.message
      });
      
      return {
        bookmarkId: bookmark.id,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Create batches from array
   * @param {Array} items - Items to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array} - Array of batches
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Get agent endpoints for A2A discovery
   * @returns {Object} - Agent endpoints
   */
  getEndpoints() {
    return {
      process: '/api/agents/embedding/process',
      status: '/api/agents/embedding/status',
      capabilities: '/api/agents/embedding/capabilities'
    };
  }
}

// Export singleton instance
export default new EmbeddingAgent();