import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import bookmarkImporter from './bookmarkImporter.js';
import { query } from '../db/index.js';
import unifiedLogger from './unifiedLogger.js';
import dotenv from 'dotenv';

dotenv.config();

class FileWatcher {
  constructor() {
    this.watchDir = process.env.BOOKMARK_IMPORT_DIR || './imports';
    this.watcher = null;
    this.processing = new Set();
    this.defaultUserId = process.env.DEFAULT_USER_ID; // For automated imports

    unifiedLogger.info('FileWatcher initialized', {
      service: 'fileWatcher',
      source: 'constructor',
      watchDir: this.watchDir,
      hasDefaultUserId: !!this.defaultUserId
    });
  }

  async start() {
    const startTime = Date.now();
    unifiedLogger.info('Starting file watcher', {
      service: 'fileWatcher',
      source: 'start',
      watchDir: this.watchDir
    });

    // Ensure watch directory exists
    await fs.mkdir(this.watchDir, { recursive: true });
    await fs.mkdir(path.join(this.watchDir, 'archive'), { recursive: true });
    await fs.mkdir(path.join(this.watchDir, 'failed'), { recursive: true });

    // Initialize watcher
    this.watcher = chokidar.watch(this.watchDir, {
      ignored: [
        /(^|[\/\\])\../, // ignore dotfiles
        /archive/,        // ignore archive directory
        /failed/          // ignore failed directory
      ],
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // Set up event handlers
    this.watcher
      .on('add', (filePath) => this.handleNewFile(filePath))
      .on('change', (filePath) => unifiedLogger.debug('File changed', {
        service: 'fileWatcher',
        source: 'watcher.change',
        filePath
      }))
      .on('unlink', (filePath) => unifiedLogger.debug('File removed', {
        service: 'fileWatcher',
        source: 'watcher.unlink',
        filePath
      }))
      .on('error', (error) => unifiedLogger.error('Watcher error', {
        service: 'fileWatcher',
        source: 'watcher.error',
        error: error.message,
        stack: error.stack
      }))
      .on('ready', () => {
        unifiedLogger.info('File watcher ready and monitoring', {
          service: 'fileWatcher',
          source: 'watcher.ready',
          duration: Date.now() - startTime
        });
        this.processExistingFiles();
      });
  }

  async handleNewFile(filePath) {
    const startTime = Date.now();
    const filename = path.basename(filePath);
    
    // Check if it's a bookmark file
    if (!this.isBookmarkFile(filename)) {
      return;
    }

    // Skip if already processing
    if (this.processing.has(filePath)) {
      unifiedLogger.debug('File already being processed', {
        service: 'fileWatcher',
        source: 'handleNewFile',
        filePath
      });
      return;
    }

    unifiedLogger.info('New bookmark file detected', {
      service: 'fileWatcher',
      source: 'handleNewFile',
      filename,
      filePath
    });
    this.processing.add(filePath);

    try {
      // Determine user ID
      const userId = await this.getUserIdForFile(filePath);
      
      if (!userId) {
        throw new Error('No user ID available for import');
      }

      // Import bookmarks
      const result = await bookmarkImporter.importFromFile(userId, filePath);
      
      unifiedLogger.info('Import completed', {
        service: 'fileWatcher',
        source: 'handleNewFile',
        filename,
        result,
        duration: Date.now() - startTime
      });
      
      // Send notification if configured
      await this.sendNotification(userId, result);
      
    } catch (error) {
      unifiedLogger.error('Error processing file', {
        service: 'fileWatcher',
        source: 'handleNewFile',
        error: error.message,
        stack: error.stack,
        filename,
        filePath
      });
      
      // Move to failed directory
      const failedPath = path.join(this.watchDir, 'failed', filename);
      await fs.rename(filePath, failedPath);
      
    } finally {
      this.processing.delete(filePath);
    }
  }

  isBookmarkFile(filename) {
    // Check for bookmark file patterns
    const patterns = [
      /bookmarks.*\.html$/i,
      /chrome.*bookmarks.*\.html$/i,
      /bookmark.*export.*\.html$/i
    ];
    
    return patterns.some(pattern => pattern.test(filename));
  }

  async getUserIdForFile(filePath) {
    const filename = path.basename(filePath);
    unifiedLogger.debug('Getting user ID for file', {
      service: 'fileWatcher',
      source: 'getUserIdForFile',
      filename
    });
    
    // Try to extract user identifier from filename
    // Format: bookmarks_[email]_[timestamp].html
    const match = filename.match(/bookmarks_(.+?)_\d+\.html/);
    
    if (match) {
      const email = match[1].replace(/_/g, '.');
      const result = await query('SELECT id FROM users WHERE email = $1', [email]);
      
      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    }
    
    // Fall back to default user
    return this.defaultUserId;
  }

  async processExistingFiles() {
    const startTime = Date.now();
    try {
      const files = await fs.readdir(this.watchDir);
      const bookmarkFiles = files.filter(f => this.isBookmarkFile(f));
      
      if (bookmarkFiles.length > 0) {
        unifiedLogger.info('Found existing bookmark files', {
          service: 'fileWatcher',
          source: 'processExistingFiles',
          count: bookmarkFiles.length
        });
        
        for (const file of bookmarkFiles) {
          const filePath = path.join(this.watchDir, file);
          await this.handleNewFile(filePath);
        }
      }

      unifiedLogger.info('Finished processing existing files', {
        service: 'fileWatcher',
        source: 'processExistingFiles',
        duration: Date.now() - startTime
      });
    } catch (error) {
      unifiedLogger.error('Error processing existing files', {
        service: 'fileWatcher',
        source: 'processExistingFiles',
        error: error.message,
        stack: error.stack
      });
    }
  }

  async sendNotification(userId, importResult) {
    // This could send email, push notification, or update a status dashboard
    unifiedLogger.info('Sending import notification', {
      service: 'fileWatcher',
      source: 'sendNotification',
      userId,
      importResult
    });
    
    // You could integrate with services like:
    // - SendGrid for email
    // - Firebase for push notifications
    // - WebSockets for real-time updates
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      unifiedLogger.info('File watcher stopped', {
        service: 'fileWatcher',
        source: 'stop'
      });
    }
  }
}

// Start the watcher if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const watcher = new FileWatcher();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    unifiedLogger.info('Shutting down file watcher (SIGINT)', {
      service: 'fileWatcher',
      source: 'SIGINT'
    });
    await watcher.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    unifiedLogger.info('Shutting down file watcher (SIGTERM)', {
      service: 'fileWatcher',
      source: 'SIGTERM'
    });
    await watcher.stop();
    process.exit(0);
  });
  
  // Start watching
  watcher.start().catch(error => {
    unifiedLogger.error('Failed to start file watcher', {
      service: 'fileWatcher',
      source: 'startup',
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });
}

export default FileWatcher;