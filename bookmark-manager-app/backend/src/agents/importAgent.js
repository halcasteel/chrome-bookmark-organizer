import fs from 'fs/promises';
import { A2AAgent } from './baseAgent.js';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';
import a2aTaskManager from '../services/a2aTaskManager.js';

/**
 * Import Agent - A2A-compliant agent for bookmark file processing
 * 
 * This agent handles the first phase of bookmark processing:
 * - Parses HTML bookmark files
 * - Extracts bookmark data
 * - Inserts bookmarks into database in chunks
 * - Creates bookmark IDs for downstream agents
 */
export class ImportAgent extends A2AAgent {
  constructor() {
    super({
      agentType: 'import',
      version: '1.0.0',
      capabilities: {
        description: 'Processes bookmark files and inserts into database',
        inputs: {
          filePath: { type: 'string', required: true, description: 'Path to bookmark HTML file' },
          userId: { type: 'string', required: true, description: 'User ID for bookmark ownership' },
          importId: { type: 'string', required: true, description: 'Import session ID' }
        },
        outputs: {
          type: 'bookmark_import_result',
          bookmarkIds: { type: 'array', items: 'string', description: 'Array of created bookmark IDs' },
          totalBookmarks: { type: 'number', description: 'Total bookmarks found in file' },
          insertedCount: { type: 'number', description: 'Number of bookmarks inserted' },
          duplicateCount: { type: 'number', description: 'Number of duplicate bookmarks skipped' }
        },
        estimatedDuration: '30-300s',
        maxConcurrency: 1,
        supportsStreaming: true
      }
    });
    
    this.chunkSize = parseInt(process.env.IMPORT_CHUNK_SIZE) || 100;
    this.taskManager = a2aTaskManager;
  }

  /**
   * Execute import action
   * @param {Object} task - A2A task containing filePath, userId, importId
   * @returns {Object} - Import results with bookmarkIds
   */
  async executeAction(task) {
    const { filePath, userId, importId } = task.context;
    const startTime = Date.now();
    
    unifiedLogger.info('Starting import execution', {
      service: this.agentType,
      method: 'executeAction',
      filePath,
      userId,
      importId,
      taskId: task.id
    });
    
    // Parse bookmarks from file
    await this.reportProgress(task.id, 10, 'Parsing bookmark file');
    const bookmarks = await this.parseBookmarksFromFile(filePath);
    
    unifiedLogger.info('Bookmarks parsed', {
      service: this.agentType,
      method: 'executeAction',
      count: bookmarks.length,
      taskId: task.id
    });
    
    // Insert bookmarks in chunks with progress updates
    await this.reportProgress(task.id, 20, `Found ${bookmarks.length} bookmarks, starting insertion`);
    const result = await this.insertBookmarksInChunks(
      bookmarks, 
      userId, 
      importId, 
      task
    );
    
    // Clean up temp file
    try {
      await fs.unlink(filePath);
      unifiedLogger.debug('Temp file cleaned up', {
        service: this.agentType,
        method: 'executeAction',
        filePath
      });
    } catch (error) {
      unifiedLogger.warn('Failed to clean up temp file', {
        service: this.agentType,
        method: 'executeAction',
        filePath,
        error: error.message
      });
    }
    
    // Update import history
    await db.query(
      `UPDATE import_history 
       SET status = $1, total_bookmarks = $2, new_bookmarks = $3, completed_at = NOW() 
       WHERE id = $4`,
      ['phase1_complete', bookmarks.length, result.insertedCount, importId]
    );
    
    const duration = Date.now() - startTime;
    
    unifiedLogger.info('Import execution completed', {
      service: this.agentType,
      method: 'executeAction',
      taskId: task.id,
      duration,
      totalBookmarks: bookmarks.length,
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount
    });
    
    return {
      bookmarkIds: result.bookmarkIds,
      totalBookmarks: bookmarks.length,
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount,
      importId: importId,
      duration: duration
    };
  }

  /**
   * Parse bookmarks from HTML file
   * @param {string} filePath - Path to HTML file
   * @returns {Array} - Array of bookmark objects
   */
  async parseBookmarksFromFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const bookmarks = [];
    
    // Parse bookmarks using regex (faster than DOM parsing for large files)
    const linkRegex = /<A\s+[^>]*HREF="([^"]+)"[^>]*>([^<]+)<\/A>/gi;
    const addDateRegex = /ADD_DATE="(\d+)"/i;
    const iconRegex = /ICON="([^"]+)"/i;
    
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const url = match[1];
      const title = match[2];
      
      // Skip invalid URLs
      if (url === 'about:blank' || !url.startsWith('http')) {
        continue;
      }
      
      const addDateMatch = addDateRegex.exec(fullMatch);
      const iconMatch = iconRegex.exec(fullMatch);
      
      bookmarks.push({
        id: uuidv4(),
        url,
        title: title.trim(),
        addDate: addDateMatch ? new Date(parseInt(addDateMatch[1]) * 1000) : new Date(),
        icon: iconMatch ? iconMatch[1] : null
      });
    }
    
    return bookmarks;
  }

  /**
   * Insert bookmarks in chunks with progress reporting
   * @param {Array} bookmarks - Bookmarks to insert
   * @param {string} userId - User ID
   * @param {string} importId - Import ID
   * @param {Object} task - A2A task for progress reporting
   * @returns {Object} - Insertion results
   */
  async insertBookmarksInChunks(bookmarks, userId, importId, task) {
    const totalBookmarks = bookmarks.length;
    const bookmarkIds = [];
    let insertedCount = 0;
    let duplicateCount = 0;
    let processed = 0;
    
    // Process in chunks
    for (let i = 0; i < bookmarks.length; i += this.chunkSize) {
      const chunk = bookmarks.slice(i, i + this.chunkSize);
      const chunkNum = Math.floor(i / this.chunkSize) + 1;
      const totalChunks = Math.ceil(bookmarks.length / this.chunkSize);
      
      // Report progress
      const progress = Math.round((processed / totalBookmarks) * 100);
      
      // Emit progress via task manager
      if (task && task.id) {
        await this.taskManager.updateTaskProgress(task.id, progress, {
          bookmarksProcessed: processed,
          totalBookmarks: totalBookmarks,
          currentChunk: chunkNum,
          totalChunks: totalChunks,
          insertedCount: insertedCount,
          duplicateCount: duplicateCount
        });
        
        // Add progress message
        await this.taskManager.addTaskMessage(task.id, {
          agentType: this.agentType,
          type: 'progress',
          content: `Processing chunk ${chunkNum}/${totalChunks}`,
          metadata: {
            chunkSize: chunk.length,
            processed: processed,
            total: totalBookmarks
          }
        });
      }
      
      try {
        // Insert chunk in transaction
        await db.query('BEGIN');
        
        for (const bookmark of chunk) {
          try {
            // Insert bookmark (handle duplicates)
            const result = await db.query(
              `INSERT INTO bookmarks (id, user_id, url, title, created_at, import_id, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (user_id, url) DO UPDATE SET
                 title = EXCLUDED.title,
                 updated_at = NOW()
               RETURNING id, (xmax = 0) as inserted`,
              [bookmark.id, userId, bookmark.url, bookmark.title, bookmark.addDate, importId, 'imported']
            );
            
            if (result.rows.length > 0) {
              bookmarkIds.push(result.rows[0].id);
              if (result.rows[0].inserted) {
                insertedCount++;
              } else {
                duplicateCount++;
              }
            }
            
            processed++;
            
          } catch (bookmarkError) {
            unifiedLogger.warn('Failed to insert individual bookmark', {
              service: this.agentType,
              method: 'insertBookmarksInChunks',
              url: bookmark.url,
              error: bookmarkError.message,
              importId
            });
          }
        }
        
        await db.query('COMMIT');
        
        // Report progress
        const progress = 20 + Math.round((processed / totalBookmarks) * 70); // 20-90%
        await this.reportProgress(
          task.id, 
          progress,
          `Processed chunk ${chunkNum}/${totalChunks} (${processed}/${totalBookmarks} bookmarks)`
        );
        
      } catch (error) {
        await db.query('ROLLBACK');
        
        unifiedLogger.error('Failed to insert chunk', {
          service: this.agentType,
          method: 'insertBookmarksInChunks',
          chunkStart: i,
          chunkSize: chunk.length,
          error: error.message,
          stack: error.stack,
          importId
        });
        
        // Continue with next chunk instead of failing entire import
        processed += chunk.length;
      }
    }
    
    // Final progress
    await this.reportProgress(task.id, 95, 'Import complete, preparing results');
    
    return {
      bookmarkIds,
      insertedCount,
      duplicateCount
    };
  }
}

// Export singleton instance
export default new ImportAgent();