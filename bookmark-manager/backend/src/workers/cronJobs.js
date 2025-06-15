import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { DeadLinkChecker } from '../services/deadLinkChecker.js';
import { EmbeddingService } from '../services/embeddingService.js';
import { query } from '../config/database.js';

const deadLinkChecker = new DeadLinkChecker();
const embeddingService = new EmbeddingService();

export function startCronJobs() {
  // Check for dead links every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    logger.info('Starting dead link check job');
    try {
      await deadLinkChecker.checkAllBookmarks();
      logger.info('Dead link check completed');
    } catch (error) {
      logger.error('Dead link check failed:', error);
    }
  });

  // Generate missing embeddings every hour
  cron.schedule('0 * * * *', async () => {
    logger.info('Starting embedding generation job');
    try {
      // Get users with bookmarks missing embeddings
      const result = await query(
        `SELECT DISTINCT user_id 
         FROM bookmarks 
         WHERE embedding IS NULL 
         LIMIT 10`
      );

      for (const row of result.rows) {
        await embeddingService.batchUpdateEmbeddings(row.user_id);
      }
      
      logger.info('Embedding generation completed');
    } catch (error) {
      logger.error('Embedding generation failed:', error);
    }
  });

  // Clean up old import history every day at midnight
  cron.schedule('0 0 * * *', async () => {
    logger.info('Starting cleanup job');
    try {
      // Delete import history older than 30 days
      await query(
        `DELETE FROM import_history 
         WHERE started_at < CURRENT_TIMESTAMP - INTERVAL '30 days'`
      );
      
      // Clean up orphaned tags
      await query(
        `DELETE FROM tags t
         WHERE NOT EXISTS (
           SELECT 1 FROM bookmark_tags bt 
           WHERE bt.tag_id = t.id
         )`
      );
      
      logger.info('Cleanup completed');
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  });

  logger.info('Cron jobs initialized');
}