import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import unifiedLogger from './unifiedLogger.js';
import BookmarkProcessor from './bookmarkProcessor.js';

/**
 * ImportService - Handles bookmark imports from various sources
 * Supports HTML files and provides progress tracking
 */
class ImportService {
  /**
   * Import bookmarks from HTML file with validation and classification
   * @param {string} userId - User ID
   * @param {string} filePath - Path to HTML file
   * @returns {Promise<Object>} Import result
   */
  async importFromFile(userId, filePath) {
    unifiedLogger.debug('ImportService.importFromFile method entry', {
      service: 'import',
      source: 'importFromFile',
      userId,
      filePath,
      fileName: path.basename(filePath)
    });
    
    const startTime = Date.now();
    let importId;
    try {
      // Create import history record
      importId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status, total_count) 
         VALUES ($1, $2, $3, $4, $5)`,
        [importId, userId, path.basename(filePath), 'processing', 0]
      );

      // Read and parse file
      const content = await fs.readFile(filePath, 'utf-8');
      const bookmarks = this.parseBookmarksHtml(content);
      
      // Update total count
      await db.query(
        'UPDATE import_history SET total_count = $1 WHERE id = $2',
        [bookmarks.length, importId]
      );

      unifiedLogger.info('Successfully parsed bookmarks from HTML', {
        service: 'import',
        source: 'importFromFile',
        userId,
        importId,
        bookmarkCount: bookmarks.length,
        parseTime: Date.now() - startTime
      });

      // Use BookmarkProcessor for validation and classification
      const processor = new BookmarkProcessor();
      await processor.initialize();
      
      try {
        const processingReport = await processor.processHtmlFile(filePath, userId);
        
        // Update import history
        await db.query(
          'UPDATE import_history SET status = $1, processed_count = $2, completed_at = $3 WHERE id = $4',
          ['completed', processingReport.processedCount, new Date(), importId]
        );
        
        const duration = Date.now() - startTime;
        
        unifiedLogger.info('Import completed successfully', {
          service: 'import',
          source: 'importFromFile',
          userId,
          importId,
          performance: {
            duration: `${duration}ms`,
            bookmarksPerSecond: Math.round((processingReport.processedCount / duration) * 1000)
          },
          results: {
            total: processingReport.totalBookmarks,
            processed: processingReport.processedCount,
            failed: processingReport.failedCount,
            duplicates: 0
          }
        });
        
        // Log performance metrics if operation was slow
        if (duration > 5000) {
          unifiedLogger.logPerformance('bookmark-import', duration, {
            service: 'import',
            userId,
            bookmarkCount: processingReport.totalBookmarks
          });
        }
        
        return {
          importId,
          total: processingReport.totalBookmarks,
          imported: processingReport.processedCount,
          failed: processingReport.failedCount,
          duplicates: 0,
          report: processingReport,
        };
      } finally {
        await processor.cleanup();
      }

    } catch (error) {
      unifiedLogger.error('Import failed', error, {
        service: 'import',
        source: 'importFromFile',
        userId,
        filePath,
        importId,
        duration: Date.now() - startTime
      });
      
      // Update import history on error
      if (importId) {
        await db.query(
          'UPDATE import_history SET status = $1 WHERE id = $2',
          ['failed', importId]
        );
      }
      
      throw error;
    }
  }

  /**
   * Parse bookmarks from HTML
   * @param {string} html - HTML content
   * @returns {Array} Parsed bookmarks
   */
  parseBookmarksHtml(html) {
    unifiedLogger.debug('Starting HTML bookmark parsing', {
      service: 'import',
      source: 'parseBookmarksHtml',
      htmlLength: html.length
    });
    
    const parseStartTime = Date.now();
    const bookmarks = [];
    const linkRegex = /<A\s+[^>]*HREF="([^"]+)"[^>]*>([^<]+)<\/A>/gi;
    const addDateRegex = /ADD_DATE="(\d+)"/i;
    const iconRegex = /ICON="([^"]+)"/i;
    
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const fullMatch = match[0];
      const url = match[1];
      const title = match[2];
      
      const addDateMatch = addDateRegex.exec(fullMatch);
      const iconMatch = iconRegex.exec(fullMatch);
      
      bookmarks.push({
        url,
        title,
        addDate: addDateMatch ? new Date(parseInt(addDateMatch[1]) * 1000) : null,
        icon: iconMatch ? iconMatch[1] : null,
        tags: []
      });
    }
    
    const parseTime = Date.now() - parseStartTime;
    
    unifiedLogger.debug('HTML parsing completed', {
      service: 'import',
      source: 'parseBookmarksHtml',
      bookmarkCount: bookmarks.length,
      parseTime: `${parseTime}ms`,
      performance: {
        bookmarksPerSecond: Math.round((bookmarks.length / parseTime) * 1000)
      }
    });
    
    return bookmarks;
  }

  /**
   * Legacy bookmark processing (kept for backward compatibility)
   * @param {string} userId - User ID
   * @param {Array} bookmarks - Bookmarks to process
   * @param {string} importId - Import ID
   * @returns {Promise<Object>} Processing result
   * @deprecated Use BookmarkProcessor instead
   */
  async processBookmarks(userId, bookmarks, importId) {
    unifiedLogger.warn('Using deprecated legacy bookmark processing method', {
      service: 'import',
      source: 'processBookmarks',
      userId,
      importId,
      bookmarkCount: bookmarks.length
    });
    
    let imported = 0;
    let duplicates = 0;
    let failed = 0;
    const total = bookmarks.length;

    for (const bookmark of bookmarks) {
      try {
        // Check if bookmark already exists
        const existing = await db.query(
          'SELECT id FROM bookmarks WHERE user_id = $1 AND url = $2',
          [userId, bookmark.url]
        );

        if (existing.rows.length > 0) {
          duplicates++;
          continue;
        }

        // Insert bookmark
        const bookmarkResult = await db.query(
          `INSERT INTO bookmarks (user_id, url, title, created_at) 
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, bookmark.url, bookmark.title, new Date()]
        );

        // Insert default tags if any
        if (bookmark.tags && bookmark.tags.length > 0) {
          for (const tagName of bookmark.tags) {
            // Get or create tag
            const tagResult = await db.query(
              `INSERT INTO tags (name, user_id) 
               VALUES ($1, $2) 
               ON CONFLICT (name, user_id) DO UPDATE SET name = EXCLUDED.name
               RETURNING id`,
              [tagName.toLowerCase(), userId]
            );

            // Link tag to bookmark
            await db.query(
              'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)',
              [bookmarkResult.rows[0].id, tagResult.rows[0].id]
            );
          }
        }

        imported++;
        
        if (imported % 100 === 0) {
          const progress = Math.round((imported / total) * 100);
          
          unifiedLogger.info('Import progress update', {
            service: 'import',
            source: 'processBookmarks',
            userId,
            importId,
            progress: {
              imported,
              total,
              percentage: progress,
              duplicates,
              failed
            }
          });
          
          await db.query(
            'UPDATE import_history SET processed_count = $1 WHERE id = $2',
            [imported, importId]
          );
        }

      } catch (error) {
        unifiedLogger.error('Failed to process bookmark', error, {
          service: 'import',
          source: 'processBookmarks',
          userId,
          importId,
          bookmark: {
            url: bookmark.url,
            title: bookmark.title
          },
          progress: {
            imported,
            failed: failed + 1,
            total
          }
        });
        failed++;
      }
    }

    unifiedLogger.info('Legacy import process completed', {
      service: 'import',
      source: 'processBookmarks',
      userId,
      importId,
      results: {
        total,
        imported,
        duplicates,
        failed,
        successRate: `${Math.round((imported / total) * 100)}%`
      }
    });
    
    return {
      total,
      imported,
      duplicates,
      failed
    };
  }

  /**
   * Get import history for user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Import history records
   */
  async getImportHistory(userId) {
    unifiedLogger.debug('Retrieving import history', {
      service: 'import',
      source: 'getImportHistory',
      userId
    });
    
    const result = await db.query(
      `SELECT id, filename, status, total_count as total_bookmarks, 
              processed_count as new_bookmarks, 
              created_at as started_at, completed_at
       FROM import_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    unifiedLogger.debug('Import history retrieved', {
      service: 'import',
      source: 'getImportHistory',
      userId,
      recordCount: result.rows.length
    });
    
    return result.rows;
  }

  /**
   * Get import status
   * @param {string} importId - Import ID
   * @returns {Promise<Object>} Import status
   */
  async getImportStatus(importId) {
    unifiedLogger.debug('Retrieving import status', {
      service: 'import',
      source: 'getImportStatus',
      importId
    });
    
    const result = await db.query(
      `SELECT id, file_name, status, total_count, processed_count,
              created_at, completed_at
       FROM import_history
       WHERE id = $1`,
      [importId]
    );

    const status = result.rows[0] || null;
    
    unifiedLogger.debug('Import status retrieved', {
      service: 'import',
      source: 'getImportStatus',
      importId,
      found: !!status,
      status: status?.status
    });
    
    return status;
  }
}

export default new ImportService();