import puppeteer from 'puppeteer';
import { logInfo, logError, logWarn, logDebug } from '../utils/logger.js';
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
  }

  /**
   * Initialize the Puppeteer browser instance
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logInfo('Initializing Puppeteer browser', { headless: this.options.headless });
      
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
      
      logInfo('Puppeteer browser initialized successfully');
    } catch (error) {
      logError(error, { context: 'BookmarkValidator.initialize' });
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
    
    logDebug('Starting bookmark validation', { 
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
        
        logInfo('Bookmark validated successfully', {
          bookmarkId,
          url: bookmark.url,
          statusCode: result.statusCode,
          loadTime: result.loadTime,
        });
      } else {
        result.error = `HTTP ${result.statusCode}`;
        logWarn('Bookmark validation failed', {
          bookmarkId,
          url: bookmark.url,
          statusCode: result.statusCode,
        });
      }
      
    } catch (error) {
      result.error = error.message;
      result.loadTime = Date.now() - startTime;
      
      logError(error, {
        context: 'BookmarkValidator.validateBookmark',
        bookmarkId,
        url: bookmark.url,
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
    try {
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
      
      return metadata;
    } catch (error) {
      logError(error, { context: 'BookmarkValidator.extractMetadata' });
      return {};
    }
  }

  /**
   * Validate multiple bookmarks in parallel with concurrency control
   * @param {Array} bookmarks - Array of bookmark objects
   * @returns {Promise<Array>} Array of validation results
   */
  async validateBatch(bookmarks) {
    logInfo('Starting batch validation', { count: bookmarks.length });
    
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
            logError(error, { 
              context: 'BookmarkValidator.validateBatch',
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
    
    logInfo('Batch validation completed', { 
      total: bookmarks.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
    });
    
    return results;
  }

  /**
   * Process bookmarks from HTML file
   * @param {string} htmlPath - Path to bookmarks HTML file
   * @returns {Promise<Object>} Processing summary
   */
  async processBookmarksFile(htmlPath) {
    try {
      logInfo('Processing bookmarks file', { path: htmlPath });
      
      // Read and parse HTML file
      const html = await fs.readFile(htmlPath, 'utf-8');
      const bookmarks = this.parseBookmarksHtml(html);
      
      logInfo('Parsed bookmarks from HTML', { count: bookmarks.length });
      
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
      
      return summary;
      
    } catch (error) {
      logError(error, { context: 'BookmarkValidator.processBookmarksFile' });
      throw error;
    }
  }

  /**
   * Parse bookmarks from HTML string
   * @param {string} html - HTML content
   * @returns {Array} Array of bookmark objects
   */
  parseBookmarksHtml(html) {
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
      if (this.browser) {
        // Close all active pages
        for (const page of this.activePages) {
          await page.close().catch(() => {});
        }
        
        await this.browser.close();
        this.browser = null;
        
        logInfo('Puppeteer browser closed');
      }
    } catch (error) {
      logError(error, { context: 'BookmarkValidator.close' });
    }
  }
}

export default BookmarkValidator;