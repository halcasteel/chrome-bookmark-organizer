import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';
import bookmarkImporter from './bookmarkImporter.js';
import { query } from '../db/index.js';
import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'file-watcher.log' })
  ]
});

class FileWatcher {
  constructor() {
    this.watchDir = process.env.BOOKMARK_IMPORT_DIR || './imports';
    this.watcher = null;
    this.processing = new Set();
    this.defaultUserId = process.env.DEFAULT_USER_ID; // For automated imports
  }

  async start() {
    // Ensure watch directory exists
    await fs.mkdir(this.watchDir, { recursive: true });
    await fs.mkdir(path.join(this.watchDir, 'archive'), { recursive: true });
    await fs.mkdir(path.join(this.watchDir, 'failed'), { recursive: true });

    logger.info(`Starting file watcher on directory: ${this.watchDir}`);

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
      .on('change', (filePath) => logger.info(`File changed: ${filePath}`))
      .on('unlink', (filePath) => logger.info(`File removed: ${filePath}`))
      .on('error', (error) => logger.error('Watcher error:', error))
      .on('ready', () => {
        logger.info('File watcher ready and monitoring for changes');
        this.processExistingFiles();
      });
  }

  async handleNewFile(filePath) {
    const filename = path.basename(filePath);
    
    // Check if it's a bookmark file
    if (!this.isBookmarkFile(filename)) {
      return;
    }

    // Skip if already processing
    if (this.processing.has(filePath)) {
      return;
    }

    logger.info(`New bookmark file detected: ${filename}`);
    this.processing.add(filePath);

    try {
      // Determine user ID
      const userId = await this.getUserIdForFile(filePath);
      
      if (!userId) {
        throw new Error('No user ID available for import');
      }

      // Import bookmarks
      const result = await bookmarkImporter.importFromFile(userId, filePath);
      
      logger.info(`Import completed: ${JSON.stringify(result)}`);
      
      // Send notification if configured
      await this.sendNotification(userId, result);
      
    } catch (error) {
      logger.error(`Error processing file ${filename}:`, error);
      
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
    try {
      const files = await fs.readdir(this.watchDir);
      const bookmarkFiles = files.filter(f => this.isBookmarkFile(f));
      
      if (bookmarkFiles.length > 0) {
        logger.info(`Found ${bookmarkFiles.length} existing bookmark files to process`);
        
        for (const file of bookmarkFiles) {
          const filePath = path.join(this.watchDir, file);
          await this.handleNewFile(filePath);
        }
      }
    } catch (error) {
      logger.error('Error processing existing files:', error);
    }
  }

  async sendNotification(userId, importResult) {
    // This could send email, push notification, or update a status dashboard
    logger.info(`Import notification for user ${userId}: ${JSON.stringify(importResult)}`);
    
    // You could integrate with services like:
    // - SendGrid for email
    // - Firebase for push notifications
    // - WebSockets for real-time updates
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      logger.info('File watcher stopped');
    }
  }
}

// Start the watcher if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const watcher = new FileWatcher();
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down file watcher...');
    await watcher.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Shutting down file watcher...');
    await watcher.stop();
    process.exit(0);
  });
  
  // Start watching
  watcher.start().catch(error => {
    logger.error('Failed to start file watcher:', error);
    process.exit(1);
  });
}

export default FileWatcher;