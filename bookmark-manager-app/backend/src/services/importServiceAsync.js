import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import unifiedLogger from './unifiedLogger.js';
import { JSDOM } from 'jsdom';
import orchestratorService from './orchestratorService.js';
import websocketService from './websocketService.js';

/**
 * Async Import Service - Fast bookmark import with background processing
 */
class ImportServiceAsync {
  /**
   * Fast import - parse and store immediately, process later
   */
  async importFromFile(userId, filePath) {
    unifiedLogger.debug('ImportServiceAsync.importFromFile method entry', {
      service: 'import',
      source: 'importFromFileAsync',
      userId,
      filePath,
      fileName: path.basename(filePath),
      mode: 'async'
    });
    
    const startTime = Date.now();
    const importId = uuidv4();
    let client;
    
    try {
      // Create import record
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status, total_count) 
         VALUES ($1, $2, $3, $4, $5)`,
        [importId, userId, path.basename(filePath), 'processing', 0]
      );

      // Parse HTML file
      const content = await fs.readFile(filePath, 'utf-8');
      const bookmarks = this.parseBookmarksHtml(content);
      
      unifiedLogger.info('Successfully parsed bookmarks from HTML (async mode)', {
        service: 'import',
        source: 'importFromFileAsync',
        userId,
        importId,
        bookmarkCount: bookmarks.length,
        parseTime: Date.now() - startTime,
        fileSize: content.length
      });

      // Update total count
      await db.query(
        'UPDATE import_history SET total_count = $1 WHERE id = $2',
        [bookmarks.length, importId]
      );

      // Start transaction for bulk insert
      client = await db.getClient();
      await client.query('BEGIN');

      let imported = 0;
      const batchSize = 100;
      const allInsertedIds = [];
      
      // Process in batches for better performance
      for (let i = 0; i < bookmarks.length; i += batchSize) {
        const batch = bookmarks.slice(i, i + batchSize);
        const insertedIds = await this.insertBookmarkBatch(client, userId, batch);
        imported += insertedIds.length;
        allInsertedIds.push(...insertedIds);

        // Update progress
        await client.query(
          'UPDATE import_history SET processed_count = $1 WHERE id = $2',
          [imported, importId]
        );
        
        const progress = Math.round((imported / bookmarks.length) * 100);
        
        // Log batch progress
        unifiedLogger.debug('Import batch processed', {
          service: 'import',
          source: 'importFromFileAsync',
          userId,
          importId,
          batch: {
            start: i,
            end: Math.min(i + batchSize, bookmarks.length),
            size: batch.length,
            insertedCount: insertedIds.length
          },
          progress: {
            imported,
            total: bookmarks.length,
            percentage: progress
          }
        });
        
        // Emit progress via WebSocket
        websocketService.emitImportProgress(importId, {
          importId,
          total: bookmarks.length,
          imported,
          percentage: progress,
        });
      }

      await client.query('COMMIT');
      
      // Start orchestrated workflow for all imported bookmarks
      const workflowId = await orchestratorService.startWorkflow('standard', allInsertedIds, {
        userId,
        importId,
        workflowType: 'import',
      });
      
      unifiedLogger.info('Orchestrated workflow started for imported bookmarks', {
        service: 'import',
        source: 'importFromFileAsync',
        userId,
        importId,
        workflowId,
        bookmarkCount: allInsertedIds.length,
        workflow: {
          type: 'standard',
          context: 'import'
        }
      });

      // Mark import as complete (validation still pending)
      await db.query(
        'UPDATE import_history SET status = $1, completed_at = $2 WHERE id = $3',
        ['imported', new Date(), importId]
      );

      const duration = Date.now() - startTime;
      
      unifiedLogger.info('Async import completed successfully', {
        service: 'import',
        source: 'importFromFileAsync',
        userId,
        importId,
        performance: {
          duration: `${duration}ms`,
          bookmarksPerSecond: Math.round((imported / duration) * 1000),
          mode: 'async-bulk-insert'
        },
        results: {
          total: bookmarks.length,
          imported,
          workflowStarted: true,
          workflowId
        }
      });
      
      // Log performance metrics if operation was slow
      if (duration > 3000) {
        unifiedLogger.logPerformance('async-bookmark-import', duration, {
          service: 'import',
          userId,
          bookmarkCount: bookmarks.length
        });
      }

      return {
        importId,
        total: bookmarks.length,
        imported,
        status: 'imported',
        message: 'Bookmarks imported successfully. Background processing started.',
      };

    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      
      unifiedLogger.error('Async import failed', error, {
        service: 'import',
        source: 'importFromFileAsync',
        userId,
        filePath,
        importId,
        duration: Date.now() - startTime,
        transactionState: client ? 'rollback' : 'not-started'
      });
      
      await db.query(
        'UPDATE import_history SET status = $1 WHERE id = $2',
        ['failed', importId]
      );
      
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Parse bookmarks from HTML
   */
  parseBookmarksHtml(html) {
    unifiedLogger.debug('Starting HTML parsing with JSDOM', {
      service: 'import',
      source: 'parseBookmarksHtmlAsync',
      htmlLength: html.length
    });
    
    const parseStartTime = Date.now();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const bookmarks = [];
    let skippedCount = 0;
    
    // Find all bookmark links
    const links = document.querySelectorAll('a[href]');
    
    unifiedLogger.debug('Found bookmark links in HTML', {
      service: 'import',
      source: 'parseBookmarksHtmlAsync',
      linkCount: links.length
    });
    
    links.forEach(link => {
      const url = link.getAttribute('href');
      const title = link.textContent.trim();
      const addDate = link.getAttribute('add_date');
      const icon = link.getAttribute('icon');
      
      // Skip non-http(s) URLs
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        skippedCount++;
        return;
      }

      // Extract domain
      let domain;
      try {
        const urlObj = new URL(url);
        domain = urlObj.hostname;
      } catch (e) {
        domain = 'unknown';
      }

      bookmarks.push({
        url,
        title: title || url,
        domain,
        favicon_url: icon || null,
        chrome_add_date: addDate ? parseInt(addDate) : null,
        imported_at: new Date(),
      });
    });

    const parseTime = Date.now() - parseStartTime;
    
    unifiedLogger.debug('JSDOM parsing completed', {
      service: 'import',
      source: 'parseBookmarksHtmlAsync',
      totalLinks: links.length,
      validBookmarks: bookmarks.length,
      skippedUrls: skippedCount,
      parseTime: `${parseTime}ms`,
      performance: {
        bookmarksPerSecond: Math.round((bookmarks.length / parseTime) * 1000)
      }
    });
    
    return bookmarks;
  }

  /**
   * Insert batch of bookmarks
   */
  async insertBookmarkBatch(client, userId, bookmarks) {
    const batchStartTime = Date.now();
    const insertedIds = [];
    let duplicates = 0;
    let errors = 0;
    
    unifiedLogger.debug('Processing bookmark batch', {
      service: 'import',
      source: 'insertBookmarkBatch',
      userId,
      batchSize: bookmarks.length
    });
    
    for (const bookmark of bookmarks) {
      try {
        // Check if bookmark already exists
        const existing = await client.query(
          'SELECT id FROM bookmarks WHERE user_id = $1 AND url = $2',
          [userId, bookmark.url]
        );

        if (existing.rows.length > 0) {
          insertedIds.push(existing.rows[0].id);
          duplicates++;
          continue;
        }

        // Insert new bookmark
        const result = await client.query(
          `INSERT INTO bookmarks (
            id, user_id, url, title, domain, favicon_url, 
            imported_at, chrome_add_date, is_valid, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id`,
          [
            uuidv4(),
            userId,
            bookmark.url,
            bookmark.title,
            bookmark.domain,
            bookmark.favicon_url,
            bookmark.imported_at,
            bookmark.chrome_add_date,
            true, // Assume valid initially
            new Date(),
            new Date(),
          ]
        );

        insertedIds.push(result.rows[0].id);

        // Also create metadata record
        await client.query(
          `INSERT INTO bookmark_metadata (
            id, bookmark_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4)`,
          [uuidv4(), result.rows[0].id, new Date(), new Date()]
        );

      } catch (error) {
        errors++;
        unifiedLogger.warn('Failed to insert bookmark in batch', {
          service: 'import',
          source: 'insertBookmarkBatch',
          userId,
          bookmark: {
            url: bookmark.url,
            title: bookmark.title,
            domain: bookmark.domain
          },
          error: {
            message: error.message,
            code: error.code
          },
          stats: {
            processed: insertedIds.length + duplicates + errors,
            total: bookmarks.length
          }
        });
      }
    }

    const batchTime = Date.now() - batchStartTime;
    
    unifiedLogger.debug('Bookmark batch insertion completed', {
      service: 'import',
      source: 'insertBookmarkBatch',
      userId,
      batchSize: bookmarks.length,
      results: {
        inserted: insertedIds.length,
        duplicates,
        errors,
        totalProcessed: insertedIds.length + duplicates + errors
      },
      performance: {
        duration: `${batchTime}ms`,
        bookmarksPerSecond: Math.round((bookmarks.length / batchTime) * 1000)
      }
    });
    
    return insertedIds;
  }

  /**
   * Get import progress
   */
  async getImportProgress(importId) {
    unifiedLogger.debug('Retrieving detailed import progress', {
      service: 'import',
      source: 'getImportProgress',
      importId
    });
    
    const result = await db.query(
      `SELECT 
        ih.*,
        (SELECT COUNT(*) FROM bookmarks b WHERE b.import_id = ih.id) as imported_count,
        (SELECT COUNT(*) FROM bookmarks b WHERE b.import_id = ih.id AND b.is_valid = true) as valid_count,
        (SELECT COUNT(*) FROM bookmarks b WHERE b.import_id = ih.id AND b.enriched = true) as enriched_count
      FROM import_history ih
      WHERE ih.id = $1`,
      [importId]
    );

    if (result.rows.length === 0) {
      unifiedLogger.debug('Import not found', {
        service: 'import',
        source: 'getImportProgress',
        importId
      });
      return null;
    }

    const importData = result.rows[0];
    
    return {
      ...importData,
      validation_progress: {
        total: importData.imported_count,
        validated: importData.valid_count,
        percentage: importData.imported_count > 0 
          ? Math.round((importData.valid_count / importData.imported_count) * 100) 
          : 0,
      },
      enrichment_progress: {
        total: importData.imported_count,
        enriched: importData.enriched_count,
        percentage: importData.imported_count > 0 
          ? Math.round((importData.enriched_count / importData.imported_count) * 100) 
          : 0,
      },
    };
    
    unifiedLogger.debug('Import progress retrieved', {
      service: 'import',
      source: 'getImportProgress',
      importId,
      status: importData.status,
      progress: {
        total: importData.total_count,
        imported: importData.imported_count,
        validated: importData.valid_count,
        enriched: importData.enriched_count
      }
    });
    
    return progressData;
  }
}

export default new ImportServiceAsync();