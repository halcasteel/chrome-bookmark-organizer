import { chromium } from 'playwright';
import unifiedLogger from './unifiedLogger.js';
import EventEmitter from 'events';

/**
 * Browser Pool Manager
 * 
 * Manages a pool of Playwright browser instances for efficient resource usage.
 * Prevents creating too many browser instances and reuses them across requests.
 */
class BrowserPool extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.maxBrowsers = options.maxBrowsers || 5;
    this.maxContextsPerBrowser = options.maxContextsPerBrowser || 10;
    this.browserTimeout = options.browserTimeout || 30000;
    this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
    
    this.browsers = [];
    this.availableContexts = [];
    this.busyContexts = new Set();
    this.waitingQueue = [];
    
    this.stats = {
      created: 0,
      reused: 0,
      destroyed: 0,
      errors: 0,
      queueSize: 0,
      activeContexts: 0
    };
    
    // Cleanup idle browsers periodically
    this.cleanupInterval = setInterval(() => this.cleanupIdleBrowsers(), 60000);
    
    unifiedLogger.info('Browser pool initialized', {
      service: 'browserPool',
      method: 'constructor',
      maxBrowsers: this.maxBrowsers,
      maxContextsPerBrowser: this.maxContextsPerBrowser
    });
  }

  /**
   * Get browser launch options
   */
  getBrowserOptions() {
    return {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Better for containerized environments
        '--disable-gpu'
      ]
    };
  }

  /**
   * Get context options with random user agent
   */
  getContextOptions() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];
    
    return {
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
      viewport: { 
        width: 1920 + Math.floor(Math.random() * 200) - 100,
        height: 1080 + Math.floor(Math.random() * 200) - 100 
      },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      deviceScaleFactor: 1,
      hasTouch: false,
      ignoreHTTPSErrors: true
    };
  }

  /**
   * Acquire a browser context from the pool
   * @returns {Promise<Object>} - Context wrapper with release method
   */
  async acquire() {
    const startTime = Date.now();
    
    // Try to get available context
    if (this.availableContexts.length > 0) {
      const contextWrapper = this.availableContexts.shift();
      this.busyContexts.add(contextWrapper);
      
      this.stats.reused++;
      this.stats.activeContexts = this.busyContexts.size;
      
      unifiedLogger.debug('Reused browser context from pool', {
        service: 'browserPool',
        method: 'acquire',
        poolSize: this.availableContexts.length,
        busySize: this.busyContexts.size,
        duration: Date.now() - startTime
      });
      
      return contextWrapper;
    }
    
    // Check if we can create new browser/context
    if (this.canCreateNewContext()) {
      return await this.createNewContext();
    }
    
    // Wait for available context
    return await this.waitForAvailableContext();
  }

  /**
   * Check if we can create a new context
   */
  canCreateNewContext() {
    const totalContexts = this.availableContexts.length + this.busyContexts.size;
    const maxTotalContexts = this.maxBrowsers * this.maxContextsPerBrowser;
    return totalContexts < maxTotalContexts;
  }

  /**
   * Create a new browser context
   */
  async createNewContext() {
    try {
      let browser;
      
      // Find browser with available context slots
      for (const browserWrapper of this.browsers) {
        if (browserWrapper.contexts.size < this.maxContextsPerBrowser) {
          browser = browserWrapper;
          break;
        }
      }
      
      // Create new browser if needed
      if (!browser && this.browsers.length < this.maxBrowsers) {
        const browserInstance = await chromium.launch(this.getBrowserOptions());
        browser = {
          instance: browserInstance,
          contexts: new Set(),
          createdAt: Date.now(),
          lastUsed: Date.now()
        };
        this.browsers.push(browser);
        this.stats.created++;
        
        unifiedLogger.info('Created new browser instance', {
          service: 'browserPool',
          method: 'createNewContext',
          browserCount: this.browsers.length
        });
      }
      
      if (!browser) {
        throw new Error('Cannot create new browser: pool limit reached');
      }
      
      // Create new context
      const context = await browser.instance.newContext(this.getContextOptions());
      const page = await context.newPage();
      
      const contextWrapper = {
        browser,
        context,
        page,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        release: async () => this.release(contextWrapper)
      };
      
      browser.contexts.add(contextWrapper);
      this.busyContexts.add(contextWrapper);
      this.stats.activeContexts = this.busyContexts.size;
      
      return contextWrapper;
      
    } catch (error) {
      this.stats.errors++;
      unifiedLogger.error('Failed to create browser context', {
        service: 'browserPool',
        method: 'createNewContext',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Wait for an available context
   */
  async waitForAvailableContext() {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitingQueue.indexOf(queueItem);
        if (index > -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error('Timeout waiting for browser context'));
      }, this.browserTimeout);
      
      const queueItem = { resolve, reject, timeoutId };
      this.waitingQueue.push(queueItem);
      this.stats.queueSize = this.waitingQueue.length;
      
      unifiedLogger.debug('Added to browser pool queue', {
        service: 'browserPool',
        method: 'waitForAvailableContext',
        queueSize: this.waitingQueue.length
      });
    });
  }

  /**
   * Release a browser context back to the pool
   * @param {Object} contextWrapper - Context to release
   */
  async release(contextWrapper) {
    try {
      if (!this.busyContexts.has(contextWrapper)) {
        return;
      }
      
      this.busyContexts.delete(contextWrapper);
      contextWrapper.lastUsed = Date.now();
      
      // Clear page state
      try {
        await contextWrapper.page.goto('about:blank');
      } catch (error) {
        // Page might be closed
      }
      
      // Check if anyone is waiting
      if (this.waitingQueue.length > 0) {
        const queueItem = this.waitingQueue.shift();
        clearTimeout(queueItem.timeoutId);
        this.busyContexts.add(contextWrapper);
        queueItem.resolve(contextWrapper);
        this.stats.queueSize = this.waitingQueue.length;
      } else {
        this.availableContexts.push(contextWrapper);
      }
      
      this.stats.activeContexts = this.busyContexts.size;
      
      unifiedLogger.debug('Released browser context to pool', {
        service: 'browserPool',
        method: 'release',
        poolSize: this.availableContexts.length,
        busySize: this.busyContexts.size,
        queueSize: this.waitingQueue.length
      });
      
    } catch (error) {
      unifiedLogger.error('Error releasing browser context', {
        service: 'browserPool',
        method: 'release',
        error: error.message
      });
      // Remove from all collections
      this.busyContexts.delete(contextWrapper);
      const index = this.availableContexts.indexOf(contextWrapper);
      if (index > -1) {
        this.availableContexts.splice(index, 1);
      }
    }
  }

  /**
   * Clean up idle browsers
   */
  async cleanupIdleBrowsers() {
    const now = Date.now();
    const browsersToRemove = [];
    
    for (const browser of this.browsers) {
      if (browser.contexts.size === 0 && 
          now - browser.lastUsed > this.idleTimeout) {
        browsersToRemove.push(browser);
      }
    }
    
    for (const browser of browsersToRemove) {
      try {
        await browser.instance.close();
        const index = this.browsers.indexOf(browser);
        if (index > -1) {
          this.browsers.splice(index, 1);
        }
        this.stats.destroyed++;
        
        unifiedLogger.info('Closed idle browser', {
          service: 'browserPool',
          method: 'cleanupIdleBrowsers',
          idleTime: now - browser.lastUsed,
          remainingBrowsers: this.browsers.length
        });
      } catch (error) {
        unifiedLogger.error('Error closing idle browser', {
          service: 'browserPool',
          method: 'cleanupIdleBrowsers',
          error: error.message
        });
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      ...this.stats,
      browsers: this.browsers.length,
      availableContexts: this.availableContexts.length,
      busyContexts: this.busyContexts.size,
      totalContexts: this.availableContexts.length + this.busyContexts.size
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown() {
    clearInterval(this.cleanupInterval);
    
    // Cancel waiting queue
    for (const queueItem of this.waitingQueue) {
      clearTimeout(queueItem.timeoutId);
      queueItem.reject(new Error('Browser pool shutting down'));
    }
    this.waitingQueue = [];
    
    // Close all contexts
    const allContexts = [...this.availableContexts, ...this.busyContexts];
    for (const contextWrapper of allContexts) {
      try {
        await contextWrapper.context.close();
      } catch (error) {
        // Context might already be closed
      }
    }
    
    // Close all browsers
    for (const browser of this.browsers) {
      try {
        await browser.instance.close();
      } catch (error) {
        unifiedLogger.error('Error closing browser during shutdown', {
          service: 'browserPool',
          method: 'shutdown',
          error: error.message
        });
      }
    }
    
    this.browsers = [];
    this.availableContexts = [];
    this.busyContexts.clear();
    
    unifiedLogger.info('Browser pool shut down', {
      service: 'browserPool',
      method: 'shutdown',
      stats: this.stats
    });
  }
}

// Export singleton instance
export default new BrowserPool();