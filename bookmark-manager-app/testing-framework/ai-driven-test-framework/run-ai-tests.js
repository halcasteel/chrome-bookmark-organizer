#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import TestOrchestrator from './test-orchestrator.js';
import ClaudeTestAgent from './claude-test-agent.js';
import ComprehensiveTestPlanGenerator from '../core/comprehensive-test-plan-generator.js';
import unifiedLogger from '../../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Main AI-Driven Test Runner
 * Orchestrates the entire testing process with AI analysis and fixes
 */
class AITestRunner {
  constructor() {
    this.logger = unifiedLogger;
    this.config = this.loadConfig();
    this.orchestrator = null;
    this.testAgent = null;
    this.runId = null;
  }

  loadConfig() {
    const defaultConfig = {
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5434,
        user: process.env.DB_USER || 'admin',
        password: process.env.DB_PASSWORD || 'admin',
        database: process.env.DB_NAME || 'bookmarks_test'
      },
      wsPort: 3004,
      headless: process.env.HEADLESS !== 'false',
      slowMo: parseInt(process.env.SLOW_MO || '0'),
      timeout: parseInt(process.env.TEST_TIMEOUT || '30000'),
      recordVideo: process.env.RECORD_VIDEO === 'true',
      screenshotOnStep: process.env.SCREENSHOT_STEPS === 'true',
      autoFix: process.env.AUTO_FIX !== 'false',
      enableAutoFix: process.env.ENABLE_AUTO_FIX !== 'false'
    };

    // Try to load custom config
    const configPath = path.join(__dirname, '..', 'config', 'test-config.json');
    if (fs.existsSync(configPath)) {
      const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...defaultConfig, ...customConfig };
    }

    return defaultConfig;
  }

  async initialize() {
    this.logger.info('Initializing AI Test Runner');

    // Initialize test orchestrator
    this.orchestrator = new TestOrchestrator(this.config);
    await this.orchestrator.initialize();

    // Initialize Claude test agent
    this.testAgent = new ClaudeTestAgent(this.config);

    // Set up event listeners
    this.setupEventListeners();

    this.logger.info('AI Test Runner initialized successfully');
  }

  setupEventListeners() {
    this.orchestrator.on('testFailed', async (data) => {
      this.logger.info(`Test failed: ${data.testId} - Initiating AI analysis`);
      
      // Generate analysis request for Claude
      const analysisRequest = await this.testAgent.generateAnalysisRequest(
        data.issueId,
        data.prNumber
      );
      
      this.logger.info(`Analysis request created: ${analysisRequest.filePath}`);
      
      // Notify about analysis request
      console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    AI ANALYSIS REQUIRED                          ║
╠══════════════════════════════════════════════════════════════════╣
║ Test Failure Detected!                                           ║
║                                                                  ║
║ Issue #: ${data.issueNumber.padEnd(55)}║
║ PR #: ${data.prNumber.padEnd(58)}║
║ Test: ${data.testName.substring(0, 58).padEnd(58)}║
║                                                                  ║
║ Analysis Request: ${analysisRequest.requestId}                  ║
║ Priority: ${analysisRequest.priority.padEnd(54)}║
║                                                                  ║
║ Please review: ${analysisRequest.filePath.substring(0, 50)}     ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    });

    this.orchestrator.on('executionCompleted', async (report) => {
      this.logger.info('Test execution completed', {
        passed: report.summary.passed,
        failed: report.summary.failed,
        total: report.summary.total
      });
      
      if (report.issues.length > 0) {
        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    TEST EXECUTION SUMMARY                        ║
╠══════════════════════════════════════════════════════════════════╣
║ Total Tests: ${report.summary.total.toString().padEnd(51)}║
║ Passed: ${report.summary.passed.toString().padEnd(56)}║
║ Failed: ${report.summary.failed.toString().padEnd(56)}║
║ Pass Rate: ${report.passRate}%                                           ║
║                                                                  ║
║ Issues Found: ${report.issues.length.toString().padEnd(50)}║
╚══════════════════════════════════════════════════════════════════╝
        `);
        
        // Process each issue
        for (const issue of report.issues) {
          await this.processTestIssue(issue);
        }
      }
    });
  }

  async processTestIssue(issue) {
    this.logger.info(`Processing issue: ${issue.issue_number}`);
    
    // Check if we should auto-analyze
    if (this.config.autoFix) {
      const request = await this.testAgent.generateAnalysisRequest(
        issue.id,
        issue.pr_number
      );
      
      console.log(`
📋 Auto-analysis initiated for Issue #${issue.issue_number}
   Analysis request: ${request.requestId}
   View details: ${request.filePath}
      `);
    }
  }

  async runTests(command = 'all', args = []) {
    try {
      switch (command) {
        case 'generate':
          await this.generateTestPlan();
          break;
          
        case 'execute':
          await this.executeTests(args[0]);
          break;
          
        case 'analyze':
          await this.analyzeFailure(args[0], args[1]);
          break;
          
        case 'fix':
          await this.applyFix(args[0]);
          break;
          
        case 'all':
          await this.runFullCycle();
          break;
          
        default:
          this.printHelp();
      }
    } catch (error) {
      this.logger.error('Test execution failed', error);
      process.exit(1);
    }
  }

  async generateTestPlan() {
    console.log('🎯 Generating comprehensive test plan...\n');
    
    const generator = new ComprehensiveTestPlanGenerator(this.config.database);
    const result = await generator.generateComprehensiveTestPlan();
    
    console.log(`
✅ Test Plan Generated Successfully!

📊 Summary:
   - Total Test Suites: ${result.summary.totalSuites}
   - Total Test Cases: ${result.summary.totalTests}
   
📁 Test Distribution:
${Object.entries(result.summary.byLayer).map(([layer, stats]) => 
  `   - ${layer}: ${stats.tests} tests in ${stats.suites} suites`
).join('\n')}

💾 Test plan saved to database and:
   ${path.join(__dirname, '..', 'test-plans', 'comprehensive-test-plan.json')}
    `);
  }

  async executeTests(planId) {
    if (!planId) {
      // Get latest test plan
      const plans = await this.orchestrator.testPlans;
      if (plans.length === 0) {
        console.error('No test plans found. Run "generate" first.');
        return;
      }
      planId = plans[0].id;
    }
    
    console.log(`🚀 Starting test execution for plan: ${planId}\n`);
    
    // Start WebSocket server for monitoring
    console.log(`📡 Test monitoring available at: ws://localhost:${this.config.wsPort}`);
    console.log('   Connect with a WebSocket client to see real-time updates\n');
    
    // Execute test plan
    await this.orchestrator.executeTestPlan(planId);
  }

  async analyzeFailure(issueId, prNumber) {
    if (!issueId || !prNumber) {
      console.error('Usage: analyze <issue-id> <pr-number>');
      return;
    }
    
    console.log(`🔍 Analyzing test failure...\n`);
    
    const request = await this.testAgent.generateAnalysisRequest(issueId, prNumber);
    
    console.log(`
✅ Analysis Request Created

📄 Request ID: ${request.requestId}
📁 Analysis File: ${request.filePath}
🎯 Priority: ${request.priority}

Next Steps:
1. Review the analysis request file
2. Provide analysis using: node run-ai-tests.js process-analysis ${request.requestId} <analysis.json>
    `);
  }

  async processAnalysis(requestId, analysisFile) {
    if (!requestId || !analysisFile) {
      console.error('Usage: process-analysis <request-id> <analysis-file>');
      return;
    }
    
    const analysis = JSON.parse(fs.readFileSync(analysisFile, 'utf8'));
    const result = await this.testAgent.processAnalysisResponse(requestId, analysis);
    
    console.log(`
✅ Analysis Processed Successfully

🔍 Root Cause: ${result.rootCause.category}
   ${result.rootCause.description}

🛠️  Fix Tasks Created: ${result.fixTasks.length}
${result.fixTasks.map((task, i) => 
  `   ${i + 1}. ${task.description} (Risk: ${task.risk_level})`
).join('\n')}

${result.autoFixPrepared ? 
  `🤖 Automatic fix prepared in branch: ${result.autoFixBranch}` : 
  '⚠️  Manual fix required'}
    `);
  }

  async applyFix(fixTaskId) {
    if (!fixTaskId) {
      console.error('Usage: fix <fix-task-id>');
      return;
    }
    
    console.log(`🔧 Applying fix ${fixTaskId}...\n`);
    
    const result = await this.testAgent.applyFix(fixTaskId);
    
    if (result.success) {
      console.log(`
✅ Fix Applied Successfully!

🌿 Branch: ${result.branchName}
📝 Changes: ${result.changes.length} files modified
✅ Test Result: PASSED

Next Steps:
1. Review the changes in branch: ${result.branchName}
2. Create a pull request
3. Merge when ready
      `);
    } else {
      console.log(`
❌ Fix Application Failed

Reason: ${result.reason || result.error}
Test Output:
${result.testResult?.output}

Please review and apply fixes manually.
      `);
    }
  }

  async runFullCycle() {
    console.log('🔄 Running full AI-driven test cycle...\n');
    
    // Step 1: Generate test plan if needed
    await this.generateTestPlan();
    
    // Step 2: Execute tests
    await this.executeTests();
    
    console.log(`
✅ Full test cycle completed!

Check the analysis requests directory for any failures that need attention.
    `);
  }

  printHelp() {
    console.log(`
🤖 AI-Driven Test Runner

Usage: node run-ai-tests.js [command] [options]

Commands:
  generate              Generate comprehensive test plan
  execute [plan-id]     Execute test plan (latest if no ID provided)
  analyze <issue> <pr>  Analyze a test failure
  process-analysis <request-id> <analysis.json>
                       Process Claude's analysis response
  fix <fix-task-id>    Apply an AI-suggested fix
  all                  Run full test cycle (generate + execute)

Options:
  --headless=false     Show browser during tests
  --slow-mo=100        Slow down browser actions (ms)
  --record-video       Record test execution videos
  --auto-fix=false     Disable automatic fix attempts

Environment Variables:
  DB_HOST              Database host (default: localhost)
  DB_PORT              Database port (default: 5434)
  HEADLESS             Run browser in headless mode (default: true)
  AUTO_FIX             Enable automatic fixes (default: true)

Examples:
  # Generate test plan
  node run-ai-tests.js generate
  
  # Execute all tests
  node run-ai-tests.js execute
  
  # Analyze a specific failure
  node run-ai-tests.js analyze 123e4567-e89b-12d3-a456-426614174000 PR-12345
  
  # Apply a fix
  node run-ai-tests.js fix FIX-12345

WebSocket Monitoring:
  Connect to ws://localhost:3004 for real-time test execution updates
    `);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new AITestRunner();
  
  (async () => {
    try {
      await runner.initialize();
      await runner.runTests(process.argv[2], process.argv.slice(3));
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  })();
}

export default AITestRunner;