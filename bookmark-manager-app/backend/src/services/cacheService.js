import redis from '../config/redis.js';
import unifiedLogger from './unifiedLogger.js';

/**
 * Cache Service
 * 
 * Provides caching capabilities for various data types
 * with TTL support and cache invalidation
 */
class CacheService {
  constructor() {
    this.defaultTTL = 3600; // 1 hour
    this.keyPrefixes = {
      enrichment: 'enrich:',
      validation: 'valid:',
      category: 'cat:',
      user: 'user:',
      bookmark: 'bm:'
    };
  }

  /**
   * Get cached enrichment data
   * @param {string} urlHash - MD5 hash of URL
   * @returns {Object|null} - Cached enrichment data
   */
  async getEnrichment(urlHash) {
    const key = `${this.keyPrefixes.enrichment}${urlHash}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        unifiedLogger.debug('Cache hit for enrichment', {
          service: 'cacheService',
          method: 'getEnrichment',
          urlHash
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      unifiedLogger.error('Failed to get cached enrichment', {
        service: 'cacheService',
        method: 'getEnrichment',
        urlHash,
        error: error.message
      });
    }
    
    return null;
  }

  /**
   * Set enrichment cache
   * @param {string} urlHash - MD5 hash of URL
   * @param {Object} data - Enrichment data
   * @param {number} ttl - TTL in seconds
   */
  async setEnrichment(urlHash, data, ttl = this.defaultTTL) {
    const key = `${this.keyPrefixes.enrichment}${urlHash}`;
    
    try {
      await redis.setex(key, ttl, JSON.stringify(data));
      
      unifiedLogger.debug('Cached enrichment data', {
        service: 'cacheService',
        method: 'setEnrichment',
        urlHash,
        ttl
      });
    } catch (error) {
      unifiedLogger.error('Failed to cache enrichment', {
        service: 'cacheService',
        method: 'setEnrichment',
        urlHash,
        error: error.message
      });
    }
  }

  /**
   * Get cached validation result
   * @param {string} url - URL to check
   * @returns {Object|null} - Cached validation result
   */
  async getValidation(url) {
    const key = `${this.keyPrefixes.validation}${this.hashUrl(url)}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        unifiedLogger.debug('Cache hit for validation', {
          service: 'cacheService',
          method: 'getValidation',
          url
        });
        return JSON.parse(cached);
      }
    } catch (error) {
      unifiedLogger.error('Failed to get cached validation', {
        service: 'cacheService',
        method: 'getValidation',
        url,
        error: error.message
      });
    }
    
    return null;
  }

  /**
   * Set validation cache
   * @param {string} url - URL validated
   * @param {Object} result - Validation result
   * @param {number} ttl - TTL in seconds
   */
  async setValidation(url, result, ttl = 86400) { // 24 hours default
    const key = `${this.keyPrefixes.validation}${this.hashUrl(url)}`;
    
    try {
      await redis.setex(key, ttl, JSON.stringify(result));
      
      unifiedLogger.debug('Cached validation result', {
        service: 'cacheService',
        method: 'setValidation',
        url,
        ttl
      });
    } catch (error) {
      unifiedLogger.error('Failed to cache validation', {
        service: 'cacheService',
        method: 'setValidation',
        url,
        error: error.message
      });
    }
  }

  /**
   * Get user's category mapping cache
   * @param {string} userId - User ID
   * @returns {Array|null} - Cached categories
   */
  async getUserCategories(userId) {
    const key = `${this.keyPrefixes.category}${userId}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      unifiedLogger.error('Failed to get cached categories', {
        service: 'cacheService',
        method: 'getUserCategories',
        userId,
        error: error.message
      });
    }
    
    return null;
  }

  /**
   * Set user's category cache
   * @param {string} userId - User ID
   * @param {Array} categories - User's categories
   * @param {number} ttl - TTL in seconds
   */
  async setUserCategories(userId, categories, ttl = 3600) {
    const key = `${this.keyPrefixes.category}${userId}`;
    
    try {
      await redis.setex(key, ttl, JSON.stringify(categories));
    } catch (error) {
      unifiedLogger.error('Failed to cache categories', {
        service: 'cacheService',
        method: 'setUserCategories',
        userId,
        error: error.message
      });
    }
  }

  /**
   * Invalidate user's category cache
   * @param {string} userId - User ID
   */
  async invalidateUserCategories(userId) {
    const key = `${this.keyPrefixes.category}${userId}`;
    
    try {
      await redis.del(key);
      
      unifiedLogger.debug('Invalidated category cache', {
        service: 'cacheService',
        method: 'invalidateUserCategories',
        userId
      });
    } catch (error) {
      unifiedLogger.error('Failed to invalidate category cache', {
        service: 'cacheService',
        method: 'invalidateUserCategories',
        userId,
        error: error.message
      });
    }
  }

  /**
   * Get cached bookmark data
   * @param {string} bookmarkId - Bookmark ID
   * @returns {Object|null} - Cached bookmark
   */
  async getBookmark(bookmarkId) {
    const key = `${this.keyPrefixes.bookmark}${bookmarkId}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      unifiedLogger.error('Failed to get cached bookmark', {
        service: 'cacheService',
        method: 'getBookmark',
        bookmarkId,
        error: error.message
      });
    }
    
    return null;
  }

  /**
   * Set bookmark cache
   * @param {string} bookmarkId - Bookmark ID
   * @param {Object} data - Bookmark data
   * @param {number} ttl - TTL in seconds
   */
  async setBookmark(bookmarkId, data, ttl = 300) { // 5 minutes
    const key = `${this.keyPrefixes.bookmark}${bookmarkId}`;
    
    try {
      await redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      unifiedLogger.error('Failed to cache bookmark', {
        service: 'cacheService',
        method: 'setBookmark',
        bookmarkId,
        error: error.message
      });
    }
  }

  /**
   * Invalidate bookmark cache
   * @param {string} bookmarkId - Bookmark ID
   */
  async invalidateBookmark(bookmarkId) {
    const key = `${this.keyPrefixes.bookmark}${bookmarkId}`;
    
    try {
      await redis.del(key);
    } catch (error) {
      unifiedLogger.error('Failed to invalidate bookmark cache', {
        service: 'cacheService',
        method: 'invalidateBookmark',
        bookmarkId,
        error: error.message
      });
    }
  }

  /**
   * Clear all caches for a user
   * @param {string} userId - User ID
   */
  async clearUserCaches(userId) {
    try {
      // Clear categories
      await this.invalidateUserCategories(userId);
      
      // Clear user-specific keys (would need to track these)
      // For now, just log the operation
      unifiedLogger.info('Cleared user caches', {
        service: 'cacheService',
        method: 'clearUserCaches',
        userId
      });
    } catch (error) {
      unifiedLogger.error('Failed to clear user caches', {
        service: 'cacheService',
        method: 'clearUserCaches',
        userId,
        error: error.message
      });
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    try {
      const info = await redis.info('memory');
      const dbSize = await redis.dbsize();
      
      return {
        keyCount: dbSize,
        memoryInfo: info
      };
    } catch (error) {
      unifiedLogger.error('Failed to get cache stats', {
        service: 'cacheService',
        method: 'getStats',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Hash URL for cache key
   * @param {string} url - URL to hash
   * @returns {string} - MD5 hash
   */
  hashUrl(url) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex');
  }
}

// Export singleton instance
export default new CacheService();