import Queue from 'bull';
import unifiedLogger from '../services/unifiedLogger.js';
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
  
  unifiedLogger.info('Starting bookmark validation job', {
    service: 'validationWorker',
    method: 'validate',
    bookmarkId,
    userId,
    importId
  });
  
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
    
    const jobResult = { 
      bookmarkId, 
      isValid: result.is_valid, 
      enriched: result.enriched 
    };
    
    unifiedLogger.info('Bookmark validation completed successfully', {
      service: 'validationWorker',
      method: 'validate',
      bookmarkId,
      isValid: result.is_valid,
      enriched: result.enriched,
      queuedForEnrichment: result.is_valid && !result.enriched && process.env.OPENAI_CATEGORIZATION_ENABLED === 'true'
    });
    
    return jobResult;
    
  } catch (error) {
    unifiedLogger.error('Validation job failed', {
      service: 'validationWorker',
      method: 'validate',
      bookmarkId,
      userId,
      importId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

// Process batch validation jobs
validationQueue.process('validateBatch', async (job) => {
  unifiedLogger.info('Processing validation batch job', {
    service: 'validationWorker',
    method: 'validateBatch',
    jobId: job.id
  });
  
  try {
    const results = await validationService.processValidationQueue();
    
    unifiedLogger.info('Validation batch completed successfully', {
      service: 'validationWorker',
      method: 'validateBatch',
      processed: results.processed || 0,
      successful: results.successful || 0,
      failed: results.failed || 0
    });
    
    return results;
  } catch (error) {
    unifiedLogger.error('Validation batch job failed', {
      service: 'validationWorker',
      method: 'validateBatch',
      jobId: job.id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
});

// Handle completed jobs
validationQueue.on('completed', (job, result) => {
  unifiedLogger.info('Validation job completed successfully', {
    service: 'validationWorker',
    method: 'onCompleted',
    jobId: job.id,
    jobType: job.name,
    bookmarkId: result.bookmarkId,
    isValid: result.isValid
  });
});

// Handle failed jobs
validationQueue.on('failed', (job, err) => {
  unifiedLogger.error('Validation job failed', {
    service: 'validationWorker',
    method: 'onFailed',
    jobId: job.id,
    jobType: job.name,
    bookmarkId: job.data.bookmarkId,
    userId: job.data.userId,
    attempts: job.attemptsMade,
    error: err.message,
    stack: err.stack
  });
});

export default validationQueue;