import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import agentInitializationService from '../../../backend/src/services/agentInitializationService.js';
import a2aTaskManager from '../../../backend/src/services/a2aTaskManager.js';
import db from '../../../backend/src/db/index.js';
import Bull from 'bull';

describe('Agent Registration Integration Tests', () => {
  beforeEach(async () => {
    // Clean up any existing registrations
    await agentInitializationService.reset();
    await a2aTaskManager.reset();
    
    // Clear test data - using 'created' column not 'created_at'
    await db.query('DELETE FROM a2a_tasks WHERE created < NOW()');
    await db.query('DELETE FROM a2a_artifacts WHERE created < NOW()');
    
    // Clear Redis data using Bull queue
    const testQueue = new Bull('test-cleanup', process.env.REDIS_URL || 'redis://localhost:6382');
    await testQueue.empty();
    await testQueue.close();
  });

  afterEach(async () => {
    // Clean up after tests
    await agentInitializationService.reset();
    await a2aTaskManager.reset();
  });

  it('should register all A2A agents on initialization', async () => {
    // Initialize all agents
    await agentInitializationService.initialize();
    
    // Get registered agents
    const agents = agentInitializationService.getAgents();
    
    // Verify all expected agents are registered
    expect(agents.size).toBe(4); // import, validation, enrichment, categorization
    expect(agents.has('import')).toBe(true);
    expect(agents.has('validation')).toBe(true);
    expect(agents.has('enrichment')).toBe(true);
    expect(agents.has('categorization')).toBe(true);
    
    // Verify each agent has required properties
    for (const [agentType, agent] of agents) {
      expect(agent).toBeDefined();
      expect(agent.agentType).toBe(agentType);
      expect(agent.capabilities).toBeDefined();
      expect(agent.processTask).toBeDefined();
      expect(typeof agent.processTask).toBe('function');
    }
  });

  it('should handle agent registration failures gracefully', async () => {
    // Create a failing agent
    const failingAgent = {
      agentType: 'failing',
      capabilities: {},
      processTask: () => {}, // Add required method
      getAgentCard: () => ({ version: '1.0.0', capabilities: {} }), // Add required method
      initialize: async () => { 
        throw new Error('Agent initialization failed'); 
      }
    };
    
    // Attempt to register failing agent
    await expect(
      agentInitializationService.registerAgent(failingAgent)
    ).rejects.toThrow('Agent initialization failed');
    
    // Verify the agent was not added to registry
    const agents = agentInitializationService.getAgents();
    expect(agents.has('failing')).toBe(false);
  });

  it('should make agents discoverable via task manager', async () => {
    // Initialize agents
    await agentInitializationService.initialize();
    
    // Get agent from task manager
    const importAgent = await a2aTaskManager.getAgent('import');
    
    // Verify agent is accessible
    expect(importAgent).toBeDefined();
    expect(importAgent.agentType).toBe('import');
    expect(importAgent.capabilities).toBeDefined();
    expect(importAgent.capabilities.description).toContain('bookmark files');
  });

  it('should support agent health checks', async () => {
    // Initialize agents
    await agentInitializationService.initialize();
    
    // Check health of all agents
    const healthStatus = await agentInitializationService.checkHealth();
    
    expect(healthStatus).toBeDefined();
    expect(healthStatus.healthy).toBe(true);
    expect(healthStatus.agents).toBeDefined();
    expect(Object.keys(healthStatus.agents).length).toBe(4);
    
    // Verify each agent health
    for (const agentType of ['import', 'validation', 'enrichment', 'categorization']) {
      expect(healthStatus.agents[agentType]).toBeDefined();
      expect(healthStatus.agents[agentType].status).toBe('healthy');
      expect(healthStatus.agents[agentType].lastCheck).toBeDefined();
    }
  });

  it('should prevent duplicate agent registration', async () => {
    // Initialize agents first time
    await agentInitializationService.initialize();
    const firstCount = agentInitializationService.getAgents().size;
    
    // Try to initialize again
    await agentInitializationService.initialize();
    const secondCount = agentInitializationService.getAgents().size;
    
    // Should not duplicate agents
    expect(secondCount).toBe(firstCount);
  });

  it('should register agents with task manager for workflow orchestration', async () => {
    // Initialize agents
    await agentInitializationService.initialize();
    
    // Verify task manager has access to all agents
    const taskManagerAgents = await a2aTaskManager.getRegisteredAgents();
    
    expect(taskManagerAgents).toBeDefined();
    expect(taskManagerAgents.length).toBe(4);
    
    const agentTypes = taskManagerAgents.map(a => a.agentType);
    expect(agentTypes).toContain('import');
    expect(agentTypes).toContain('validation');
    expect(agentTypes).toContain('enrichment');
    expect(agentTypes).toContain('categorization');
  });

  it('should clean up resources on reset', async () => {
    // Initialize agents
    await agentInitializationService.initialize();
    expect(agentInitializationService.getAgents().size).toBe(4);
    
    // Reset
    await agentInitializationService.reset();
    
    // Verify cleanup
    expect(agentInitializationService.getAgents().size).toBe(0);
    expect(agentInitializationService.isInitialized()).toBe(false);
  });

  it('should handle concurrent initialization requests', async () => {
    // Attempt multiple concurrent initializations
    const promises = [
      agentInitializationService.initialize(),
      agentInitializationService.initialize(),
      agentInitializationService.initialize()
    ];
    
    // All should complete without error
    await expect(Promise.all(promises)).resolves.not.toThrow();
    
    // Should still have correct number of agents
    const agents = agentInitializationService.getAgents();
    expect(agents.size).toBe(4);
  });

  it('should provide agent capability discovery', async () => {
    // Initialize agents
    await agentInitializationService.initialize();
    
    // Get capabilities for each agent
    const capabilities = await agentInitializationService.getCapabilities();
    
    expect(capabilities).toBeDefined();
    expect(Object.keys(capabilities).length).toBe(4);
    
    // Verify import agent capabilities
    expect(capabilities.import).toBeDefined();
    expect(capabilities.import.inputs).toBeDefined();
    expect(capabilities.import.outputs).toBeDefined();
    expect(capabilities.import.inputs.filePath).toBeDefined();
    
    // Verify validation agent capabilities
    expect(capabilities.validation).toBeDefined();
    expect(capabilities.validation.inputs.bookmarkIds).toBeDefined();
    
    // Verify enrichment agent capabilities
    expect(capabilities.enrichment).toBeDefined();
    expect(capabilities.enrichment.inputs.bookmarkIds).toBeDefined();
    
    // Verify categorization agent capabilities
    expect(capabilities.categorization).toBeDefined();
    expect(capabilities.categorization.inputs.bookmarkIds).toBeDefined();
  });

  it('should support agent lifecycle hooks', async () => {
    // Track lifecycle events
    const lifecycleEvents = [];
    
    // Add lifecycle tracking
    agentInitializationService.on('agent:registered', (agentType) => {
      lifecycleEvents.push(`registered:${agentType}`);
    });
    
    agentInitializationService.on('agent:initialized', (agentType) => {
      lifecycleEvents.push(`initialized:${agentType}`);
    });
    
    // Initialize agents
    await agentInitializationService.initialize();
    
    // Verify lifecycle events fired
    expect(lifecycleEvents.length).toBeGreaterThan(0);
    expect(lifecycleEvents).toContain('registered:import');
    expect(lifecycleEvents).toContain('initialized:import');
    expect(lifecycleEvents).toContain('registered:validation');
    expect(lifecycleEvents).toContain('initialized:validation');
  });
});