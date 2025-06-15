import puppeteer from 'puppeteer';
import db from '../config/database.js';
import { logInfo, logError, logWarn } from '../utils/logger.js';

/**
 * Validation Agent - Autonomous agent for URL validation
 * 
 * This agent independently validates bookmark URLs by:
 * - Checking HTTP status
 * - Detecting redirects
 * - Capturing response metadata
 * - Identifying dead links
 */
class ValidationAgent {
  constructor() {
    this.browser = null;
    this.browserPromise = null;
  }

  /**
   * Initialize browser instance
   */
  async initBrowser() {
    if (this.browser) return this.browser;
    
    if (this.browserPromise) return this.browserPromise;
    
    this.browserPromise = puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
      ],
    });
    
    this.browser = await this.browserPromise;
    this.browserPromise = null;
    
    return this.browser;
  }

  /**
   * Process validation job
   */
  async process(job) {
    const { bookmarkId, workflowId } = job.data;
    
    logInfo('Validation agent processing bookmark', { bookmarkId, workflowId });
    
    try {
      // Get bookmark details
      const result = await db.query(
        'SELECT url, title FROM bookmarks WHERE id = $1',
        [bookmarkId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Bookmark not found');
      }
      
      const bookmark = result.rows[0];
      
      // Validate URL
      const validationResult = await this.validateUrl(bookmark.url);
      
      // Update bookmark status
      await this.updateBookmarkStatus(bookmarkId, validationResult);
      
      // Report progress
      await job.progress(100);
      
      return {
        bookmarkId,
        url: bookmark.url,
        isValid: validationResult.isValid,
        metadata: validationResult.metadata,
        timestamp: new Date(),
      };
      
    } catch (error) {
      logError(error, { 
        context: 'Validation agent error', 
        bookmarkId 
      });
      throw error;
    }
  }

  /**
   * Validate a URL
   */
  async validateUrl(url) {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    
    try {
      // Set timeout and user agent
      await page.setDefaultNavigationTimeout(30000);
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      // Track response
      let responseStatus = null;
      let responseHeaders = {};
      let finalUrl = url;
      let redirectChain = [];
      
      page.on('response', response => {
        if (response.url() === url || response.url() === finalUrl) {
          responseStatus = response.status();
          responseHeaders = response.headers();
        }
      });
      
      page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
          finalUrl = frame.url();
        }
      });
      
      // Navigate to URL
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      
      // Get page metrics
      const metrics = await page.metrics();
      const timing = await page.evaluate(() => {
        const perf = window.performance.timing;
        return {
          loadTime: perf.loadEventEnd - perf.navigationStart,
          domReady: perf.domContentLoadedEventEnd - perf.navigationStart,
          firstByte: perf.responseStart - perf.navigationStart,
        };
      });
      
      // Check for common error indicators
      const pageContent = await page.content();
      const isErrorPage = this.detectErrorPage(pageContent, responseStatus);
      
      // Determine validity
      const isValid = responseStatus >= 200 && 
                     responseStatus < 400 && 
                     !isErrorPage;
      
      return {
        isValid,
        metadata: {
          statusCode: responseStatus,
          finalUrl,
          redirected: finalUrl !== url,
          redirectChain,
          contentType: responseHeaders['content-type'],
          contentLength: responseHeaders['content-length'],
          server: responseHeaders['server'],
          timing,
          metrics: {
            jsHeapUsed: metrics.JSHeapUsedSize,
            documents: metrics.Documents,
            frames: metrics.Frames,
          },
        },
      };
      
    } catch (error) {
      // Handle specific error types
      if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
        return {
          isValid: false,
          metadata: {
            error: 'DNS_ERROR',
            message: 'Domain not found',
          },
        };
      }
      
      if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
        return {
          isValid: false,
          metadata: {
            error: 'CONNECTION_REFUSED',
            message: 'Server refused connection',
          },
        };
      }
      
      if (error.message.includes('Navigation timeout')) {
        return {
          isValid: false,
          metadata: {
            error: 'TIMEOUT',
            message: 'Page load timeout',
          },
        };
      }
      
      // Generic error
      return {
        isValid: false,
        metadata: {
          error: 'VALIDATION_ERROR',
          message: error.message,
        },
      };
      
    } finally {
      await page.close();
    }
  }

  /**
   * Detect error pages
   */
  detectErrorPage(content, statusCode) {
    const errorPatterns = [
      /404\s*not\s*found/i,
      /page\s*not\s*found/i,
      /error\s*404/i,
      /the\s*page\s*you\s*requested\s*could\s*not\s*be\s*found/i,
      /this\s*page\s*doesn't\s*exist/i,
      /access\s*denied/i,
      /forbidden/i,
      /unauthorized/i,
    ];
    
    // Check status code
    if (statusCode >= 400) return true;
    
    // Check content patterns
    const lowerContent = content.toLowerCase();
    return errorPatterns.some(pattern => pattern.test(lowerContent));
  }

  /**
   * Update bookmark validation status
   */
  async updateBookmarkStatus(bookmarkId, validationResult) {
    const { isValid, metadata } = validationResult;
    
    await db.query(
      `UPDATE bookmarks 
       SET is_valid = $1,
           is_dead = $2,
           http_status = $3,
           last_checked = $4,
           redirect_url = $5,
           updated_at = $6
       WHERE id = $7`,
      [
        isValid,
        !isValid,
        metadata.statusCode || null,
        new Date(),
        metadata.finalUrl !== metadata.url ? metadata.finalUrl : null,
        new Date(),
        bookmarkId,
      ]
    );
    
    // Store validation metadata
    await db.query(
      `UPDATE bookmark_metadata
       SET validation_metadata = $1,
           updated_at = $2
       WHERE bookmark_id = $3`,
      [
        JSON.stringify(metadata),
        new Date(),
        bookmarkId,
      ]
    );
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export default new ValidationAgent();