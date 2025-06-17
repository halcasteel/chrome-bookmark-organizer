# A2A Testing Strategy
## Testing Framework Updates for Agent2Agent Architecture Migration

### Overview
This document outlines the testing strategy for migrating from the legacy orchestrator system to the Google A2A-compliant agent architecture. All tests must validate the new task-centric, artifact-based workflow while maintaining the "REAL TESTING" philosophy (no mocks).

### Core Testing Principles for A2A

1. **Task-Centric Testing**: Every workflow is a task with persistent state
2. **Artifact Validation**: All agent outputs are immutable artifacts
3. **Message Stream Testing**: Progress updates via SSE must be tested
4. **Agent Independence**: Each agent must be testable in isolation
5. **Real Services Only**: No mocks - use actual PostgreSQL, Redis, and services

### Test Categories for A2A Migration

#### 1. Agent Unit Tests
Each agent must have comprehensive unit tests validating:
- Capability declaration (AgentCard)
- Input validation against capabilities
- Task processing lifecycle
- Artifact creation
- Error handling
- Progress reporting

```typescript
// Example: Import Agent Unit Test Pattern
describe('ImportAgent', () => {
  let agent: ImportAgent;
  let taskManager: A2ATaskManager;
  
  beforeEach(async () => {
    agent = new ImportAgent();
    taskManager = new A2ATaskManager();
    taskManager.registerAgent(agent);
  });

  describe('capabilities', () => {
    it('should declare correct inputs and outputs', () => {
      const card = agent.getAgentCard();
      expect(card.capabilities.inputs).toHaveProperty('filePath');
      expect(card.capabilities.outputs.type).toBe('bookmark_import_result');
    });
  });

  describe('task processing', () => {
    it('should parse HTML and create bookmark artifacts', async () => {
      const task = await taskManager.createTask('import', {
        filePath: 'test-bookmarks.html',
        userId: 'test-user',
        importId: 'test-import'
      });
      
      // Wait for completion
      await waitForTaskCompletion(task.id);
      
      const completedTask = await taskManager.getTask(task.id);
      expect(completedTask.status).toBe('completed');
      expect(completedTask.artifacts).toHaveLength(1);
      expect(completedTask.artifacts[0].type).toBe('bookmark_import_result');
    });
  });
});
```

#### 2. Task Manager Integration Tests
Test the A2A task management system:
- Task creation and lifecycle
- Agent registration and discovery
- Workflow orchestration
- Task persistence and recovery
- Message and artifact storage

```typescript
// Example: Task Manager Integration Test
describe('A2ATaskManager Integration', () => {
  describe('workflow execution', () => {
    it('should execute full import workflow', async () => {
      // Register all agents
      taskManager.registerAgent(importAgent);
      taskManager.registerAgent(validationAgent);
      taskManager.registerAgent(enrichmentAgent);
      
      // Create workflow task
      const task = await taskManager.createTask('full_import', {
        filePath: 'large-bookmarks.html',
        userId: 'test-user'
      });
      
      // Monitor progress via SSE
      const messages = [];
      taskManager.on('task:progress', (msg) => messages.push(msg));
      
      // Wait for completion
      await waitForTaskCompletion(task.id);
      
      // Validate workflow execution
      expect(messages).toContainEqual(
        expect.objectContaining({ 
          agentType: 'import',
          type: 'completion' 
        })
      );
    });
  });
});
```

#### 3. E2E Tests for A2A Workflows
End-to-end tests validating complete user flows:

```typescript
// Example: Import Workflow E2E Test
test('complete bookmark import workflow', async ({ page }) => {
  // Login
  await page.goto('/login');
  await loginAsTestUser(page);
  
  // Navigate to import
  await page.goto('/import');
  
  // Upload file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('test-data/bookmarks-5000.html');
  
  // Start import
  await page.click('button:has-text("Import")');
  
  // Monitor SSE progress updates
  await page.waitForSelector('[data-testid="import-progress"]');
  
  // Validate progress messages
  await expect(page.locator('[data-testid="agent-status-import"]'))
    .toContainText('completed');
  
  // Verify bookmarks imported
  await page.goto('/bookmarks');
  await expect(page.locator('[data-testid="bookmark-count"]'))
    .toContainText('5000');
});
```

#### 4. Performance Tests for A2A
Validate system performance under load:

```typescript
// Example: Agent Performance Test
describe('A2A Performance', () => {
  it('should handle 10,000 bookmarks in under 60 seconds', async () => {
    const startTime = Date.now();
    
    const task = await taskManager.createTask('full_import', {
      filePath: 'benchmark-10k-bookmarks.html',
      userId: 'perf-test-user'
    });
    
    await waitForTaskCompletion(task.id, { timeout: 60000 });
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(60000);
    
    // Validate all bookmarks processed
    const finalTask = await taskManager.getTask(task.id);
    const artifact = finalTask.artifacts[0];
    expect(artifact.data.totalBookmarks).toBe(10000);
  });
});
```

### Test Data Requirements

#### 1. Bookmark Test Files
- `test-bookmarks-minimal.html` - 10 bookmarks for quick tests
- `test-bookmarks-standard.html` - 100 bookmarks for integration
- `test-bookmarks-large.html` - 5,000 bookmarks for E2E
- `test-bookmarks-huge.html` - 50,000 bookmarks for performance

#### 2. Task Test Data
```sql
-- Test task data for various states
INSERT INTO a2a_tasks (id, type, status, workflow_type, workflow_agents)
VALUES 
  ('test-task-pending', 'full_import', 'pending', 'full_import', ARRAY['import', 'validation']),
  ('test-task-running', 'full_import', 'running', 'full_import', ARRAY['import', 'validation']),
  ('test-task-completed', 'full_import', 'completed', 'full_import', ARRAY['import', 'validation']),
  ('test-task-failed', 'full_import', 'failed', 'full_import', ARRAY['import', 'validation']);
```

### Migration Testing Checklist

#### Phase 1: Foundation Testing
- [ ] A2A base agent class unit tests
- [ ] Task manager unit tests
- [ ] Database schema migration tests
- [ ] Agent discovery endpoint tests
- [ ] SSE streaming tests

#### Phase 2: Agent Testing
- [ ] Import agent unit tests
- [ ] Import agent integration tests
- [ ] Validation agent unit tests (Playwright)
- [ ] Agent-to-agent transition tests
- [ ] Artifact persistence tests

#### Phase 3: Workflow Testing
- [ ] Full import workflow E2E test
- [ ] Partial workflow tests
- [ ] Workflow failure recovery tests
- [ ] Concurrent workflow tests
- [ ] Large file performance tests

#### Phase 4: UI Integration Testing
- [ ] Import page A2A integration
- [ ] Workflow view real-time updates
- [ ] Task management UI
- [ ] Error display and recovery
- [ ] Progress visualization

### Test Utilities for A2A

```typescript
// Test utilities specific to A2A testing
export class A2ATestUtils {
  static async waitForTaskCompletion(
    taskManager: A2ATaskManager, 
    taskId: string, 
    options = { timeout: 30000 }
  ): Promise<Task> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < options.timeout) {
      const task = await taskManager.getTask(taskId);
      if (task.status === 'completed' || task.status === 'failed') {
        return task;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Task ${taskId} did not complete within timeout`);
  }

  static async createTestTask(
    type: string, 
    context: any
  ): Promise<Task> {
    // Create task with test data
  }

  static async validateArtifact(
    artifact: Artifact, 
    expectedType: string,
    schema: any
  ): Promise<void> {
    expect(artifact.type).toBe(expectedType);
    expect(artifact.immutable).toBe(true);
    // Validate against schema
  }
}
```

### CI/CD Updates for A2A

Update GitHub Actions to include A2A tests:

```yaml
# .github/workflows/a2a-tests.yml
name: A2A Architecture Tests
on: [push, pull_request]

jobs:
  test-a2a:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        ports:
          - 5434:5432
      redis:
        image: redis:7-alpine
        ports:
          - 6382:6379
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run A2A migrations
        run: npm run db:migrate:a2a
      
      - name: Run A2A unit tests
        run: npm run test:a2a:unit
      
      - name: Run A2A integration tests
        run: npm run test:a2a:integration
      
      - name: Run A2A E2E tests
        run: npm run test:a2a:e2e
      
      - name: Upload test artifacts
        uses: actions/upload-artifact@v3
        with:
          name: a2a-test-results
          path: |
            test-results/
            coverage/
```

### Monitoring & Reporting

1. **Test Coverage Requirements**
   - Agent code: 90% coverage
   - Task Manager: 95% coverage
   - API routes: 85% coverage
   - Overall: 80% minimum

2. **Performance Benchmarks**
   - Import: 1000 bookmarks/minute minimum
   - Task creation: < 100ms
   - Agent transition: < 1 second
   - SSE latency: < 500ms

3. **Test Reports**
   - Daily test execution summary
   - Agent performance metrics
   - Workflow success rates
   - Error categorization

### Best Practices

1. **Test Isolation**: Each test must clean up its tasks/artifacts
2. **Real Data**: Use production-like bookmark files
3. **Concurrent Testing**: Test multiple workflows simultaneously
4. **Error Scenarios**: Test every failure path
5. **Progress Validation**: Verify all progress messages
6. **Artifact Immutability**: Ensure artifacts cannot be modified

This testing strategy ensures the A2A migration maintains quality while transitioning to the new architecture.