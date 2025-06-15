import dotenv from 'dotenv';
import Bull from 'bull';
import { logInfo, logError } from '../utils/logger.js';
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
  logInfo('Starting autonomous agents and orchestrator...');
  
  try {
    // Initialize WebSocket service if needed
    if (!websocketService.io) {
      logInfo('WebSocket service not initialized, skipping real-time updates');
    }
    
    // Start validation agent
    const validationWorker = new Bull('bookmark-validation', redisConfig);
    validationWorker.process('validation', 5, async (job) => {
      return await validationAgent.process(job);
    });
    workers.set('validation', validationWorker);
    logInfo('Validation agent started');
    
    // Start enrichment agent
    const enrichmentWorker = new Bull('bookmark-enrichment', redisConfig);
    enrichmentWorker.process('enrichment', 3, async (job) => {
      return await enrichmentAgent.process(job);
    });
    workers.set('enrichment', enrichmentWorker);
    logInfo('Enrichment agent started');
    
    // Start categorization agent (placeholder for now)
    const categorizationWorker = new Bull('bookmark-categorization', redisConfig);
    categorizationWorker.process('categorization', 5, async (job) => {
      // Placeholder - categorization is handled in enrichment for now
      return { bookmarkId: job.data.bookmarkId, categorized: true };
    });
    workers.set('categorization', categorizationWorker);
    logInfo('Categorization agent started');
    
    // Start embedding agent (placeholder for now)
    const embeddingWorker = new Bull('bookmark-embedding', redisConfig);
    embeddingWorker.process('embedding', 3, async (job) => {
      // Placeholder - embeddings are created in enrichment for now
      return { bookmarkId: job.data.bookmarkId, embedded: true };
    });
    workers.set('embedding', embeddingWorker);
    logInfo('Embedding agent started');
    
    // Start screenshot agent (placeholder for now)
    const screenshotWorker = new Bull('bookmark-screenshot', redisConfig);
    screenshotWorker.process('screenshot', 2, async (job) => {
      // Placeholder for future screenshot functionality
      return { bookmarkId: job.data.bookmarkId, screenshot: false };
    });
    workers.set('screenshot', screenshotWorker);
    logInfo('Screenshot agent started');
    
    // Log orchestrator status
    logInfo('All autonomous agents started successfully');
    
    // Set up periodic orchestrator health checks
    setInterval(async () => {
      const health = await orchestratorService.performHealthCheck();
      logInfo('Orchestrator health check', { 
        agents: Object.keys(health.agents).length,
        workflows: health.workflows.active,
      });
    }, 60000); // Every minute
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logInfo('SIGTERM received, shutting down agents...');
      
      // Clean up browser resources
      await validationAgent.cleanup();
      
      // Close all workers
      for (const [name, worker] of workers) {
        await worker.close();
        logInfo(`${name} agent stopped`);
      }
      
      process.exit(0);
    });
    
    // Handle uncaught errors
    process.on('unhandledRejection', (error) => {
      logError(error, { context: 'Unhandled rejection in workers' });
    });
    
  } catch (error) {
    logError(error, { context: 'Failed to start workers' });
    process.exit(1);
  }
}

// Start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkers();
}

export default startWorkers;