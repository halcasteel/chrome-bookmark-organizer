import { EventEmitter } from 'events';
import unifiedLogger from './unifiedLogger.js';
import a2aTaskManager from './a2aTaskManager.js';
import agentExecutor from './agentExecutor.js';
import queueConfig from '../config/queueConfig.js';

// Import all A2A agents
import importAgent from '../agents/importAgent.js';
import validationAgent from '../agents/validationAgentA2A.js';
import enrichmentAgent from '../agents/enrichmentAgentA2A.js';
import categorizationAgent from '../agents/categorizationAgentA2A.js';
import embeddingAgent from '../agents/embeddingAgentA2A.js';

/**
 * Agent Initialization Service
 * 
 * Responsible for:
 * - Registering all A2A agents with the task manager
 * - Performing health checks on agents
 * - Managing agent lifecycle
 * - Providing agent discovery endpoints
 * - Emitting lifecycle events
 */
class AgentInitializationService extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.initialized = false;
    this.healthCheckResults = new Map();
  }

  /**
   * Initialize all A2A agents and register with task manager
   */
  async initialize() {
    // Prevent duplicate initialization
    if (this.initialized) {
      unifiedLogger.debug('Agent initialization already complete', {
        service: 'agentInitializationService',
        method: 'initialize'
      });
      return;
    }

    unifiedLogger.info('Starting A2A agent initialization', {
      service: 'agentInitializationService',
      method: 'initialize'
    });

    try {
      // Configure agents with queue settings for hybrid execution
      const agentConfigs = [
        { agent: importAgent, config: queueConfig.agents.import },
        { agent: validationAgent, config: queueConfig.agents.validation },
        { agent: enrichmentAgent, config: queueConfig.agents.enrichment },
        { agent: categorizationAgent, config: queueConfig.agents.categorization },
        { agent: embeddingAgent, config: queueConfig.agents.embedding }
      ];
      
      // Register each agent with queue configuration
      for (const { agent, config } of agentConfigs) {
        // Apply queue configuration
        agent.concurrency = config.concurrency;
        agent.rateLimit = config.rateLimit;
        
        await this.registerAgent(agent);
      }
      
      // Perform health checks
      await this.performHealthChecks();
      
      this.initialized = true;
      
      unifiedLogger.info('A2A agent initialization completed', {
        service: 'agentInitializationService',
        method: 'initialize',
        agentCount: this.agents.size,
        agents: Array.from(this.agents.keys())
      });
      
    } catch (error) {
      unifiedLogger.error('Failed to initialize A2A agents', {
        service: 'agentInitializationService',
        method: 'initialize',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Register an agent with the task manager
   * @param {A2AAgent} agent - Agent instance to register
   */
  async registerAgent(agent) {
    const agentType = agent.agentType;
    
    unifiedLogger.info('Registering A2A agent', {
      service: 'agentInitializationService',
      method: 'registerAgent',
      agentType,
      version: agent.version
    });
    
    try {
      // Validate agent has required methods
      if (!agent.processTask || typeof agent.processTask !== 'function') {
        throw new Error(`Agent ${agentType} missing required processTask method`);
      }
      
      if (!agent.getAgentCard || typeof agent.getAgentCard !== 'function') {
        throw new Error(`Agent ${agentType} missing required getAgentCard method`);
      }
      
      // Initialize agent if it has an initialize method
      if (agent.initialize && typeof agent.initialize === 'function') {
        await agent.initialize();
      }
      
      // Emit registration event
      this.emit('agent:registered', agentType);
      
      // Register with task manager
      await a2aTaskManager.registerAgent(agent);
      
      // Store reference
      this.agents.set(agentType, agent);
      
      // Persist agent capabilities to database
      await this.persistAgentCapabilities(agent);
      
      // Emit initialization complete event
      this.emit('agent:initialized', agentType);
      
      unifiedLogger.info('A2A agent registered successfully', {
        service: 'agentInitializationService',
        method: 'registerAgent',
        agentType,
        capabilities: Object.keys(agent.capabilities.inputs || {})
      });
      
    } catch (error) {
      unifiedLogger.error('Failed to register A2A agent', {
        service: 'agentInitializationService',
        method: 'registerAgent',
        agentType,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Persist agent capabilities to database for discovery
   * @param {A2AAgent} agent - Agent whose capabilities to persist
   */
  async persistAgentCapabilities(agent) {
    const agentCard = agent.getAgentCard();
    
    try {
      // This would normally write to a2a_agent_capabilities table
      // For now, just log the capability registration
      unifiedLogger.debug('Persisting agent capabilities', {
        service: 'agentInitializationService',
        method: 'persistAgentCapabilities',
        agentType: agent.agentType,
        capabilities: agentCard.capabilities
      });
      
      // TODO: Implement database persistence when db is available
      // await db.query(
      //   `INSERT INTO a2a_agent_capabilities (agent_type, version, capabilities, updated_at)
      //    VALUES ($1, $2, $3, NOW())
      //    ON CONFLICT (agent_type) DO UPDATE 
      //    SET version = $2, capabilities = $3, updated_at = NOW()`,
      //   [agent.agentType, agent.version, JSON.stringify(agentCard)]
      // );
      
    } catch (error) {
      unifiedLogger.error('Failed to persist agent capabilities', {
        service: 'agentInitializationService',
        method: 'persistAgentCapabilities',
        agentType: agent.agentType,
        error: error.message
      });
      // Don't throw - this is not critical for agent operation
    }
  }

  /**
   * Perform health checks on all registered agents
   */
  async performHealthChecks() {
    unifiedLogger.info('Performing agent health checks', {
      service: 'agentInitializationService',
      method: 'performHealthChecks',
      agentCount: this.agents.size
    });
    
    const healthResults = new Map();
    
    for (const [agentType, agent] of this.agents) {
      try {
        // Check if agent has health check method
        if (agent.healthCheck && typeof agent.healthCheck === 'function') {
          const health = await agent.healthCheck();
          healthResults.set(agentType, health);
        } else {
          // Basic health check - just verify agent responds
          const agentCard = agent.getAgentCard();
          healthResults.set(agentType, {
            status: 'healthy',
            message: 'Agent responding',
            version: agentCard.version
          });
        }
        
        unifiedLogger.debug('Agent health check passed', {
          service: 'agentInitializationService',
          method: 'performHealthChecks',
          agentType,
          health: healthResults.get(agentType)
        });
        
      } catch (error) {
        healthResults.set(agentType, {
          status: 'unhealthy',
          message: error.message,
          error: true
        });
        
        unifiedLogger.warn('Agent health check failed', {
          service: 'agentInitializationService',
          method: 'performHealthChecks',
          agentType,
          error: error.message
        });
      }
    }
    
    return healthResults;
  }

  /**
   * Get all registered agents
   * @returns {Map} Map of agent type to agent instance
   */
  getAgents() {
    return this.agents;
  }

  /**
   * Get agent by type
   * @param {string} agentType - Type of agent to retrieve
   * @returns {A2AAgent|null} Agent instance or null if not found
   */
  getAgent(agentType) {
    return this.agents.get(agentType) || null;
  }

  /**
   * Get all agent capabilities for discovery
   * @returns {Array} Array of agent cards
   */
  getAgentCapabilities() {
    const capabilities = [];
    
    for (const agent of this.agents.values()) {
      capabilities.push(agent.getAgentCard());
    }
    
    return capabilities;
  }

  /**
   * Reset the service - clear all agents and reset state
   */
  async reset() {
    await this.shutdown();
  }

  /**
   * Check if service is initialized
   * @returns {boolean} Whether the service is initialized
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Check health of all agents
   * @returns {Object} Health status object
   */
  async checkHealth() {
    const agents = {};
    let allHealthy = true;
    
    for (const [agentType, agent] of this.agents) {
      try {
        let health;
        
        // Use agent's health check if available
        if (agent.healthCheck && typeof agent.healthCheck === 'function') {
          health = await agent.healthCheck();
        } else {
          // Basic health check
          health = {
            status: 'healthy',
            message: 'Agent responding'
          };
        }
        
        agents[agentType] = {
          status: health.status || 'healthy',
          lastCheck: new Date().toISOString(),
          ...health
        };
        
        if (health.status !== 'healthy') {
          allHealthy = false;
        }
        
      } catch (error) {
        agents[agentType] = {
          status: 'unhealthy',
          lastCheck: new Date().toISOString(),
          error: error.message
        };
        allHealthy = false;
      }
    }
    
    return {
      healthy: allHealthy,
      agents
    };
  }

  /**
   * Get capabilities for all agents
   * @returns {Object} Capabilities object keyed by agent type
   */
  async getCapabilities() {
    const capabilities = {};
    
    for (const [agentType, agent] of this.agents) {
      if (agent.capabilities) {
        capabilities[agentType] = agent.capabilities;
      }
    }
    
    return capabilities;
  }

  /**
   * Shutdown all agents gracefully
   */
  async shutdown() {
    unifiedLogger.info('Shutting down A2A agents', {
      service: 'agentInitializationService',
      method: 'shutdown',
      agentCount: this.agents.size
    });
    
    for (const [agentType, agent] of this.agents) {
      try {
        // Call agent cleanup if available
        if (agent.cleanup && typeof agent.cleanup === 'function') {
          await agent.cleanup();
        }
        
        // Remove all listeners if agent is EventEmitter
        if (agent.removeAllListeners && typeof agent.removeAllListeners === 'function') {
          agent.removeAllListeners();
        }
        
        unifiedLogger.debug('Agent shutdown complete', {
          service: 'agentInitializationService',
          method: 'shutdown',
          agentType
        });
        
      } catch (error) {
        unifiedLogger.error('Error shutting down agent', {
          service: 'agentInitializationService',
          method: 'shutdown',
          agentType,
          error: error.message
        });
      }
    }
    
    this.agents.clear();
    this.healthCheckResults.clear();
    this.initialized = false;
    
    // Also reset the task manager and executor
    await a2aTaskManager.reset();
    await agentExecutor.shutdown();
  }
}

// Export singleton instance
export default new AgentInitializationService();