import fs from 'fs';
import readline from 'readline';
import { JSDOM } from 'jsdom';
import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import unifiedLogger from './unifiedLogger.js';
import websocketService from './websocketService.js';

// Create import queue
const importChunkQueue = new Bull('import-chunks', process.env.REDIS_URL);

class StreamingImportService {
  constructor() {
    this.chunkSize = parseInt(process.env.IMPORT_CHUNK_SIZE) || 100;
    this.currentBookmark = null;
    this.inBookmark = false;

    unifiedLogger.info('StreamingImportService initialized', {
      service: 'streamingImportService',
      source: 'constructor',
      chunkSize: this.chunkSize
    });
  }

  /**
   * Parse HTML file using streaming to handle large files
   */
  async parseBookmarksStream(filePath, importId, userId) {
    const startTime = Date.now();
    unifiedLogger.info('Starting stream parsing', {
      service: 'streamingImportService',
      source: 'parseBookmarksStream',
      filePath,
      importId,
      userId
    });

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
          unifiedLogger.error('Error parsing line', {
            service: 'streamingImportService',
            source: 'parseBookmarksStream',
            error: error.message,
            stack: error.stack,
            lineLength: line.length
          });
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
          
          unifiedLogger.info('Stream parsing complete', {
            service: 'streamingImportService',
            source: 'parseBookmarksStream',
            importId,
            totalBookmarks,
            totalChunks: chunkId,
            duration: Date.now() - startTime
          });
          
          resolve({ totalBookmarks, totalChunks: chunkId });
        } catch (error) {
          reject(error);
        }
      });
      
      rl.on('error', (error) => {
        unifiedLogger.error('Stream reading error', {
          service: 'streamingImportService',
          source: 'parseBookmarksStream',
          error: error.message,
          stack: error.stack,
          filePath,
          importId
        });
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
      unifiedLogger.error('Error extracting bookmark', {
        service: 'streamingImportService',
        source: 'extractBookmarkFromBuffer',
        error: error.message,
        stack: error.stack,
        bufferLength: buffer.length
      });
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
    
    unifiedLogger.debug('Chunk queued', {
      service: 'streamingImportService',
      source: 'queueChunk',
      importId,
      chunkId,
      bookmarkCount: bookmarks.length,
      userId
    });
  }

  /**
   * Start streaming import
   */
  async startStreamingImport(userId, filePath) {
    const startTime = Date.now();
    const importId = uuidv4();
    
    unifiedLogger.info('Starting streaming import', {
      service: 'streamingImportService',
      source: 'startStreamingImport',
      importId,
      userId,
      filePath
    });
    
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
          unifiedLogger.info('Streaming import completed', {
            service: 'streamingImportService',
            source: 'startStreamingImport',
            importId,
            ...result,
            duration: Date.now() - startTime
          });
        })
        .catch(error => {
          unifiedLogger.error('Streaming import failed', {
            service: 'streamingImportService',
            source: 'startStreamingImport',
            error: error.message,
            stack: error.stack,
            importId
          });
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
      unifiedLogger.error('Failed to start streaming import', {
        service: 'streamingImportService',
        source: 'startStreamingImport',
        error: error.message,
        stack: error.stack,
        userId,
        filePath
      });
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
  const startTime = Date.now();
  const { importId, userId, chunkId, bookmarks } = job.data;
  
  unifiedLogger.info('Processing import chunk', {
    service: 'streamingImportService',
    source: 'importChunkQueue.process',
    importId,
    chunkId,
    count: bookmarks.length,
    userId
  });
  
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
        unifiedLogger.warn('Failed to import bookmark', {
          service: 'streamingImportService',
          source: 'importChunkQueue.process',
          url: bookmark.url,
          error: error.message,
          importId,
          chunkId
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
      
      unifiedLogger.info('Import completed', {
        service: 'streamingImportService',
        source: 'importChunkQueue.process',
        importId,
        totalBookmarks: progress.bookmarksImported,
        duration: Date.now() - startTime
      });
      
      // Emit completion event
      websocketService.emitImportCompleted(userId, importId, {
        bookmarksImported: parseInt(progress.bookmarksImported),
        chunksProcessed: parseInt(progress.chunksProcessed)
      });
    }

    unifiedLogger.debug('Chunk processed successfully', {
      service: 'streamingImportService',
      source: 'importChunkQueue.process',
      imported,
      chunkId,
      duration: Date.now() - startTime
    });
    
    return { imported, chunkId };
    
  } catch (error) {
    unifiedLogger.error('Chunk processing failed', {
      service: 'streamingImportService',
      source: 'importChunkQueue.process',
      error: error.message,
      stack: error.stack,
      importId,
      chunkId
    });
    throw error;
  }
});

export default new StreamingImportService();