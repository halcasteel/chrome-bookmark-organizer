import Queue from 'bull';
import { logInfo, logError } from '../utils/logger.js';
import db from '../config/database.js';
import validationService from '../services/validationService.js';
import dotenv from 'dotenv';

dotenv.config();

const validationQueue = new Queue('bookmark-validation', {
  redis: {
    port: 6379,
    host: 'localhost',
    password: process.env.REDIS_PASSWORD || 'admin'
  },
});

const enrichmentQueue = new Queue('bookmark-enrichment', {
  redis: {
    port: 6379,
    host: 'localhost',
    password: process.env.REDIS_PASSWORD || 'admin'
  },
});

// Process individual validation jobs
validationQueue.process('validate', async (job) => {
  const { bookmarkId, userId, importId } = job.data;
  
  logInfo('Starting bookmark validation', { bookmarkId });
  
  try {
    // Use the validation service for consistent validation logic
    const result = await validationService.validateBookmark(bookmarkId);
    
    // If valid and enriched, we're done
    // If valid but not enriched, it means AI categorization was skipped
    if (result.is_valid && !result.enriched && process.env.OPENAI_CATEGORIZATION_ENABLED === 'true') {
      // Queue for enrichment if needed
      await enrichmentQueue.add('enrich', {
        bookmarkId,
        userId,
        url: result.url,
        title: result.title,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
    }
    
    logInfo('Bookmark validation completed', { 
      bookmarkId, 
      isValid: result.is_valid,
      enriched: result.enriched
    });
    
    return { 
      bookmarkId, 
      isValid: result.is_valid, 
      enriched: result.enriched 
    };
    
  } catch (error) {
    logError(error, { context: 'ValidationWorker', bookmarkId });
    throw error;
  }
});

// Process batch validation jobs
validationQueue.process('validateBatch', async (job) => {
  logInfo('Processing validation batch');
  
  try {
    const results = await validationService.processValidationQueue();
    
    logInfo('Validation batch completed', results);
    
    return results;
  } catch (error) {
    logError(error, { context: 'Validation batch failed' });
    throw error;
  }
});

// Handle completed jobs
validationQueue.on('completed', (job, result) => {
  logInfo('Validation job completed', { 
    jobId: job.id, 
    bookmarkId: result.bookmarkId 
  });
});

// Handle failed jobs
validationQueue.on('failed', (job, err) => {
  logError(err, { 
    context: 'Validation job failed', 
    jobId: job.id,
    bookmarkId: job.data.bookmarkId 
  });
});

export default validationQueue;