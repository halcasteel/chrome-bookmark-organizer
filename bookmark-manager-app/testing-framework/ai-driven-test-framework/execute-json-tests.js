#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import unifiedLogger from '../../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Simple test executor that runs tests from JSON file
 */
class SimpleTestExecutor {
  constructor() {
    this.logger = unifiedLogger;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      failures: []
    };
  }

  async loadTestPlan() {
    const testPlanPath = path.join(__dirname, '../test-plans/comprehensive-test-plan.json');
    if (!fs.existsSync(testPlanPath)) {
      throw new Error('Test plan not found. Run "generate" first.');
    }
    
    const content = fs.readFileSync(testPlanPath, 'utf8');
    return JSON.parse(content);
  }

  async initialize() {
    this.logger.info('Initializing browser for testing');
    
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      slowMo: parseInt(process.env.SLOW_MO || '0')
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    this.page = await this.context.newPage();
    
    // Log console messages
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.logger.error(`Browser console error: ${msg.text()}`);
      }
    });
    
    // Log page errors
    this.page.on('pageerror', error => {
      this.logger.error(`Page error: ${error.message}`);
    });
  }

  async executeTestPlan() {
    const testPlan = await this.loadTestPlan();
    
    console.log(`
🚀 Executing Test Plan: ${testPlan.testPlan.name}
   Total Suites: ${testPlan.testSuites.length}
   Total Tests: ${testPlan.summary.totalTests}
    `);
    
    // Start with E2E tests first as they test the full application
    const e2eSuites = testPlan.testSuites.filter(s => s.layer === 'e2e');
    
    for (const suite of e2eSuites) {
      await this.executeTestSuite(suite);
    }
    
    this.printResults();
  }

  async executeTestSuite(suite) {
    console.log(`\n📋 Executing Suite: ${suite.name}`);
    console.log(`   Layer: ${suite.layer}, Priority: ${suite.priority}`);
    console.log(`   Tests: ${suite.testCases.length}`);
    
    for (const testCase of suite.testCases) {
      await this.executeTestCase(testCase, suite);
    }
  }

  async executeTestCase(testCase, suite) {
    this.results.total++;
    console.log(`\n   🧪 ${testCase.testId}: ${testCase.name}`);
    
    try {
      // For now, let's just execute E2E login test
      if (testCase.testId === 'TEST-E2E-AUTH-001') {
        await this.executeLoginTest();
        this.results.passed++;
        console.log(`      ✅ PASSED`);
      } else {
        // Skip other tests for now
        this.results.skipped++;
        console.log(`      ⏭️  SKIPPED (not implemented)`);
      }
    } catch (error) {
      this.results.failed++;
      this.results.failures.push({
        testId: testCase.testId,
        testName: testCase.name,
        suite: suite.name,
        error: error.message,
        stack: error.stack
      });
      console.log(`      ❌ FAILED: ${error.message}`);
    }
  }

  async executeLoginTest() {
    // Navigate to login page
    await this.page.goto('http://localhost:5173/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Check if login page loaded
    const title = await this.page.title();
    if (!title.includes('Bookmark Manager')) {
      throw new Error('Login page did not load correctly');
    }
    
    // Enter credentials
    await this.page.fill('input[name="email"]', 'admin@az1.ai');
    await this.page.fill('input[name="password"]', 'changeme123');
    
    // Click login button
    await this.page.click('button[type="submit"]');
    
    // Wait for navigation or error
    await this.page.waitForTimeout(3000);
    
    // Check current URL
    const currentUrl = this.page.url();
    if (!currentUrl.includes('/dashboard') && !currentUrl.includes('/verify-2fa')) {
      throw new Error(`Login failed - stayed on ${currentUrl}`);
    }
    
    console.log(`      ✓ Successfully logged in`);
  }

  printResults() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    TEST EXECUTION SUMMARY                        ║
╠══════════════════════════════════════════════════════════════════╣
║ Total Tests: ${this.results.total.toString().padEnd(51)}║
║ Passed: ${this.results.passed.toString().padEnd(56)}║
║ Failed: ${this.results.failed.toString().padEnd(56)}║
║ Skipped: ${this.results.skipped.toString().padEnd(55)}║
║ Pass Rate: ${this.results.total > 0 ? Math.round(this.results.passed / this.results.total * 100) : 0}%                                           ║
╚══════════════════════════════════════════════════════════════════╝
    `);
    
    if (this.results.failures.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.failures.forEach((failure, index) => {
        console.log(`\n${index + 1}. ${failure.testId}: ${failure.testName}`);
        console.log(`   Suite: ${failure.suite}`);
        console.log(`   Error: ${failure.error}`);
      });
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
async function main() {
  const executor = new SimpleTestExecutor();
  
  try {
    // Check if services are running
    try {
      const response = await fetch('http://localhost:3001/health');
      if (!response.ok) {
        throw new Error('Backend is not healthy');
      }
    } catch (error) {
      console.error('❌ Backend service is not running!');
      console.error('   Please start the application first with: node start-services.js');
      process.exit(1);
    }
    
    await executor.initialize();
    await executor.executeTestPlan();
    await executor.cleanup();
    
    process.exit(executor.results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error);
    await executor.cleanup();
    process.exit(1);
  }
}

main();