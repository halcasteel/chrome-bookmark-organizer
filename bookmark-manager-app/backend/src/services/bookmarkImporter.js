import { JSDOM } from 'jsdom';
import crypto from 'crypto';
import { query, transaction } from '../db/index.js';
import embeddingService from './embeddingService.js';
import metadataExtractor from './metadataExtractor.js';
import unifiedLogger from './unifiedLogger.js';

export class BookmarkImporter {
  constructor() {
    this.batchSize = 100;
    unifiedLogger.info('BookmarkImporter initialized', {
      service: 'bookmarkImporter',
      source: 'constructor',
      batchSize: this.batchSize
    });
  }

  // Parse Chrome bookmarks HTML file
  async parseBookmarksHTML(htmlContent) {
    const startTime = Date.now();
    unifiedLogger.debug('Parsing bookmarks HTML', {
      service: 'bookmarkImporter',
      source: 'parseBookmarksHTML',
      contentLength: htmlContent.length
    });

    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    const bookmarks = [];

    // Find all bookmark links
    const links = document.querySelectorAll('a');
    
    links.forEach((link) => {
      const url = link.getAttribute('href');
      const title = link.textContent.trim();
      const addDate = link.getAttribute('add_date');
      const icon = link.getAttribute('icon');
      
      if (url && title) {
        try {
          const urlObj = new URL(url);
          bookmarks.push({
            url,
            title,
            domain: urlObj.hostname,
            chromeAddDate: addDate ? parseInt(addDate) : null,
            icon
          });
        } catch (error) {
          // Skip invalid URLs
          unifiedLogger.warn('Invalid URL skipped', {
            service: 'bookmarkImporter',
            source: 'parseBookmarksHTML',
            url,
            error: error.message
          });
        }
      }
    });

    unifiedLogger.info('Bookmarks parsed from HTML', {
      service: 'bookmarkImporter',
      source: 'parseBookmarksHTML',
      bookmarkCount: bookmarks.length,
      duration: Date.now() - startTime
    });
    return bookmarks;
  }

  // Import bookmarks for a user
  async importBookmarks(userId, htmlContent, filename) {
    const startTime = Date.now();
    unifiedLogger.info('Starting bookmark import', {
      service: 'bookmarkImporter',
      source: 'importBookmarks',
      userId,
      filename,
      contentLength: htmlContent.length
    });

    const importId = await this.createImportRecord(userId, filename, htmlContent.length);
    
    try {
      // Parse bookmarks
      const bookmarks = await this.parseBookmarksHTML(htmlContent);
      
      // Process bookmarks in batches
      const results = {
        total: bookmarks.length,
        new: 0,
        updated: 0,
        failed: 0,
        errors: []
      };

      for (let i = 0; i < bookmarks.length; i += this.batchSize) {
        const batch = bookmarks.slice(i, i + this.batchSize);
        const batchResult = await this.processBatch(userId, batch);
        
        results.new += batchResult.new;
        results.updated += batchResult.updated;
        results.failed += batchResult.failed;
        results.errors.push(...batchResult.errors);

        // Update progress
        unifiedLogger.info('Import progress', {
          service: 'bookmarkImporter',
          source: 'importBookmarks',
          processed: i + batch.length,
          total: bookmarks.length,
          percentComplete: Math.round(((i + batch.length) / bookmarks.length) * 100)
        });
      }

      // Update import record
      await this.updateImportRecord(importId, 'completed', results);

      // Process embeddings in background
      this.processEmbeddingsAsync(userId);

      unifiedLogger.info('Bookmark import completed', {
        service: 'bookmarkImporter',
        source: 'importBookmarks',
        importId,
        results,
        duration: Date.now() - startTime
      });

      return {
        importId,
        ...results
      };
    } catch (error) {
      unifiedLogger.error('Import failed', {
        service: 'bookmarkImporter',
        source: 'importBookmarks',
        error: error.message,
        stack: error.stack,
        importId,
        userId
      });
      await this.updateImportRecord(importId, 'failed', null, error.message);
      throw error;
    }
  }

  // Process a batch of bookmarks
  async processBatch(userId, bookmarks) {
    const startTime = Date.now();
    unifiedLogger.debug('Processing bookmark batch', {
      service: 'bookmarkImporter',
      source: 'processBatch',
      userId,
      batchSize: bookmarks.length
    });

    const results = {
      new: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    await transaction(async (client) => {
      for (const bookmark of bookmarks) {
        try {
          // Check if bookmark exists
          const existingQuery = `
            SELECT id FROM bookmarks 
            WHERE user_id = $1 AND url = $2
          `;
          const existing = await client.query(existingQuery, [userId, bookmark.url]);

          if (existing.rows.length > 0) {
            // Update existing bookmark
            const updateQuery = `
              UPDATE bookmarks 
              SET title = $1, updated_at = CURRENT_TIMESTAMP, imported_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `;
            await client.query(updateQuery, [bookmark.title, existing.rows[0].id]);
            results.updated++;
          } else {
            // Insert new bookmark
            const insertQuery = `
              INSERT INTO bookmarks (user_id, url, title, domain, chrome_add_date, imported_at)
              VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
              RETURNING id
            `;
            await client.query(insertQuery, [
              userId,
              bookmark.url,
              bookmark.title,
              bookmark.domain,
              bookmark.chromeAddDate
            ]);
            results.new++;
          }
        } catch (error) {
          unifiedLogger.error('Error processing bookmark', {
            service: 'bookmarkImporter',
            source: 'processBatch',
            error: error.message,
            stack: error.stack,
            url: bookmark.url,
            userId
          });
          results.failed++;
          results.errors.push({
            url: bookmark.url,
            error: error.message
          });
        }
      }
    });

    unifiedLogger.debug('Batch processing completed', {
      service: 'bookmarkImporter',
      source: 'processBatch',
      results,
      duration: Date.now() - startTime
    });

    return results;
  }

  // Create import record
  async createImportRecord(userId, filename, fileSize) {
    unifiedLogger.debug('Creating import record', {
      service: 'bookmarkImporter',
      source: 'createImportRecord',
      userId,
      filename,
      fileSize
    });

    const sql = `
      INSERT INTO import_history (user_id, filename, file_size, status)
      VALUES ($1, $2, $3, 'processing')
      RETURNING id
    `;
    const result = await query(sql, [userId, filename, fileSize]);
    const importId = result.rows[0].id;

    unifiedLogger.info('Import record created', {
      service: 'bookmarkImporter',
      source: 'createImportRecord',
      importId,
      userId
    });

    return importId;
  }

  // Update import record
  async updateImportRecord(importId, status, results = null, error = null) {
    unifiedLogger.debug('Updating import record', {
      service: 'bookmarkImporter',
      source: 'updateImportRecord',
      importId,
      status,
      hasResults: !!results,
      hasError: !!error
    });
    const sql = `
      UPDATE import_history 
      SET status = $1,
          total_bookmarks = $2,
          new_bookmarks = $3,
          updated_bookmarks = $4,
          failed_bookmarks = $5,
          error_message = $6,
          completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE id = $7
    `;
    
    await query(sql, [
      status,
      results?.total,
      results?.new,
      results?.updated,
      results?.failed,
      error,
      importId
    ]);
  }

  // Process embeddings asynchronously
  async processEmbeddingsAsync(userId) {
    unifiedLogger.debug('Starting async embedding processing', {
      service: 'bookmarkImporter',
      source: 'processEmbeddingsAsync',
      userId
    });

    // Get bookmarks without embeddings
    const sql = `
      SELECT b.* 
      FROM bookmarks b
      LEFT JOIN bookmark_embeddings be ON b.id = be.bookmark_id
      WHERE b.user_id = $1 AND be.id IS NULL
      LIMIT 100
    `;
    
    const result = await query(sql, [userId]);
    
    if (result.rows.length > 0) {
      unifiedLogger.info('Processing embeddings for bookmarks', {
        service: 'bookmarkImporter',
        source: 'processEmbeddingsAsync',
        bookmarkCount: result.rows.length,
        userId
      });
      
      // Process in background
      setImmediate(async () => {
        try {
          await embeddingService.processBookmarks(result.rows);
        } catch (error) {
          unifiedLogger.error('Error processing embeddings', {
            service: 'bookmarkImporter',
            source: 'processEmbeddingsAsync',
            error: error.message,
            stack: error.stack,
            userId
          });
        }
      });
    }
  }

  // Import from file path (for file watcher)
  async importFromFile(userId, filePath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const filename = path.basename(filePath);
      
      unifiedLogger.info('Importing bookmarks from file', {
        service: 'bookmarkImporter',
        source: 'importFromFile',
        filename,
        filePath,
        userId
      });
      const result = await this.importBookmarks(userId, content, filename);
      
      // Archive the processed file
      const archiveDir = path.join(path.dirname(filePath), 'archive');
      await fs.mkdir(archiveDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivePath = path.join(archiveDir, `${timestamp}_${filename}`);
      await fs.rename(filePath, archivePath);
      
      unifiedLogger.info('Archived processed file', {
        service: 'bookmarkImporter',
        source: 'importFromFile',
        archivePath,
        originalPath: filePath
      });
      
      return result;
    } catch (error) {
      unifiedLogger.error('Error importing from file', {
        service: 'bookmarkImporter',
        source: 'importFromFile',
        error: error.message,
        stack: error.stack,
        filePath,
        userId
      });
      throw error;
    }
  }

  // Detect and handle duplicates
  async detectDuplicates(userId) {
    unifiedLogger.debug('Detecting duplicate bookmarks', {
      service: 'bookmarkImporter',
      source: 'detectDuplicates',
      userId
    });
    const sql = `
      SELECT url, COUNT(*) as count
      FROM bookmarks
      WHERE user_id = $1
      GROUP BY url
      HAVING COUNT(*) > 1
    `;
    
    const result = await query(sql, [userId]);
    return result.rows;
  }

  // Merge duplicate bookmarks
  async mergeDuplicates(userId) {
    const startTime = Date.now();
    unifiedLogger.info('Starting duplicate merge process', {
      service: 'bookmarkImporter',
      source: 'mergeDuplicates',
      userId
    });

    const duplicates = await this.detectDuplicates(userId);
    let mergedCount = 0;

    for (const dup of duplicates) {
      // Get all instances of this URL
      const sql = `
        SELECT id, created_at 
        FROM bookmarks 
        WHERE user_id = $1 AND url = $2
        ORDER BY created_at ASC
      `;
      const instances = await query(sql, [userId, dup.url]);
      
      if (instances.rows.length > 1) {
        // Keep the oldest, delete the rest
        const keepId = instances.rows[0].id;
        const deleteIds = instances.rows.slice(1).map(r => r.id);
        
        // Delete duplicates
        const deleteSql = `
          DELETE FROM bookmarks 
          WHERE id = ANY($1)
        `;
        await query(deleteSql, [deleteIds]);
        
        mergedCount += deleteIds.length;
      }
    }

    unifiedLogger.info('Duplicate merge completed', {
      service: 'bookmarkImporter',
      source: 'mergeDuplicates',
      mergedCount,
      duplicateUrls: duplicates.length,
      userId,
      duration: Date.now() - startTime
    });
    return mergedCount;
  }
}

// Export singleton instance
export default new BookmarkImporter();