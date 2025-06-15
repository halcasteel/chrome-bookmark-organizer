import axios from 'axios';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class DeadLinkChecker {
  constructor() {
    this.timeout = 10000; // 10 seconds
    this.userAgent = 'Mozilla/5.0 (compatible; BookmarkManager/1.0)';
  }

  // Check if a URL is dead
  async checkUrl(url) {
    try {
      const response = await axios.head(url, {
        timeout: this.timeout,
        maxRedirects: 5,
        headers: {
          'User-Agent': this.userAgent
        },
        validateStatus: (status) => status < 500
      });

      return {
        isAlive: response.status >= 200 && response.status < 400,
        statusCode: response.status,
        error: null
      };
    } catch (error) {
      // Try GET request if HEAD fails
      if (error.code === 'ECONNABORTED' || error.response?.status === 405) {
        try {
          const response = await axios.get(url, {
            timeout: this.timeout,
            maxRedirects: 5,
            headers: {
              'User-Agent': this.userAgent
            },
            validateStatus: (status) => status < 500,
            maxContentLength: 1024 * 1024 // 1MB limit
          });

          return {
            isAlive: response.status >= 200 && response.status < 400,
            statusCode: response.status,
            error: null
          };
        } catch (getError) {
          return this.handleError(getError);
        }
      }

      return this.handleError(error);
    }
  }

  handleError(error) {
    if (error.response) {
      return {
        isAlive: false,
        statusCode: error.response.status,
        error: `HTTP ${error.response.status}`
      };
    } else if (error.code === 'ENOTFOUND') {
      return {
        isAlive: false,
        statusCode: null,
        error: 'Domain not found'
      };
    } else if (error.code === 'ECONNREFUSED') {
      return {
        isAlive: false,
        statusCode: null,
        error: 'Connection refused'
      };
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return {
        isAlive: false,
        statusCode: null,
        error: 'Request timeout'
      };
    } else {
      return {
        isAlive: false,
        statusCode: null,
        error: error.message || 'Unknown error'
      };
    }
  }

  // Check all bookmarks for dead links
  async checkAllBookmarks(batchSize = 50) {
    try {
      let offset = 0;
      let totalChecked = 0;
      let deadCount = 0;

      while (true) {
        // Get batch of bookmarks that haven't been checked recently
        const result = await query(
          `SELECT id, url 
           FROM bookmarks 
           WHERE last_checked IS NULL 
              OR last_checked < CURRENT_TIMESTAMP - INTERVAL '7 days'
           ORDER BY last_checked ASC NULLS FIRST
           LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );

        if (result.rows.length === 0) {
          break;
        }

        // Check each bookmark
        const promises = result.rows.map(async (bookmark) => {
          const checkResult = await this.checkUrl(bookmark.url);
          
          await query(
            `UPDATE bookmarks 
             SET is_dead = $1, last_checked = CURRENT_TIMESTAMP 
             WHERE id = $2`,
            [!checkResult.isAlive, bookmark.id]
          );

          if (!checkResult.isAlive) {
            deadCount++;
            logger.warn(`Dead link detected: ${bookmark.url}`, checkResult);
          }

          return checkResult;
        });

        await Promise.all(promises);
        
        totalChecked += result.rows.length;
        offset += batchSize;

        // Add delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info(`Dead link check completed: ${totalChecked} checked, ${deadCount} dead`);
      
      return {
        totalChecked,
        deadCount
      };
    } catch (error) {
      logger.error('Error checking bookmarks:', error);
      throw error;
    }
  }

  // Check specific user's bookmarks
  async checkUserBookmarks(userId) {
    try {
      const result = await query(
        `SELECT id, url FROM bookmarks WHERE user_id = $1`,
        [userId]
      );

      let deadCount = 0;
      
      for (const bookmark of result.rows) {
        const checkResult = await this.checkUrl(bookmark.url);
        
        await query(
          `UPDATE bookmarks 
           SET is_dead = $1, last_checked = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [!checkResult.isAlive, bookmark.id]
        );

        if (!checkResult.isAlive) {
          deadCount++;
        }

        // Add small delay between checks
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return {
        totalChecked: result.rows.length,
        deadCount
      };
    } catch (error) {
      logger.error(`Error checking user ${userId} bookmarks:`, error);
      throw error;
    }
  }
}