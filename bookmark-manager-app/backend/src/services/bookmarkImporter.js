import { JSDOM } from 'jsdom';
import crypto from 'crypto';
import { query, transaction } from '../db/index.js';
import embeddingService from './embeddingService.js';
import metadataExtractor from './metadataExtractor.js';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

export class BookmarkImporter {
  constructor() {
    this.batchSize = 100;
  }

  // Parse Chrome bookmarks HTML file
  async parseBookmarksHTML(htmlContent) {
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
          logger.warn(`Invalid URL skipped: ${url}`);
        }
      }
    });

    logger.info(`Parsed ${bookmarks.length} bookmarks from HTML`);
    return bookmarks;
  }

  // Import bookmarks for a user
  async importBookmarks(userId, htmlContent, filename) {
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
        logger.info(`Progress: ${i + batch.length}/${bookmarks.length} bookmarks processed`);
      }

      // Update import record
      await this.updateImportRecord(importId, 'completed', results);

      // Process embeddings in background
      this.processEmbeddingsAsync(userId);

      return {
        importId,
        ...results
      };
    } catch (error) {
      logger.error('Import failed:', error);
      await this.updateImportRecord(importId, 'failed', null, error.message);
      throw error;
    }
  }

  // Process a batch of bookmarks
  async processBatch(userId, bookmarks) {
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
          logger.error(`Error processing bookmark ${bookmark.url}:`, error);
          results.failed++;
          results.errors.push({
            url: bookmark.url,
            error: error.message
          });
        }
      }
    });

    return results;
  }

  // Create import record
  async createImportRecord(userId, filename, fileSize) {
    const sql = `
      INSERT INTO import_history (user_id, filename, file_size, status)
      VALUES ($1, $2, $3, 'processing')
      RETURNING id
    `;
    const result = await query(sql, [userId, filename, fileSize]);
    return result.rows[0].id;
  }

  // Update import record
  async updateImportRecord(importId, status, results = null, error = null) {
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
      logger.info(`Processing embeddings for ${result.rows.length} bookmarks`);
      
      // Process in background
      setImmediate(async () => {
        try {
          await embeddingService.processBookmarks(result.rows);
        } catch (error) {
          logger.error('Error processing embeddings:', error);
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
      
      logger.info(`Importing bookmarks from file: ${filename}`);
      const result = await this.importBookmarks(userId, content, filename);
      
      // Archive the processed file
      const archiveDir = path.join(path.dirname(filePath), 'archive');
      await fs.mkdir(archiveDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivePath = path.join(archiveDir, `${timestamp}_${filename}`);
      await fs.rename(filePath, archivePath);
      
      logger.info(`Archived processed file to: ${archivePath}`);
      
      return result;
    } catch (error) {
      logger.error(`Error importing from file ${filePath}:`, error);
      throw error;
    }
  }

  // Detect and handle duplicates
  async detectDuplicates(userId) {
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

    logger.info(`Merged ${mergedCount} duplicate bookmarks`);
    return mergedCount;
  }
}

// Export singleton instance
export default new BookmarkImporter();