import fs from 'fs';
import readline from 'readline';
import { JSDOM } from 'jsdom';
import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import logger from '../utils/logger.js';
import websocketService from './websocketService.js';

// Create import queue
const importChunkQueue = new Bull('import-chunks', process.env.REDIS_URL);

class StreamingImportService {
  constructor() {
    this.chunkSize = parseInt(process.env.IMPORT_CHUNK_SIZE) || 100;
    this.currentBookmark = null;
    this.inBookmark = false;
  }

  /**
   * Parse HTML file using streaming to handle large files
   */
  async parseBookmarksStream(filePath, importId, userId) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({ input: stream });
      
      let lineBuffer = '';
      let bookmarks = [];
      let totalBookmarks = 0;
      let chunkId = 0;
      
      rl.on('line', async (line) => {
        try {
          // Buffer lines to handle multi-line bookmarks
          lineBuffer += line + '\n';
          
          // Look for bookmark start
          if (line.includes('<DT><A')) {
            this.inBookmark = true;
          }
          
          // Look for bookmark end
          if (this.inBookmark && line.includes('</A>')) {
            const bookmark = this.extractBookmarkFromBuffer(lineBuffer);
            if (bookmark) {
              bookmarks.push(bookmark);
              totalBookmarks++;
              
              // Queue chunk when size reached
              if (bookmarks.length >= this.chunkSize) {
                rl.pause(); // Pause reading while we queue
                await this.queueChunk(importId, userId, chunkId++, [...bookmarks]);
                bookmarks = [];
                rl.resume(); // Resume reading
              }
            }
            
            lineBuffer = '';
            this.inBookmark = false;
          }
        } catch (error) {
          logger.error('Error parsing line', { error: error.message, line });
        }
      });
      
      rl.on('close', async () => {
        try {
          // Queue remaining bookmarks
          if (bookmarks.length > 0) {
            await this.queueChunk(importId, userId, chunkId++, bookmarks);
          }
          
          // Update import record
          await query(
            'UPDATE import_history SET total_bookmarks = $1, total_chunks = $2 WHERE id = $3',
            [totalBookmarks, chunkId, importId]
          );
          
          logger.info('Stream parsing complete', { 
            importId, 
            totalBookmarks, 
            totalChunks: chunkId 
          });
          
          resolve({ totalBookmarks, totalChunks: chunkId });
        } catch (error) {
          reject(error);
        }
      });
      
      rl.on('error', (error) => {
        logger.error('Stream reading error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * Extract bookmark data from HTML buffer
   */
  extractBookmarkFromBuffer(buffer) {
    try {
      const dom = new JSDOM(buffer);
      const link = dom.window.document.querySelector('a');
      
      if (!link || !link.href) return null;
      
      const bookmark = {
        id: uuidv4(),
        url: link.href,
        title: link.textContent.trim(),
        addDate: link.getAttribute('ADD_DATE') ? 
          new Date(parseInt(link.getAttribute('ADD_DATE')) * 1000) : 
          new Date(),
        icon: link.getAttribute('ICON') || null
      };
      
      // Skip invalid URLs
      if (bookmark.url === 'about:blank' || !bookmark.url.startsWith('http')) {
        return null;
      }
      
      return bookmark;
    } catch (error) {
      logger.error('Error extracting bookmark', { error: error.message, buffer });
      return null;
    }
  }

  /**
   * Queue a chunk of bookmarks for processing
   */
  async queueChunk(importId, userId, chunkId, bookmarks) {
    await importChunkQueue.add('process-chunk', {
      importId,
      userId,
      chunkId,
      bookmarks,
      timestamp: new Date()
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    
    // Update Redis progress
    const progressKey = `import:${importId}:progress`;
    await importChunkQueue.client.hincrby(progressKey, 'chunksQueued', 1);
    
    logger.info('Chunk queued', { 
      importId, 
      chunkId, 
      bookmarkCount: bookmarks.length 
    });
  }

  /**
   * Start streaming import
   */
  async startStreamingImport(userId, filePath) {
    const importId = uuidv4();
    
    try {
      // Create import record
      await query(
        `INSERT INTO import_history (id, user_id, filename, status, total_bookmarks) 
         VALUES ($1, $2, $3, $4, $5)`,
        [importId, userId, filePath.split('/').pop(), 'streaming', 0]
      );
      
      // Initialize Redis tracking
      const progressKey = `import:${importId}:progress`;
      await importChunkQueue.client.hmset(progressKey, {
        status: 'streaming',
        chunksQueued: 0,
        chunksProcessed: 0,
        bookmarksImported: 0,
        startTime: Date.now()
      });
      
      // Start streaming parse in background
      this.parseBookmarksStream(filePath, importId, userId)
        .then(result => {
          logger.info('Streaming import completed', { importId, ...result });
        })
        .catch(error => {
          logger.error('Streaming import failed', { importId, error: error.message });
          query(
            'UPDATE import_history SET status = $1, error_message = $2 WHERE id = $3',
            ['failed', error.message, importId]
          );
        });
      
      return {
        importId,
        status: 'started',
        message: 'Import started in streaming mode'
      };
      
    } catch (error) {
      logger.error('Failed to start streaming import', { error: error.message });
      throw error;
    }
  }

  /**
   * Get import progress from Redis
   */
  async getImportProgress(importId) {
    const progressKey = `import:${importId}:progress`;
    const progress = await importChunkQueue.client.hgetall(progressKey);
    
    if (!progress || !progress.status) {
      return null;
    }
    
    return {
      importId,
      status: progress.status,
      chunksQueued: parseInt(progress.chunksQueued) || 0,
      chunksProcessed: parseInt(progress.chunksProcessed) || 0,
      bookmarksImported: parseInt(progress.bookmarksImported) || 0,
      duration: Date.now() - parseInt(progress.startTime),
      percentComplete: progress.chunksQueued > 0 ? 
        Math.round((parseInt(progress.chunksProcessed) / parseInt(progress.chunksQueued)) * 100) : 0
    };
  }
}

// Process import chunks
importChunkQueue.process('process-chunk', async (job) => {
  const { importId, userId, chunkId, bookmarks } = job.data;
  
  logger.info('Processing import chunk', { importId, chunkId, count: bookmarks.length });
  
  try {
    let imported = 0;
    
    // Insert bookmarks in batch transaction
    await query('BEGIN');
    
    for (const bookmark of bookmarks) {
      try {
        await query(
          `INSERT INTO bookmarks (id, user_id, url, title, created_at, import_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, url) DO UPDATE SET
             title = EXCLUDED.title,
             updated_at = NOW()`,
          [bookmark.id, userId, bookmark.url, bookmark.title, bookmark.addDate, importId]
        );
        imported++;
      } catch (error) {
        logger.warn('Failed to import bookmark', { 
          url: bookmark.url, 
          error: error.message 
        });
      }
    }
    
    await query('COMMIT');
    
    // Update progress in Redis
    const progressKey = `import:${importId}:progress`;
    await importChunkQueue.client.hincrby(progressKey, 'chunksProcessed', 1);
    await importChunkQueue.client.hincrby(progressKey, 'bookmarksImported', imported);
    
    // Get current progress
    const progress = await importChunkQueue.client.hgetall(progressKey);
    
    // Emit progress update via WebSocket
    websocketService.emitImportProgress(userId, importId, {
      phase: 'importing',
      chunkId,
      chunksProcessed: parseInt(progress.chunksProcessed),
      chunksQueued: parseInt(progress.chunksQueued),
      bookmarksImported: parseInt(progress.bookmarksImported),
      percentComplete: Math.round(
        (parseInt(progress.chunksProcessed) / parseInt(progress.chunksQueued)) * 100
      )
    });
    
    // Check if import is complete
    if (progress.chunksProcessed === progress.chunksQueued) {
      await query(
        'UPDATE import_history SET status = $1, new_bookmarks = $2, completed_at = NOW() WHERE id = $3',
        ['completed', progress.bookmarksImported, importId]
      );
      
      logger.info('Import completed', { 
        importId, 
        totalBookmarks: progress.bookmarksImported 
      });
      
      // Emit completion event
      websocketService.emitImportCompleted(userId, importId, {
        bookmarksImported: parseInt(progress.bookmarksImported),
        chunksProcessed: parseInt(progress.chunksProcessed)
      });
    }
    
    return { imported, chunkId };
    
  } catch (error) {
    logger.error('Chunk processing failed', { 
      importId, 
      chunkId, 
      error: error.message 
    });
    throw error;
  }
});

export default new StreamingImportService();