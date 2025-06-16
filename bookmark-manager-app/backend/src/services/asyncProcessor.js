import unifiedLogger from './unifiedLogger.js';
import db from '../config/database.js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class AsyncProcessor {
  constructor() {
    this.validationQueue = [];
    this.enrichmentQueue = [];
    this.isProcessing = false;
    unifiedLogger.info('AsyncProcessor initialized', {
      service: 'asyncProcessor',
      source: 'constructor'
    });
  }

  /**
   * Add bookmark for validation
   */
  queueValidation(bookmarkId, userId) {
    unifiedLogger.debug('Queuing bookmark for validation', {
      service: 'asyncProcessor',
      source: 'queueValidation',
      bookmarkId,
      userId,
      queueLength: this.validationQueue.length + 1
    });
    this.validationQueue.push({ bookmarkId, userId });
    this.startProcessing();
  }

  /**
   * Add bookmark for enrichment
   */
  queueEnrichment(bookmarkId, userId, url, title) {
    unifiedLogger.debug('Queuing bookmark for enrichment', {
      service: 'asyncProcessor',
      source: 'queueEnrichment',
      bookmarkId,
      userId,
      url,
      queueLength: this.enrichmentQueue.length + 1
    });
    this.enrichmentQueue.push({ bookmarkId, userId, url, title });
  }

  /**
   * Start processing queues
   */
  startProcessing() {
    if (this.isProcessing) {
      unifiedLogger.debug('Processing already in progress', {
        service: 'asyncProcessor',
        source: 'startProcessing'
      });
      return;
    }
    
    unifiedLogger.info('Starting queue processing', {
      service: 'asyncProcessor',
      source: 'startProcessing',
      validationQueueSize: this.validationQueue.length,
      enrichmentQueueSize: this.enrichmentQueue.length
    });
    
    this.isProcessing = true;
    
    // Process validation queue
    setTimeout(() => this.processValidationQueue(), 1000);
    
    // Process enrichment queue
    setTimeout(() => this.processEnrichmentQueue(), 2000);
  }

  /**
   * Process validation queue
   */
  async processValidationQueue() {
    const startTime = Date.now();
    unifiedLogger.info('Processing validation queue', {
      service: 'asyncProcessor',
      source: 'processValidationQueue',
      queueSize: this.validationQueue.length
    });

    while (this.validationQueue.length > 0) {
      const batch = this.validationQueue.splice(0, 10); // Process 10 at a time
      
      unifiedLogger.debug('Processing validation batch', {
        service: 'asyncProcessor',
        source: 'processValidationQueue',
        batchSize: batch.length,
        remainingQueue: this.validationQueue.length
      });
      
      await Promise.all(batch.map(item => 
        this.validateBookmark(item.bookmarkId, item.userId)
          .catch(err => unifiedLogger.error('Validation failed', {
            service: 'asyncProcessor',
            source: 'processValidationQueue',
            error: err.message,
            stack: err.stack,
            bookmarkId: item.bookmarkId
          }))
      ));
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    unifiedLogger.info('Validation queue processed', {
      service: 'asyncProcessor',
      source: 'processValidationQueue',
      duration: Date.now() - startTime
    });
    
    // Continue processing enrichment queue
    setTimeout(() => this.processEnrichmentQueue(), 1000);
  }

  /**
   * Validate a single bookmark
   */
  async validateBookmark(bookmarkId, userId) {
    const startTime = Date.now();
    try {
      unifiedLogger.debug('Validating bookmark', {
        service: 'asyncProcessor',
        source: 'validateBookmark',
        bookmarkId,
        userId
      });
      
      // Get bookmark
      const result = await db.query(
        'SELECT url, title FROM bookmarks WHERE id = $1',
        [bookmarkId]
      );
      
      if (result.rows.length === 0) return;
      
      const bookmark = result.rows[0];
      
      // Simple HEAD request validation
      let isValid = false;
      let httpStatus = 0;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(bookmark.url, {
          method: 'HEAD',
          signal: controller.signal,
          redirect: 'follow',
        });
        
        clearTimeout(timeoutId);
        
        isValid = response.ok;
        httpStatus = response.status;
      } catch (err) {
        unifiedLogger.warn('Validation failed', {
          service: 'asyncProcessor',
          source: 'validateBookmark',
          url: bookmark.url,
          error: err.message,
          bookmarkId
        });
      }
      
      // Update bookmark
      await db.query(
        `UPDATE bookmarks 
         SET is_valid = $1, http_status = $2, last_checked = $3
         WHERE id = $4`,
        [isValid, httpStatus, new Date(), bookmarkId]
      );
      
      // Queue for enrichment if valid
      if (isValid) {
        this.queueEnrichment(bookmarkId, userId, bookmark.url, bookmark.title);
      }
      
      unifiedLogger.info('Bookmark validated', {
        service: 'asyncProcessor',
        source: 'validateBookmark',
        bookmarkId,
        isValid,
        httpStatus,
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      unifiedLogger.error('Error validating bookmark', {
        service: 'asyncProcessor',
        source: 'validateBookmark',
        error: error.message,
        stack: error.stack,
        bookmarkId
      });
    }
  }

  /**
   * Process enrichment queue
   */
  async processEnrichmentQueue() {
    const startTime = Date.now();
    unifiedLogger.info('Processing enrichment queue', {
      service: 'asyncProcessor',
      source: 'processEnrichmentQueue',
      queueSize: this.enrichmentQueue.length
    });

    while (this.enrichmentQueue.length > 0) {
      const item = this.enrichmentQueue.shift();
      
      unifiedLogger.debug('Processing enrichment item', {
        service: 'asyncProcessor',
        source: 'processEnrichmentQueue',
        bookmarkId: item.bookmarkId,
        remainingQueue: this.enrichmentQueue.length
      });
      
      await this.enrichBookmark(item.bookmarkId, item.userId, item.url, item.title)
        .catch(err => unifiedLogger.error('Enrichment failed', {
          service: 'asyncProcessor',
          source: 'processEnrichmentQueue',
          error: err.message,
          stack: err.stack,
          bookmarkId: item.bookmarkId
        }));
      
      // Rate limit for OpenAI
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    this.isProcessing = false;
    unifiedLogger.info('Enrichment queue processed', {
      service: 'asyncProcessor',
      source: 'processEnrichmentQueue',
      duration: Date.now() - startTime
    });
  }

  /**
   * Enrich a single bookmark with OpenAI
   */
  async enrichBookmark(bookmarkId, userId, url, title) {
    const startTime = Date.now();
    try {
      unifiedLogger.debug('Enriching bookmark', {
        service: 'asyncProcessor',
        source: 'enrichBookmark',
        bookmarkId,
        url,
        userId
      });
      
      // Skip if already enriched
      const check = await db.query(
        'SELECT enriched FROM bookmarks WHERE id = $1',
        [bookmarkId]
      );
      
      if (check.rows.length === 0 || check.rows[0].enriched) return;
      
      // Call OpenAI for categorization
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `Analyze this bookmark and provide:
1. category: main category (Technology, Business, Education, etc.)
2. subcategory: specific subcategory
3. tags: array of 3-5 relevant tags
4. description: brief description (max 150 chars)

Respond in JSON format only.`
          },
          {
            role: "user",
            content: `URL: ${url}\nTitle: ${title}`
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      let enrichmentData;
      try {
        enrichmentData = JSON.parse(completion.choices[0].message.content);
      } catch (err) {
        unifiedLogger.warn('Failed to parse OpenAI response', {
          service: 'asyncProcessor',
          source: 'enrichBookmark',
          error: err.message,
          response: completion.choices[0].message.content,
          bookmarkId
        });
        return;
      }
      
      // Generate embedding
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: `${title} ${enrichmentData.description || ''} ${enrichmentData.tags?.join(' ') || ''}`,
      });
      
      const embedding = embeddingResponse.data[0].embedding;
      
      // Update database
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        
        // Update bookmark
        if (enrichmentData.description) {
          await client.query(
            'UPDATE bookmarks SET description = $1 WHERE id = $2',
            [enrichmentData.description, bookmarkId]
          );
        }
        
        // Update metadata
        await client.query(
          `UPDATE bookmark_metadata 
           SET category = $1, subcategory = $2, keywords = $3, 
               semantic_summary = $4, embedding = $5, updated_at = $6
           WHERE bookmark_id = $7`,
          [
            enrichmentData.category,
            enrichmentData.subcategory,
            enrichmentData.tags,
            enrichmentData.description,
            `[${embedding.join(',')}]`,
            new Date(),
            bookmarkId
          ]
        );
        
        // Add tags
        if (enrichmentData.tags && Array.isArray(enrichmentData.tags)) {
          for (const tagName of enrichmentData.tags) {
            // Check if tag exists
            let tagResult = await client.query(
              'SELECT id FROM tags WHERE user_id = $1 AND name = $2',
              [userId, tagName.toLowerCase()]
            );
            
            let tagId;
            if (tagResult.rows.length === 0) {
              // Create new tag
              const newTag = await client.query(
                'INSERT INTO tags (id, user_id, name, color, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [uuidv4(), userId, tagName.toLowerCase(), '#' + Math.floor(Math.random()*16777215).toString(16), new Date()]
              );
              tagId = newTag.rows[0].id;
            } else {
              tagId = tagResult.rows[0].id;
            }
            
            // Link tag to bookmark
            await client.query(
              'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
              [bookmarkId, tagId]
            );
          }
        }
        
        // Mark as enriched
        await client.query(
          'UPDATE bookmarks SET enriched = true WHERE id = $1',
          [bookmarkId]
        );
        
        await client.query('COMMIT');
        
        unifiedLogger.info('Bookmark enriched', {
          service: 'asyncProcessor',
          source: 'enrichBookmark',
          bookmarkId,
          category: enrichmentData.category,
          tags: enrichmentData.tags,
          duration: Date.now() - startTime
        });
        
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
    } catch (error) {
      unifiedLogger.error('Error enriching bookmark', {
        service: 'asyncProcessor',
        source: 'enrichBookmark',
        error: error.message,
        stack: error.stack,
        bookmarkId,
        url
      });
    }
  }
}

export default new AsyncProcessor();