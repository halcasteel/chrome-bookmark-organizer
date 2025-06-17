import browserPool from './browserPool.js';
import unifiedLogger from './unifiedLogger.js';
import crypto from 'crypto';

/**
 * URL Content Fetcher Service
 * 
 * Uses browser pool to efficiently fetch content with human-like behavior.
 * Includes caching to avoid redundant fetches.
 */
class URLContentFetcher {
  constructor() {
    this.timeout = 30000; // 30 seconds
    this.cache = new Map(); // Simple in-memory cache
    this.cacheMaxSize = 1000;
    this.cacheTTL = 3600000; // 1 hour
  }

  /**
   * Generate cache key for URL
   */
  getCacheKey(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * Get cached content if available and fresh
   */
  getCachedContent(url) {
    const key = this.getCacheKey(url);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      unifiedLogger.debug('Cache hit for URL content', {
        service: 'urlContentFetcher',
        method: 'getCachedContent',
        url,
        age: Date.now() - cached.timestamp
      });
      return cached.data;
    }
    
    return null;
  }

  /**
   * Store content in cache
   */
  setCachedContent(url, data) {
    const key = this.getCacheKey(url);
    
    // Implement simple LRU by removing oldest entries if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Add human-like delays
   */
  async humanDelay(min = 100, max = 500) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Fetch content from URL using browser pool with human-like behavior
   * @param {string} url - URL to fetch
   * @returns {Object} - Extracted content and metadata
   */
  async fetchContent(url) {
    const startTime = Date.now();
    
    // Check cache first
    const cached = this.getCachedContent(url);
    if (cached) {
      return cached;
    }
    
    // Acquire browser context from pool
    const contextWrapper = await browserPool.acquire();
    const { page } = contextWrapper;
    
    try {
      unifiedLogger.debug('Fetching URL content with Playwright', {
        service: 'urlContentFetcher',
        method: 'fetchContent',
        url
      });

      // Simulate human-like navigation
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      });

      // Random delay before navigation
      await this.humanDelay(500, 1500);

      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.timeout
      });

      if (!response.ok()) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      // Wait for content to load with human-like timing
      await this.humanDelay(1000, 2000);

      // Simulate human scrolling behavior
      await this.simulateHumanScrolling(page);

      // Wait for any lazy-loaded content
      await page.waitForTimeout(1000);

      // Extract all content using page evaluation
      const extractedData = await page.evaluate((url) => {
        // Helper functions inside evaluate context
        const extractTitle = () => {
          return document.title || 
                 document.querySelector('meta[property="og:title"]')?.content ||
                 document.querySelector('meta[name="twitter:title"]')?.content ||
                 document.querySelector('h1')?.textContent?.trim() || 
                 '';
        };

        const extractDescription = () => {
          return document.querySelector('meta[name="description"]')?.content ||
                 document.querySelector('meta[property="og:description"]')?.content ||
                 document.querySelector('meta[name="twitter:description"]')?.content ||
                 document.querySelector('p')?.textContent?.trim()?.substring(0, 200) ||
                 '';
        };

        const extractKeywords = () => {
          const keywords = [];
          const metaKeywords = document.querySelector('meta[name="keywords"]')?.content;
          if (metaKeywords) {
            keywords.push(...metaKeywords.split(',').map(k => k.trim()));
          }
          
          document.querySelectorAll('meta[property="article:tag"]').forEach(el => {
            keywords.push(el.content);
          });
          
          return [...new Set(keywords)];
        };

        const extractMainContent = () => {
          const selectors = [
            'main', 'article', '[role="main"]', '.main-content', '#main-content',
            '.content', '#content', '.post-content', '.entry-content'
          ];
          
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
              const clone = element.cloneNode(true);
              clone.querySelectorAll('script, style').forEach(el => el.remove());
              return clone.textContent.replace(/\s+/g, ' ').trim();
            }
          }
          
          // Fallback to body
          const body = document.body.cloneNode(true);
          body.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
          return body.textContent.replace(/\s+/g, ' ').trim().substring(0, 5000);
        };

        const extractHeadings = () => {
          const headings = [];
          document.querySelectorAll('h1, h2, h3').forEach(el => {
            const text = el.textContent.trim();
            if (text) {
              headings.push({ level: el.tagName.toLowerCase(), text });
            }
          });
          return headings;
        };

        const extractStructuredData = () => {
          const data = [];
          document.querySelectorAll('script[type="application/ld+json"]').forEach(el => {
            try {
              data.push(JSON.parse(el.textContent));
            } catch (e) {
              // Invalid JSON
            }
          });
          return data;
        };

        // Perform extraction
        return {
          metadata: {
            title: extractTitle(),
            description: extractDescription(),
            keywords: extractKeywords(),
            author: document.querySelector('meta[name="author"]')?.content || '',
            publishedDate: document.querySelector('meta[property="article:published_time"]')?.content ||
                          document.querySelector('time[datetime]')?.getAttribute('datetime') || '',
            image: document.querySelector('meta[property="og:image"]')?.content ||
                   document.querySelector('meta[name="twitter:image"]')?.content || '',
            favicon: document.querySelector('link[rel="icon"]')?.href ||
                    document.querySelector('link[rel="shortcut icon"]')?.href ||
                    '/favicon.ico',
            language: document.documentElement.lang || 'en',
            type: document.querySelector('meta[property="og:type"]')?.content || 'website'
          },
          content: extractMainContent(),
          headings: extractHeadings(),
          structuredData: extractStructuredData(),
          fullText: document.body.textContent.replace(/\s+/g, ' ').trim().substring(0, 10000)
        };
      }, url);

      unifiedLogger.info('URL content fetched successfully', {
        service: 'urlContentFetcher',
        method: 'fetchContent',
        url,
        duration: Date.now() - startTime,
        contentLength: extractedData.content.length,
        hasStructuredData: extractedData.structuredData.length > 0
      });

      const result = {
        url,
        ...extractedData
      };
      
      // Cache the result
      this.setCachedContent(url, result);
      
      return result;

    } catch (error) {
      unifiedLogger.error('Failed to fetch URL content', {
        service: 'urlContentFetcher',
        method: 'fetchContent',
        url,
        error: error.message,
        duration: Date.now() - startTime
      });
      throw error;
    } finally {
      // Release context back to pool
      await contextWrapper.release();
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    unifiedLogger.info('URL content cache cleared', {
      service: 'urlContentFetcher',
      method: 'clearCache'
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    let totalAge = 0;
    let count = 0;
    
    for (const [key, value] of this.cache) {
      totalAge += Date.now() - value.timestamp;
      count++;
    }
    
    return {
      size: this.cache.size,
      maxSize: this.cacheMaxSize,
      averageAge: count > 0 ? totalAge / count : 0,
      ttl: this.cacheTTL
    };
  }

  /**
   * Simulate human-like scrolling behavior
   * @param {Page} page - Playwright page object
   */
  async simulateHumanScrolling(page) {
    try {
      // Get page height
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);
      
      // Scroll in chunks with variable speed
      let currentPosition = 0;
      const scrollStep = 300 + Math.floor(Math.random() * 200); // 300-500px per scroll
      
      while (currentPosition < pageHeight) {
        // Scroll with smooth behavior
        await page.evaluate((y) => {
          window.scrollTo({ top: y, behavior: 'smooth' });
        }, currentPosition);
        
        // Human-like delay between scrolls
        await this.humanDelay(200, 600);
        
        currentPosition += scrollStep;
        
        // Sometimes pause longer, like reading
        if (Math.random() < 0.3) {
          await this.humanDelay(1000, 2000);
        }
      }
      
      // Scroll back to top sometimes (human behavior)
      if (Math.random() < 0.5) {
        await this.humanDelay(500, 1000);
        await page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
      
    } catch (error) {
      unifiedLogger.warn('Error during scrolling simulation', {
        service: 'urlContentFetcher',
        method: 'simulateHumanScrolling',
        error: error.message
      });
    }
  }

  /**
   * Shutdown the fetcher (no-op now, browser pool handles cleanup)
   */
  async closeBrowser() {
    // No-op - browser pool manages browser lifecycle
    unifiedLogger.debug('URL fetcher shutdown called (delegated to browser pool)', {
      service: 'urlContentFetcher',
      method: 'closeBrowser'
    });
  }

}

// Export singleton instance
export default new URLContentFetcher();