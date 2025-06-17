import { EventEmitter } from 'events';
import pg from 'pg';
import { chromium, firefox, webkit } from 'playwright';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import unifiedLogger from '../../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * AI-Driven Test Orchestrator
 * Manages test execution with full database integration and real-time visibility
 */
class TestOrchestrator extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.logger = unifiedLogger;
    this.db = null;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.wsServer = null;
    this.activeTests = new Map();
    this.executionId = crypto.randomUUID();
    this.status = 'idle';
  }

  async initialize() {
    this.logger.info('Initializing Test Orchestrator');
    
    // Initialize database connection
    await this.initializeDatabase();
    
    // Start WebSocket server for real-time updates
    await this.startWebSocketServer();
    
    // Load test plans from database
    await this.loadTestPlans();
    
    this.emit('initialized', { 
      executionId: this.executionId,
      timestamp: new Date() 
    });
  }

  async initializeDatabase() {
    this.db = new pg.Pool(this.config.database);
    
    // Test connection
    const client = await this.db.connect();
    await client.query('SELECT 1');
    client.release();
    
    this.logger.info('Database connection established');
  }

  async startWebSocketServer() {
    const port = this.config.wsPort || 3004;
    this.wsServer = new WebSocketServer({ port });
    
    this.wsServer.on('connection', (ws) => {
      this.logger.info('Test viewer connected');
      
      // Send current status
      ws.send(JSON.stringify({
        type: 'status',
        data: {
          orchestratorStatus: this.status,
          activeTests: Array.from(this.activeTests.values())
        }
      }));
      
      // Handle client messages
      ws.on('message', async (message) => {
        const msg = JSON.parse(message.toString());
        await this.handleClientMessage(msg, ws);
      });
    });
    
    this.logger.info(`WebSocket server started on port ${port}`);
  }

  async loadTestPlans() {
    const result = await this.db.query(`
      SELECT tp.*, 
             COUNT(DISTINCT ts.id) as suite_count,
             COUNT(DISTINCT tc.id) as test_count
      FROM test_plans tp
      LEFT JOIN test_suites ts ON ts.plan_id = tp.id
      LEFT JOIN test_cases tc ON tc.suite_id = ts.id
      WHERE tp.status = 'approved'
      GROUP BY tp.id
      ORDER BY tp.created_at DESC
    `);
    
    this.testPlans = result.rows;
    this.logger.info(`Loaded ${this.testPlans.length} test plans`);
  }

  async executeTestPlan(planId) {
    this.status = 'executing';
    const startTime = Date.now();
    
    try {
      // Load complete test plan from database
      const testPlan = await this.loadTestPlanFromDatabase(planId);
      
      // Create execution record
      const executionRecord = await this.createExecutionRecord(testPlan);
      
      // Broadcast execution start
      this.broadcast({
        type: 'executionStarted',
        data: {
          executionId: executionRecord.id,
          testPlan: testPlan.name,
          totalSuites: testPlan.suites.length,
          totalTests: testPlan.suites.reduce((sum, s) => sum + s.testCases.length, 0)
        }
      });
      
      // Execute test suites
      for (const suite of testPlan.suites) {
        await this.executeTestSuite(suite, executionRecord);
      }
      
      // Generate final report
      const report = await this.generateExecutionReport(executionRecord.id);
      
      // Update execution record
      await this.updateExecutionRecord(executionRecord.id, {
        status: 'completed',
        completedAt: new Date(),
        duration: Date.now() - startTime,
        report
      });
      
      this.broadcast({
        type: 'executionCompleted',
        data: report
      });
      
    } catch (error) {
      this.logger.error('Test plan execution failed', error);
      this.broadcast({
        type: 'executionError',
        data: {
          error: error.message,
          stack: error.stack
        }
      });
    } finally {
      this.status = 'idle';
      await this.cleanup();
    }
  }

  async loadTestPlanFromDatabase(planId) {
    // Load test plan with all suites and test cases
    const planResult = await this.db.query(
      'SELECT * FROM test_plans WHERE id = $1',
      [planId]
    );
    
    const plan = planResult.rows[0];
    
    // Load test suites
    const suitesResult = await this.db.query(
      'SELECT * FROM test_suites WHERE plan_id = $1 ORDER BY priority DESC, name',
      [planId]
    );
    
    plan.suites = suitesResult.rows;
    
    // Load test cases for each suite
    for (const suite of plan.suites) {
      const casesResult = await this.db.query(
        'SELECT * FROM test_cases WHERE suite_id = $1 ORDER BY priority DESC, name',
        [suite.id]
      );
      
      suite.testCases = casesResult.rows;
      
      // Parse JSON fields
      suite.testCases = suite.testCases.map(tc => ({
        ...tc,
        steps: JSON.parse(tc.steps || '[]'),
        expected_results: JSON.parse(tc.expected_results || '[]'),
        test_data: JSON.parse(tc.test_data || '{}')
      }));
    }
    
    return plan;
  }

  async createExecutionRecord(testPlan) {
    const result = await this.db.query(`
      INSERT INTO test_executions 
      (id, test_case_id, execution_id, run_id, status, started_at, executed_by, environment)
      VALUES ($1, NULL, $2, $3, 'running', NOW(), $4, $5)
      RETURNING *
    `, [
      crypto.randomUUID(),
      `EXEC-${Date.now()}`,
      this.executionId,
      process.env.USER || 'ai-orchestrator',
      JSON.stringify({
        os: process.platform,
        node: process.version,
        testPlan: testPlan.name
      })
    ]);
    
    return result.rows[0];
  }

  async executeTestSuite(suite, executionRecord) {
    this.logger.info(`Executing test suite: ${suite.name}`);
    
    this.broadcast({
      type: 'suiteStarted',
      data: {
        suiteId: suite.id,
        suiteName: suite.name,
        testCount: suite.testCases.length
      }
    });
    
    // Initialize browser for this suite
    await this.initializeBrowser(suite.browser || 'chromium');
    
    // Execute each test case
    for (const testCase of suite.testCases) {
      await this.executeTestCase(testCase, suite, executionRecord);
    }
    
    this.broadcast({
      type: 'suiteCompleted',
      data: {
        suiteId: suite.id,
        suiteName: suite.name
      }
    });
  }

  async executeTestCase(testCase, suite, executionRecord) {
    const testStartTime = Date.now();
    const testExecutionId = crypto.randomUUID();
    
    this.logger.info(`Executing test case: ${testCase.name}`);
    
    // Create test execution record
    const testExecution = await this.db.query(`
      INSERT INTO test_executions
      (id, test_case_id, execution_id, run_id, status, started_at, executed_by, environment, test_data_used)
      VALUES ($1, $2, $3, $4, 'running', NOW(), $5, $6, $7)
      RETURNING *
    `, [
      testExecutionId,
      testCase.id,
      `EXEC-${testCase.test_id}-${Date.now()}`,
      this.executionId,
      'ai-orchestrator',
      JSON.stringify({ browser: this.browser.name }),
      JSON.stringify(testCase.test_data)
    ]);
    
    this.activeTests.set(testCase.id, {
      testCase,
      status: 'running',
      startTime: testStartTime
    });
    
    this.broadcast({
      type: 'testStarted',
      data: {
        testId: testCase.test_id,
        testName: testCase.name,
        suite: suite.name
      }
    });
    
    let testResult = {
      status: 'passed',
      steps: [],
      screenshots: [],
      errors: []
    };
    
    try {
      // Execute preconditions
      if (testCase.preconditions) {
        await this.executePreconditions(testCase.preconditions);
      }
      
      // Execute test steps
      for (const step of testCase.steps) {
        const stepResult = await this.executeTestStep(step, testCase, testExecutionId);
        testResult.steps.push(stepResult);
        
        if (!stepResult.passed) {
          testResult.status = 'failed';
          
          // Create PR/PQ for failure
          await this.createProblemReport(testCase, step, stepResult, testExecutionId);
          
          if (step.errorHandling?.criticalError) {
            break; // Stop execution on critical error
          }
        }
      }
      
    } catch (error) {
      this.logger.error(`Test case failed: ${testCase.name}`, error);
      testResult.status = 'failed';
      testResult.errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: new Date()
      });
      
      // Create PR for unexpected error
      await this.createProblemReport(testCase, null, {
        error: error.message,
        stack: error.stack
      }, testExecutionId);
    }
    
    // Update test execution record
    await this.db.query(`
      UPDATE test_executions
      SET status = $1, completed_at = NOW(), duration_ms = $2,
          steps_executed = $3, screenshots = $4, error_message = $5
      WHERE id = $6
    `, [
      testResult.status,
      Date.now() - testStartTime,
      JSON.stringify(testResult.steps),
      testResult.screenshots,
      testResult.errors[0]?.message,
      testExecutionId
    ]);
    
    this.activeTests.delete(testCase.id);
    
    this.broadcast({
      type: 'testCompleted',
      data: {
        testId: testCase.test_id,
        testName: testCase.name,
        status: testResult.status,
        duration: Date.now() - testStartTime,
        errorCount: testResult.errors.length
      }
    });
    
    return testResult;
  }

  async executeTestStep(step, testCase, executionId) {
    const stepStartTime = Date.now();
    
    this.broadcast({
      type: 'stepStarted',
      data: {
        testId: testCase.test_id,
        stepNumber: step.stepNumber,
        description: step.description,
        action: step.action.type
      }
    });
    
    const stepResult = {
      stepNumber: step.stepNumber,
      description: step.description,
      passed: false,
      duration: 0,
      screenshots: [],
      logs: []
    };
    
    try {
      // Execute action
      const actionResult = await this.executeAction(step.action);
      stepResult.actionResult = actionResult;
      
      // Wait if specified
      if (step.action.parameters?.waitAfter) {
        await this.page.waitForTimeout(step.action.parameters.waitAfter);
      }
      
      // Execute validation
      const validationResult = await this.executeValidation(step.validation);
      stepResult.validationResult = validationResult;
      stepResult.passed = validationResult.passed;
      
      // Take screenshot if configured
      if (this.config.screenshotOnStep || !stepResult.passed) {
        const screenshot = await this.takeScreenshot(
          `${testCase.test_id}-step${step.stepNumber}`
        );
        stepResult.screenshots.push(screenshot);
      }
      
      // Extract data if specified
      if (step.validation.extractData) {
        await this.extractAndStoreData(step.validation.extractData);
      }
      
    } catch (error) {
      stepResult.passed = false;
      stepResult.error = {
        message: error.message,
        stack: error.stack,
        selector: step.action.target?.selector,
        action: step.action.type
      };
      
      // Take error screenshot
      const screenshot = await this.takeScreenshot(
        `${testCase.test_id}-step${step.stepNumber}-error`
      );
      stepResult.screenshots.push(screenshot);
      
      // Try error recovery if specified
      if (step.errorHandling?.retryCount > 0) {
        this.logger.info(`Retrying step ${step.stepNumber}`);
        // Implement retry logic
      }
    }
    
    stepResult.duration = Date.now() - stepStartTime;
    
    this.broadcast({
      type: 'stepCompleted',
      data: {
        testId: testCase.test_id,
        stepNumber: step.stepNumber,
        passed: stepResult.passed,
        duration: stepResult.duration,
        error: stepResult.error
      }
    });
    
    // Log step result to database
    await this.logStepResult(executionId, stepResult);
    
    return stepResult;
  }

  async executeAction(action) {
    const { type, target, parameters } = action;
    
    this.logger.debug(`Executing action: ${type}`, { target, parameters });
    
    switch (type) {
      case 'navigate':
        await this.page.goto(parameters.url, {
          waitUntil: 'networkidle',
          timeout: parameters.timeout || 30000
        });
        break;
        
      case 'click':
        const element = await this.findElement(target);
        await element.click();
        break;
        
      case 'type':
        const input = await this.findElement(target);
        await input.fill(parameters.value);
        break;
        
      case 'select':
        const select = await this.findElement(target);
        await select.selectOption(parameters.value);
        break;
        
      case 'wait':
        await this.page.waitForTimeout(parameters.value);
        break;
        
      case 'screenshot':
        await this.takeScreenshot(parameters.name || 'action-screenshot');
        break;
        
      case 'executeScript':
        await this.page.evaluate(parameters.script);
        break;
        
      case 'apiCall':
        return await this.executeAPICall(parameters);
        
      case 'databaseQuery':
        return await this.executeDatabaseQuery(parameters);
        
      default:
        throw new Error(`Unknown action type: ${type}`);
    }
    
    return { success: true, type };
  }

  async executeValidation(validation) {
    const { type, target, expected, operator } = validation;
    
    this.logger.debug(`Executing validation: ${type}`, { expected });
    
    let actual;
    let passed = false;
    
    try {
      switch (type) {
        case 'elementExists':
          const exists = await this.page.locator(target.selector).count() > 0;
          passed = exists === expected;
          actual = exists;
          break;
          
        case 'elementVisible':
          const visible = await this.page.locator(target.selector).isVisible();
          passed = visible === expected;
          actual = visible;
          break;
          
        case 'textEquals':
          const text = await this.page.locator(target.selector).textContent();
          passed = text?.trim() === expected;
          actual = text?.trim();
          break;
          
        case 'textContains':
          const content = await this.page.locator(target.selector).textContent();
          passed = content?.includes(expected);
          actual = content;
          break;
          
        case 'urlEquals':
          const url = this.page.url();
          passed = url === expected;
          actual = url;
          break;
          
        case 'urlContains':
          const currentUrl = this.page.url();
          passed = currentUrl.includes(expected);
          actual = currentUrl;
          break;
          
        case 'networkRequestMade':
          // Check if network request was made
          passed = await this.checkNetworkRequest(expected);
          break;
          
        case 'databaseRecordExists':
          const result = await this.checkDatabaseRecord(expected);
          passed = result.exists;
          actual = result.record;
          break;
          
        default:
          throw new Error(`Unknown validation type: ${type}`);
      }
      
    } catch (error) {
      passed = false;
      actual = error.message;
    }
    
    return {
      type,
      expected,
      actual,
      passed,
      operator
    };
  }

  async findElement(target) {
    let locator;
    
    switch (target.selectorType) {
      case 'css':
        locator = this.page.locator(target.selector);
        break;
      case 'xpath':
        locator = this.page.locator(`xpath=${target.selector}`);
        break;
      case 'text':
        locator = this.page.getByText(target.selector);
        break;
      case 'role':
        locator = this.page.getByRole(target.selector);
        break;
      case 'testId':
        locator = this.page.getByTestId(target.selector);
        break;
      default:
        locator = this.page.locator(target.selector);
    }
    
    // Try alternative selectors if main fails
    try {
      await locator.waitFor({ timeout: 5000 });
    } catch (error) {
      if (target.alternativeSelectors) {
        for (const altSelector of target.alternativeSelectors) {
          try {
            locator = this.page.locator(altSelector);
            await locator.waitFor({ timeout: 2000 });
            break;
          } catch (e) {
            // Continue to next alternative
          }
        }
      }
    }
    
    return locator;
  }

  async createProblemReport(testCase, step, error, executionId) {
    // Create test issue
    const issue = await this.db.query(`
      INSERT INTO test_issues
      (id, execution_id, issue_number, title, description, severity, status, affected_tests, affected_components)
      VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8)
      RETURNING *
    `, [
      crypto.randomUUID(),
      executionId,
      `ISS-${Date.now()}`,
      `Test Failure: ${testCase.name}${step ? ` - Step ${step.stepNumber}` : ''}`,
      this.generateIssueDescription(testCase, step, error),
      this.determineSeverity(testCase, error),
      [testCase.id],
      this.identifyAffectedComponents(testCase, step)
    ]);
    
    // Create PR (Problem Report)
    const pr = await this.db.query(`
      INSERT INTO problem_reports
      (id, pr_number, issue_id, type, title, description, steps_to_reproduce, 
       expected_behavior, actual_behavior, impact_analysis, priority, category,
       reported_by, reported_date, status, attachments)
      VALUES ($1, $2, $3, 'PR', $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 'open', $13)
      RETURNING *
    `, [
      crypto.randomUUID(),
      `PR-${Date.now()}`,
      issue.rows[0].id,
      issue.rows[0].title,
      this.generatePRDescription(testCase, step, error),
      this.generateStepsToReproduce(testCase, step),
      step ? step.validation?.expected : 'Test should pass',
      error.message || 'Test failed',
      this.analyzeImpact(testCase),
      testCase.priority || 'medium',
      this.categorizeError(error),
      'ai-orchestrator',
      JSON.stringify({
        testCase: testCase.test_id,
        screenshots: error.screenshots || [],
        logs: error.logs || []
      })
    ]);
    
    this.broadcast({
      type: 'issueCreated',
      data: {
        issueNumber: issue.rows[0].issue_number,
        prNumber: pr.rows[0].pr_number,
        testCase: testCase.test_id,
        severity: issue.rows[0].severity
      }
    });
    
    return { issue: issue.rows[0], pr: pr.rows[0] };
  }

  generateIssueDescription(testCase, step, error) {
    return `
## Test Failure Details

**Test Case**: ${testCase.test_id} - ${testCase.name}
**Step**: ${step ? `${step.stepNumber} - ${step.description}` : 'Test initialization'}
**Error Type**: ${error.name || 'Unknown'}

### Error Details
\`\`\`
${error.message || error}
\`\`\`

### Stack Trace
\`\`\`
${error.stack || 'No stack trace available'}
\`\`\`

### Context
- **Action**: ${step?.action?.type || 'N/A'}
- **Target**: ${step?.action?.target?.selector || 'N/A'}
- **Expected**: ${JSON.stringify(step?.validation?.expected) || 'N/A'}
- **Actual**: ${JSON.stringify(error.actual) || 'Unknown'}

### AI Context
${step?.aiContext?.purposeOfStep || 'No AI context provided'}

### Environment
- Browser: ${this.browser?.name || 'Unknown'}
- OS: ${process.platform}
- Node: ${process.version}
- Timestamp: ${new Date().toISOString()}
    `.trim();
  }

  generatePRDescription(testCase, step, error) {
    return `
## Problem Report

This automated test has failed and requires investigation.

### Summary
The test "${testCase.name}" failed ${step ? `at step ${step.stepNumber}` : 'during initialization'}.

### Technical Details
- **Test ID**: ${testCase.test_id}
- **Test Type**: ${testCase.type}
- **Priority**: ${testCase.priority}
- **Automated**: Yes

### Failure Information
- **Error Type**: ${this.categorizeError(error)}
- **Failure Point**: ${step?.description || 'Test setup'}
- **Root Cause**: To be determined

### Debugging Information
${testCase.aiInstructions?.debuggingHints?.join('\n') || 'No debugging hints available'}

### Common Issues to Check
${testCase.aiInstructions?.commonIssues?.join('\n') || 'No common issues documented'}
    `.trim();
  }

  generateStepsToReproduce(testCase, failedStep) {
    const steps = [];
    
    // Add preconditions
    if (testCase.preconditions) {
      steps.push('Preconditions:');
      testCase.preconditions.forEach(pre => {
        steps.push(`- ${pre.description}`);
      });
      steps.push('');
    }
    
    // Add test steps up to failure
    steps.push('Steps to Reproduce:');
    for (const step of testCase.steps) {
      steps.push(`${step.stepNumber}. ${step.description}`);
      steps.push(`   Action: ${step.action.type} on ${step.action.target?.selector || 'N/A'}`);
      steps.push(`   Expected: ${JSON.stringify(step.validation.expected)}`);
      
      if (step.stepNumber === failedStep?.stepNumber) {
        steps.push(`   ❌ FAILED AT THIS STEP`);
        break;
      }
    }
    
    return steps.join('\n');
  }

  determineSeverity(testCase, error) {
    if (testCase.priority === 'critical') return 'critical';
    if (error.name === 'TimeoutError') return 'high';
    if (testCase.type === 'smoke') return 'high';
    return 'medium';
  }

  categorizeError(error) {
    if (error.name === 'TimeoutError') return 'timeout';
    if (error.message?.includes('not found')) return 'element-not-found';
    if (error.message?.includes('network')) return 'network';
    if (error.message?.includes('permission')) return 'permission';
    return 'functional';
  }

  identifyAffectedComponents(testCase, step) {
    const components = [];
    
    // Extract from test case metadata
    if (testCase.components) {
      components.push(...testCase.components);
    }
    
    // Extract from step target
    if (step?.action?.target?.selector) {
      const selector = step.action.target.selector;
      // Extract component hints from selector
      if (selector.includes('bookmark')) components.push('bookmarks');
      if (selector.includes('auth')) components.push('authentication');
      if (selector.includes('collection')) components.push('collections');
    }
    
    return [...new Set(components)];
  }

  analyzeImpact(testCase) {
    const impacts = [];
    
    if (testCase.priority === 'critical') {
      impacts.push('Critical functionality affected - blocks user workflow');
    }
    
    if (testCase.type === 'smoke') {
      impacts.push('Basic functionality broken - affects all users');
    }
    
    if (testCase.dependencies?.length > 0) {
      impacts.push(`Blocks ${testCase.dependencies.length} dependent tests`);
    }
    
    return impacts.join('\n') || 'Impact analysis pending';
  }

  async initializeBrowser(browserType = 'chromium') {
    this.logger.info(`Initializing ${browserType} browser`);
    
    const browserOptions = {
      headless: this.config.headless ?? true,
      slowMo: this.config.slowMo || 0,
      timeout: this.config.timeout || 30000
    };
    
    switch (browserType) {
      case 'firefox':
        this.browser = await firefox.launch(browserOptions);
        break;
      case 'webkit':
        this.browser = await webkit.launch(browserOptions);
        break;
      default:
        this.browser = await chromium.launch(browserOptions);
    }
    
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: this.config.recordVideo ? { dir: './videos' } : undefined,
      ignoreHTTPSErrors: true
    });
    
    this.page = await this.context.newPage();
    
    // Set up console log capture
    this.page.on('console', msg => {
      this.logger.debug(`Browser console: ${msg.text()}`);
    });
    
    // Set up network request logging
    this.page.on('request', request => {
      this.logger.debug(`Network request: ${request.method()} ${request.url()}`);
    });
  }

  async takeScreenshot(name) {
    const screenshotPath = path.join(
      __dirname,
      '..',
      'screenshots',
      `${name}-${Date.now()}.png`
    );
    
    await this.page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    return screenshotPath;
  }

  async cleanup() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  broadcast(message) {
    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(message));
        }
      });
    }
  }

  async handleClientMessage(message, ws) {
    switch (message.type) {
      case 'executeTestPlan':
        await this.executeTestPlan(message.planId);
        break;
      case 'pauseExecution':
        this.status = 'paused';
        break;
      case 'resumeExecution':
        this.status = 'executing';
        break;
      case 'stopExecution':
        this.status = 'stopping';
        await this.cleanup();
        break;
      case 'getStatus':
        ws.send(JSON.stringify({
          type: 'status',
          data: {
            status: this.status,
            activeTests: Array.from(this.activeTests.values())
          }
        }));
        break;
    }
  }

  async generateExecutionReport(executionId) {
    const results = await this.db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'passed' THEN 1 END) as passed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped
      FROM test_executions
      WHERE run_id = $1
    `, [executionId]);
    
    const issues = await this.db.query(`
      SELECT ti.*, pr.pr_number
      FROM test_issues ti
      LEFT JOIN problem_reports pr ON pr.issue_id = ti.id
      WHERE ti.execution_id IN (
        SELECT id FROM test_executions WHERE run_id = $1
      )
    `, [executionId]);
    
    return {
      executionId,
      summary: results.rows[0],
      issues: issues.rows,
      passRate: results.rows[0].total > 0 
        ? ((results.rows[0].passed / results.rows[0].total) * 100).toFixed(2) 
        : 0
    };
  }

  async updateExecutionRecord(executionId, updates) {
    await this.db.query(`
      UPDATE test_executions
      SET status = $1, completed_at = $2, duration_ms = $3
      WHERE id = $4
    `, [updates.status, updates.completedAt, updates.duration, executionId]);
  }

  async logStepResult(executionId, stepResult) {
    // Log step execution details for AI analysis
    await this.db.query(`
      INSERT INTO test_step_results
      (id, execution_id, step_number, description, passed, duration_ms, 
       action_type, target_selector, validation_type, expected, actual,
       error_message, screenshots, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
    `, [
      crypto.randomUUID(),
      executionId,
      stepResult.stepNumber,
      stepResult.description,
      stepResult.passed,
      stepResult.duration,
      stepResult.actionResult?.type,
      stepResult.action?.target?.selector,
      stepResult.validation?.type,
      JSON.stringify(stepResult.validation?.expected),
      JSON.stringify(stepResult.validation?.actual),
      stepResult.error?.message,
      stepResult.screenshots
    ]);
  }
}

export default TestOrchestrator;