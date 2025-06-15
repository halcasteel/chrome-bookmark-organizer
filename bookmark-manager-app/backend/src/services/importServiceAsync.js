import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/database.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';
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
    logInfo('Starting fast bookmark import', { userId, filePath });
    
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
      
      logInfo('Parsed bookmarks from HTML', { count: bookmarks.length });

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
        
        // Emit progress via WebSocket
        websocketService.emitImportProgress(importId, {
          importId,
          total: bookmarks.length,
          imported,
          percentage: Math.round((imported / bookmarks.length) * 100),
        });
      }

      await client.query('COMMIT');
      
      // Start orchestrated workflow for all imported bookmarks
      const workflowId = await orchestratorService.startWorkflow('standard', allInsertedIds, {
        userId,
        importId,
        workflowType: 'import',
      });
      
      logInfo('Started orchestrated workflow for import', {
        importId,
        workflowId,
        bookmarkCount: allInsertedIds.length,
      });

      // Mark import as complete (validation still pending)
      await db.query(
        'UPDATE import_history SET status = $1, completed_at = $2 WHERE id = $3',
        ['imported', new Date(), importId]
      );

      logInfo('Fast import completed', {
        importId,
        total: bookmarks.length,
        imported,
      });

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
      
      logError(error, { context: 'ImportServiceAsync.importFromFile' });
      
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
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const bookmarks = [];
    
    // Find all bookmark links
    const links = document.querySelectorAll('a[href]');
    
    links.forEach(link => {
      const url = link.getAttribute('href');
      const title = link.textContent.trim();
      const addDate = link.getAttribute('add_date');
      const icon = link.getAttribute('icon');
      
      // Skip non-http(s) URLs
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
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

    return bookmarks;
  }

  /**
   * Insert batch of bookmarks
   */
  async insertBookmarkBatch(client, userId, bookmarks) {
    const insertedIds = [];
    
    for (const bookmark of bookmarks) {
      try {
        // Check if bookmark already exists
        const existing = await client.query(
          'SELECT id FROM bookmarks WHERE user_id = $1 AND url = $2',
          [userId, bookmark.url]
        );

        if (existing.rows.length > 0) {
          insertedIds.push(existing.rows[0].id);
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
        logWarn('Failed to insert bookmark', { 
          url: bookmark.url, 
          error: error.message 
        });
      }
    }

    return insertedIds;
  }

  /**
   * Get import progress
   */
  async getImportProgress(importId) {
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
  }
}

export default new ImportServiceAsync();