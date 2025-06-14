#!/usr/bin/env node

import BookmarkValidator from '../services/bookmarkValidator.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Test script for bookmark validation
 * Tests individual URLs and generates sample output
 */
async function testValidation() {
  const testBookmarks = [
    {
      url: 'https://www.google.com',
      title: 'Google Search'
    },
    {
      url: 'https://github.com',
      title: 'GitHub'
    },
    {
      url: 'https://stackoverflow.com',
      title: 'Stack Overflow'
    },
    {
      url: 'https://invalid-url-that-does-not-exist-12345.com',
      title: 'Invalid URL Test'
    },
    {
      url: 'https://www.wikipedia.org',
      title: 'Wikipedia'
    }
  ];

  const validator = new BookmarkValidator({
    timeout: 15000,
    maxConcurrent: 3,
    headless: 'new'
  });

  try {
    logInfo('Starting bookmark validation test');
    
    await validator.initialize();
    
    logInfo('Testing individual bookmarks...');
    
    // Test individual validations
    for (const bookmark of testBookmarks.slice(0, 2)) {
      const result = await validator.validateBookmark(bookmark);
      
      console.log('\n=== Validation Result ===');
      console.log(`URL: ${result.url}`);
      console.log(`Valid: ${result.valid}`);
      console.log(`Status: ${result.statusCode || 'N/A'}`);
      console.log(`Load Time: ${result.loadTime}ms`);
      
      if (result.valid && result.metadata) {
        console.log('\nMetadata:');
        console.log(`  Title: ${result.metadata.title}`);
        console.log(`  Description: ${result.metadata.description || 'N/A'}`);
        console.log(`  Language: ${result.metadata.language || 'N/A'}`);
        console.log(`  Keywords: ${result.metadata.keywords?.join(', ') || 'N/A'}`);
      }
      
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    }
    
    // Test batch validation
    console.log('\n\n=== Testing Batch Validation ===');
    const batchResults = await validator.validateBatch(testBookmarks);
    
    console.log(`\nTotal: ${batchResults.length}`);
    console.log(`Valid: ${batchResults.filter(r => r.valid).length}`);
    console.log(`Invalid: ${batchResults.filter(r => !r.valid).length}`);
    
    // Summary
    console.log('\n=== Summary by URL ===');
    batchResults.forEach(result => {
      const status = result.valid ? '✅' : '❌';
      console.log(`${status} ${result.url} (${result.loadTime}ms)`);
    });
    
    logInfo('Validation test completed');
    
  } catch (error) {
    logError(error, { context: 'testValidation' });
    console.error('Test failed:', error.message);
  } finally {
    await validator.close();
  }
}

// Run the test
testValidation();