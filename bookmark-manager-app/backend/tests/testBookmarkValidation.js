#!/usr/bin/env node

import BookmarkValidator from '../services/bookmarkValidator.js';
import unifiedLogger from '../services/unifiedLogger.js';

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
    unifiedLogger.info('Starting bookmark validation test', { service: 'script', source: 'testBookmarkValidation' });
    
    await validator.initialize();
    
    unifiedLogger.info('Testing individual bookmarks...', { service: 'script', source: 'testBookmarkValidation' });
    
    // Test individual validations
    for (const bookmark of testBookmarks.slice(0, 2)) {
      const result = await validator.validateBookmark(bookmark);
      
      unifiedLogger.info('Validation Result', {
        service: 'script',
        source: 'testBookmarkValidation',
        url: result.url,
        valid: result.valid,
        statusCode: result.statusCode,
        loadTime: result.loadTime,
        metadata: result.metadata,
        error: result.error
      });
      
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
    
    const validCount = batchResults.filter(r => r.valid).length;
    const invalidCount = batchResults.filter(r => !r.valid).length;
    
    unifiedLogger.info('Batch validation completed', {
      service: 'script',
      source: 'testBookmarkValidation',
      total: batchResults.length,
      valid: validCount,
      invalid: invalidCount,
      results: batchResults.map(r => ({ url: r.url, valid: r.valid, loadTime: r.loadTime }))
    });
    
    console.log(`\nTotal: ${batchResults.length}`);
    console.log(`Valid: ${validCount}`);
    console.log(`Invalid: ${invalidCount}`);
    
    // Summary
    console.log('\n=== Summary by URL ===');
    batchResults.forEach(result => {
      const status = result.valid ? '✅' : '❌';
      console.log(`${status} ${result.url} (${result.loadTime}ms)`);
    });
    
    unifiedLogger.info('Validation test completed', { service: 'script', source: 'testBookmarkValidation' });
    
  } catch (error) {
    // Error already logged below
    unifiedLogger.error('Test failed', {
      service: 'script',
      source: 'testBookmarkValidation',
      error: error.message,
      stack: error.stack
    });
    console.error('Test failed:', error.message);
  } finally {
    await validator.close();
  }
}

// Run the test
testValidation();