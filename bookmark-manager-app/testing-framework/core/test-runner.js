#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { unifiedLogger } from '../../backend/src/services/unifiedLogger.js';
import TestDiscoveryEngine from './test-discovery/test-discovery-engine.js';
import TDDWorkflowManager from '../tdd-tools/tdd-workflow-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class UnifiedTestRunner {
  constructor() {
    this.logger = unifiedLogger.child({ service: 'test-runner' });
    this.discoveryEngine = new TestDiscoveryEngine();
    this.tddManager = new TDDWorkflowManager();
    this.testResults = new Map();
    this.options = {
      watch: false,
      coverage: true,
      parallel: true,
      bail: false
    };
  }

  async run(command, args = []) {
    this.logger.info(`Starting test runner: ${command}`);
    
    switch (command) {
      case 'discover':
        return await this.runDiscovery();
      case 'all':
        return await this.runAllTests();
      case 'unit':
        return await this.runUnitTests();
      case 'integration':
        return await this.runIntegrationTests();
      case 'e2e':
        return await this.runE2ETests();
      case 'tdd':
        return await this.startTDD(args[0], args[1]);
      case 'watch':
        return await this.runWatchMode();
      case 'coverage':
        return await this.runCoverageReport();
      case 'performance':
        return await this.runPerformanceTests();
      case 'dashboard':
        return await this.startDashboard();
      default:
        this.logger.error(`Unknown command: ${command}`);
        this.printHelp();
    }
  }

  async runDiscovery() {
    this.logger.info('Running test discovery...');
    const startTime = Date.now();
    
    try {
      const report = await this.discoveryEngine.discoverAll();
      
      const duration = Date.now() - startTime;
      this.logger.info(`Discovery completed in ${duration}ms`, {
        featuresFound: report.summary.featuresDiscovered,
        testsGenerated: report.summary.testCasesGenerated
      });
      
      // Print summary
      console.log('\n📊 Test Discovery Report');
      console.log('=======================');
      console.log(`✅ Features discovered: ${report.summary.featuresDiscovered}`);
      console.log(`✅ Test cases generated: ${report.summary.testCasesGenerated}`);
      console.log('\n📁 Coverage Summary:');
      console.log(`  Frontend: ${report.summary.coverage.frontend.pages} pages, ${report.summary.coverage.frontend.components} components`);
      console.log(`  Backend: ${report.summary.coverage.backend.routes} routes, ${report.summary.coverage.backend.services} services`);
      console.log(`  Database: ${report.summary.coverage.database.tables} tables`);
      
      if (report.recommendations.length > 0) {
        console.log('\n⚠️  Recommendations:');
        report.recommendations.forEach(rec => {
          console.log(`  - [${rec.priority}] ${rec.message}`);
        });
      }
      
      return report;
    } catch (error) {
      this.logger.error('Discovery failed', error);
      throw error;
    }
  }

  async runAllTests() {
    this.logger.info('Running all tests...');
    
    const results = {
      unit: await this.runUnitTests(),
      integration: await this.runIntegrationTests(),
      e2e: await this.runE2ETests()
    };
    
    this.printSummary(results);
    return results;
  }

  async runUnitTests() {
    this.logger.info('Running unit tests...');
    
    return await this.executeTests('unit', [
      'npm', 'run', 'test:unit', '--', 
      '--reporter=json',
      this.options.coverage ? '--coverage' : ''
    ].filter(Boolean));
  }

  async runIntegrationTests() {
    this.logger.info('Running integration tests...');
    
    return await this.executeTests('integration', [
      'npm', 'run', 'test:integration', '--',
      '--reporter=json'
    ]);
  }

  async runE2ETests() {
    this.logger.info('Running E2E tests...');
    
    // Check if services are running
    const servicesRunning = await this.checkServices();
    if (!servicesRunning) {
      this.logger.warn('Services not running. Starting them...');
      await this.startServices();
    }
    
    return await this.executeTests('e2e', [
      'npx', 'playwright', 'test',
      '--reporter=json'
    ]);
  }

  async executeTests(type, command) {
    const startTime = Date.now();
    const results = {
      type,
      status: 'running',
      startTime: new Date(),
      tests: [],
      summary: {}
    };
    
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command;
      const testProcess = spawn(cmd, args, {
        cwd: path.join(__dirname, '..', '..'),
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      let output = '';
      let errorOutput = '';
      
      testProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (!this.options.quiet) {
          process.stdout.write(data);
        }
      });
      
      testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        if (!this.options.quiet) {
          process.stderr.write(data);
        }
      });
      
      testProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        results.duration = duration;
        results.status = code === 0 ? 'passed' : 'failed';
        results.endTime = new Date();
        
        try {
          // Parse JSON output if available
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const testData = JSON.parse(jsonMatch[0]);
            results.tests = testData.tests || [];
            results.summary = testData.summary || {};
          }
        } catch (error) {
          this.logger.warn('Could not parse test output as JSON');
        }
        
        this.testResults.set(type, results);
        this.logger.info(`${type} tests completed in ${duration}ms`, {
          status: results.status,
          tests: results.tests.length
        });
        
        resolve(results);
      });
      
      testProcess.on('error', (error) => {
        this.logger.error(`Failed to run ${type} tests`, error);
        results.status = 'error';
        results.error = error.message;
        reject(error);
      });
    });
  }

  async startTDD(featureName, specFile) {
    if (!featureName) {
      console.error('❌ Feature name is required for TDD workflow');
      console.log('Usage: npm run test:tdd <feature-name> [spec-file]');
      return;
    }
    
    this.logger.info(`Starting TDD workflow for: ${featureName}`);
    
    let specification;
    if (specFile) {
      // Load specification from file
      const specPath = path.resolve(specFile);
      specification = JSON.parse(await fs.promises.readFile(specPath, 'utf8'));
    } else {
      // Interactive specification builder
      specification = await this.buildSpecificationInteractive(featureName);
    }
    
    const workflow = await this.tddManager.startTDDWorkflow(featureName, specification);
    
    console.log('\n🚀 TDD Workflow Started');
    console.log('======================');
    console.log(`Workflow ID: ${workflow.id}`);
    console.log(`Feature: ${workflow.feature}`);
    console.log('\n📝 Next Steps:');
    console.log('1. Review generated test files');
    console.log('2. Run tests (they should fail)');
    console.log('3. Implement feature to make tests pass');
    console.log('4. Refactor with confidence');
    console.log(`\nTest files generated in: testing-framework/tests/`);
    console.log(`Implementation scaffolds in: testing-framework/scaffolds/`);
    
    return workflow;
  }

  async buildSpecificationInteractive(featureName) {
    // In a real implementation, this would be interactive
    // For now, return a basic template
    return {
      description: `Implement ${featureName} feature`,
      criteria: [
        'Must be accessible to all users',
        'Must handle errors gracefully',
        'Must provide feedback to users'
      ],
      userStories: [
        {
          action: 'uses the feature',
          response: 'receives expected result'
        }
      ]
    };
  }

  async runWatchMode() {
    this.logger.info('Starting watch mode...');
    this.options.watch = true;
    
    // Use nodemon or similar for watch mode
    const watchProcess = spawn('npx', [
      'nodemon',
      '--watch', 'frontend/src',
      '--watch', 'backend/src',
      '--ext', 'js,jsx,ts,tsx',
      '--exec', 'node',
      path.join(__dirname, 'test-runner.js'),
      'all'
    ], {
      stdio: 'inherit'
    });
    
    watchProcess.on('error', (error) => {
      this.logger.error('Watch mode failed', error);
    });
  }

  async runCoverageReport() {
    this.logger.info('Generating coverage report...');
    
    // Run tests with coverage
    this.options.coverage = true;
    const results = await this.runAllTests();
    
    // Generate HTML coverage report
    const coverageProcess = spawn('npx', [
      'nyc', 'report',
      '--reporter=html',
      '--reporter=text'
    ], {
      stdio: 'inherit'
    });
    
    coverageProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n📊 Coverage report generated in coverage/index.html');
      }
    });
    
    return results;
  }

  async runPerformanceTests() {
    this.logger.info('Running performance tests...');
    
    const perfTests = await glob(path.join(
      __dirname, '..', 'tests', 'performance', '**/*.perf.js'
    ));
    
    if (perfTests.length === 0) {
      console.log('No performance tests found');
      return;
    }
    
    // Run performance tests
    return await this.executeTests('performance', [
      'npm', 'run', 'test:performance'
    ]);
  }

  async startDashboard() {
    this.logger.info('Starting test dashboard...');
    
    // Start the dashboard server
    const dashboardPath = path.join(__dirname, '..', 'dashboard', 'server.js');
    
    const dashboardProcess = spawn('node', [dashboardPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: process.env.TEST_DASHBOARD_PORT || '3005'
      }
    });
    
    dashboardProcess.on('error', (error) => {
      this.logger.error('Failed to start dashboard', error);
    });
    
    console.log('\n🎯 Test Dashboard starting...');
    console.log(`View at: http://localhost:${process.env.TEST_DASHBOARD_PORT || '3005'}`);
  }

  async checkServices() {
    try {
      // Check if backend is running
      const response = await fetch('http://localhost:3001/health');
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async startServices() {
    console.log('Starting services...');
    
    const startProcess = spawn('node', ['start-services.js'], {
      cwd: path.join(__dirname, '..', '..'),
      stdio: 'inherit'
    });
    
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  printSummary(results) {
    console.log('\n📋 Test Summary');
    console.log('===============');
    
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    
    Object.entries(results).forEach(([type, result]) => {
      const status = result.status === 'passed' ? '✅' : '❌';
      console.log(`${status} ${type}: ${result.status}`);
      
      if (result.summary) {
        totalTests += result.summary.total || 0;
        totalPassed += result.summary.passed || 0;
        totalFailed += result.summary.failed || 0;
      }
    });
    
    console.log('\n📊 Totals:');
    console.log(`  Tests: ${totalTests}`);
    console.log(`  ✅ Passed: ${totalPassed}`);
    console.log(`  ❌ Failed: ${totalFailed}`);
    
    const allPassed = Object.values(results).every(r => r.status === 'passed');
    console.log(`\n${allPassed ? '🎉 All tests passed!' : '❌ Some tests failed'}`);
  }

  printHelp() {
    console.log(`
📚 Unified Test Runner
====================

Commands:
  discover     - Discover all testable features and generate test specs
  all          - Run all tests (unit, integration, e2e)
  unit         - Run unit tests only
  integration  - Run integration tests only
  e2e          - Run end-to-end tests only
  tdd          - Start TDD workflow for a new feature
  watch        - Run tests in watch mode
  coverage     - Generate coverage report
  performance  - Run performance tests
  dashboard    - Start test dashboard UI

Options:
  --quiet      - Suppress test output
  --bail       - Stop on first test failure
  --parallel   - Run tests in parallel (default: true)

Examples:
  npm run test:all
  npm run test:tdd "User Login"
  npm run test:e2e
  npm run test:watch
`);
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new UnifiedTestRunner();
  const [,, command, ...args] = process.argv;
  
  runner.run(command || 'all', args).catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export default UnifiedTestRunner;