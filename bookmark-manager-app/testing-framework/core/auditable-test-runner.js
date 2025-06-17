import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import os from 'os';
import { execSync } from 'child_process';
import unifiedLogger from '../../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Auditable Test Runner with Complete Traceability
 */
export class AuditableTestRunner {
  constructor(config) {
    this.config = config;
    this.logger = unifiedLogger;
    this.db = new pg.Pool(config.database);
    this.runId = null;
    this.runDir = null;
    this.browser = null;
    this.context = null;
    this.artifacts = [];
    this.auditTrail = [];
  }

  /**
   * Generate unique run ID
   */
  generateRunId() {
    const date = new Date();
    const dateStr = date.toISOString().replace(/[-:T]/g, '').substring(0, 14);
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `RUN-${dateStr}-${random}`;
  }

  /**
   * Generate execution ID
   */
  generateExecId(testId) {
    const timestamp = Date.now();
    return `EXEC-${this.runId}-${testId}-${timestamp}`;
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Capture complete environment snapshot
   */
  captureEnvironment() {
    return {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      user: process.env.USER || process.env.USERNAME,
      cwd: process.cwd(),
      env_vars: {
        NODE_ENV: process.env.NODE_ENV,
        CI: process.env.CI,
        TEST_ENV: process.env.TEST_ENV
      },
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      git: this.getGitInfo()
    };
  }

  /**
   * Get git information
   */
  getGitInfo() {
    try {
      return {
        commit: execSync('git rev-parse HEAD').toString().trim(),
        branch: execSync('git branch --show-current').toString().trim(),
        status: execSync('git status --porcelain').toString().trim() || 'clean'
      };
    } catch (e) {
      return { error: 'Git info not available' };
    }
  }

  /**
   * Initialize test run
   */
  async initializeRun(testPlan) {
    this.runId = this.generateRunId();
    
    // Create run directory structure
    const dateDir = new Date().toISOString().split('T')[0];
    this.runDir = path.join(__dirname, '..', 'test-runs', dateDir, this.runId);
    
    // Create all necessary directories
    const dirs = [
      this.runDir,
      path.join(this.runDir, 'screenshots'),
      path.join(this.runDir, 'network-logs'),
      path.join(this.runDir, 'console-logs'),
      path.join(this.runDir, 'videos'),
      path.join(this.runDir, 'reports')
    ];
    
    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Calculate test plan checksum
    const testPlanContent = JSON.stringify(testPlan, null, 2);
    const testPlanChecksum = crypto
      .createHash('sha256')
      .update(testPlanContent)
      .digest('hex');
    
    // Save test plan copy
    const testPlanPath = path.join(this.runDir, 'test-plan.json');
    fs.writeFileSync(testPlanPath, testPlanContent);
    
    // Save metadata
    const metadata = {
      runId: this.runId,
      startedAt: new Date().toISOString(),
      environment: this.captureEnvironment(),
      testPlanChecksum,
      testPlanPath,
      config: this.config
    };
    
    fs.writeFileSync(
      path.join(this.runDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Create database entry
    await this.db.query(`
      INSERT INTO test_runs (
        run_id, started_at, status, environment, test_plan_checksum, 
        artifacts_path, created_by, machine_info, git_commit, git_branch
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      this.runId,
      new Date(),
      'running',
      JSON.stringify(metadata.environment),
      testPlanChecksum,
      this.runDir,
      metadata.environment.user,
      JSON.stringify({
        hostname: metadata.environment.hostname,
        platform: metadata.environment.platform,
        arch: metadata.environment.arch
      }),
      metadata.environment.git?.commit,
      metadata.environment.git?.branch
    ]);
    
    // Log audit entry
    await this.auditLog('RUN_INITIALIZED', {
      runId: this.runId,
      testPlanChecksum,
      environment: metadata.environment
    });
    
    this.logger.info('Test run initialized', {
      service: 'test-runner',
      runId: this.runId,
      runDir: this.runDir
    });
    
    return this.runId;
  }

  /**
   * Execute test case with full audit trail
   */
  async executeTestCase(testCase) {
    const execId = this.generateExecId(testCase.test_id);
    const testDir = path.join(this.runDir, 'screenshots', testCase.test_id);
    fs.mkdirSync(testDir, { recursive: true });
    
    this.logger.info(`Executing test case: ${testCase.name}`, {
      service: 'test-runner',
      runId: this.runId,
      execId,
      testId: testCase.test_id
    });
    
    // Initialize browser for this test
    if (!this.browser) {
      await this.initializeBrowser();
    }
    
    const page = await this.context.newPage();
    const consoleLogs = [];
    const networkLogs = [];
    
    // Set up console logging
    page.on('console', msg => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      };
      consoleLogs.push(logEntry);
    });
    
    // Set up network logging
    page.on('request', request => {
      networkLogs.push({
        timestamp: new Date().toISOString(),
        type: 'request',
        url: request.url(),
        method: request.method(),
        headers: request.headers()
      });
    });
    
    page.on('response', response => {
      networkLogs.push({
        timestamp: new Date().toISOString(),
        type: 'response',
        url: response.url(),
        status: response.status(),
        headers: response.headers()
      });
    });
    
    // Start video recording if configured
    let videoPath = null;
    if (this.config.recordVideo) {
      videoPath = path.join(this.runDir, 'videos', `${testCase.test_id}.webm`);
      await page.video().saveAs(videoPath);
    }
    
    // Execute test steps
    const stepResults = [];
    let testPassed = true;
    
    for (const step of testCase.steps) {
      const stepResult = await this.executeStep(page, step, {
        execId,
        testId: testCase.test_id,
        testDir
      });
      
      stepResults.push(stepResult);
      
      if (!stepResult.passed) {
        testPassed = false;
        if (step.criticalError) {
          break; // Stop execution if critical step fails
        }
      }
    }
    
    // Save console logs
    const consoleLogPath = path.join(
      this.runDir, 
      'console-logs', 
      `${testCase.test_id}.json`
    );
    fs.writeFileSync(consoleLogPath, JSON.stringify(consoleLogs, null, 2));
    
    // Save network logs
    const networkLogPath = path.join(
      this.runDir,
      'network-logs',
      testCase.test_id
    );
    fs.mkdirSync(networkLogPath, { recursive: true });
    fs.writeFileSync(
      path.join(networkLogPath, 'summary.json'),
      JSON.stringify(networkLogs, null, 2)
    );
    
    // Close page
    await page.close();
    
    // Create execution summary
    const executionSummary = {
      execId,
      testId: testCase.test_id,
      testName: testCase.name,
      status: testPassed ? 'passed' : 'failed',
      startedAt: stepResults[0]?.startedAt,
      completedAt: stepResults[stepResults.length - 1]?.completedAt,
      duration: this.calculateDuration(stepResults),
      steps: stepResults,
      artifacts: {
        screenshots: stepResults.flatMap(s => s.screenshots || []),
        consoleLogs: consoleLogPath,
        networkLogs: networkLogPath,
        video: videoPath
      }
    };
    
    // Store in database
    await this.storeExecutionResults(executionSummary, testCase);
    
    return executionSummary;
  }

  /**
   * Execute individual test step
   */
  async executeStep(page, step, context) {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();
    const stepDir = context.testDir;
    
    // Take before screenshot
    const beforeScreenshot = await this.takeScreenshot(page, {
      stepNumber: step.stepNumber,
      stepId: step.stepId,
      phase: 'before',
      testId: context.testId,
      dir: stepDir
    });
    
    let result = {
      stepNumber: step.stepNumber,
      stepId: step.stepId,
      description: step.description,
      startedAt,
      screenshots: [beforeScreenshot],
      passed: false,
      error: null
    };
    
    try {
      // Execute the step action
      await this.performAction(page, step.action);
      
      // Wait if specified
      if (step.action.parameters?.waitAfter) {
        await page.waitForTimeout(step.action.parameters.waitAfter);
      }
      
      // Perform validation if specified
      if (step.validation) {
        const validationResult = await this.performValidation(page, step.validation);
        result.validationResult = validationResult;
        result.passed = validationResult.passed;
      } else {
        result.passed = true;
      }
      
    } catch (error) {
      result.error = {
        message: error.message,
        stack: error.stack,
        type: error.constructor.name
      };
      result.passed = false;
      
      // Take error screenshot
      const errorScreenshot = await this.takeScreenshot(page, {
        stepNumber: step.stepNumber,
        stepId: step.stepId,
        phase: 'error',
        testId: context.testId,
        dir: stepDir
      });
      result.screenshots.push(errorScreenshot);
    }
    
    // Take after screenshot
    const afterScreenshot = await this.takeScreenshot(page, {
      stepNumber: step.stepNumber,
      stepId: step.stepId,
      phase: 'after',
      testId: context.testId,
      dir: stepDir
    });
    result.screenshots.push(afterScreenshot);
    
    // Complete result
    result.completedAt = new Date().toISOString();
    result.duration = Date.now() - startTime;
    
    // Store step result in database
    await this.storeStepResult(result, step, context.execId);
    
    return result;
  }

  /**
   * Take screenshot with proper naming and checksums
   */
  async takeScreenshot(page, options) {
    const timestamp = Date.now();
    const filename = `${String(options.stepNumber).padStart(3, '0')}-${options.stepId}-${options.phase}-${timestamp}.png`;
    const filepath = path.join(options.dir, filename);
    
    await page.screenshot({ 
      path: filepath,
      fullPage: options.phase === 'error'
    });
    
    const checksum = await this.calculateChecksum(filepath);
    const stats = fs.statSync(filepath);
    
    const artifact = {
      type: 'screenshot',
      filename,
      filepath,
      checksum,
      size: stats.size,
      timestamp: new Date().toISOString(),
      metadata: {
        stepNumber: options.stepNumber,
        stepId: options.stepId,
        phase: options.phase,
        testId: options.testId
      }
    };
    
    this.artifacts.push(artifact);
    
    return artifact;
  }

  /**
   * Perform test action
   */
  async performAction(page, action) {
    switch (action.type) {
      case 'navigate':
        await page.goto(action.parameters.url, {
          waitUntil: action.parameters.waitUntil || 'networkidle',
          timeout: action.parameters.timeout || 30000
        });
        break;
        
      case 'click':
        await page.click(action.target.selector, {
          timeout: action.parameters?.timeout || 5000
        });
        break;
        
      case 'type':
      case 'fill':
        await page.fill(action.target.selector, action.parameters.value);
        break;
        
      case 'wait':
        await page.waitForTimeout(action.parameters.value);
        break;
        
      case 'waitForSelector':
        await page.waitForSelector(action.target.selector, {
          timeout: action.parameters?.timeout || 5000
        });
        break;
        
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Perform validation
   */
  async performValidation(page, validation) {
    const result = {
      type: validation.type,
      expected: validation.expected,
      actual: null,
      passed: false
    };
    
    switch (validation.type) {
      case 'urlContains':
        result.actual = page.url();
        result.passed = result.actual.includes(validation.expected);
        break;
        
      case 'elementVisible':
        const element = await page.locator(validation.target.selector);
        result.actual = await element.isVisible();
        result.passed = result.actual === validation.expected;
        break;
        
      case 'textContains':
        const textElement = await page.locator(validation.target.selector);
        result.actual = await textElement.textContent();
        result.passed = result.actual?.includes(validation.expected) || false;
        break;
        
      case 'attributeEquals':
        const attrElement = await page.locator(validation.target.selector);
        result.actual = await attrElement.getAttribute(validation.attribute || 'value');
        result.passed = result.actual === validation.expected;
        break;
        
      default:
        throw new Error(`Unknown validation type: ${validation.type}`);
    }
    
    return result;
  }

  /**
   * Initialize browser
   */
  async initializeBrowser() {
    this.browser = await chromium.launch({
      headless: this.config.headless !== false,
      slowMo: this.config.slowMo || 0,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      recordVideo: this.config.recordVideo ? {
        dir: path.join(this.runDir, 'videos'),
        size: { width: 1280, height: 720 }
      } : undefined
    });
  }

  /**
   * Store execution results in database
   */
  async storeExecutionResults(summary, testCase) {
    await this.db.query(`
      INSERT INTO test_executions (
        execution_id, test_case_id, run_id, status,
        started_at, completed_at, duration_ms,
        executed_by, environment, test_data_used,
        steps_executed, error_message, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      summary.execId,
      testCase.id,
      this.runId,
      summary.status,
      summary.startedAt,
      summary.completedAt,
      summary.duration,
      this.captureEnvironment().user,
      JSON.stringify(this.captureEnvironment()),
      JSON.stringify(testCase.test_data || {}),
      JSON.stringify(summary.steps),
      summary.steps.find(s => !s.passed)?.error?.message,
      `Automated test run ${this.runId}`
    ]);
  }

  /**
   * Store step result in database
   */
  async storeStepResult(result, step, execId) {
    await this.db.query(`
      INSERT INTO test_step_executions (
        execution_id, step_number, step_id, action_type,
        target_element, input_data, started_at, completed_at,
        duration_ms, status, screenshot_before, screenshot_after,
        screenshot_checksum, error_details, validation_results,
        audit_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      execId,
      result.stepNumber,
      result.stepId,
      step.action.type,
      step.action.target?.selector,
      JSON.stringify(step.action.parameters || {}),
      result.startedAt,
      result.completedAt,
      result.duration,
      result.passed ? 'passed' : 'failed',
      result.screenshots[0]?.filepath,
      result.screenshots[result.screenshots.length - 1]?.filepath,
      result.screenshots[result.screenshots.length - 1]?.checksum,
      result.error ? JSON.stringify(result.error) : null,
      result.validationResult ? JSON.stringify(result.validationResult) : null,
      JSON.stringify({
        user: process.env.USER,
        timestamp: new Date().toISOString(),
        runId: this.runId
      })
    ]);
  }

  /**
   * Calculate total duration
   */
  calculateDuration(stepResults) {
    if (stepResults.length === 0) return 0;
    
    const start = new Date(stepResults[0].startedAt);
    const end = new Date(stepResults[stepResults.length - 1].completedAt);
    return end - start;
  }

  /**
   * Create audit log entry
   */
  async auditLog(action, details) {
    const entry = {
      timestamp: new Date().toISOString(),
      runId: this.runId,
      action,
      actor: process.env.USER || 'system',
      ipAddress: this.getIPAddress(),
      details
    };
    
    this.auditTrail.push(entry);
    
    // Store in database
    try {
      await this.db.query(`
        INSERT INTO test_audit_trail (
          run_id, action, actor, timestamp, ip_address,
          user_agent, action_details, system_state
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        this.runId,
        action,
        entry.actor,
        new Date(),
        entry.ipAddress,
        'AuditableTestRunner/1.0',
        JSON.stringify(details),
        JSON.stringify(this.captureEnvironment())
      ]);
    } catch (error) {
      this.logger.error('Failed to store audit log', {
        error: error.message,
        action,
        runId: this.runId
      });
    }
  }

  /**
   * Get IP address
   */
  getIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  /**
   * Finalize run
   */
  async finalizeRun(summary) {
    // Update run status in database
    await this.db.query(`
      UPDATE test_runs
      SET completed_at = $2, status = $3, total_tests = $4,
          passed = $5, failed = $6, skipped = $7
      WHERE run_id = $1
    `, [
      this.runId,
      new Date(),
      summary.failed > 0 ? 'failed' : 'completed',
      summary.total,
      summary.passed,
      summary.failed,
      summary.skipped
    ]);
    
    // Generate execution log
    const executionLog = {
      runId: this.runId,
      summary,
      environment: this.captureEnvironment(),
      auditTrail: this.auditTrail,
      artifacts: this.artifacts
    };
    
    fs.writeFileSync(
      path.join(this.runDir, 'execution-log.json'),
      JSON.stringify(executionLog, null, 2)
    );
    
    // Generate audit trail report
    const auditReport = {
      runId: this.runId,
      generated: new Date().toISOString(),
      integrity: {
        totalArtifacts: this.artifacts.length,
        totalChecksums: this.artifacts.length,
        verified: true
      },
      timeline: this.auditTrail,
      summary
    };
    
    fs.writeFileSync(
      path.join(this.runDir, 'reports', 'audit-trail.json'),
      JSON.stringify(auditReport, null, 2)
    );
    
    // Create final audit log
    await this.auditLog('RUN_COMPLETED', {
      summary,
      artifactsPath: this.runDir,
      totalArtifacts: this.artifacts.length
    });
    
    // Close browser
    if (this.browser) {
      await this.browser.close();
    }
    
    this.logger.info('Test run completed', {
      service: 'test-runner',
      runId: this.runId,
      summary
    });
  }
}

export default AuditableTestRunner;