/**
 * Global Test Setup
 * Runs once before all tests
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Suppress console logs during tests unless DEBUG is set
if (!process.env.DEBUG) {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
}

// Global test utilities
global.testHelpers = {
  // Wait for condition
  waitFor: async (condition, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timeout waiting for condition');
  },
  
  // Create test user
  createTestUser: async () => {
    // This would use your actual user creation logic
    return {
      id: crypto.randomUUID(),
      email: `test-${Date.now()}@az1.ai`,
      name: 'Test User'
    };
  },
  
  // Clean up test data
  cleanupTestData: async () => {
    // Clean up any test data created during tests
    // This would connect to your test database
  }
};

// Extend expect matchers
expect.extend({
  toBeValidUrl(received) {
    try {
      new URL(received);
      return {
        pass: true,
        message: () => `expected ${received} not to be a valid URL`
      };
    } catch {
      return {
        pass: false,
        message: () => `expected ${received} to be a valid URL`
      };
    }
  },
  
  toBeValidEmail(received) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    return {
      pass,
      message: () => pass 
        ? `expected ${received} not to be a valid email`
        : `expected ${received} to be a valid email`
    };
  }
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in tests:', reason);
});

export default {
  // Cleanup after all tests
  async teardown() {
    await global.testHelpers.cleanupTestData();
  }
};