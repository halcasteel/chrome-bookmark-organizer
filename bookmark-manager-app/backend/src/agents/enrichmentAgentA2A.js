import { A2AAgent } from './baseAgent.js';
import db from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';
import aiEnrichmentService from '../services/aiEnrichmentService.js';
import urlContentFetcher from '../services/urlContentFetcher.js';
import { processInParallel, RateLimiter } from '../utils/concurrencyUtils.js';
import { batchUpdate } from '../utils/databaseUtils.js';

/**
 * A2A Enrichment Agent
 * 
 * Enriches bookmarks with AI-generated metadata including:
 * - Category suggestions
 * - Tags
 * - Summary
 * - Keywords
 * 
 * Follows Google-standard A2A patterns:
 * - Immutable artifacts between agents
 * - Real database operations
 * - Progress reporting via reportProgress()
 * - No mocks, only real services
 */
export class EnrichmentAgent extends A2AAgent {
  constructor() {
    super({
      agentType: 'enrichment',
      version: '1.0.0',
      capabilities: {
        description: 'Enriches bookmarks with AI-generated metadata using OpenAI',
        inputs: {
          bookmarkIds: { type: 'array', required: true, description: 'Array of bookmark IDs to enrich' },
          userId: { type: 'string', required: true, description: 'User ID for authorization' },
          validationResults: { type: 'array', required: false, description: 'Validation results from ValidationAgent' }
        },
        outputs: {
          type: 'bookmark_enrichment_result',
          enrichedCount: { type: 'number', description: 'Number of bookmarks successfully enriched' },
          failedCount: { type: 'number', description: 'Number of bookmarks that failed enrichment' },
          enrichmentResults: { type: 'array', items: 'object', description: 'Detailed enrichment results per bookmark' }
        }
      }
    });
    
    this.concurrency = 5; // Process 5 bookmarks concurrently
    this.rateLimiter = new RateLimiter(10, 60000); // 10 requests per minute for AI
  }

  /**
   * Cleanup resources when agent shuts down
   */
  async cleanup() {
    // Ensure URL fetcher browser is closed
    await urlContentFetcher.closeBrowser();
    
    unifiedLogger.debug('Enrichment agent cleaned up', {
      service: this.agentType,
      method: 'cleanup'
    });
  }

  /**
   * Process enrichment task
   * @param {Object} task - A2A task to process
   * @returns {Object} - Task result with enrichment artifacts
   */
  async processTask(task) {
    unifiedLogger.info('Processing enrichment task', {
      service: this.agentType,
      method: 'processTask',
      taskId: task.id,
      bookmarkCount: task.context.bookmarkIds?.length || 0
    });
    
    try {
      // Execute enrichment action
      const result = await this.executeAction(task);
      
      // Create enrichment artifact
      const artifact = {
        type: 'bookmark_enrichment_result',
        data: result
      };
      
      // Complete task with artifact
      return {
        status: 'completed',
        artifacts: [artifact]
      };
      
    } catch (error) {
      unifiedLogger.error('Enrichment task failed', {
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
   * Execute enrichment action
   * @param {Object} task - Task context with bookmarkIds and userId
   * @returns {Object} - Enrichment results
   */
  async executeAction(task) {
    const { bookmarkIds, userId, validationResults } = task.context;
    
    if (!bookmarkIds || bookmarkIds.length === 0) {
      return {
        enrichedCount: 0,
        failedCount: 0,
        enrichmentResults: []
      };
    }
    
    // Initial progress
    await this.reportProgress(task.id, 5, 'Starting bookmark enrichment');
    
    // Fetch bookmarks with their content
    const bookmarks = await this.fetchBookmarksWithContent(bookmarkIds, userId);
    
    if (bookmarks.length === 0) {
      unifiedLogger.warn('No bookmarks found for enrichment', {
        service: this.agentType,
        method: 'executeAction',
        bookmarkIds,
        userId
      });
      return {
        enrichedCount: 0,
        failedCount: 0,
        enrichmentResults: []
      };
    }
    
    await this.reportProgress(task.id, 10, `Found ${bookmarks.length} bookmarks to enrich`);
    
    // Enrich bookmarks in batches
    const results = await this.enrichBookmarksInBatches(bookmarks, task);
    
    // Calculate summary
    const enrichedCount = results.filter(r => r.enriched).length;
    const failedCount = results.filter(r => !r.enriched).length;
    
    unifiedLogger.info('Enrichment completed', {
      service: this.agentType,
      method: 'executeAction',
      taskId: task.id,
      enrichedCount,
      failedCount,
      total: results.length
    });
    
    await this.reportProgress(task.id, 100, 'Enrichment complete');
    
    return {
      enrichedCount,
      failedCount,
      enrichmentResults: results
    };
  }

  /**
   * Fetch bookmarks with content for enrichment
   * @param {Array} bookmarkIds - Bookmark IDs to fetch
   * @param {string} userId - User ID for authorization
   * @returns {Array} - Bookmarks with content
   */
  async fetchBookmarksWithContent(bookmarkIds, userId) {
    try {
      const result = await db.query(
        `SELECT id, url, title, description, enrichment_data
         FROM bookmarks 
         WHERE id = ANY($1) AND user_id = $2 AND is_deleted = false
         ORDER BY created_at`,
        [bookmarkIds, userId]
      );
      
      return result.rows;
    } catch (error) {
      unifiedLogger.error('Failed to fetch bookmarks for enrichment', {
        service: this.agentType,
        method: 'fetchBookmarksWithContent',
        bookmarkIds,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Enrich bookmarks in batches with progress reporting
   * @param {Array} bookmarks - Bookmarks to enrich
   * @param {Object} task - A2A task for progress reporting
   * @returns {Array} - Enrichment results
   */
  async enrichBookmarksInBatches(bookmarks, task) {
    const results = [];
    let processed = 0;
    
    unifiedLogger.info('Starting concurrent bookmark enrichment', {
      service: this.agentType,
      method: 'enrichBookmarksInBatches',
      totalBookmarks: bookmarks.length,
      concurrency: this.concurrency
    });
    
    // Collect enrichment results for batch update
    const enrichmentData = [];
    
    // Process enrichment concurrently with progress updates
    const enrichmentResults = await processInParallel(
      bookmarks,
      async (bookmark, index) => {
        // Apply rate limiting
        await this.rateLimiter.canProceed();
        
        const enrichment = await this.enrichBookmark(bookmark);
        
        // Collect for batch update if successful
        if (enrichment.success) {
          enrichmentData.push({
            id: bookmark.id,
            data: {
              ai_tags: enrichment.tags,
              ai_summary: enrichment.summary,
              enrichment_data: JSON.stringify({
                category: enrichment.category,
                keywords: enrichment.keywords,
                enrichedAt: new Date().toISOString()
              }),
              updated_at: new Date()
            }
          });
        }
        
        processed++;
        
        // Report progress periodically
        if (processed % 5 === 0 || processed === bookmarks.length) {
          const progress = 10 + Math.round((processed / bookmarks.length) * 85); // 10-95%
          await this.reportProgress(
            task.id,
            progress,
            `Enriched ${processed}/${bookmarks.length} bookmarks`
          );
        }
        
        return {
          bookmarkId: bookmark.id,
          url: bookmark.url,
          enriched: enrichment.success,
          error: enrichment.error || null,
          category: enrichment.category,
          tags: enrichment.tags,
          summary: enrichment.summary,
          keywords: enrichment.keywords
        };
      },
      {
        concurrency: this.concurrency,
        onProgress: (progress) => {
          unifiedLogger.debug('Enrichment progress', {
            service: this.agentType,
            method: 'enrichBookmarksInBatches',
            ...progress
          });
        },
        onError: (error) => {
          unifiedLogger.warn('Bookmark enrichment failed', {
            service: this.agentType,
            method: 'enrichBookmarksInBatches',
            bookmarkIndex: error.index,
            error: error.error.message
          });
        }
      }
    );
    
    // Batch update all enriched bookmarks
    if (enrichmentData.length > 0) {
      await batchUpdate('bookmarks', enrichmentData, {
        updateColumns: ['ai_tags', 'ai_summary', 'enrichment_data', 'updated_at']
      });
      
      unifiedLogger.info('Batch database update completed', {
        service: this.agentType,
        method: 'enrichBookmarksInBatches',
        updatedCount: enrichmentData.length
      });
    }
    
    // Extract results
    for (const result of enrichmentResults) {
      results.push(result.success ? result.result : {
        bookmarkId: bookmarks[enrichmentResults.indexOf(result)].id,
        url: bookmarks[enrichmentResults.indexOf(result)].url,
        enriched: false,
        error: result.error
      });
    }
    
    // Final progress
    await this.reportProgress(task.id, 95, 'Enrichment complete, preparing results');
    
    unifiedLogger.info('Concurrent enrichment completed', {
      service: this.agentType,
      method: 'enrichBookmarksInBatches',
      totalProcessed: results.length,
      successful: results.filter(r => r.enriched).length,
      failed: results.filter(r => !r.enriched).length
    });
    
    return results;
  }

  /**
   * Enrich a single bookmark using AI
   * @param {Object} bookmark - Bookmark to enrich
   * @returns {Object} - Enrichment result
   */
  async enrichBookmark(bookmark) {
    try {
      // Prepare content for AI
      const bookmarkData = {
        url: bookmark.url,
        title: bookmark.title || '',
        description: bookmark.description || '',
        content: bookmark.enrichment_data?.content || bookmark.description || ''
      };
      
      // Call AI service for enrichment (uses Claude in Claude Code, OpenAI otherwise)
      const enrichment = await aiEnrichmentService.enrichBookmark(bookmarkData);
      
      unifiedLogger.debug('Bookmark enriched', {
        service: this.agentType,
        method: 'enrichBookmark',
        bookmarkId: bookmark.id,
        category: enrichment.category,
        tagCount: enrichment.tags?.length || 0
      });
      
      return {
        success: true,
        category: enrichment.category || 'uncategorized',
        tags: enrichment.tags || [],
        summary: enrichment.summary || null,
        keywords: enrichment.keywords || []
      };
      
    } catch (error) {
      unifiedLogger.warn('Bookmark enrichment failed', {
        service: this.agentType,
        method: 'enrichBookmark',
        bookmarkId: bookmark.id,
        url: bookmark.url,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update bookmark with enrichment data
   * @param {string} bookmarkId - Bookmark ID
   * @param {Object} enrichment - Enrichment data
   */
  async updateBookmarkEnrichment(bookmarkId, enrichment) {
    try {
      await db.query(
        `UPDATE bookmarks 
         SET ai_tags = $2,
             ai_summary = $3,
             enrichment_data = enrichment_data || $4::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          bookmarkId,
          enrichment.tags,
          enrichment.summary,
          JSON.stringify({
            category: enrichment.category,
            keywords: enrichment.keywords,
            enrichedAt: new Date().toISOString()
          })
        ]
      );
    } catch (error) {
      unifiedLogger.error('Failed to update bookmark enrichment', {
        service: this.agentType,
        method: 'updateBookmarkEnrichment',
        bookmarkId,
        error: error.message,
        stack: error.stack
      });
      // Don't throw - continue with other bookmarks
    }
  }
}

// Export singleton instance
export default new EnrichmentAgent();