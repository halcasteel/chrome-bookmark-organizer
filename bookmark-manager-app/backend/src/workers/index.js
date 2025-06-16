import dotenv from 'dotenv';
import Bull from 'bull';
import unifiedLogger from '../services/unifiedLogger.js';
import orchestratorService from '../services/orchestratorService.js';
import validationAgent from '../agents/validationAgent.js';
import enrichmentAgent from '../agents/enrichmentAgent.js';
import websocketService from '../services/websocketService.js';

// Load environment variables
dotenv.config();

// Redis configuration
const redisConfig = process.env.REDIS_URL ? 
  process.env.REDIS_URL : 
  {
    port: 6379,
    host: 'localhost',
  };

// Worker instances
const workers = new Map();

/**
 * Start all autonomous agents
 */
async function startWorkers() {
  unifiedLogger.info('Starting autonomous agents and orchestrator', {
    service: 'workers',
    method: 'startWorkers'
  });
  
  try {
    // Initialize WebSocket service if needed
    if (!websocketService.io) {
      unifiedLogger.warn('WebSocket service not initialized, skipping real-time updates', {
        service: 'workers',
        method: 'startWorkers'
      });
    }
    
    // Start validation agent
    const validationWorker = new Bull('bookmark-validation', redisConfig);
    validationWorker.process('validation', 5, async (job) => {
      return await validationAgent.process(job);
    });
    workers.set('validation', validationWorker);
    unifiedLogger.info('Validation agent started successfully', {
      service: 'workers',
      method: 'startWorkers',
      agent: 'validation',
      concurrency: 5
    });
    
    // Start enrichment agent
    const enrichmentWorker = new Bull('bookmark-enrichment', redisConfig);
    enrichmentWorker.process('enrichment', 3, async (job) => {
      return await enrichmentAgent.process(job);
    });
    workers.set('enrichment', enrichmentWorker);
    unifiedLogger.info('Enrichment agent started successfully', {
      service: 'workers',
      method: 'startWorkers',
      agent: 'enrichment',
      concurrency: 3
    });
    
    // Start categorization agent (placeholder for now)
    const categorizationWorker = new Bull('bookmark-categorization', redisConfig);
    categorizationWorker.process('categorization', 5, async (job) => {
      // Placeholder - categorization is handled in enrichment for now
      return { bookmarkId: job.data.bookmarkId, categorized: true };
    });
    workers.set('categorization', categorizationWorker);
    unifiedLogger.info('Categorization agent started successfully', {
      service: 'workers',
      method: 'startWorkers',
      agent: 'categorization',
      concurrency: 5
    });
    
    // Start embedding agent (placeholder for now)
    const embeddingWorker = new Bull('bookmark-embedding', redisConfig);
    embeddingWorker.process('embedding', 3, async (job) => {
      // Placeholder - embeddings are created in enrichment for now
      return { bookmarkId: job.data.bookmarkId, embedded: true };
    });
    workers.set('embedding', embeddingWorker);
    unifiedLogger.info('Embedding agent started successfully', {
      service: 'workers',
      method: 'startWorkers',
      agent: 'embedding',
      concurrency: 3
    });
    
    // Start screenshot agent (placeholder for now)
    const screenshotWorker = new Bull('bookmark-screenshot', redisConfig);
    screenshotWorker.process('screenshot', 2, async (job) => {
      // Placeholder for future screenshot functionality
      return { bookmarkId: job.data.bookmarkId, screenshot: false };
    });
    workers.set('screenshot', screenshotWorker);
    unifiedLogger.info('Screenshot agent started successfully', {
      service: 'workers',
      method: 'startWorkers',
      agent: 'screenshot',
      concurrency: 2
    });
    
    // Log orchestrator status
    unifiedLogger.info('All autonomous agents started successfully', {
      service: 'workers',
      method: 'startWorkers',
      totalAgents: workers.size,
      agents: Array.from(workers.keys())
    });
    
    // Set up periodic orchestrator health checks
    setInterval(async () => {
      try {
        const health = await orchestratorService.performHealthCheck();
        unifiedLogger.info('Orchestrator health check completed', {
          service: 'workers',
          method: 'healthCheck',
          agentsCount: Object.keys(health.agents).length,
          activeWorkflows: health.workflows.active,
          status: 'healthy'
        });
      } catch (error) {
        unifiedLogger.error('Orchestrator health check failed', {
          service: 'workers',
          method: 'healthCheck',
          error: error.message,
          stack: error.stack
        });
      }
    }, 60000); // Every minute
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      unifiedLogger.info('SIGTERM received, shutting down agents', {
        service: 'workers',
        method: 'shutdown',
        activeAgents: workers.size
      });
      
      // Clean up browser resources
      await validationAgent.cleanup();
      
      // Close all workers
      for (const [name, worker] of workers) {
        await worker.close();
        unifiedLogger.info('Agent stopped successfully', {
          service: 'workers',
          method: 'shutdown', 
          agent: name
        });
      }
      
      unifiedLogger.info('All agents shutdown complete', {
        service: 'workers',
        method: 'shutdown'
      });
      
      process.exit(0);
    });
    
    // Handle uncaught errors
    process.on('unhandledRejection', (error) => {
      unifiedLogger.error('Unhandled rejection in workers', {
        service: 'workers',
        method: 'unhandledRejection',
        error: error.message,
        stack: error.stack
      });
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to start workers', {
      service: 'workers',
      method: 'startWorkers',
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkers();
}

export default startWorkers;