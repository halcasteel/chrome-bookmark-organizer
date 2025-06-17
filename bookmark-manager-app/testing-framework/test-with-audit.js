#!/usr/bin/env node

import { AuditableTestRunner } from './core/auditable-test-runner.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test configuration
const config = {
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:admin@localhost:5434/bookmark_manager'
  },
  headless: false,
  slowMo: 100,
  recordVideo: true
};

// Login test case
const loginTestCase = {
  id: 'TEST-FE-AUTH-LOGIN-001',
  test_id: 'TEST-FE-AUTH-LOGIN-001',
  name: 'User Login Flow',
  description: 'Test user login with valid credentials',
  category: 'authentication',
  test_data: {
    email: 'admin@az1.ai',
    password: 'changeme123'
  },
  steps: [
    {
      stepNumber: 1,
      stepId: 'navigate-to-login',
      description: 'Navigate to login page',
      action: {
        type: 'navigate',
        parameters: {
          url: 'http://localhost:5173/login',
          waitUntil: 'networkidle'
        }
      },
      validation: {
        type: 'urlContains',
        expected: '/login'
      }
    },
    {
      stepNumber: 2,
      stepId: 'enter-email',
      description: 'Enter email address',
      action: {
        type: 'fill',
        target: {
          selector: 'input[placeholder*="@az1.ai"]'
        },
        parameters: {
          value: 'admin@az1.ai'
        }
      },
      validation: {
        type: 'attributeEquals',
        target: {
          selector: 'input[placeholder*="@az1.ai"]'
        },
        expected: 'admin@az1.ai'
      }
    },
    {
      stepNumber: 3,
      stepId: 'enter-password',
      description: 'Enter password',
      action: {
        type: 'fill',
        target: {
          selector: 'input[placeholder="Enter your password"]'
        },
        parameters: {
          value: 'changeme123'
        }
      }
    },
    {
      stepNumber: 4,
      stepId: 'click-submit',
      description: 'Click login button',
      action: {
        type: 'click',
        target: {
          selector: 'button:has-text("Sign In")'
        },
        parameters: {
          waitAfter: 2000
        }
      },
      criticalError: true
    },
    {
      stepNumber: 5,
      stepId: 'verify-dashboard',
      description: 'Verify successful login',
      action: {
        type: 'wait',
        parameters: {
          value: 1000
        }
      },
      validation: {
        type: 'urlContains',
        expected: '/dashboard'
      }
    }
  ]
};

// Test plan
const testPlan = {
  id: 'PLAN-001',
  name: 'Authentication Test Suite',
  version: '1.0.0',
  description: 'Test authentication flows',
  test_cases: [loginTestCase]
};

async function runAuditableTest() {
  console.log('🚀 Starting Auditable Test Execution\n');
  console.log('📋 Test Plan:', testPlan.name);
  console.log('📝 Total Test Cases:', testPlan.test_cases.length);
  console.log('');
  
  const runner = new AuditableTestRunner(config);
  
  try {
    // Initialize test run
    const runId = await runner.initializeRun(testPlan);
    console.log(`✅ Test run initialized: ${runId}`);
    console.log(`📁 Artifacts directory: ${runner.runDir}\n`);
    
    // Execute test cases
    const results = [];
    for (const testCase of testPlan.test_cases) {
      console.log(`\n🧪 Executing: ${testCase.name}`);
      const result = await runner.executeTestCase(testCase);
      results.push(result);
      
      console.log(`\n📊 Test Result:`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Steps Executed: ${result.steps.length}`);
      console.log(`   Screenshots: ${result.artifacts.screenshots.length}`);
      
      // Show step results
      console.log(`\n   Step Results:`);
      for (const step of result.steps) {
        const icon = step.passed ? '✅' : '❌';
        console.log(`   ${icon} Step ${step.stepNumber}: ${step.description}`);
        if (step.error) {
          console.log(`      Error: ${step.error.message}`);
        }
        if (step.validationResult) {
          console.log(`      Validation: Expected "${step.validationResult.expected}", Got "${step.validationResult.actual}"`);
        }
      }
    }
    
    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: 0
    };
    
    // Finalize run
    await runner.finalizeRun(summary);
    
    console.log(`\n\n📈 Test Run Summary:`);
    console.log(`   Total Tests: ${summary.total}`);
    console.log(`   Passed: ${summary.passed}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Run ID: ${runId}`);
    console.log(`\n📂 Complete audit trail available at:`);
    console.log(`   ${runner.runDir}`);
    
    // Show audit trail files
    console.log(`\n📄 Generated Artifacts:`);
    const auditFiles = [
      'metadata.json',
      'test-plan.json',
      'execution-log.json',
      'reports/audit-trail.json'
    ];
    
    for (const file of auditFiles) {
      const filePath = path.join(runner.runDir, file);
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        console.log(`   ✓ ${file} (${stats.size} bytes)`);
      }
    }
    
    // Count screenshots
    const screenshotDir = path.join(runner.runDir, 'screenshots');
    if (fs.existsSync(screenshotDir)) {
      const testDirs = fs.readdirSync(screenshotDir);
      let totalScreenshots = 0;
      for (const testDir of testDirs) {
        const screenshots = fs.readdirSync(path.join(screenshotDir, testDir));
        totalScreenshots += screenshots.length;
      }
      console.log(`   ✓ ${totalScreenshots} screenshots captured`);
    }
    
    return summary.failed === 0;
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the test
runAuditableTest().then(success => {
  console.log(`\n${success ? '✅ All tests passed!' : '❌ Some tests failed!'}`);
  process.exit(success ? 0 : 1);
});