#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import BookmarkProcessor from '../services/bookmarkProcessor.js';
import unifiedLogger from '../services/unifiedLogger.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Script to validate and process bookmark files
 * Usage: node validateBookmarks.js <html-file-path> <user-id>
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    unifiedLogger.error('Usage: node validateBookmarks.js <html-file-path> <user-id>', {
      service: 'script',
      source: 'validateBookmarks'
    });
    unifiedLogger.error('Example: node validateBookmarks.js /path/to/bookmarks.html 123e4567-e89b-12d3-a456-426614174000', {
      service: 'script',
      source: 'validateBookmarks'
    });
    console.error('Usage: node validateBookmarks.js <html-file-path> <user-id>');
    console.error('Example: node validateBookmarks.js /path/to/bookmarks.html 123e4567-e89b-12d3-a456-426614174000');
    process.exit(1);
  }
  
  const [htmlPath, userId] = args;
  
  unifiedLogger.info('Starting bookmark validation', { service: 'script', source: 'validateBookmarks', htmlPath, userId });
  
  const processor = new BookmarkProcessor({
    validationDir: path.join(__dirname, '../../../../bookmark-validation'),
    batchSize: 5,
    maxRetries: 2,
  });
  
  try {
    // Initialize processor
    await processor.initialize();
    
    // Process the HTML file
    const report = await processor.processHtmlFile(htmlPath, userId);
    
    unifiedLogger.info('Processing completed', { service: 'script', source: 'validateBookmarks', report });
    
    unifiedLogger.info('Bookmark processing report generated', {
      service: 'script',
      source: 'validateBookmarks',
      report: {
        totalBookmarks: report.totalBookmarks,
        validBookmarks: report.validBookmarks,
        invalidBookmarks: report.invalidBookmarks,
        processedCount: report.processedCount,
        failedCount: report.failedCount,
        categories: report.classifications?.categories,
        topTags: report.classifications?.tags ? Object.entries(report.classifications.tags)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10) : undefined
      },
      reportPath: path.join(processor.options.validationDir, 'processing-report.json')
    });
    
    console.log('\n=== Bookmark Processing Report ===');
    console.log(`Total Bookmarks: ${report.totalBookmarks}`);
    console.log(`Valid Bookmarks: ${report.validBookmarks}`);
    console.log(`Invalid Bookmarks: ${report.invalidBookmarks}`);
    console.log(`Processed Successfully: ${report.processedCount}`);
    console.log(`Failed to Process: ${report.failedCount}`);
    
    if (report.classifications) {
      console.log('\n=== Categories ===');
      Object.entries(report.classifications.categories)
        .sort(([,a], [,b]) => b - a)
        .forEach(([category, count]) => {
          console.log(`${category}: ${count}`);
        });
      
      console.log('\n=== Top Tags ===');
      Object.entries(report.classifications.tags)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([tag, count]) => {
          console.log(`${tag}: ${count}`);
        });
    }
    
    console.log(`\nFull report saved to: ${path.join(processor.options.validationDir, 'processing-report.json')}`);
    
  } catch (error) {
    // Error already logged below
    unifiedLogger.error('Error processing bookmarks', {
      service: 'script',
      source: 'validateBookmarks',
      error: error.message,
      stack: error.stack
    });
    console.error('Error processing bookmarks:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    await processor.cleanup();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}