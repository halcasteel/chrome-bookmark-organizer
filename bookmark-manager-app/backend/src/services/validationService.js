import { query } from '../db/index.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import openaiService from './openaiService.js';

class ValidationService {
  constructor() {
    this.timeout = parseInt(process.env.VALIDATION_TIMEOUT_MS) || 10000;
    this.maxRetries = parseInt(process.env.VALIDATION_MAX_RETRIES) || 3;
    this.batchSize = parseInt(process.env.VALIDATION_BATCH_SIZE) || 50;
  }

  /**
   * Validate a single bookmark
   */
  async validateBookmark(bookmarkId) {
    try {
      // Get bookmark details
      const result = await query(
        'SELECT * FROM bookmarks WHERE id = $1',
        [bookmarkId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Bookmark not found');
      }
      
      const bookmark = result.rows[0];
      
      // Skip if already validated recently (within 24 hours)
      if (bookmark.last_checked && 
          new Date() - new Date(bookmark.last_checked) < 24 * 60 * 60 * 1000) {
        logger.info('Bookmark recently validated, skipping', { bookmarkId });
        return bookmark;
      }
      
      // Increment check attempts
      await query(
        'UPDATE bookmarks SET check_attempts = check_attempts + 1 WHERE id = $1',
        [bookmarkId]
      );
      
      try {
        // STEP 1: Check if URL is accessible (headless browser check)
        const content = await this.fetchWithTimeout(bookmark.url);
        
        // If we get here, the URL returned a successful response (2xx status)
        // Now we can proceed with content extraction and AI categorization
        
        // Extract metadata from the successfully loaded page
        const metadata = this.extractMetadata(content.html, bookmark.url);
        
        // Calculate content hash for duplicate detection
        const contentHash = crypto
          .createHash('md5')
          .update(content.html)
          .digest('hex');
        
        // STEP 2: Only attempt AI categorization if we have valid content
        let aiData = {};
        if (process.env.OPENAI_CATEGORIZATION_ENABLED === 'true' && content.text && content.text.length > 50) {
          // Only categorize if we have meaningful content
          aiData = await this.categorizeWithAI({
            url: bookmark.url,
            title: metadata.title || bookmark.title,
            description: metadata.description || bookmark.description,
            content: content.text.substring(0, 2000)
          });
        } else if (!content.text || content.text.length <= 50) {
          // Page loaded but has minimal content
          logger.warn('Page has minimal content, skipping AI categorization', {
            bookmarkId,
            url: bookmark.url,
            contentLength: content.text?.length || 0
          });
        }
        
        // Update bookmark with validation results
        await query(`
          UPDATE bookmarks 
          SET 
            is_valid = true,
            is_dead = false,
            http_status = $2,
            last_checked = NOW(),
            validation_errors = NULL,
            enrichment_data = $3,
            ai_tags = $4,
            ai_summary = $5,
            enriched = $6
          WHERE id = $1
        `, [
          bookmarkId,
          content.status,
          {
            ...metadata,
            contentHash,
            contentLength: content.text?.length || 0,
            validatedAt: new Date().toISOString()
          },
          aiData.tags || [],
          aiData.summary || null,
          !!aiData.category
        ]);
        
        // Update bookmark metadata if AI data available
        if (aiData.category) {
          await query(`
            INSERT INTO bookmark_metadata (bookmark_id, category, subcategory, priority)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (bookmark_id) 
            DO UPDATE SET 
              category = EXCLUDED.category,
              subcategory = EXCLUDED.subcategory,
              priority = EXCLUDED.priority
          `, [bookmarkId, aiData.category, aiData.subcategory, aiData.priority || 'medium']);
        }
        
        logger.info('Bookmark validated successfully', { 
          bookmarkId, 
          url: bookmark.url,
          httpStatus: content.status,
          hasContent: content.text?.length > 50,
          enriched: !!aiData.category 
        });
        
        return { ...bookmark, is_valid: true, enriched: !!aiData.category };
        
      } catch (validationError) {
        // Handle validation failure - URL is not accessible
        await this.handleValidationError(bookmarkId, validationError);
        return { ...bookmark, is_valid: false };
      }
      
    } catch (error) {
      logger.error('Validation service error', { bookmarkId, error: error.message });
      throw error;
    }
  }

  /**
   * Fetch URL content with timeout
   */
  async fetchWithTimeout(url, timeout = this.timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BookmarkValidator/1.0)'
        },
        redirect: 'follow',
        compress: true
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Extract text content for AI processing
      const text = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000);
      
      return {
        status: response.status,
        html,
        text
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Extract metadata from HTML
   */
  extractMetadata(html, url) {
    const $ = cheerio.load(html);
    
    return {
      title: $('title').text() || $('meta[property="og:title"]').attr('content') || '',
      description: $('meta[name="description"]').attr('content') || 
                   $('meta[property="og:description"]').attr('content') || '',
      keywords: $('meta[name="keywords"]').attr('content') || '',
      author: $('meta[name="author"]').attr('content') || '',
      image: $('meta[property="og:image"]').attr('content') || '',
      favicon: $('link[rel="icon"]').attr('href') || 
               $('link[rel="shortcut icon"]').attr('href') || 
               '/favicon.ico',
      language: $('html').attr('lang') || '',
      publishedDate: $('meta[property="article:published_time"]').attr('content') || '',
      modifiedDate: $('meta[property="article:modified_time"]').attr('content') || ''
    };
  }

  /**
   * Get AI categorization for bookmark
   */
  async categorizeWithAI(bookmarkData) {
    try {
      const result = await openaiService.categorizeBookmark(bookmarkData);
      return result;
    } catch (error) {
      logger.error('AI categorization failed', { error: error.message });
      return {};
    }
  }

  /**
   * Handle validation errors
   */
  async handleValidationError(bookmarkId, error) {
    // Categorize the error type
    let errorType = 'UNKNOWN';
    let isDead = false;
    let httpStatus = null;
    let isTemporary = false;
    
    // Extract HTTP status from error message
    const statusMatch = error.message.match(/HTTP (\d+)/);
    if (statusMatch) {
      httpStatus = parseInt(statusMatch[1]);
    }
    
    // Categorize based on error type and HTTP status
    if (httpStatus) {
      if (httpStatus === 404) {
        errorType = 'NOT_FOUND';
        isDead = true;
      } else if (httpStatus === 403) {
        errorType = 'FORBIDDEN';
      } else if (httpStatus === 401) {
        errorType = 'UNAUTHORIZED';
      } else if (httpStatus >= 500) {
        errorType = 'SERVER_ERROR';
        isTemporary = true; // Server errors might be temporary
      } else if (httpStatus === 429) {
        errorType = 'RATE_LIMITED';
        isTemporary = true;
      } else if (httpStatus >= 400) {
        errorType = 'CLIENT_ERROR';
      }
    } else if (error.code === 'ENOTFOUND') {
      errorType = 'DNS_FAILURE';
      isDead = true;
    } else if (error.code === 'ECONNREFUSED') {
      errorType = 'CONNECTION_REFUSED';
      isDead = true;
    } else if (error.code === 'ETIMEDOUT' || error.name === 'AbortError') {
      errorType = 'TIMEOUT';
      isTemporary = true;
    } else if (error.code === 'ECONNRESET') {
      errorType = 'CONNECTION_RESET';
      isTemporary = true;
    } else if (error.message.includes('SSL') || error.message.includes('certificate')) {
      errorType = 'SSL_ERROR';
    } else if (error.message.includes('redirect')) {
      errorType = 'TOO_MANY_REDIRECTS';
    }
    
    const errorData = {
      type: errorType,
      message: error.message,
      code: error.code || httpStatus || 'UNKNOWN',
      timestamp: new Date().toISOString(),
      isTemporary
    };
    
    // Get current bookmark to check attempts
    const bookmarkResult = await query(
      'SELECT check_attempts FROM bookmarks WHERE id = $1',
      [bookmarkId]
    );
    
    const checkAttempts = bookmarkResult.rows[0]?.check_attempts || 0;
    
    // Don't mark as dead if it's a temporary error and we haven't exceeded max retries
    if (isTemporary && checkAttempts < this.maxRetries) {
      isDead = false;
    }
    
    await query(`
      UPDATE bookmarks 
      SET 
        is_valid = false,
        is_dead = $2,
        http_status = $3,
        last_checked = NOW(),
        validation_errors = COALESCE(validation_errors, '[]'::jsonb) || $4::jsonb
      WHERE id = $1
    `, [bookmarkId, isDead, httpStatus, JSON.stringify([errorData])]);
    
    logger.warn('Bookmark validation failed', { 
      bookmarkId, 
      errorType,
      httpStatus,
      isDead,
      isTemporary,
      attempts: checkAttempts,
      error: error.message
    });
  }

  /**
   * Get pending bookmarks for validation
   */
  async getPendingBookmarks(limit = this.batchSize) {
    const result = await query(`
      SELECT id, url, title, description 
      FROM bookmarks 
      WHERE 
        is_deleted = false AND
        (last_checked IS NULL OR last_checked < NOW() - INTERVAL '30 days') AND
        check_attempts < $1
      ORDER BY 
        last_checked ASC NULLS FIRST,
        created_at ASC
      LIMIT $2
    `, [this.maxRetries, limit]);
    
    return result.rows;
  }

  /**
   * Process validation queue
   */
  async processValidationQueue() {
    try {
      const pendingBookmarks = await this.getPendingBookmarks();
      
      if (pendingBookmarks.length === 0) {
        logger.info('No bookmarks pending validation');
        return { processed: 0, successful: 0, failed: 0 };
      }
      
      logger.info(`Processing ${pendingBookmarks.length} bookmarks for validation`);
      
      const results = {
        processed: 0,
        successful: 0,
        failed: 0
      };
      
      // Process bookmarks in parallel batches of 5
      const batchSize = 5;
      for (let i = 0; i < pendingBookmarks.length; i += batchSize) {
        const batch = pendingBookmarks.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
          batch.map(bookmark => this.validateBookmark(bookmark.id))
        );
        
        batchResults.forEach(result => {
          results.processed++;
          if (result.status === 'fulfilled' && result.value.is_valid) {
            results.successful++;
          } else {
            results.failed++;
          }
        });
        
        // Small delay between batches to avoid overwhelming servers
        if (i + batchSize < pendingBookmarks.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      logger.info('Validation queue processed', results);
      return results;
      
    } catch (error) {
      logger.error('Error processing validation queue', { error: error.message });
      throw error;
    }
  }

  /**
   * Revalidate bookmarks older than specified days
   */
  async revalidateOldBookmarks(days = 30) {
    const result = await query(`
      UPDATE bookmarks 
      SET last_checked = NULL, check_attempts = 0
      WHERE 
        is_deleted = false AND
        last_checked < NOW() - INTERVAL '${days} days'
      RETURNING id
    `);
    
    logger.info(`Marked ${result.rowCount} bookmarks for revalidation`);
    return result.rowCount;
  }

  /**
   * Get validation statistics
   */
  async getValidationStats() {
    const stats = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_valid = true) as valid,
        COUNT(*) FILTER (WHERE is_valid = false) as invalid,
        COUNT(*) FILTER (WHERE is_dead = true) as dead,
        COUNT(*) FILTER (WHERE last_checked IS NULL) as unchecked,
        COUNT(*) FILTER (WHERE enriched = true) as enriched,
        COUNT(*) FILTER (WHERE check_attempts >= $1) as max_retries_reached
      FROM bookmarks
      WHERE is_deleted = false
    `, [this.maxRetries]);
    
    return stats.rows[0];
  }
}

export default new ValidationService();