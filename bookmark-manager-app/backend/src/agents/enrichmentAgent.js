import { JSDOM } from 'jsdom';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import db from '../config/database.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';

/**
 * Enrichment Agent - Autonomous agent for bookmark enrichment
 * 
 * This agent enriches bookmarks by:
 * - Extracting metadata from pages
 * - Generating descriptions using AI
 * - Creating embeddings for semantic search
 * - Categorizing content
 */
class EnrichmentAgent {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Process enrichment job
   */
  async process(job) {
    const { bookmarkId, workflowId, previousResults } = job.data;
    
    logInfo('Enrichment agent processing bookmark', { bookmarkId, workflowId });
    
    try {
      // Get bookmark details
      const result = await db.query(
        'SELECT url, title, description FROM bookmarks WHERE id = $1',
        [bookmarkId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Bookmark not found');
      }
      
      const bookmark = result.rows[0];
      
      // Skip if invalid from validation
      if (previousResults?.[bookmarkId]?.validation?.isValid === false) {
        logWarn('Skipping enrichment for invalid bookmark', { bookmarkId });
        return {
          bookmarkId,
          skipped: true,
          reason: 'Invalid URL',
        };
      }
      
      // Extract metadata from page
      const metadata = await this.extractMetadata(bookmark.url);
      
      // Generate AI enrichment
      const enrichment = await this.generateEnrichment(bookmark, metadata);
      
      // Create embedding
      const embedding = await this.createEmbedding(enrichment.content);
      
      // Update bookmark
      await this.updateBookmark(bookmarkId, metadata, enrichment, embedding);
      
      // Report progress
      await job.progress(100);
      
      return {
        bookmarkId,
        title: enrichment.title,
        description: enrichment.description,
        category: enrichment.category,
        subcategory: enrichment.subcategory,
        tags: enrichment.tags,
        hasEmbedding: true,
        timestamp: new Date(),
      };
      
    } catch (error) {
      logError(error, { 
        context: 'Enrichment agent error', 
        bookmarkId 
      });
      throw error;
    }
  }

  /**
   * Extract metadata from webpage
   */
  async extractMetadata(url) {
    try {
      const response = await fetch(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      
      // Extract various metadata
      const metadata = {
        title: this.extractTitle(doc),
        description: this.extractDescription(doc),
        keywords: this.extractKeywords(doc),
        author: this.extractAuthor(doc),
        publishDate: this.extractPublishDate(doc),
        image: this.extractImage(doc, url),
        favicon: this.extractFavicon(doc, url),
        language: doc.documentElement.lang || 'en',
        openGraph: this.extractOpenGraph(doc),
        jsonLd: this.extractJsonLd(doc),
      };
      
      // Extract main content
      metadata.content = this.extractMainContent(doc);
      
      return metadata;
      
    } catch (error) {
      logError(error, { 
        context: 'Metadata extraction failed', 
        url 
      });
      return {
        title: null,
        description: null,
        content: null,
      };
    }
  }

  /**
   * Extract title
   */
  extractTitle(doc) {
    return doc.querySelector('meta[property="og:title"]')?.content ||
           doc.querySelector('meta[name="twitter:title"]')?.content ||
           doc.querySelector('title')?.textContent ||
           doc.querySelector('h1')?.textContent ||
           '';
  }

  /**
   * Extract description
   */
  extractDescription(doc) {
    return doc.querySelector('meta[property="og:description"]')?.content ||
           doc.querySelector('meta[name="description"]')?.content ||
           doc.querySelector('meta[name="twitter:description"]')?.content ||
           '';
  }

  /**
   * Extract keywords
   */
  extractKeywords(doc) {
    const keywords = doc.querySelector('meta[name="keywords"]')?.content || '';
    return keywords.split(',').map(k => k.trim()).filter(k => k);
  }

  /**
   * Extract author
   */
  extractAuthor(doc) {
    return doc.querySelector('meta[name="author"]')?.content ||
           doc.querySelector('meta[property="article:author"]')?.content ||
           '';
  }

  /**
   * Extract publish date
   */
  extractPublishDate(doc) {
    const dateStr = doc.querySelector('meta[property="article:published_time"]')?.content ||
                   doc.querySelector('meta[name="publish_date"]')?.content ||
                   doc.querySelector('time[datetime]')?.getAttribute('datetime');
    
    if (dateStr) {
      try {
        return new Date(dateStr).toISOString();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Extract main image
   */
  extractImage(doc, baseUrl) {
    const image = doc.querySelector('meta[property="og:image"]')?.content ||
                  doc.querySelector('meta[name="twitter:image"]')?.content ||
                  doc.querySelector('img[src]')?.src;
    
    if (image) {
      try {
        return new URL(image, baseUrl).href;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Extract favicon
   */
  extractFavicon(doc, baseUrl) {
    const favicon = doc.querySelector('link[rel="icon"]')?.href ||
                   doc.querySelector('link[rel="shortcut icon"]')?.href ||
                   '/favicon.ico';
    
    try {
      return new URL(favicon, baseUrl).href;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract OpenGraph data
   */
  extractOpenGraph(doc) {
    const og = {};
    doc.querySelectorAll('meta[property^="og:"]').forEach(meta => {
      const property = meta.getAttribute('property').replace('og:', '');
      og[property] = meta.content;
    });
    return og;
  }

  /**
   * Extract JSON-LD structured data
   */
  extractJsonLd(doc) {
    try {
      const script = doc.querySelector('script[type="application/ld+json"]');
      if (script) {
        return JSON.parse(script.textContent);
      }
    } catch (e) {
      // Invalid JSON-LD
    }
    return null;
  }

  /**
   * Extract main content
   */
  extractMainContent(doc) {
    // Remove script and style elements
    const scripts = doc.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());
    
    // Try to find main content area
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '#content',
      '.post',
      '.entry-content',
    ];
    
    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        return element.textContent.trim().substring(0, 5000);
      }
    }
    
    // Fallback to body
    return doc.body?.textContent.trim().substring(0, 5000) || '';
  }

  /**
   * Generate AI enrichment
   */
  async generateEnrichment(bookmark, metadata) {
    try {
      const content = [
        `URL: ${bookmark.url}`,
        `Title: ${metadata.title || bookmark.title}`,
        `Description: ${metadata.description || bookmark.description || ''}`,
        `Content: ${(metadata.content || '').substring(0, 2000)}`,
      ].join('\n');
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a bookmark categorization assistant. Analyze the webpage content and provide:
1. An improved title (if needed)
2. A concise description (max 200 chars)
3. A primary category from: Technology, Business, Education, Entertainment, News, Reference, Shopping, Social, Tools, Other
4. A relevant subcategory
5. Up to 5 relevant tags

Respond in JSON format.`,
          },
          {
            role: 'user',
            content,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      
      return {
        title: result.title || metadata.title || bookmark.title,
        description: result.description || metadata.description,
        category: result.category || 'Other',
        subcategory: result.subcategory || null,
        tags: result.tags || [],
        content: content, // For embedding
      };
      
    } catch (error) {
      logError(error, { context: 'AI enrichment failed' });
      
      // Fallback enrichment
      return {
        title: metadata.title || bookmark.title,
        description: metadata.description || '',
        category: 'Other',
        subcategory: null,
        tags: metadata.keywords || [],
        content: `${bookmark.url} ${bookmark.title} ${metadata.description || ''}`,
      };
    }
  }

  /**
   * Create embedding for semantic search
   */
  async createEmbedding(content) {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: content.substring(0, 8000), // Limit tokens
      });
      
      return response.data[0].embedding;
      
    } catch (error) {
      logError(error, { context: 'Embedding creation failed' });
      return null;
    }
  }

  /**
   * Update bookmark with enrichment data
   */
  async updateBookmark(bookmarkId, metadata, enrichment, embedding) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Update bookmark
      await client.query(
        `UPDATE bookmarks
         SET title = $1,
             description = $2,
             category = $3,
             subcategory = $4,
             favicon_url = $5,
             enriched = true,
             enriched_at = $6,
             updated_at = $7
         WHERE id = $8`,
        [
          enrichment.title,
          enrichment.description,
          enrichment.category,
          enrichment.subcategory,
          metadata.favicon,
          new Date(),
          new Date(),
          bookmarkId,
        ]
      );
      
      // Update metadata
      await client.query(
        `UPDATE bookmark_metadata
         SET page_title = $1,
             page_description = $2,
             keywords = $3,
             author = $4,
             published_date = $5,
             image_url = $6,
             language = $7,
             open_graph = $8,
             json_ld = $9,
             enrichment_metadata = $10,
             embedding = $11,
             updated_at = $12
         WHERE bookmark_id = $13`,
        [
          metadata.title,
          metadata.description,
          metadata.keywords,
          metadata.author,
          metadata.publishDate,
          metadata.image,
          metadata.language,
          JSON.stringify(metadata.openGraph),
          JSON.stringify(metadata.jsonLd),
          JSON.stringify({ ...enrichment, metadata }),
          embedding ? `[${embedding.join(',')}]` : null,
          new Date(),
          bookmarkId,
        ]
      );
      
      // Update tags
      if (enrichment.tags && enrichment.tags.length > 0) {
        for (const tagName of enrichment.tags) {
          // Insert or get tag
          const tagResult = await client.query(
            `INSERT INTO tags (id, name, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3)
             ON CONFLICT (name) DO UPDATE SET name = $1
             RETURNING id`,
            [tagName.toLowerCase(), new Date(), new Date()]
          );
          
          const tagId = tagResult.rows[0].id;
          
          // Create bookmark-tag relationship
          await client.query(
            `INSERT INTO bookmark_tags (bookmark_id, tag_id, created_at)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [bookmarkId, tagId, new Date()]
          );
        }
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new EnrichmentAgent();