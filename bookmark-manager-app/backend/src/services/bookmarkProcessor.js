import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logInfo, logError, logWarn, logDebug } from '../utils/logger.js';
import db from '../config/database.js';
import BookmarkValidator from './bookmarkValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * BookmarkProcessor - Processes validated bookmarks with LLM classification
 * Handles the complete pipeline from validation to database storage
 */
class BookmarkProcessor {
  constructor(options = {}) {
    this.options = {
      validationDir: options.validationDir || path.join(__dirname, '../../../bookmark-validation'),
      batchSize: options.batchSize || 10,
      llmProvider: options.llmProvider || 'openai', // 'openai' or 'anthropic'
      maxRetries: options.maxRetries || 3,
    };
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.validator = null;
    this.processingQueue = [];
    this.isProcessing = false;
  }

  /**
   * Initialize the processor
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logInfo('Initializing BookmarkProcessor');
      
      // Initialize validator
      this.validator = new BookmarkValidator();
      await this.validator.initialize();
      
      // Ensure directories exist
      await fs.mkdir(path.join(this.options.validationDir, 'processed'), { recursive: true });
      await fs.mkdir(path.join(this.options.validationDir, 'failed'), { recursive: true });
      
      logInfo('BookmarkProcessor initialized successfully');
    } catch (error) {
      logError(error, { context: 'BookmarkProcessor.initialize' });
      throw error;
    }
  }

  /**
   * Process a bookmark HTML file
   * @param {string} htmlPath - Path to the HTML file
   * @param {string} userId - User ID for bookmark ownership
   * @returns {Promise<Object>} Processing results
   */
  async processHtmlFile(htmlPath, userId) {
    try {
      logInfo('Processing HTML bookmark file', { path: htmlPath, userId });
      
      // Validate bookmarks
      const validationSummary = await this.validator.processBookmarksFile(htmlPath);
      
      // Process valid bookmarks
      const validDir = path.join(this.options.validationDir, 'valid');
      const validFiles = await fs.readdir(validDir);
      const validJsonFiles = validFiles.filter(f => f.endsWith('.json'));
      
      logInfo('Processing valid bookmarks', { count: validJsonFiles.length });
      
      const processedResults = [];
      
      // Process in batches
      for (let i = 0; i < validJsonFiles.length; i += this.options.batchSize) {
        const batch = validJsonFiles.slice(i, i + this.options.batchSize);
        const batchResults = await this.processBatch(batch, userId);
        processedResults.push(...batchResults);
        
        logInfo('Processed batch', { 
          batchIndex: i / this.options.batchSize,
          processed: batchResults.length 
        });
      }
      
      // Generate final report
      const report = {
        ...validationSummary,
        processedCount: processedResults.filter(r => r.success).length,
        failedCount: processedResults.filter(r => !r.success).length,
        classifications: this.summarizeClassifications(processedResults),
        timestamp: new Date().toISOString(),
      };
      
      await fs.writeFile(
        path.join(this.options.validationDir, 'processing-report.json'),
        JSON.stringify(report, null, 2)
      );
      
      return report;
      
    } catch (error) {
      logError(error, { context: 'BookmarkProcessor.processHtmlFile' });
      throw error;
    }
  }

  /**
   * Process a batch of validated bookmarks
   * @param {Array} fileNames - Array of JSON file names in valid directory
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Processing results
   */
  async processBatch(fileNames, userId) {
    const results = [];
    
    for (const fileName of fileNames) {
      try {
        const filePath = path.join(this.options.validationDir, 'valid', fileName);
        const validationData = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        
        // Classify with LLM
        const classification = await this.classifyBookmark(validationData);
        
        // Store in database
        const dbResult = await this.storeBookmark(validationData, classification, userId);
        
        // Move to processed directory
        const processedPath = path.join(this.options.validationDir, 'processed', fileName);
        await fs.rename(filePath, processedPath);
        
        results.push({
          id: validationData.id,
          url: validationData.url,
          success: true,
          classification,
          bookmarkId: dbResult.id,
        });
        
      } catch (error) {
        logError(error, { 
          context: 'BookmarkProcessor.processBatch',
          fileName 
        });
        
        results.push({
          fileName,
          success: false,
          error: error.message,
        });
      }
    }
    
    return results;
  }

  /**
   * Classify a bookmark using LLM
   * @param {Object} validationData - Validated bookmark data
   * @returns {Promise<Object>} Classification result
   */
  async classifyBookmark(validationData) {
    try {
      const { metadata, url } = validationData;
      
      const prompt = `Analyze this bookmark and provide classification:

URL: ${url}
Title: ${metadata.title || 'N/A'}
Description: ${metadata.description || 'N/A'}
Keywords: ${metadata.keywords?.join(', ') || 'N/A'}
Site Name: ${metadata.siteName || 'N/A'}
Content Type: ${metadata.contentType || 'N/A'}
Language: ${metadata.language || 'N/A'}

Provide a JSON response with:
1. category: Primary category (e.g., "Technology", "Education", "News", "Entertainment", "Business", "Reference", "Social", "Shopping", "Other")
2. subcategory: More specific subcategory
3. tags: Array of relevant tags (max 5)
4. summary: One-sentence summary of what this site is about
5. priority: "high", "medium", or "low" based on likely usefulness
6. contentQuality: Score 1-10 based on the metadata quality`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a bookmark classification assistant. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });
      
      const classification = JSON.parse(response.choices[0].message.content);
      
      logDebug('Bookmark classified', { 
        url,
        category: classification.category,
        subcategory: classification.subcategory,
      });
      
      return classification;
      
    } catch (error) {
      logError(error, { context: 'BookmarkProcessor.classifyBookmark' });
      
      // Return default classification on error
      return {
        category: 'Other',
        subcategory: 'Uncategorized',
        tags: [],
        summary: 'Unable to classify',
        priority: 'low',
        contentQuality: 5,
      };
    }
  }

  /**
   * Store bookmark in database
   * @param {Object} validationData - Validated bookmark data
   * @param {Object} classification - LLM classification
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Created bookmark
   */
  async storeBookmark(validationData, classification, userId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Insert bookmark
      const bookmarkResult = await client.query(
        `INSERT INTO bookmarks (
          user_id, url, title, description, favicon, 
          is_dead, last_checked, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          userId,
          validationData.url,
          validationData.metadata.title || validationData.originalBookmark.title,
          validationData.metadata.description || classification.summary,
          validationData.metadata.favicon,
          !validationData.valid,
          new Date(),
          validationData.originalBookmark.addDate || new Date(),
        ]
      );
      
      const bookmarkId = bookmarkResult.rows[0].id;
      
      // Insert metadata
      await client.query(
        `INSERT INTO bookmark_metadata (
          bookmark_id, category, subcategory, language,
          author, keywords, og_image, canonical_url,
          content_type, site_name, published_date,
          quality_score, validation_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          bookmarkId,
          classification.category,
          classification.subcategory,
          validationData.metadata.language,
          validationData.metadata.author,
          validationData.metadata.keywords,
          validationData.metadata.ogImage,
          validationData.metadata.canonical,
          validationData.metadata.contentType,
          validationData.metadata.siteName,
          validationData.metadata.publishedTime,
          classification.contentQuality,
          JSON.stringify(validationData),
        ]
      );
      
      // Insert tags
      for (const tagName of classification.tags) {
        // Get or create tag
        const tagResult = await client.query(
          `INSERT INTO tags (name, user_id) 
           VALUES ($1, $2) 
           ON CONFLICT (name, user_id) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [tagName.toLowerCase(), userId]
        );
        
        // Link tag to bookmark
        await client.query(
          `INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2)`,
          [bookmarkId, tagResult.rows[0].id]
        );
      }
      
      // Generate embedding if we have content
      if (validationData.metadata.description || classification.summary) {
        const text = `${validationData.metadata.title} ${validationData.metadata.description} ${classification.summary}`;
        const embedding = await this.generateEmbedding(text);
        
        await client.query(
          `INSERT INTO bookmark_embeddings (bookmark_id, embedding, model_version)
           VALUES ($1, $2, $3)`,
          [bookmarkId, `[${embedding.join(',')}]`, 'text-embedding-ada-002']
        );
      }
      
      await client.query('COMMIT');
      
      logInfo('Bookmark stored successfully', { 
        bookmarkId,
        url: validationData.url,
        category: classification.category,
      });
      
      return { id: bookmarkId };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate embedding for text
   * @param {string} text - Text to embed
   * @returns {Promise<Array>} Embedding vector
   */
  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000), // Limit text length
      });
      
      return response.data[0].embedding;
    } catch (error) {
      logError(error, { context: 'BookmarkProcessor.generateEmbedding' });
      return new Array(1536).fill(0); // Return zero vector on error
    }
  }

  /**
   * Summarize classifications from results
   * @param {Array} results - Processing results
   * @returns {Object} Classification summary
   */
  summarizeClassifications(results) {
    const summary = {
      categories: {},
      tags: {},
      priorities: { high: 0, medium: 0, low: 0 },
    };
    
    for (const result of results) {
      if (result.success && result.classification) {
        const { category, tags, priority } = result.classification;
        
        summary.categories[category] = (summary.categories[category] || 0) + 1;
        summary.priorities[priority] = (summary.priorities[priority] || 0) + 1;
        
        for (const tag of tags) {
          summary.tags[tag] = (summary.tags[tag] || 0) + 1;
        }
      }
    }
    
    return summary;
  }

  /**
   * Process pending bookmarks from directory
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async processPendingBookmarks(userId) {
    try {
      const pendingDir = path.join(this.options.validationDir, 'pending');
      const files = await fs.readdir(pendingDir);
      const pendingFiles = files.filter(f => f.endsWith('.json'));
      
      logInfo('Processing pending bookmarks', { count: pendingFiles.length });
      
      for (const file of pendingFiles) {
        const filePath = path.join(pendingDir, file);
        const bookmarkData = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        
        // Validate bookmark
        const validationResult = await this.validator.validateBookmark(bookmarkData);
        
        // Remove from pending
        await fs.unlink(filePath);
        
        logDebug('Processed pending bookmark', { 
          id: bookmarkData.id,
          valid: validationResult.valid,
        });
      }
      
    } catch (error) {
      logError(error, { context: 'BookmarkProcessor.processPendingBookmarks' });
    }
  }

  /**
   * Cleanup and close resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      if (this.validator) {
        await this.validator.close();
      }
      
      logInfo('BookmarkProcessor cleanup completed');
    } catch (error) {
      logError(error, { context: 'BookmarkProcessor.cleanup' });
    }
  }
}

export default BookmarkProcessor;