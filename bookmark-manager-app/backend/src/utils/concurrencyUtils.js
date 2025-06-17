import unifiedLogger from '../services/unifiedLogger.js';

/**
 * Concurrency utilities for managing parallel operations
 */

/**
 * Process items in parallel with concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {Object} options - Processing options
 * @returns {Array} - Results in same order as input
 */
export async function processInParallel(items, processor, options = {}) {
  const {
    concurrency = 5,
    onProgress = null,
    onError = null,
    stopOnError = false
  } = options;
  
  const startTime = Date.now();
  const results = new Array(items.length);
  const errors = [];
  let completed = 0;
  let running = 0;
  let currentIndex = 0;
  
  unifiedLogger.debug('Starting parallel processing', {
    service: 'concurrencyUtils',
    method: 'processInParallel',
    itemCount: items.length,
    concurrency
  });
  
  return new Promise((resolve, reject) => {
    // Process next item
    const processNext = async () => {
      if (currentIndex >= items.length) {
        // All items have been started
        if (running === 0) {
          // All items completed
          unifiedLogger.info('Parallel processing completed', {
            service: 'concurrencyUtils',
            method: 'processInParallel',
            completed,
            errors: errors.length,
            duration: Date.now() - startTime
          });
          
          if (stopOnError && errors.length > 0) {
            reject(new Error(`Processing failed with ${errors.length} errors`));
          } else {
            resolve(results);
          }
        }
        return;
      }
      
      const index = currentIndex++;
      const item = items[index];
      running++;
      
      try {
        const result = await processor(item, index);
        results[index] = { success: true, result };
        completed++;
        
        if (onProgress) {
          onProgress({
            completed,
            total: items.length,
            percent: Math.round((completed / items.length) * 100),
            item,
            index
          });
        }
      } catch (error) {
        results[index] = { success: false, error: error.message };
        errors.push({ index, item, error });
        completed++;
        
        unifiedLogger.warn('Item processing failed', {
          service: 'concurrencyUtils',
          method: 'processInParallel',
          index,
          error: error.message
        });
        
        if (onError) {
          onError({ index, item, error });
        }
        
        if (stopOnError) {
          running--;
          reject(error);
          return;
        }
      }
      
      running--;
      
      // Start next item
      processNext();
    };
    
    // Start initial batch
    const initialBatch = Math.min(concurrency, items.length);
    for (let i = 0; i < initialBatch; i++) {
      processNext();
    }
  });
}

/**
 * Process items in batches
 * @param {Array} items - Items to process
 * @param {Function} batchProcessor - Async function to process a batch
 * @param {Object} options - Processing options
 * @returns {Array} - All results flattened
 */
export async function processInBatches(items, batchProcessor, options = {}) {
  const {
    batchSize = 10,
    delayBetweenBatches = 0,
    onBatchComplete = null
  } = options;
  
  const results = [];
  const totalBatches = Math.ceil(items.length / batchSize);
  
  unifiedLogger.debug('Starting batch processing', {
    service: 'concurrencyUtils',
    method: 'processInBatches',
    itemCount: items.length,
    batchSize,
    totalBatches
  });
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    
    try {
      const batchResults = await batchProcessor(batch, batchNum, totalBatches);
      results.push(...batchResults);
      
      if (onBatchComplete) {
        onBatchComplete({
          batchNum,
          totalBatches,
          batchSize: batch.length,
          processedCount: results.length,
          totalCount: items.length
        });
      }
      
      // Delay between batches if specified
      if (delayBetweenBatches > 0 && i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    } catch (error) {
      unifiedLogger.error('Batch processing failed', {
        service: 'concurrencyUtils',
        method: 'processInBatches',
        batchNum,
        error: error.message
      });
      throw error;
    }
  }
  
  return results;
}

/**
 * Rate limiter for controlling request frequency
 */
export class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow; // in milliseconds
    this.requests = [];
  }
  
  /**
   * Check if request can proceed
   */
  async canProceed() {
    const now = Date.now();
    
    // Remove old requests outside time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }
    
    // Calculate wait time
    const oldestRequest = this.requests[0];
    const waitTime = this.timeWindow - (now - oldestRequest);
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.canProceed(); // Recursive call after waiting
    }
    
    return true;
  }
  
  /**
   * Get current usage stats
   */
  getStats() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    return {
      current: this.requests.length,
      max: this.maxRequests,
      utilization: (this.requests.length / this.maxRequests) * 100
    };
  }
}

/**
 * Create a throttled version of an async function
 * @param {Function} fn - Async function to throttle
 * @param {number} delay - Minimum delay between calls in ms
 * @returns {Function} - Throttled function
 */
export function throttle(fn, delay) {
  let lastCall = 0;
  let timeout = null;
  
  return async function throttled(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall >= delay) {
      lastCall = now;
      return fn.apply(this, args);
    }
    
    // Wait for remaining time
    const waitTime = delay - timeSinceLastCall;
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    return new Promise((resolve, reject) => {
      timeout = setTimeout(async () => {
        lastCall = Date.now();
        try {
          const result = await fn.apply(this, args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, waitTime);
    });
  };
}

/**
 * Retry an async operation with exponential backoff
 * @param {Function} operation - Async operation to retry
 * @param {Object} options - Retry options
 * @returns {*} - Result of successful operation
 */
export async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry = null
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        unifiedLogger.error('Operation failed after all retries', {
          service: 'concurrencyUtils',
          method: 'retryWithBackoff',
          attempts: attempt + 1,
          error: error.message
        });
        throw error;
      }
      
      const delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);
      
      unifiedLogger.warn('Operation failed, retrying', {
        service: 'concurrencyUtils',
        method: 'retryWithBackoff',
        attempt: attempt + 1,
        maxRetries,
        delay,
        error: error.message
      });
      
      if (onRetry) {
        onRetry({ attempt: attempt + 1, delay, error });
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}