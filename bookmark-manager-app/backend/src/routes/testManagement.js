import express from 'express';
import { AuditableTestRunner } from '../../../testing-framework/core/auditable-test-runner.js';
import unifiedLogger from '../services/unifiedLogger.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import WebSocket from 'ws';

const router = express.Router();
const logger = unifiedLogger;

// Test execution instances - track running tests
const activeTestRuns = new Map();

// WebSocket server for real-time updates (will be initialized from main server)
let testWebSocketServer = null;

function initializeTestWebSocket(server) {
  testWebSocketServer = new WebSocket.Server({ 
    port: 3004,
    path: '/test-websocket'
  });
  
  testWebSocketServer.on('connection', (ws) => {
    logger.info('Test WebSocket client connected', {
      service: 'test-management',
      method: 'websocket-connect'
    });
    
    // Send current active test runs
    ws.send(JSON.stringify({
      type: 'active-runs',
      data: Array.from(activeTestRuns.keys())
    }));
  });
  
  logger.info('Test Management WebSocket server started on port 3004', {
    service: 'test-management',
    method: 'initialize-websocket'
  });
}

// Broadcast to all WebSocket clients
function broadcastTestUpdate(type, data) {
  if (testWebSocketServer) {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    testWebSocketServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

// GET /api/test-management/suites - Get all test suites
router.get('/suites', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await req.db.query(`
      SELECT 
        ts.id,
        ts.name,
        ts.description,
        ts.category,
        ts.created_at,
        ts.updated_at,
        COUNT(tc.id) as test_case_count,
        MAX(te.completed_at) as last_execution
      FROM test_suites ts
      LEFT JOIN test_cases tc ON ts.id = tc.suite_id
      LEFT JOIN test_executions te ON tc.id = te.test_case_id
      GROUP BY ts.id, ts.name, ts.description, ts.category, ts.created_at, ts.updated_at
      ORDER BY ts.updated_at DESC
    `);
    
    logger.info('Retrieved test suites', {
      service: 'test-management',
      method: 'get-suites',
      count: result.rows.length
    });
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Failed to retrieve test suites', {
      service: 'test-management',
      method: 'get-suites',
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve test suites'
    });
  }
});

// POST /api/test-management/suites - Create new test suite
router.post('/suites', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, category } = req.body;
    
    const result = await req.db.query(`
      INSERT INTO test_suites (name, description, category, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, description, category, req.user.email]);
    
    logger.info('Created new test suite', {
      service: 'test-management',
      method: 'create-suite',
      suiteId: result.rows[0].id,
      name
    });
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Failed to create test suite', {
      service: 'test-management',
      method: 'create-suite',
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create test suite'
    });
  }
});

// GET /api/test-management/suites/:id/cases - Get test cases for suite
router.get('/suites/:id/cases', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await req.db.query(`
      SELECT 
        tc.*,
        COUNT(te.id) as execution_count,
        MAX(te.completed_at) as last_execution,
        AVG(CASE WHEN te.status = 'passed' THEN 1 ELSE 0 END) as pass_rate
      FROM test_cases tc
      LEFT JOIN test_executions te ON tc.id = te.test_case_id
      WHERE tc.suite_id = $1
      GROUP BY tc.id
      ORDER BY tc.priority DESC, tc.created_at ASC
    `, [id]);
    
    logger.info('Retrieved test cases for suite', {
      service: 'test-management',
      method: 'get-suite-cases',
      suiteId: id,
      count: result.rows.length
    });
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('Failed to retrieve test cases', {
      service: 'test-management',
      method: 'get-suite-cases',
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve test cases'
    });
  }
});

// POST /api/test-management/execute - Execute test suite
router.post('/execute', authenticate, requireAdmin, async (req, res) => {
  try {
    const { suiteId, environment = 'development', parameters = {} } = req.body;
    
    // Get test suite and cases
    const suiteResult = await req.db.query('SELECT * FROM test_suites WHERE id = $1', [suiteId]);
    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Test suite not found'
      });
    }
    
    const casesResult = await req.db.query(`
      SELECT * FROM test_cases 
      WHERE suite_id = $1 AND enabled = true 
      ORDER BY priority DESC, created_at ASC
    `, [suiteId]);
    
    const suite = suiteResult.rows[0];
    const testCases = casesResult.rows;
    
    logger.info('Starting test suite execution', {
      service: 'test-management',
      method: 'execute-suite',
      suiteId,
      suiteName: suite.name,
      testCaseCount: testCases.length,
      environment,
      user: req.user.email
    });
    
    // Create test plan from database data
    const testPlan = {
      id: `PLAN-${Date.now()}`,
      name: suite.name,
      version: '1.0.0',
      description: suite.description,
      environment,
      parameters,
      test_cases: testCases.map(tc => {
        // Parse JSON test steps
        const testCase = {
          id: tc.id,
          test_id: tc.test_identifier,
          name: tc.name,
          description: tc.description,
          category: tc.category,
          priority: tc.priority,
          test_data: tc.test_data || {},
          steps: tc.test_steps || []
        };
        
        return testCase;
      })
    };
    
    // Initialize test runner
    const config = {
      database: {
        connectionString: process.env.DATABASE_URL
      },
      headless: environment !== 'debug',
      slowMo: environment === 'debug' ? 500 : 100,
      recordVideo: true,
      baseUrl: parameters.baseUrl || process.env.FRONTEND_URL || 'http://localhost:5173'
    };
    
    const runner = new AuditableTestRunner(config);
    
    // Start execution in background
    const executionPromise = executeTestSuiteAsync(runner, testPlan, req.user.email);
    
    // Track active run
    const runId = `RUN-${Date.now()}`;
    activeTestRuns.set(runId, {
      suite: suite.name,
      startedBy: req.user.email,
      startedAt: new Date(),
      status: 'running',
      promise: executionPromise
    });
    
    // Broadcast start
    broadcastTestUpdate('test-run-started', {
      runId,
      suite: suite.name,
      testCaseCount: testCases.length,
      startedBy: req.user.email
    });
    
    // Handle completion
    executionPromise.then(result => {
      activeTestRuns.delete(runId);
      broadcastTestUpdate('test-run-completed', {
        runId,
        result,
        completedAt: new Date()
      });
    }).catch(error => {
      activeTestRuns.delete(runId);
      broadcastTestUpdate('test-run-failed', {
        runId,
        error: error.message,
        failedAt: new Date()
      });
    });
    
    res.json({
      success: true,
      message: 'Test execution started',
      runId,
      testCaseCount: testCases.length
    });
    
  } catch (error) {
    logger.error('Failed to start test execution', {
      service: 'test-management',
      method: 'execute-suite',
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to start test execution'
    });
  }
});

// Async test execution function
async function executeTestSuiteAsync(runner, testPlan, executedBy) {
  try {
    const runId = await runner.initializeRun(testPlan);
    
    broadcastTestUpdate('test-run-initialized', {
      runId,
      artifactsPath: runner.runDir
    });
    
    const results = [];
    
    for (const testCase of testPlan.test_cases) {
      broadcastTestUpdate('test-case-started', {
        runId,
        testCase: testCase.name,
        testId: testCase.test_id
      });
      
      const result = await runner.executeTestCase(testCase);
      results.push(result);
      
      broadcastTestUpdate('test-case-completed', {
        runId,
        testCase: testCase.name,
        testId: testCase.test_id,
        status: result.status,
        duration: result.duration,
        screenshots: result.artifacts.screenshots.length
      });
    }
    
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: 0
    };
    
    await runner.finalizeRun(summary);
    
    logger.info('Test suite execution completed', {
      service: 'test-management',
      method: 'execute-suite-async',
      runId,
      summary,
      executedBy
    });
    
    return {
      runId,
      summary,
      results,
      artifactsPath: runner.runDir
    };
    
  } catch (error) {
    logger.error('Test suite execution failed', {
      service: 'test-management',
      method: 'execute-suite-async',
      error: error.message,
      executedBy
    });
    throw error;
  }
}

// GET /api/test-management/runs - Get test run history
router.get('/runs', authenticate, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    
    let query = `
      SELECT 
        run_id,
        started_at,
        completed_at,
        status,
        total_tests,
        passed,
        failed,
        skipped,
        created_by,
        git_branch,
        git_commit
      FROM test_runs
    `;
    
    const params = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY started_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await req.db.query(query, params);
    
    // Also get active runs
    const activeRuns = Array.from(activeTestRuns.entries()).map(([runId, info]) => ({
      run_id: runId,
      started_at: info.startedAt,
      status: 'running',
      created_by: info.startedBy,
      suite_name: info.suite
    }));
    
    res.json({
      success: true,
      data: {
        completed: result.rows,
        active: activeRuns
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve test runs', {
      service: 'test-management',
      method: 'get-runs',
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve test runs'
    });
  }
});

// GET /api/test-management/runs/:runId - Get detailed run results
router.get('/runs/:runId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { runId } = req.params;
    
    // Get run info
    const runResult = await req.db.query('SELECT * FROM test_runs WHERE run_id = $1', [runId]);
    if (runResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Test run not found'
      });
    }
    
    // Get executions for this run
    const executionsResult = await req.db.query(`
      SELECT * FROM test_executions 
      WHERE run_id = $1 
      ORDER BY started_at ASC
    `, [runId]);
    
    // Get step executions
    const stepsResult = await req.db.query(`
      SELECT * FROM test_step_executions 
      WHERE execution_id IN (
        SELECT execution_id FROM test_executions WHERE run_id = $1
      )
      ORDER BY execution_id, step_number ASC
    `, [runId]);
    
    res.json({
      success: true,
      data: {
        run: runResult.rows[0],
        executions: executionsResult.rows,
        steps: stepsResult.rows
      }
    });
    
  } catch (error) {
    logger.error('Failed to retrieve test run details', {
      service: 'test-management',
      method: 'get-run-details',
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve test run details'
    });
  }
});

// POST /api/test-management/generate-tests - AI-driven test generation
router.post('/generate-tests', authenticate, requireAdmin, async (req, res) => {
  try {
    const { requirements, targetUrl, userStories, category } = req.body;
    
    logger.info('Starting AI test generation', {
      service: 'test-management',
      method: 'generate-tests',
      requirements,
      targetUrl,
      userStories: userStories?.length || 0,
      user: req.user.email
    });
    
    // TODO: Implement Claude AI test generation
    // This will call our Claude test agent to generate test cases
    
    res.json({
      success: true,
      message: 'AI test generation not yet implemented',
      data: {
        requirements,
        targetUrl,
        userStories,
        category
      }
    });
    
  } catch (error) {
    logger.error('Failed to generate tests', {
      service: 'test-management',
      method: 'generate-tests',
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to generate tests'
    });
  }
});

export { router as testManagementRouter, initializeTestWebSocket };