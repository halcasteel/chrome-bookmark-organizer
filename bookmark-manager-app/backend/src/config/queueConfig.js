/**
 * Queue configuration for A2A agent execution
 */

export const queueConfig = {
  // Redis connection
  redis: {
    port: parseInt(process.env.REDIS_PORT || '6382'),
    host: process.env.REDIS_HOST || 'localhost',
  },
  
  // Default job options
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
  
  // Agent-specific configurations
  agents: {
    import: {
      concurrency: 1, // Process one file at a time
      rateLimit: null,
    },
    validation: {
      concurrency: 10, // Validate 10 URLs in parallel
      rateLimit: {
        max: 100,
        duration: 60000, // 100 requests per minute
      },
    },
    enrichment: {
      concurrency: 5, // 5 concurrent AI enrichments
      rateLimit: {
        max: 30,
        duration: 60000, // 30 per minute (OpenAI limit)
      },
    },
    categorization: {
      concurrency: 5,
      rateLimit: {
        max: 30,
        duration: 60000,
      },
    },
    embedding: {
      concurrency: 5,
      rateLimit: {
        max: 50,
        duration: 60000, // 50 embeddings per minute
      },
    },
  },
  
  // Queue monitoring
  monitoring: {
    statsInterval: 30000, // Update stats every 30 seconds
    cleanupInterval: 3600000, // Clean old jobs every hour
  },
};

export default queueConfig;