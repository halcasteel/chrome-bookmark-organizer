import { A2AAgent } from './baseAgent.js';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';
import browserPool from '../services/browserPool.js';
import { processInParallel } from '../utils/concurrencyUtils.js';

/**
 * Validation Agent - A2A-compliant agent for bookmark URL validation
 * 
 * Validates bookmark URLs and extracts metadata using Playwright
 * with human-like browser behavior to avoid detection.
 * 
 * Follows Google-standard A2A patterns:
 * - Immutable artifacts between agents
 * - Real database operations
 * - Progress reporting via reportProgress()
 * - No mocks, only real services
 */
export class ValidationAgent extends A2AAgent {
  constructor() {
    super({
      agentType: 'validation',
      version: '1.0.0',
      capabilities: {
        description: 'Validates bookmark URLs and extracts metadata using Playwright',
        inputs: {
          bookmarkIds: { type: 'array', required: true, description: 'Array of bookmark IDs to validate' },
          userId: { type: 'string', required: true, description: 'User ID for authorization' },
          importId: { type: 'string', required: false, description: 'Import session ID for tracking' }
        },
        outputs: {
          type: 'bookmark_validation_result',
          validatedCount: { type: 'number', description: 'Number of bookmarks successfully validated' },
          failedCount: { type: 'number', description: 'Number of bookmarks that failed validation' },
          validationResults: { type: 'array', items: 'object', description: 'Detailed validation results per bookmark' }
        }
      }
    });
    
    this.concurrency = 3; // Limit concurrent browser operations
  }

  /**
   * Initialize browser pool on agent startup
   */
  async initialize() {
    unifiedLogger.info('Initializing validation agent', {
      service: this.agentType,
      method: 'initialize'
    });
    
    // Browser pool will be initialized on first use
  }

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    // Browser pool handles its own cleanup
    unifiedLogger.info('Validation agent cleanup complete', {
      service: this.agentType,
      method: 'cleanup'
    });
  }

  /**
   * Process validation task
   * @param {Object} task - A2A task to process
   * @returns {Object} - Task result with validation artifacts
   */
  async processTask(task) {
    unifiedLogger.info('Processing validation task', {
      service: this.agentType,
      method: 'processTask',
      taskId: task.id,
      bookmarkCount: task.context.bookmarkIds?.length || 0
    });
    
    try {
      // Execute validation action
      const result = await this.executeAction(task);
      
      // Create validation artifact
      const artifact = {
        type: 'bookmark_validation_result',
        data: result
      };
      
      // Complete task with artifact
      return {
        status: 'completed',
        artifacts: [artifact]
      };
      
    } catch (error) {
      unifiedLogger.error('Validation task failed', {
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
   * Execute validation action
   * @param {Object} task - Task context with bookmarkIds and userId
   * @returns {Object} - Validation results
   */
  async executeAction(task) {
    const { bookmarkIds, userId } = task.context;
    
    if (!bookmarkIds || bookmarkIds.length === 0) {
      return {
        validatedCount: 0,
        failedCount: 0,
        validationResults: []
      };
    }
    
    // Initial progress
    await this.reportProgress(task.id, 5, 'Starting bookmark validation');
    
    // Fetch bookmarks to validate
    const bookmarks = await this.fetchBookmarks(bookmarkIds, userId);
    
    if (bookmarks.length === 0) {
      unifiedLogger.warn('No bookmarks found for validation', {
        service: this.agentType,
        method: 'executeAction',
        bookmarkIds,
        userId
      });
      return {
        validatedCount: 0,
        failedCount: 0,
        validationResults: []
      };
    }
    
    await this.reportProgress(task.id, 10, `Found ${bookmarks.length} bookmarks to validate`);
    
    // Validate bookmarks in batches
    const results = await this.validateBookmarksInBatches(bookmarks, task);
    
    // Calculate summary
    const validatedCount = results.filter(r => r.validated).length;
    const failedCount = results.filter(r => !r.validated).length;
    
    unifiedLogger.info('Validation completed', {
      service: this.agentType,
      method: 'executeAction',
      taskId: task.id,
      validatedCount,
      failedCount,
      total: results.length
    });
    
    await this.reportProgress(task.id, 100, 'Validation complete');
    
    return {
      validatedCount,
      failedCount,
      validationResults: results
    };
  }

  /**
   * Fetch bookmarks from database
   * @param {Array} bookmarkIds - Bookmark IDs to fetch
   * @param {string} userId - User ID for authorization
   * @returns {Array} - Bookmarks to validate
   */
  async fetchBookmarks(bookmarkIds, userId) {
    try {
      const result = await db.query(
        `SELECT id, url, title, description 
         FROM bookmarks 
         WHERE id = ANY($1) AND user_id = $2 AND is_deleted = false
         ORDER BY created_at`,
        [bookmarkIds, userId]
      );
      
      return result.rows;
    } catch (error) {
      unifiedLogger.error('Failed to fetch bookmarks for validation', {
        service: this.agentType,
        method: 'fetchBookmarks',
        bookmarkIds,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate bookmarks in batches with progress reporting
   * @param {Array} bookmarks - Bookmarks to validate
   * @param {Object} task - A2A task for progress reporting
   * @returns {Array} - Validation results
   */
  async validateBookmarksInBatches(bookmarks, task) {
    const results = [];
    let processed = 0;
    
    // Process validation concurrently
    const validationResults = await processInParallel(
      bookmarks,
      async (bookmark, index) => {
        const validation = await this.validateBookmark(bookmark);
        
        processed++;
        
        // Report progress periodically
        if (processed % 5 === 0 || processed === bookmarks.length) {
          const progress = 10 + Math.round((processed / bookmarks.length) * 85); // 10-95%
          await this.reportProgress(
            task.id,
            progress,
            `Validated ${processed}/${bookmarks.length} bookmarks`
          );
        }
        
        return {
          bookmarkId: bookmark.id,
          url: bookmark.url,
          validated: validation.isValid,
          statusCode: validation.statusCode,
          error: validation.error || null,
          metadata: validation.metadata || {}
        };
      },
      {
        concurrency: this.concurrency,
        onProgress: (progress) => {
          unifiedLogger.debug('Validation progress', {
            service: this.agentType,
            method: 'validateBookmarksInBatches',
            ...progress
          });
        },
        onError: (error) => {
          unifiedLogger.warn('Bookmark validation failed', {
            service: this.agentType,
            method: 'validateBookmarksInBatches',
            bookmarkIndex: error.index,
            error: error.error.message
          });
        }
      }
    );
    
    // Extract results
    for (const result of validationResults) {
      results.push(result.success ? result.result : {
        bookmarkId: bookmarks[validationResults.indexOf(result)].id,
        url: bookmarks[validationResults.indexOf(result)].url,
        validated: false,
        error: result.error
      });
    }
    
    // Update database with validation results
    await this.updateValidationResults(results);
    
    // Final progress
    await this.reportProgress(task.id, 95, 'Validation complete, updating database');
    
    return results;
  }

  /**
   * Validate a single bookmark using Playwright
   * @param {Object} bookmark - Bookmark to validate
   * @returns {Object} - Validation result
   */
  async validateBookmark(bookmark) {
    const timer = unifiedLogger.startTimer();
    
    try {
      // Get browser context from pool
      const contextWrapper = await browserPool.acquire();
      const { page } = contextWrapper;
      
      try {
        // Navigate to URL with timeout
        const response = await page.goto(bookmark.url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        
        const statusCode = response.status();
        const isValid = statusCode >= 200 && statusCode < 400;
        
        // Extract metadata if valid
        let metadata = {};
        if (isValid) {
          metadata = await this.extractMetadata(page);
        }
        
        unifiedLogger.debug('Bookmark validated', {
          service: this.agentType,
          method: 'validateBookmark',
          bookmarkId: bookmark.id,
          url: bookmark.url,
          statusCode,
          isValid,
          duration: timer()
        });
        
        return {
          isValid,
          statusCode,
          metadata
        };
        
      } finally {
        // Always release browser context back to pool
        await browserPool.release(contextWrapper);
      }
      
    } catch (error) {
      unifiedLogger.warn('Bookmark validation error', {
        service: this.agentType,
        method: 'validateBookmark',
        bookmarkId: bookmark.id,
        url: bookmark.url,
        error: error.message,
        duration: timer()
      });
      
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Extract metadata from page
   * @param {Object} page - Playwright page object
   * @returns {Object} - Extracted metadata
   */
  async extractMetadata(page) {
    try {
      const metadata = await page.evaluate(() => {
        const getMetaContent = (name) => {
          const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return meta ? meta.getAttribute('content') : null;
        };
        
        return {
          title: document.title,
          description: getMetaContent('description') || getMetaContent('og:description'),
          keywords: getMetaContent('keywords'),
          author: getMetaContent('author'),
          ogTitle: getMetaContent('og:title'),
          ogImage: getMetaContent('og:image'),
          favicon: document.querySelector('link[rel*="icon"]')?.href
        };
      });
      
      return metadata;
    } catch (error) {
      unifiedLogger.debug('Failed to extract metadata', {
        service: this.agentType,
        method: 'extractMetadata',
        error: error.message
      });
      return {};
    }
  }

  /**
   * Update database with validation results
   * @param {Array} results - Validation results to save
   */
  async updateValidationResults(results) {
    const timer = unifiedLogger.startTimer();
    
    try {
      // Update each bookmark with validation status
      for (const result of results) {
        await db.query(
          `UPDATE bookmarks 
           SET is_valid = $2,
               last_validated_at = NOW(),
               validation_errors = $3,
               metadata = metadata || $4::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [
            result.bookmarkId,
            result.validated,
            result.error ? JSON.stringify({ error: result.error, statusCode: result.statusCode }) : null,
            JSON.stringify(result.metadata || {})
          ]
        );
      }
      
      unifiedLogger.info('Updated validation results in database', {
        service: this.agentType,
        method: 'updateValidationResults',
        count: results.length,
        duration: timer()
      });
      
    } catch (error) {
      unifiedLogger.error('Failed to update validation results', {
        service: this.agentType,
        method: 'updateValidationResults',
        error: error.message,
        stack: error.stack
      });
      // Don't throw - validation is complete even if db update fails
    }
  }

  /**
   * Health check for the agent
   * @returns {Object} Health status
   */
  async healthCheck() {
    try {
      // Check browser pool health
      const poolStats = await browserPool.getStats();
      
      return {
        status: 'healthy',
        message: 'Validation agent operational',
        browserPool: poolStats
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Validation agent error',
        error: error.message
      };
    }
  }
}

// Export singleton instance
export default new ValidationAgent();