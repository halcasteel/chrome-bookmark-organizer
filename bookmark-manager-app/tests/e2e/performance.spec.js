import { test, expect } from '@playwright/test';
import { testData } from './fixtures/test-data';

test.describe('Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test('should load dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    
    const loadTime = Date.now() - startTime;
    console.log(`Dashboard load time: ${loadTime}ms`);
    
    // Dashboard should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should perform search quickly', async ({ page }) => {
    await page.goto('/bookmarks');
    
    // Add some test bookmarks first
    for (let i = 0; i < 10; i++) {
      await page.click('button:has-text("Add Bookmark")');
      await page.fill('input[name="url"]', `https://example${i}.com`);
      await page.fill('input[name="title"]', `Example ${i}`);
      await page.click('button:has-text("Save")');
    }
    
    // Measure search performance
    const startTime = Date.now();
    
    await page.fill('input[placeholder*="Search"]', 'Example');
    await page.press('input[placeholder*="Search"]', 'Enter');
    
    // Wait for search results
    await page.waitForSelector('[data-testid="bookmark-item"]');
    
    const searchTime = Date.now() - startTime;
    console.log(`Search time: ${searchTime}ms`);
    
    // Search should complete within 1 second
    expect(searchTime).toBeLessThan(1000);
  });

  test('should handle large bookmark lists efficiently', async ({ page }) => {
    await page.goto('/bookmarks');
    
    // Simulate adding many bookmarks via API
    const bookmarks = Array.from({ length: 100 }, (_, i) => ({
      url: `https://test${i}.com`,
      title: `Test Bookmark ${i}`,
      description: `Description for bookmark ${i}`
    }));
    
    // Inject bookmarks directly via JavaScript
    await page.evaluate((bookmarks) => {
      // This would normally be done via API
      window.localStorage.setItem('test-bookmarks', JSON.stringify(bookmarks));
    }, bookmarks);
    
    // Measure page render time with many bookmarks
    const startTime = Date.now();
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const renderTime = Date.now() - startTime;
    console.log(`Render time for 100 bookmarks: ${renderTime}ms`);
    
    // Should render within 2 seconds
    expect(renderTime).toBeLessThan(2000);
  });

  test('should measure WebSocket connection time', async ({ page }) => {
    const wsConnectionTime = await page.evaluate(() => {
      return new Promise((resolve) => {
        const startTime = Date.now();
        
        // Listen for WebSocket connection
        const originalWebSocket = window.WebSocket;
        window.WebSocket = function(...args) {
          const ws = new originalWebSocket(...args);
          
          ws.addEventListener('open', () => {
            const connectionTime = Date.now() - startTime;
            resolve(connectionTime);
          });
          
          return ws;
        };
      });
    });
    
    console.log(`WebSocket connection time: ${wsConnectionTime}ms`);
    
    // WebSocket should connect within 2 seconds
    expect(wsConnectionTime).toBeLessThan(2000);
  });

  test('should monitor memory usage', async ({ page }) => {
    // Navigate to different pages and monitor memory
    const pages = ['/dashboard', '/bookmarks', '/collections', '/tags', '/settings'];
    const memoryUsage = [];
    
    for (const route of pages) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      
      // Get memory usage if available
      const memory = await page.evaluate(() => {
        if (performance.memory) {
          return {
            usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1048576),
            totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1048576)
          };
        }
        return null;
      });
      
      if (memory) {
        memoryUsage.push({ route, ...memory });
        console.log(`Memory usage for ${route}: ${memory.usedJSHeapSize}MB / ${memory.totalJSHeapSize}MB`);
      }
    }
    
    // Check for memory leaks (memory shouldn't grow excessively)
    if (memoryUsage.length > 0) {
      const initialMemory = memoryUsage[0].usedJSHeapSize;
      const finalMemory = memoryUsage[memoryUsage.length - 1].usedJSHeapSize;
      const memoryGrowth = finalMemory - initialMemory;
      
      console.log(`Memory growth: ${memoryGrowth}MB`);
      
      // Memory growth should be less than 50MB
      expect(memoryGrowth).toBeLessThan(50);
    }
  });

  test('should load admin dashboard logs efficiently', async ({ page }) => {
    await page.goto('/admin');
    await page.click('button:has-text("Logs Viewer")');
    
    const startTime = Date.now();
    
    // Wait for logs to load
    await page.waitForSelector('[data-testid="log-entry"]', { timeout: 10000 }).catch(() => {});
    
    const loadTime = Date.now() - startTime;
    console.log(`Logs load time: ${loadTime}ms`);
    
    // Logs should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should measure API response times', async ({ page }) => {
    // Intercept API calls and measure response times
    const apiTimes = [];
    
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        const timing = response.timing();
        if (timing) {
          apiTimes.push({
            url: response.url(),
            status: response.status(),
            duration: Math.round(timing.responseEnd)
          });
        }
      }
    });
    
    // Navigate to pages that make API calls
    await page.goto('/dashboard');
    await page.goto('/bookmarks');
    await page.goto('/admin');
    
    // Log API response times
    console.log('API Response Times:');
    apiTimes.forEach(({ url, status, duration }) => {
      console.log(`  ${url.split('/').pop()}: ${duration}ms (${status})`);
    });
    
    // All API calls should respond within 1 second
    apiTimes.forEach(({ duration }) => {
      expect(duration).toBeLessThan(1000);
    });
  });
});