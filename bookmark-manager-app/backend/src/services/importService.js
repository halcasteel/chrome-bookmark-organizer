import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { logInfo, logError, logWarn, logDebug } from '../utils/logger.js';
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
    logInfo('Starting bookmark import', { userId, filePath });
    
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

      logInfo('Parsed bookmarks from HTML', { count: bookmarks.length });

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
        
        logInfo('Import completed', {
          importId,
          total: processingReport.totalBookmarks,
          processed: processingReport.processedCount,
          failed: processingReport.failedCount,
        });
        
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
      logError(error, { context: 'ImportService.importFromFile', userId, filePath });
      
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
    
    logDebug('Parsed bookmarks from HTML', { count: bookmarks.length });
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
    logWarn('Using legacy bookmark processing', { userId, count: bookmarks.length });
    
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
          logInfo('Import progress', {
            imported,
            total,
            percentage: Math.round((imported / total) * 100),
          });
          
          await db.query(
            'UPDATE import_history SET processed_count = $1 WHERE id = $2',
            [imported, importId]
          );
        }

      } catch (error) {
        logError(error, {
          context: 'ImportService.processBookmarks',
          url: bookmark.url,
          title: bookmark.title,
        });
        failed++;
      }
    }

    logInfo('Legacy import complete', {
      imported,
      duplicates,
      failed,
      total,
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

    return result.rows;
  }

  /**
   * Get import status
   * @param {string} importId - Import ID
   * @returns {Promise<Object>} Import status
   */
  async getImportStatus(importId) {
    const result = await db.query(
      `SELECT id, file_name, status, total_count, processed_count,
              created_at, completed_at
       FROM import_history
       WHERE id = $1`,
      [importId]
    );

    return result.rows[0] || null;
  }
}

export default new ImportService();