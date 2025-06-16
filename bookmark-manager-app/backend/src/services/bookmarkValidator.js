import puppeteer from 'puppeteer';
import unifiedLogger from './unifiedLogger.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * BookmarkValidator - Validates bookmark URLs using Puppeteer headless browser
 * Tests URLs asynchronously and captures metadata for classification
 */
class BookmarkValidator {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 30000,
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      headless: options.headless ?? 'new',
      maxConcurrent: options.maxConcurrent || 5,
      retryAttempts: options.retryAttempts || 2,
      outputDir: options.outputDir || path.join(__dirname, '../../../bookmark-validation'),
    };
    
    this.browser = null;
    this.activePages = new Set();

    unifiedLogger.info('BookmarkValidator initialized', {
      service: 'bookmarkValidator',
      source: 'constructor',
      options: this.options
    });
  }

  /**
   * Initialize the Puppeteer browser instance
   * @returns {Promise<void>}
   */
  async initialize() {
    const startTime = Date.now();
    try {
      unifiedLogger.info('Initializing Puppeteer browser', {
        service: 'bookmarkValidator',
        source: 'initialize',
        headless: this.options.headless
      });
      
      this.browser = await puppeteer.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
      });
      
      // Ensure output directories exist
      await fs.mkdir(this.options.outputDir, { recursive: true });
      await fs.mkdir(path.join(this.options.outputDir, 'valid'), { recursive: true });
      await fs.mkdir(path.join(this.options.outputDir, 'invalid'), { recursive: true });
      await fs.mkdir(path.join(this.options.outputDir, 'pending'), { recursive: true });
      
      unifiedLogger.info('Puppeteer browser initialized successfully', {
        service: 'bookmarkValidator',
        source: 'initialize',
        duration: Date.now() - startTime
      });
    } catch (error) {
      unifiedLogger.error('Failed to initialize Puppeteer browser', {
        service: 'bookmarkValidator',
        source: 'initialize',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate a single bookmark URL
   * @param {Object} bookmark - Bookmark object with url, title, etc.
   * @returns {Promise<Object>} Validation result with metadata
   */
  async validateBookmark(bookmark) {
    const startTime = Date.now();
    const bookmarkId = crypto.randomBytes(8).toString('hex');
    
    unifiedLogger.debug('Starting bookmark validation', {
      service: 'bookmarkValidator',
      source: 'validateBookmark',
      bookmarkId,
      url: bookmark.url,
      title: bookmark.title
    });

    let page;
    let result = {
      id: bookmarkId,
      originalBookmark: bookmark,
      url: bookmark.url,
      valid: false,
      statusCode: null,
      loadTime: null,
      error: null,
      metadata: {
        title: bookmark.title,
        description: null,
        keywords: [],
        ogImage: null,
        favicon: null,
        language: null,
        contentType: null,
      },
      screenshot: null,
      timestamp: new Date().toISOString(),
    };

    try {
      page = await this.browser.newPage();
      this.activePages.add(page);
      
      // Set user agent
      await page.setUserAgent(this.options.userAgent);
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Track response status
      let responseStatus = null;
      page.on('response', (response) => {
        if (response.url() === bookmark.url) {
          responseStatus = response.status();
        }
      });
      
      // Navigate to URL with timeout
      const response = await page.goto(bookmark.url, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout,
      });
      
      result.statusCode = responseStatus || response.status();
      result.loadTime = Date.now() - startTime;
      
      // Check if page loaded successfully
      if (result.statusCode >= 200 && result.statusCode < 400) {
        result.valid = true;
        
        // Extract metadata
        result.metadata = await this.extractMetadata(page);
        
        // Take screenshot
        const screenshotPath = path.join(
          this.options.outputDir, 
          'valid', 
          `${bookmarkId}-screenshot.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: false });
        result.screenshot = screenshotPath;
        
        unifiedLogger.info('Bookmark validated successfully', {
          service: 'bookmarkValidator',
          source: 'validateBookmark',
          bookmarkId,
          url: bookmark.url,
          statusCode: result.statusCode,
          loadTime: result.loadTime,
          hasMetadata: !!result.metadata.title
        });
      } else {
        result.error = `HTTP ${result.statusCode}`;
        unifiedLogger.warn('Bookmark validation failed', {
          service: 'bookmarkValidator',
          source: 'validateBookmark',
          bookmarkId,
          url: bookmark.url,
          statusCode: result.statusCode
        });
      }
      
    } catch (error) {
      result.error = error.message;
      result.loadTime = Date.now() - startTime;
      
      unifiedLogger.error('Error validating bookmark', {
        service: 'bookmarkValidator',
        source: 'validateBookmark',
        error: error.message,
        stack: error.stack,
        bookmarkId,
        url: bookmark.url
      });
    } finally {
      if (page) {
        this.activePages.delete(page);
        await page.close().catch(() => {});
      }
    }
    
    // Save result to JSON file
    const outputDir = result.valid ? 'valid' : 'invalid';
    const outputPath = path.join(this.options.outputDir, outputDir, `${bookmarkId}.json`);
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
    
    return result;
  }

  /**
   * Extract metadata from the page
   * @param {Object} page - Puppeteer page object
   * @returns {Promise<Object>} Extracted metadata
   */
  async extractMetadata(page) {
    const startTime = Date.now();
    try {
      unifiedLogger.debug('Extracting metadata from page', {
        service: 'bookmarkValidator',
        source: 'extractMetadata'
      });
      const metadata = await page.evaluate(() => {
        const getMeta = (name) => {
          const element = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
          return element ? element.getAttribute('content') : null;
        };
        
        const getCanonicalUrl = () => {
          const link = document.querySelector('link[rel="canonical"]');
          return link ? link.getAttribute('href') : null;
        };
        
        return {
          title: document.title || null,
          description: getMeta('description') || getMeta('og:description') || null,
          keywords: getMeta('keywords')?.split(',').map(k => k.trim()) || [],
          ogImage: getMeta('og:image') || null,
          favicon: document.querySelector('link[rel="icon"]')?.href || 
                   document.querySelector('link[rel="shortcut icon"]')?.href || null,
          language: document.documentElement.lang || null,
          author: getMeta('author') || null,
          canonical: getCanonicalUrl(),
          contentType: getMeta('og:type') || 'website',
          siteName: getMeta('og:site_name') || null,
          publishedTime: getMeta('article:published_time') || null,
          modifiedTime: getMeta('article:modified_time') || null,
        };
      });
      
      unifiedLogger.debug('Metadata extracted successfully', {
        service: 'bookmarkValidator',
        source: 'extractMetadata',
        hasTitle: !!metadata.title,
        hasDescription: !!metadata.description,
        keywordCount: metadata.keywords?.length || 0,
        duration: Date.now() - startTime
      });

      return metadata;
    } catch (error) {
      unifiedLogger.error('Failed to extract metadata', {
        service: 'bookmarkValidator',
        source: 'extractMetadata',
        error: error.message,
        stack: error.stack
      });
      return {};
    }
  }

  /**
   * Validate multiple bookmarks in parallel with concurrency control
   * @param {Array} bookmarks - Array of bookmark objects
   * @returns {Promise<Array>} Array of validation results
   */
  async validateBatch(bookmarks) {
    const startTime = Date.now();
    unifiedLogger.info('Starting batch validation', {
      service: 'bookmarkValidator',
      source: 'validateBatch',
      count: bookmarks.length,
      maxConcurrent: this.options.maxConcurrent
    });
    
    const results = [];
    const queue = [...bookmarks];
    const processing = new Set();
    
    while (queue.length > 0 || processing.size > 0) {
      // Start new validations up to max concurrent
      while (processing.size < this.options.maxConcurrent && queue.length > 0) {
        const bookmark = queue.shift();
        const promise = this.validateBookmark(bookmark)
          .then((result) => {
            results.push(result);
            processing.delete(promise);
          })
          .catch((error) => {
            unifiedLogger.error('Batch validation error', {
              service: 'bookmarkValidator',
              source: 'validateBatch',
              error: error.message,
              stack: error.stack,
              url: bookmark.url
            });
            processing.delete(promise);
          });
        
        processing.add(promise);
      }
      
      // Wait for at least one to complete
      if (processing.size > 0) {
        await Promise.race(processing);
      }
    }
    
    unifiedLogger.info('Batch validation completed', {
      service: 'bookmarkValidator',
      source: 'validateBatch',
      total: bookmarks.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      duration: Date.now() - startTime,
      avgTimePerBookmark: Math.round((Date.now() - startTime) / bookmarks.length)
    });
    
    return results;
  }

  /**
   * Process bookmarks from HTML file
   * @param {string} htmlPath - Path to bookmarks HTML file
   * @returns {Promise<Object>} Processing summary
   */
  async processBookmarksFile(htmlPath) {
    const startTime = Date.now();
    try {
      unifiedLogger.info('Processing bookmarks file', {
        service: 'bookmarkValidator',
        source: 'processBookmarksFile',
        path: htmlPath
      });
      
      // Read and parse HTML file
      const html = await fs.readFile(htmlPath, 'utf-8');
      const bookmarks = this.parseBookmarksHtml(html);
      
      unifiedLogger.info('Parsed bookmarks from HTML', {
        service: 'bookmarkValidator',
        source: 'processBookmarksFile',
        count: bookmarks.length
      });
      
      // Save individual bookmark files to pending directory
      for (const bookmark of bookmarks) {
        const id = crypto.randomBytes(8).toString('hex');
        const pendingPath = path.join(this.options.outputDir, 'pending', `${id}.json`);
        await fs.writeFile(pendingPath, JSON.stringify({
          id,
          ...bookmark,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }, null, 2));
      }
      
      // Validate bookmarks in batches
      const results = await this.validateBatch(bookmarks);
      
      // Generate summary report
      const summary = {
        totalBookmarks: bookmarks.length,
        validBookmarks: results.filter(r => r.valid).length,
        invalidBookmarks: results.filter(r => !r.valid).length,
        processingTime: results.reduce((sum, r) => sum + (r.loadTime || 0), 0),
        timestamp: new Date().toISOString(),
        sourceFile: htmlPath,
      };
      
      await fs.writeFile(
        path.join(this.options.outputDir, 'summary.json'),
        JSON.stringify(summary, null, 2)
      );
      
      unifiedLogger.info('Bookmarks file processed', {
        service: 'bookmarkValidator',
        source: 'processBookmarksFile',
        summary,
        duration: Date.now() - startTime
      });

      return summary;
      
    } catch (error) {
      unifiedLogger.error('Failed to process bookmarks file', {
        service: 'bookmarkValidator',
        source: 'processBookmarksFile',
        error: error.message,
        stack: error.stack,
        htmlPath
      });
      throw error;
    }
  }

  /**
   * Parse bookmarks from HTML string
   * @param {string} html - HTML content
   * @returns {Array} Array of bookmark objects
   */
  parseBookmarksHtml(html) {
    unifiedLogger.debug('Parsing bookmarks HTML', {
      service: 'bookmarkValidator',
      source: 'parseBookmarksHtml',
      htmlLength: html.length
    });

    const bookmarks = [];
    const linkRegex = /<A\s+[^>]*HREF="([^"]+)"[^>]*>([^<]+)<\/A>/gi;
    const addDateRegex = /ADD_DATE="(\d+)"/i;
    const iconRegex = /ICON="([^"]+)"/i;
    
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const fullMatch = match[0];
      const url = match[1];
      const title = match[2];
      
      const addDateMatch = addDateRegex.exec(fullMatch);
      const iconMatch = iconRegex.exec(fullMatch);
      
      bookmarks.push({
        url,
        title,
        addDate: addDateMatch ? new Date(parseInt(addDateMatch[1]) * 1000) : null,
        icon: iconMatch ? iconMatch[1] : null,
      });
    }
    
    return bookmarks;
  }

  /**
   * Close the browser instance
   * @returns {Promise<void>}
   */
  async close() {
    try {
      unifiedLogger.info('Closing Puppeteer browser', {
        service: 'bookmarkValidator',
        source: 'close',
        activePagesCount: this.activePages.size
      });

      if (this.browser) {
        // Close all active pages
        for (const page of this.activePages) {
          await page.close().catch(() => {});
        }
        
        await this.browser.close();
        this.browser = null;
        
        unifiedLogger.info('Puppeteer browser closed successfully', {
          service: 'bookmarkValidator',
          source: 'close'
        });
      }
    } catch (error) {
      unifiedLogger.error('Error closing Puppeteer browser', {
        service: 'bookmarkValidator',
        source: 'close',
        error: error.message,
        stack: error.stack
      });
    }
  }
}

export default BookmarkValidator;