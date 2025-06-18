#!/usr/bin/env node

import { chromium } from 'playwright';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import unifiedLogger from '../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * A2A Enrichment Test Runner
 * Executes the A2A test from the database with full screenshot tracking
 */
class A2ATestRunner {
  constructor() {
    this.db = null;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.testRun = null;
    this.screenshots = [];
    this.testContext = {};
  }

  async initialize() {
    // Connect to database
    this.db = new pg.Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5434,
      database: process.env.DB_NAME || 'bookmark_manager',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    });
    
    await this.db.connect();
    console.log('✓ Connected to database');

    // Create screenshots directory
    const screenshotDir = path.join(__dirname, 'screenshots', `run-${Date.now()}`);
    fs.mkdirSync(screenshotDir, { recursive: true });
    this.screenshotDir = screenshotDir;
    console.log('✓ Created screenshot directory:', screenshotDir);

    // Launch browser
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      slowMo: parseInt(process.env.SLOW_MO || '0')
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      recordVideo: process.env.RECORD_VIDEO === 'true' ? {
        dir: path.join(this.screenshotDir, 'videos')
      } : undefined
    });
    
    this.page = await this.context.newPage();
    console.log('✓ Browser launched');

    // Set up request logging
    this.page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log(`  → ${request.method()} ${request.url()}`);
      }
    });

    this.page.on('response', response => {
      if (response.url().includes('/api/')) {
        console.log(`  ← ${response.status()} ${response.url()}`);
      }
    });
  }

  async loadTest() {
    // Load the A2A test from database
    const result = await this.db.query(`
      SELECT 
        tc.*,
        ts.name as suite_name
      FROM test_cases tc
      JOIN test_suites ts ON tc.suite_id = ts.id
      WHERE tc.test_identifier = 'TEST-A2A-ENRICHMENT-001'
      AND tc.enabled = true
    `);

    if (result.rows.length === 0) {
      throw new Error('Test TEST-A2A-ENRICHMENT-001 not found in database');
    }

    this.testCase = result.rows[0];
    console.log(`\n📋 Loaded test: ${this.testCase.name}`);
    console.log(`   Suite: ${this.testCase.suite_name}`);
    console.log(`   Steps: ${this.testCase.test_steps.length}`);
  }

  async createTestRun() {
    // Create test run record
    const result = await this.db.query(`
      INSERT INTO test_runs (
        id, suite_id, test_case_id, run_identifier, 
        status, started_at, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, NOW(), $6
      ) RETURNING *
    `, [
      uuidv4(),
      this.testCase.suite_id,
      this.testCase.id,
      `RUN-A2A-${Date.now()}`,
      'running',
      'a2a-test-runner'
    ]);

    this.testRun = result.rows[0];
    console.log(`\n🚀 Created test run: ${this.testRun.run_identifier}`);
  }

  async executeStep(step, stepIndex) {
    console.log(`\n📍 Step ${step.stepNumber}: ${step.description}`);
    
    const stepResult = {
      step_number: step.stepNumber,
      description: step.description,
      status: 'running',
      started_at: new Date(),
      screenshots: []
    };

    try {
      // Take pre-step screenshot
      const preScreenshot = await this.takeScreenshot(`step-${step.stepNumber}-before`);
      stepResult.screenshots.push(preScreenshot);

      // Execute the action
      await this.executeAction(step.action);

      // Take post-action screenshot
      const postScreenshot = await this.takeScreenshot(`step-${step.stepNumber}-after`);
      stepResult.screenshots.push(postScreenshot);

      // Execute validation if present
      if (step.validation) {
        await this.executeValidation(step.validation);
      }

      stepResult.status = 'passed';
      stepResult.completed_at = new Date();
      console.log(`   ✅ Step passed`);

    } catch (error) {
      stepResult.status = 'failed';
      stepResult.error_message = error.message;
      stepResult.completed_at = new Date();
      
      // Take error screenshot
      const errorScreenshot = await this.takeScreenshot(`step-${step.stepNumber}-error`);
      stepResult.screenshots.push(errorScreenshot);
      
      console.error(`   ❌ Step failed: ${error.message}`);
      
      // Update test run as failed
      await this.updateTestRun('failed', error.message);
      throw error;
    }

    // Record step result
    await this.recordStepResult(stepResult);
    
    return stepResult;
  }

  async executeAction(action) {
    switch (action.type) {
      case 'navigate':
        await this.page.goto(action.parameters.url, {
          waitUntil: action.parameters.waitUntil || 'networkidle'
        });
        break;

      case 'fill':
        await this.page.fill(action.target.selector, action.parameters.value);
        break;

      case 'click':
        await this.page.click(action.target.selector);
        if (action.parameters.waitAfter) {
          await this.page.waitForTimeout(action.parameters.waitAfter);
        }
        break;

      case 'uploadFile':
        const filePath = path.join(__dirname, '..', action.parameters.filePath);
        await this.page.setInputFiles(action.target.selector, filePath);
        if (action.parameters.waitAfter) {
          await this.page.waitForTimeout(action.parameters.waitAfter);
        }
        break;

      case 'waitForSelector':
        await this.page.waitForSelector(action.target.selector, {
          timeout: action.parameters.timeout || 30000
        });
        break;

      case 'databaseQuery':
        const queryResult = await this.db.query(action.parameters.query);
        if (action.parameters.storeResult) {
          this.testContext[action.parameters.storeResult] = queryResult.rows[0];
        }
        break;

      case 'wait':
        await this.page.waitForTimeout(action.parameters.value || 1000);
        break;

      default:
        console.warn(`   ⚠️  Unknown action type: ${action.type}`);
    }
  }

  async executeValidation(validation) {
    switch (validation.type) {
      case 'urlContains':
        const currentUrl = this.page.url();
        if (!currentUrl.includes(validation.expected)) {
          throw new Error(`URL validation failed. Expected: ${validation.expected}, Got: ${currentUrl}`);
        }
        break;

      case 'elementVisible':
        const isVisible = await this.page.isVisible(validation.target.selector);
        if (isVisible !== validation.expected) {
          throw new Error(`Element visibility validation failed for ${validation.target.selector}`);
        }
        break;

      case 'textContains':
        const text = await this.page.textContent(validation.target.selector);
        if (!text.includes(validation.expected)) {
          throw new Error(`Text validation failed. Expected: ${validation.expected}, Got: ${text}`);
        }
        break;

      case 'elementCount':
        const elements = await this.page.$$(validation.target.selector);
        const count = elements.length;
        if (validation.operator === 'greaterThan' && count <= validation.expected) {
          throw new Error(`Element count validation failed. Expected > ${validation.expected}, Got: ${count}`);
        }
        break;

      case 'networkRequestMade':
        // This would need request interception setup
        console.log(`   ℹ️  Network validation would check for ${validation.expected.method} ${validation.expected.url}`);
        break;

      case 'customValidation':
        console.log(`   ℹ️  Custom validation: ${JSON.stringify(validation.expected)}`);
        break;

      default:
        console.warn(`   ⚠️  Unknown validation type: ${validation.type}`);
    }
  }

  async takeScreenshot(name) {
    const filename = `${name}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    
    await this.page.screenshot({
      path: filepath,
      fullPage: true
    });
    
    this.screenshots.push({
      name,
      filename,
      filepath,
      timestamp: new Date()
    });
    
    console.log(`   📸 Screenshot: ${filename}`);
    
    return filepath;
  }

  async recordStepResult(stepResult) {
    await this.db.query(`
      INSERT INTO test_step_results (
        id, test_run_id, step_number, description,
        status, started_at, completed_at, error_message,
        screenshots, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      uuidv4(),
      this.testRun.id,
      stepResult.step_number,
      stepResult.description,
      stepResult.status,
      stepResult.started_at,
      stepResult.completed_at,
      stepResult.error_message,
      JSON.stringify(stepResult.screenshots),
      JSON.stringify(stepResult.metadata || {})
    ]);
  }

  async updateTestRun(status, errorMessage = null) {
    await this.db.query(`
      UPDATE test_runs 
      SET status = $1, 
          completed_at = NOW(),
          error_message = $2,
          metadata = $3
      WHERE id = $4
    `, [
      status,
      errorMessage,
      JSON.stringify({
        screenshots: this.screenshots,
        screenshotDir: this.screenshotDir,
        totalSteps: this.testCase.test_steps.length
      }),
      this.testRun.id
    ]);
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    if (this.db) await this.db.end();
    
    console.log('✓ Cleanup complete');
  }

  async run() {
    try {
      await this.initialize();
      await this.loadTest();
      await this.createTestRun();

      console.log('\n' + '═'.repeat(60));
      console.log('🧪 EXECUTING A2A ENRICHMENT TEST');
      console.log('═'.repeat(60));

      // First create test user
      const createUserResult = await this.db.query(`
        INSERT INTO users (id, email, password_hash, name, role, two_factor_enabled) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING id, email
      `, [
        uuidv4(),
        `test-a2a-${Date.now()}@az1.ai`,
        '$2b$10$dummy',
        'A2A Test User',
        'user',
        false
      ]);
      
      this.testContext.testUser = createUserResult.rows[0];
      console.log(`\n✓ Created test user: ${this.testContext.testUser.email}`);

      // Execute each step
      for (let i = 0; i < this.testCase.test_steps.length; i++) {
        const step = this.testCase.test_steps[i];
        
        // Replace variables in step
        let stepStr = JSON.stringify(step);
        stepStr = stepStr.replace(/\${testUser\.(\w+)}/g, (match, prop) => {
          return this.testContext.testUser[prop] || match;
        });
        const processedStep = JSON.parse(stepStr);
        
        await this.executeStep(processedStep, i);
      }

      // Test completed successfully
      await this.updateTestRun('passed');
      
      console.log('\n' + '═'.repeat(60));
      console.log('✅ TEST PASSED');
      console.log('═'.repeat(60));
      console.log(`\n📊 Test Summary:`);
      console.log(`   Run ID: ${this.testRun.run_identifier}`);
      console.log(`   Steps: ${this.testCase.test_steps.length}`);
      console.log(`   Screenshots: ${this.screenshots.length}`);
      console.log(`   Screenshot Directory: ${this.screenshotDir}`);

    } catch (error) {
      console.error('\n' + '═'.repeat(60));
      console.error('❌ TEST FAILED');
      console.error('═'.repeat(60));
      console.error(error);
      
    } finally {
      // Cleanup test data
      if (this.testContext.testUser) {
        console.log(`\n🧹 Cleaning up test data...`);
        await this.db.query('DELETE FROM bookmarks WHERE user_id = $1', [this.testContext.testUser.id]);
        await this.db.query('DELETE FROM users WHERE id = $1', [this.testContext.testUser.id]);
      }
      
      await this.cleanup();
    }
  }
}

// Run the test
const runner = new A2ATestRunner();
runner.run();