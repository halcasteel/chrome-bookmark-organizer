import { A2AAgent } from './baseAgent.js';
import db from '../db/index.js';
import unifiedLogger from '../services/unifiedLogger.js';

/**
 * A2A Categorization Agent
 * 
 * Analyzes enriched bookmarks and organizes them into user-defined
 * or auto-generated categories based on content and metadata.
 * 
 * Follows Google-standard A2A patterns:
 * - Immutable artifacts between agents
 * - Real database operations
 * - Progress reporting via reportProgress()
 * - No mocks, only real services
 */
export class CategorizationAgent extends A2AAgent {
  constructor() {
    super({
      agentType: 'categorization',
      version: '1.0.0',
      capabilities: {
        description: 'Categorizes bookmarks based on enrichment data and user preferences',
        inputs: {
          bookmarkIds: { type: 'array', required: true, description: 'Array of bookmark IDs to categorize' },
          userId: { type: 'string', required: true, description: 'User ID for authorization' },
          enrichmentResults: { type: 'array', required: false, description: 'Enrichment results from EnrichmentAgent' },
          categoryMapping: { type: 'object', required: false, description: 'User-defined category rules' }
        },
        outputs: {
          type: 'bookmark_categorization_result',
          categorizedCount: { type: 'number', description: 'Number of bookmarks successfully categorized' },
          failedCount: { type: 'number', description: 'Number of bookmarks that failed categorization' },
          categorizationResults: { type: 'array', items: 'object', description: 'Detailed categorization results per bookmark' },
          categoryDistribution: { type: 'object', description: 'Distribution of bookmarks across categories' }
        }
      }
    });
    
    this.batchSize = 10; // Process 10 bookmarks at a time
    this.defaultCategories = [
      'Development', 'AI/ML', 'Technology', 'Business', 'Education',
      'News', 'Entertainment', 'Reference', 'Tools', 'Personal', 'Other'
    ];
  }

  /**
   * Process categorization task
   * @param {Object} task - A2A task to process
   * @returns {Object} - Task result with categorization artifacts
   */
  async processTask(task) {
    unifiedLogger.info('Processing categorization task', {
      service: this.agentType,
      method: 'processTask',
      taskId: task.id,
      bookmarkCount: task.context.bookmarkIds?.length || 0
    });
    
    try {
      // Execute categorization action
      const result = await this.executeAction(task);
      
      // Create categorization artifact
      const artifact = {
        type: 'bookmark_categorization_result',
        data: result
      };
      
      // Complete task with artifact
      return {
        status: 'completed',
        artifacts: [artifact]
      };
      
    } catch (error) {
      unifiedLogger.error('Categorization task failed', {
        service: this.agentType,
        method: 'processTask',
        taskId: task.id,
        error: error.message,
        stack: error.stack
      });
      
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Execute categorization action
   * @param {Object} task - Task context with bookmarkIds and userId
   * @returns {Object} - Categorization results
   */
  async executeAction(task) {
    const { bookmarkIds, userId, enrichmentResults, categoryMapping } = task.context;
    
    if (!bookmarkIds || bookmarkIds.length === 0) {
      return {
        categorizedCount: 0,
        failedCount: 0,
        categorizationResults: [],
        categoryDistribution: {}
      };
    }
    
    // Initial progress
    await this.reportProgress(task.id, 5, 'Starting bookmark categorization');
    
    // Fetch bookmarks with enrichment data
    const bookmarks = await this.fetchEnrichedBookmarks(bookmarkIds, userId);
    
    if (bookmarks.length === 0) {
      unifiedLogger.warn('No enriched bookmarks found for categorization', {
        service: this.agentType,
        method: 'executeAction',
        bookmarkIds,
        userId
      });
      return {
        categorizedCount: 0,
        failedCount: 0,
        categorizationResults: [],
        categoryDistribution: {}
      };
    }
    
    await this.reportProgress(task.id, 10, `Found ${bookmarks.length} bookmarks to categorize`);
    
    // Load or create user's category structure
    const userCategories = await this.loadUserCategories(userId);
    
    // Categorize bookmarks in batches
    const results = await this.categorizeBookmarksInBatches(bookmarks, userCategories, categoryMapping, task);
    
    // Calculate distribution
    const categoryDistribution = this.calculateCategoryDistribution(results);
    
    // Calculate summary
    const categorizedCount = results.filter(r => r.categorized).length;
    const failedCount = results.filter(r => !r.categorized).length;
    
    unifiedLogger.info('Categorization completed', {
      service: this.agentType,
      method: 'executeAction',
      taskId: task.id,
      categorizedCount,
      failedCount,
      total: results.length,
      categoryCount: Object.keys(categoryDistribution).length
    });
    
    await this.reportProgress(task.id, 100, 'Categorization complete');
    
    return {
      categorizedCount,
      failedCount,
      categorizationResults: results,
      categoryDistribution
    };
  }

  /**
   * Fetch bookmarks with enrichment data
   * @param {Array} bookmarkIds - Bookmark IDs to fetch
   * @param {string} userId - User ID for authorization
   * @returns {Array} - Bookmarks with enrichment data
   */
  async fetchEnrichedBookmarks(bookmarkIds, userId) {
    try {
      const result = await db.query(
        `SELECT id, url, title, description, 
                ai_tags, ai_summary, enrichment_data,
                category_id, folder_id
         FROM bookmarks 
         WHERE id = ANY($1) AND user_id = $2 AND is_deleted = false
         ORDER BY created_at`,
        [bookmarkIds, userId]
      );
      
      return result.rows;
    } catch (error) {
      unifiedLogger.error('Failed to fetch enriched bookmarks', {
        service: this.agentType,
        method: 'fetchEnrichedBookmarks',
        bookmarkIds,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Load user's existing categories
   * @param {string} userId - User ID
   * @returns {Array} - User's categories
   */
  async loadUserCategories(userId) {
    try {
      const result = await db.query(
        `SELECT id, name, description, parent_id, color, icon
         FROM categories 
         WHERE user_id = $1 AND is_deleted = false
         ORDER BY name`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        // Create default categories for user
        return await this.createDefaultCategories(userId);
      }
      
      return result.rows;
    } catch (error) {
      unifiedLogger.error('Failed to load user categories', {
        service: this.agentType,
        method: 'loadUserCategories',
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create default categories for a user
   * @param {string} userId - User ID
   * @returns {Array} - Created categories
   */
  async createDefaultCategories(userId) {
    const categories = [];
    
    for (const categoryName of this.defaultCategories) {
      try {
        const result = await db.query(
          `INSERT INTO categories (user_id, name, description, color)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, description, color`,
          [
            userId,
            categoryName,
            `Default category for ${categoryName.toLowerCase()} bookmarks`,
            this.getCategoryColor(categoryName)
          ]
        );
        categories.push(result.rows[0]);
      } catch (error) {
        unifiedLogger.warn('Failed to create default category', {
          service: this.agentType,
          method: 'createDefaultCategories',
          categoryName,
          error: error.message
        });
      }
    }
    
    return categories;
  }

  /**
   * Get color for category
   * @param {string} categoryName - Category name
   * @returns {string} - Hex color code
   */
  getCategoryColor(categoryName) {
    const colorMap = {
      'Development': '#4285f4',  // Blue
      'AI/ML': '#9333ea',        // Purple
      'Technology': '#3b82f6',   // Light Blue
      'Business': '#10b981',     // Green
      'Education': '#f59e0b',    // Amber
      'News': '#ef4444',         // Red
      'Entertainment': '#ec4899', // Pink
      'Reference': '#6366f1',    // Indigo
      'Tools': '#14b8a6',        // Teal
      'Personal': '#f97316',     // Orange
      'Other': '#6b7280'         // Gray
    };
    return colorMap[categoryName] || '#6b7280';
  }

  /**
   * Categorize bookmarks in batches with progress reporting
   * @param {Array} bookmarks - Bookmarks to categorize
   * @param {Array} userCategories - User's available categories
   * @param {Object} categoryMapping - Custom category rules
   * @param {Object} task - A2A task for progress reporting
   * @returns {Array} - Categorization results
   */
  async categorizeBookmarksInBatches(bookmarks, userCategories, categoryMapping, task) {
    const results = [];
    let processed = 0;
    
    // Process in batches
    for (let i = 0; i < bookmarks.length; i += this.batchSize) {
      const batch = bookmarks.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(bookmarks.length / this.batchSize);
      
      unifiedLogger.debug('Processing categorization batch', {
        service: this.agentType,
        method: 'categorizeBookmarksInBatches',
        batchNum,
        totalBatches,
        batchSize: batch.length
      });
      
      // Categorize batch
      const batchResults = await Promise.all(
        batch.map(bookmark => this.categorizeBookmark(bookmark, userCategories, categoryMapping))
      );
      
      // Update database with results
      for (let j = 0; j < batch.length; j++) {
        const bookmark = batch[j];
        const categorization = batchResults[j];
        
        if (categorization.success) {
          await this.updateBookmarkCategory(bookmark.id, categorization.categoryId, categorization.confidence);
        }
        
        results.push({
          bookmarkId: bookmark.id,
          url: bookmark.url,
          categorized: categorization.success,
          categoryId: categorization.categoryId,
          categoryName: categorization.categoryName,
          confidence: categorization.confidence,
          reason: categorization.reason,
          error: categorization.error || null
        });
        
        processed++;
      }
      
      // Report progress
      const progress = 10 + Math.round((processed / bookmarks.length) * 85); // 10-95%
      await this.reportProgress(
        task.id,
        progress,
        `Categorized batch ${batchNum}/${totalBatches} (${processed}/${bookmarks.length} bookmarks)`
      );
    }
    
    // Final progress
    await this.reportProgress(task.id, 95, 'Categorization complete, preparing results');
    
    return results;
  }

  /**
   * Categorize a single bookmark
   * @param {Object} bookmark - Bookmark to categorize
   * @param {Array} userCategories - Available categories
   * @param {Object} categoryMapping - Custom rules
   * @returns {Object} - Categorization result
   */
  async categorizeBookmark(bookmark, userCategories, categoryMapping) {
    try {
      // Extract enrichment data
      const enrichmentData = bookmark.enrichment_data || {};
      const aiCategory = enrichmentData.category;
      const aiTags = bookmark.ai_tags || [];
      const url = bookmark.url.toLowerCase();
      const title = (bookmark.title || '').toLowerCase();
      
      // Check custom mapping rules first
      if (categoryMapping) {
        const customCategory = this.applyCustomRules(bookmark, categoryMapping, userCategories);
        if (customCategory) {
          return customCategory;
        }
      }
      
      // Find matching category from user's categories
      let bestMatch = null;
      let highestConfidence = 0;
      
      for (const category of userCategories) {
        const confidence = this.calculateCategoryConfidence(
          category,
          aiCategory,
          aiTags,
          url,
          title,
          enrichmentData
        );
        
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          bestMatch = category;
        }
      }
      
      // If no good match, use AI-suggested category or create new one
      if (highestConfidence < 0.5 && aiCategory) {
        const newCategory = await this.findOrCreateCategory(aiCategory, bookmark.user_id, userCategories);
        if (newCategory) {
          bestMatch = newCategory;
          highestConfidence = 0.7; // Default confidence for AI suggestions
        }
      }
      
      // Default to 'Other' category if no match
      if (!bestMatch) {
        bestMatch = userCategories.find(c => c.name === 'Other') || userCategories[0];
        highestConfidence = 0.3;
      }
      
      unifiedLogger.debug('Bookmark categorized', {
        service: this.agentType,
        method: 'categorizeBookmark',
        bookmarkId: bookmark.id,
        categoryName: bestMatch.name,
        confidence: highestConfidence
      });
      
      return {
        success: true,
        categoryId: bestMatch.id,
        categoryName: bestMatch.name,
        confidence: highestConfidence,
        reason: `Matched based on ${highestConfidence > 0.7 ? 'strong' : 'moderate'} similarity`
      };
      
    } catch (error) {
      unifiedLogger.warn('Bookmark categorization failed', {
        service: this.agentType,
        method: 'categorizeBookmark',
        bookmarkId: bookmark.id,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Apply custom categorization rules
   * @param {Object} bookmark - Bookmark to check
   * @param {Object} rules - Custom rules
   * @param {Array} categories - Available categories
   * @returns {Object|null} - Category match or null
   */
  applyCustomRules(bookmark, rules, categories) {
    // Check URL patterns
    if (rules.urlPatterns) {
      for (const [pattern, categoryName] of Object.entries(rules.urlPatterns)) {
        if (new RegExp(pattern, 'i').test(bookmark.url)) {
          const category = categories.find(c => c.name === categoryName);
          if (category) {
            return {
              success: true,
              categoryId: category.id,
              categoryName: category.name,
              confidence: 0.9,
              reason: 'Matched custom URL pattern'
            };
          }
        }
      }
    }
    
    // Check tag patterns
    if (rules.tagPatterns && bookmark.ai_tags) {
      for (const [tag, categoryName] of Object.entries(rules.tagPatterns)) {
        if (bookmark.ai_tags.includes(tag)) {
          const category = categories.find(c => c.name === categoryName);
          if (category) {
            return {
              success: true,
              categoryId: category.id,
              categoryName: category.name,
              confidence: 0.85,
              reason: 'Matched custom tag pattern'
            };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Calculate confidence score for category match
   * @param {Object} category - Category to evaluate
   * @param {string} aiCategory - AI-suggested category
   * @param {Array} aiTags - AI-generated tags
   * @param {string} url - Bookmark URL
   * @param {string} title - Bookmark title
   * @param {Object} enrichmentData - Additional enrichment data
   * @returns {number} - Confidence score (0-1)
   */
  calculateCategoryConfidence(category, aiCategory, aiTags, url, title, enrichmentData) {
    let confidence = 0;
    const categoryName = category.name.toLowerCase();
    
    // Direct AI category match
    if (aiCategory && aiCategory.toLowerCase() === categoryName) {
      confidence += 0.5;
    }
    
    // Partial AI category match
    if (aiCategory && (
      aiCategory.toLowerCase().includes(categoryName) ||
      categoryName.includes(aiCategory.toLowerCase())
    )) {
      confidence += 0.3;
    }
    
    // Tag matches
    const categoryKeywords = this.getCategoryKeywords(category.name);
    const tagMatches = aiTags.filter(tag => 
      categoryKeywords.some(keyword => 
        tag.toLowerCase().includes(keyword) ||
        keyword.includes(tag.toLowerCase())
      )
    );
    confidence += Math.min(tagMatches.length * 0.1, 0.3);
    
    // URL pattern matches
    if (this.urlMatchesCategory(url, category.name)) {
      confidence += 0.2;
    }
    
    // Title matches
    if (categoryKeywords.some(keyword => title.includes(keyword))) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * Get keywords associated with a category
   * @param {string} categoryName - Category name
   * @returns {Array} - Keywords
   */
  getCategoryKeywords(categoryName) {
    const keywordMap = {
      'Development': ['code', 'programming', 'developer', 'software', 'api', 'framework', 'library', 'github'],
      'AI/ML': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'neural', 'deep learning', 'llm', 'gpt'],
      'Technology': ['tech', 'technology', 'gadget', 'hardware', 'software', 'digital', 'computer'],
      'Business': ['business', 'startup', 'entrepreneur', 'finance', 'market', 'economy', 'company'],
      'Education': ['learn', 'education', 'course', 'tutorial', 'university', 'school', 'training'],
      'News': ['news', 'article', 'report', 'journalism', 'media', 'breaking', 'latest'],
      'Entertainment': ['entertainment', 'movie', 'music', 'game', 'video', 'fun', 'play'],
      'Reference': ['reference', 'documentation', 'guide', 'manual', 'wiki', 'dictionary', 'encyclopedia'],
      'Tools': ['tool', 'utility', 'app', 'application', 'service', 'platform', 'software'],
      'Personal': ['personal', 'blog', 'portfolio', 'resume', 'about', 'profile'],
      'Other': []
    };
    
    return keywordMap[categoryName] || [];
  }

  /**
   * Check if URL matches category patterns
   * @param {string} url - URL to check
   * @param {string} categoryName - Category name
   * @returns {boolean} - True if matches
   */
  urlMatchesCategory(url, categoryName) {
    const urlPatterns = {
      'Development': /github|gitlab|stackoverflow|npm|pypi|developer|docs|api/i,
      'AI/ML': /openai|huggingface|kaggle|tensorflow|pytorch/i,
      'Technology': /techcrunch|wired|verge|ars|engadget/i,
      'Business': /bloomberg|forbes|wsj|economist|businessinsider/i,
      'Education': /coursera|udemy|edx|khan|university|\.edu/i,
      'News': /news|cnn|bbc|reuters|guardian|times/i,
      'Entertainment': /youtube|netflix|spotify|twitch|imdb/i,
      'Reference': /wikipedia|dictionary|docs|manual|reference/i,
      'Tools': /tool|app|utility|service|platform/i,
      'Personal': /blog|portfolio|about|profile/i
    };
    
    const pattern = urlPatterns[categoryName];
    return pattern ? pattern.test(url) : false;
  }

  /**
   * Find or create category based on AI suggestion
   * @param {string} aiCategory - AI-suggested category
   * @param {string} userId - User ID
   * @param {Array} existingCategories - Existing categories
   * @returns {Object|null} - Category or null
   */
  async findOrCreateCategory(aiCategory, userId, existingCategories) {
    // Check if similar category exists
    const similar = existingCategories.find(c => 
      c.name.toLowerCase() === aiCategory.toLowerCase() ||
      c.name.toLowerCase().includes(aiCategory.toLowerCase()) ||
      aiCategory.toLowerCase().includes(c.name.toLowerCase())
    );
    
    if (similar) {
      return similar;
    }
    
    // Only create if it's one of our known categories
    if (this.defaultCategories.includes(aiCategory)) {
      try {
        const result = await db.query(
          `INSERT INTO categories (user_id, name, description, color)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, description, color`,
          [
            userId,
            aiCategory,
            `Auto-created category for ${aiCategory.toLowerCase()} bookmarks`,
            this.getCategoryColor(aiCategory)
          ]
        );
        return result.rows[0];
      } catch (error) {
        unifiedLogger.warn('Failed to create category', {
          service: this.agentType,
          method: 'findOrCreateCategory',
          category: aiCategory,
          error: error.message
        });
      }
    }
    
    return null;
  }

  /**
   * Update bookmark with category assignment
   * @param {string} bookmarkId - Bookmark ID
   * @param {string} categoryId - Category ID
   * @param {number} confidence - Confidence score
   */
  async updateBookmarkCategory(bookmarkId, categoryId, confidence) {
    try {
      await db.query(
        `UPDATE bookmarks 
         SET category_id = $2,
             enrichment_data = enrichment_data || $3::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          bookmarkId,
          categoryId,
          JSON.stringify({
            categorizationConfidence: confidence,
            categorizedAt: new Date().toISOString()
          })
        ]
      );
    } catch (error) {
      unifiedLogger.error('Failed to update bookmark category', {
        service: this.agentType,
        method: 'updateBookmarkCategory',
        bookmarkId,
        categoryId,
        error: error.message
      });
      // Don't throw - continue with other bookmarks
    }
  }

  /**
   * Calculate distribution of bookmarks across categories
   * @param {Array} results - Categorization results
   * @returns {Object} - Category distribution
   */
  calculateCategoryDistribution(results) {
    const distribution = {};
    
    results.forEach(result => {
      if (result.categorized && result.categoryName) {
        distribution[result.categoryName] = (distribution[result.categoryName] || 0) + 1;
      }
    });
    
    return distribution;
  }
}

// Export singleton instance
export default new CategorizationAgent();