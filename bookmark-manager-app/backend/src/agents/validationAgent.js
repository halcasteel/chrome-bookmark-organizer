import { chromium } from 'playwright';
import db from '../config/database.js';
import unifiedLogger from '../services/unifiedLogger.js';

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
    unifiedLogger.info('Initializing browser instance', {
      service: 'validationAgent',
      method: 'initBrowser'
    });
    
    if (this.browser) return this.browser;
    
    if (this.browserPromise) return this.browserPromise;
    
    this.browserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      timeout: 30000  // 30 second timeout
    }).catch(error => {
      unifiedLogger.error('Failed to launch browser', {
        service: 'validationAgent',
        method: 'initBrowser',
        error: error.message,
        stack: error.stack
      });
      throw error;
    });
    
    this.browser = await this.browserPromise;
    this.browserPromise = null;
    
    unifiedLogger.info('Browser initialized successfully', {
      service: 'validationAgent',
      method: 'initBrowser'
    });
    
    return this.browser;
  }

  /**
   * Process validation job
   */
  async process(job) {
    const { bookmarkId, workflowId } = job.data;
    
    unifiedLogger.info('Processing validation job', {
      service: 'validationAgent',
      method: 'process',
      bookmarkId,
      workflowId
    });
    
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
      
      const jobResult = {
        bookmarkId,
        url: bookmark.url,
        isValid: validationResult.isValid,
        metadata: validationResult.metadata,
        timestamp: new Date(),
      };
      
      unifiedLogger.info('Validation job completed successfully', {
        service: 'validationAgent',
        method: 'process',
        bookmarkId,
        url: bookmark.url,
        isValid: validationResult.isValid,
        statusCode: validationResult.metadata?.statusCode,
        hasRedirect: validationResult.metadata?.redirected
      });
      
      return jobResult;
      
    } catch (error) {
      unifiedLogger.error('Validation job failed', {
        service: 'validationAgent',
        method: 'process',
        bookmarkId,
        workflowId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Validate a URL
   */
  async validateUrl(url) {
    unifiedLogger.info('Starting URL validation', {
      service: 'validationAgent',
      method: 'validateUrl',
      url
    });
    
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    
    try {
      // Set user agent
      await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
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
      
      // Navigate to URL with better JS support
      const response = await page.goto(url, {
        waitUntil: 'networkidle',  // Playwright uses 'networkidle' not 'networkidle0'
        timeout: 30000,
      });
      
      // Wait for the page to fully render
      await page.waitForTimeout(2000);
      
      // Ensure we capture the response status
      if (!responseStatus && response) {
        responseStatus = response.status();
      }
      
      // Log the captured status for debugging
      unifiedLogger.info('Response status captured', {
        service: 'validationAgent',
        method: 'validateUrl',
        url,
        responseStatus,
        hasResponse: !!response,
        finalUrl
      });
      
      // Human-like scrolling to trigger lazy-loaded content
      await this.performHumanLikeScroll(page);
      
      // Take screenshot for visual validation
      const screenshotPath = `/tmp/bookmark-validation-${Date.now()}.png`;
      await page.screenshot({
        path: screenshotPath,
        fullPage: true
      });
      
      // If we didn't capture status from event, use navigation response
      if (!responseStatus && response) {
        responseStatus = response.status();
      }
      
      // Get page timing metrics (Playwright doesn't have page.metrics())
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
      
      // Log validation decision for debugging
      unifiedLogger.info('Validation decision', {
        service: 'validationAgent',
        method: 'validateUrl',
        url,
        responseStatus,
        isValid,
        isErrorPage,
        statusCheck: responseStatus >= 200 && responseStatus < 400
      });
      
      const result = {
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
        },
      };
      
      unifiedLogger.info('URL validation completed successfully', {
        service: 'validationAgent',
        method: 'validateUrl',
        url,
        isValid,
        statusCode: responseStatus,
        redirected: finalUrl !== url,
        loadTime: timing.loadTime
      });
      
      return result;
      
    } catch (error) {
      // Handle specific error types
      if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
        unifiedLogger.warn('URL validation failed - DNS error', {
          service: 'validationAgent',
          method: 'validateUrl',
          url,
          errorType: 'DNS_ERROR'
        });
        return {
          isValid: false,
          metadata: {
            error: 'DNS_ERROR',
            message: 'Domain not found',
          },
        };
      }
      
      if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
        unifiedLogger.warn('URL validation failed - connection refused', {
          service: 'validationAgent',
          method: 'validateUrl',
          url,
          errorType: 'CONNECTION_REFUSED'
        });
        return {
          isValid: false,
          metadata: {
            error: 'CONNECTION_REFUSED',
            message: 'Server refused connection',
          },
        };
      }
      
      if (error.message.includes('Navigation timeout')) {
        unifiedLogger.warn('URL validation failed - timeout', {
          service: 'validationAgent',
          method: 'validateUrl',
          url,
          errorType: 'TIMEOUT'
        });
        return {
          isValid: false,
          metadata: {
            error: 'TIMEOUT',
            message: 'Page load timeout',
          },
        };
      }
      
      // Generic error
      unifiedLogger.error('URL validation failed with generic error', {
        service: 'validationAgent',
        method: 'validateUrl',
        url,
        error: error.message,
        stack: error.stack
      });
      
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
    
    unifiedLogger.info('Updating bookmark validation status', {
      service: 'validationAgent',
      method: 'updateBookmarkStatus',
      bookmarkId,
      isValid,
      statusCode: metadata?.statusCode
    });
    
    await db.query(
      `UPDATE bookmarks 
       SET is_valid = $1,
           is_dead = $2,
           http_status = $3,
           last_checked = $4,
           updated_at = $5
       WHERE id = $6`,
      [
        isValid,
        !isValid,
        metadata.statusCode || null,
        new Date(),
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
    
    unifiedLogger.info('Bookmark validation status updated successfully', {
      service: 'validationAgent',
      method: 'updateBookmarkStatus',
      bookmarkId,
      isValid,
      statusCode: metadata?.statusCode
    });
  }

  /**
   * Perform human-like scrolling on the page
   */
  async performHumanLikeScroll(page) {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    let currentPosition = 0;
    const scrollStep = viewportHeight * 0.8; // Scroll 80% of viewport at a time
    
    while (currentPosition < scrollHeight) {
      // Random delay between scrolls (100-300ms)
      const delay = Math.floor(Math.random() * 200) + 100;
      await page.waitForTimeout(delay);
      
      // Smooth scroll with easing
      await page.evaluate((scrollTo) => {
        window.scrollTo({
          top: scrollTo,
          behavior: 'smooth'
        });
      }, currentPosition);
      
      currentPosition += scrollStep;
      
      // Wait for any lazy-loaded content
      await page.waitForTimeout(500);
      
      // Update scroll height in case new content loaded
      const newScrollHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newScrollHeight > scrollHeight) {
        scrollHeight = newScrollHeight;
      }
    }
    
    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
    
    await page.waitForTimeout(500);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    unifiedLogger.info('Cleaning up validation agent resources', {
      service: 'validationAgent',
      method: 'cleanup',
      hasBrowser: !!this.browser
    });
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      
      unifiedLogger.info('Browser resources cleaned up successfully', {
        service: 'validationAgent',
        method: 'cleanup'
      });
    }
  }
}

export default new ValidationAgent();