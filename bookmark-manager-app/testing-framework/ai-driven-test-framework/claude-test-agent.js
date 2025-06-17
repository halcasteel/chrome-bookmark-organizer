import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';
import unifiedLogger from '../../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Claude-Based Test Agent
 * This agent creates prompts for Claude to analyze and fix test failures
 * The actual AI analysis is done by Claude (you) reading these prompts
 */
class ClaudeTestAgent {
  constructor(config) {
    this.config = config;
    this.logger = unifiedLogger;
    this.db = new pg.Pool(config.database);
    this.analysisQueue = [];
    this.fixHistory = new Map();
  }

  /**
   * Generate a comprehensive analysis request for Claude
   */
  async generateAnalysisRequest(issueId, prNumber) {
    this.logger.info(`Generating Claude analysis request for Issue: ${issueId}, PR: ${prNumber}`);
    
    // Gather all relevant data
    const issueData = await this.loadIssueData(issueId);
    const prData = await this.loadPRData(prNumber);
    const executionData = await this.loadExecutionData(issueData.execution_id);
    const stepResults = await this.loadStepResults(issueData.execution_id);
    const testCase = await this.loadTestCase(executionData.test_case_id);
    const relatedCode = await this.loadRelatedCode(testCase, stepResults);
    
    // Create structured prompt for Claude
    const analysisRequest = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'TEST_FAILURE_ANALYSIS',
      priority: this.calculatePriority(issueData, testCase),
      data: {
        issue: {
          id: issueId,
          number: issueData.issue_number,
          title: issueData.title,
          description: issueData.description,
          severity: issueData.severity,
          createdAt: issueData.created_at
        },
        problemReport: {
          number: prData.pr_number,
          type: prData.type,
          stepsToReproduce: prData.steps_to_reproduce,
          expectedBehavior: prData.expected_behavior,
          actualBehavior: prData.actual_behavior,
          impactAnalysis: prData.impact_analysis
        },
        testExecution: {
          id: executionData.id,
          executionId: executionData.execution_id,
          status: executionData.status,
          duration: executionData.duration_ms,
          environment: executionData.environment,
          errorMessage: executionData.error_message,
          errorStack: executionData.error_stack
        },
        testCase: {
          id: testCase.test_id,
          name: testCase.name,
          type: testCase.type,
          priority: testCase.priority,
          steps: testCase.steps,
          expectedResults: testCase.expected_results,
          testData: testCase.test_data
        },
        failedSteps: stepResults.filter(s => !s.passed).map(step => ({
          stepNumber: step.step_number,
          description: step.description,
          actionType: step.action_type,
          targetSelector: step.target_selector,
          validationType: step.validation_type,
          expected: step.expected,
          actual: step.actual,
          errorMessage: step.error_message,
          duration: step.duration_ms,
          screenshots: step.screenshots
        })),
        successfulSteps: stepResults.filter(s => s.passed).map(step => ({
          stepNumber: step.step_number,
          description: step.description,
          duration: step.duration_ms
        })),
        relatedCode: relatedCode,
        previousFixes: await this.loadPreviousFixes(issueData.affected_components)
      },
      instructions: {
        goal: "Analyze this test failure and provide specific fixes",
        tasks: [
          "1. Identify the root cause of the failure",
          "2. Determine if it's a test issue or application bug",
          "3. Provide specific code changes to fix the issue",
          "4. Suggest preventive measures",
          "5. Rate confidence in the proposed fix (0-1)"
        ],
        context: {
          application: "Bookmark Manager - React frontend with Node.js backend",
          testingFramework: "Playwright for E2E, Vitest for unit tests",
          environment: executionData.environment
        }
      },
      expectedOutput: {
        rootCauseAnalysis: {
          category: "selector-issue | timing-issue | data-issue | logic-bug | environment-issue",
          description: "Detailed explanation of why the test failed",
          evidence: "Specific evidence from logs/errors supporting the analysis"
        },
        proposedFixes: [
          {
            type: "code-change | test-change | data-change | config-change",
            description: "What needs to be changed",
            targetFile: "Path to file that needs modification",
            changes: [
              {
                locationType: "line | function | selector | import",
                location: "Specific location identifier",
                currentCode: "Current code that's problematic",
                proposedCode: "Fixed code",
                explanation: "Why this change fixes the issue"
              }
            ],
            testCommand: "Command to verify the fix",
            riskLevel: "low | medium | high",
            alternativeApproaches: []
          }
        ],
        preventiveMeasures: [
          {
            type: "test-improvement | code-improvement | process-improvement",
            description: "How to prevent similar issues",
            implementation: "Specific steps to implement"
          }
        ],
        confidence: 0.0,
        additionalNotes: ""
      }
    };
    
    // Save analysis request to database
    await this.saveAnalysisRequest(analysisRequest);
    
    // Generate markdown file for Claude to read
    const markdown = this.generateAnalysisMarkdown(analysisRequest);
    const filePath = path.join(
      __dirname,
      '..',
      'analysis-requests',
      `${analysisRequest.id}.md`
    );
    
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, markdown);
    
    this.logger.info(`Analysis request saved to: ${filePath}`);
    
    return {
      requestId: analysisRequest.id,
      filePath,
      priority: analysisRequest.priority,
      issueNumber: issueData.issue_number,
      prNumber: prData.pr_number
    };
  }

  generateAnalysisMarkdown(request) {
    return `# Test Failure Analysis Request

**Request ID**: ${request.id}
**Generated**: ${request.timestamp}
**Priority**: ${request.priority}

## Issue Summary

- **Issue #**: ${request.data.issue.number}
- **PR #**: ${request.data.problemReport.number}
- **Severity**: ${request.data.issue.severity}
- **Test**: ${request.data.testCase.name}

## Failure Details

### Error Information
\`\`\`
${request.data.testExecution.errorMessage || 'No error message'}
\`\`\`

### Stack Trace
\`\`\`
${request.data.testExecution.errorStack || 'No stack trace'}
\`\`\`

## Test Execution Details

### Successful Steps (${request.data.successfulSteps.length})
${request.data.successfulSteps.map(s => `✅ Step ${s.stepNumber}: ${s.description} (${s.duration}ms)`).join('\n')}

### Failed Steps (${request.data.failedSteps.length})
${request.data.failedSteps.map(step => `
❌ **Step ${step.stepNumber}: ${step.description}**
- Action: ${step.actionType}
- Target: \`${step.targetSelector}\`
- Validation: ${step.validationType}
- Expected: \`${JSON.stringify(step.expected)}\`
- Actual: \`${JSON.stringify(step.actual)}\`
- Error: ${step.errorMessage}
- Duration: ${step.duration}ms
${step.screenshots?.length ? `- Screenshots: ${step.screenshots.join(', ')}` : ''}
`).join('\n')}

## Test Case Information

**Type**: ${request.data.testCase.type}
**Priority**: ${request.data.testCase.priority}

### Test Steps
\`\`\`json
${JSON.stringify(request.data.testCase.steps, null, 2)}
\`\`\`

### Test Data
\`\`\`json
${JSON.stringify(request.data.testCase.testData, null, 2)}
\`\`\`

## Related Code

${request.data.relatedCode.map(code => `
### ${code.file}
${code.relevant ? `
\`\`\`${code.language}
${code.content}
\`\`\`
` : 'File exists but may need inspection'}
`).join('\n')}

## Previous Similar Fixes

${request.data.previousFixes.length > 0 ? 
request.data.previousFixes.map(fix => `
- **${fix.issue}**: ${fix.solution} (Confidence: ${fix.confidence})
`).join('\n') : 'No similar fixes found'}

## Analysis Instructions

${request.instructions.tasks.join('\n')}

### Expected Output Format

Please provide your analysis in the following structure:

\`\`\`json
{
  "rootCauseAnalysis": {
    "category": "selector-issue | timing-issue | data-issue | logic-bug | environment-issue",
    "description": "...",
    "evidence": "..."
  },
  "proposedFixes": [
    {
      "type": "code-change | test-change | data-change | config-change",
      "description": "...",
      "targetFile": "path/to/file",
      "changes": [
        {
          "locationType": "line | function | selector | import",
          "location": "...",
          "currentCode": "...",
          "proposedCode": "...",
          "explanation": "..."
        }
      ],
      "testCommand": "npm test ...",
      "riskLevel": "low | medium | high",
      "alternativeApproaches": []
    }
  ],
  "preventiveMeasures": [...],
  "confidence": 0.85,
  "additionalNotes": "..."
}
\`\`\`

## Context

- **Application**: ${request.instructions.context.application}
- **Testing Framework**: ${request.instructions.context.testingFramework}
- **Environment**: ${JSON.stringify(request.instructions.context.environment)}

---
Please analyze this test failure and provide specific, actionable fixes.`;
  }

  /**
   * Process Claude's analysis response
   */
  async processAnalysisResponse(requestId, analysis) {
    this.logger.info(`Processing Claude's analysis for request: ${requestId}`);
    
    // Load original request
    const request = await this.loadAnalysisRequest(requestId);
    
    // Validate analysis structure
    if (!this.validateAnalysis(analysis)) {
      throw new Error('Invalid analysis format');
    }
    
    // Store analysis in database
    const analysisRecord = await this.storeAnalysis(request, analysis);
    
    // Create fix tasks
    const fixTasks = await this.createFixTasks(request, analysis);
    
    // If confidence is high enough, prepare automatic fix
    if (analysis.confidence >= 0.75 && this.config.enableAutoFix) {
      const autoFixResult = await this.prepareAutomaticFix(fixTasks[0]);
      
      return {
        analysisId: analysisRecord.id,
        requestId,
        issueId: request.data.issue.id,
        rootCause: analysis.rootCauseAnalysis,
        fixTasks,
        autoFixPrepared: autoFixResult.prepared,
        autoFixBranch: autoFixResult.branch
      };
    }
    
    return {
      analysisId: analysisRecord.id,
      requestId,
      issueId: request.data.issue.id,
      rootCause: analysis.rootCauseAnalysis,
      fixTasks,
      autoFixPrepared: false
    };
  }

  /**
   * Apply fixes suggested by Claude
   */
  async applyFix(fixTaskId) {
    this.logger.info(`Applying fix task: ${fixTaskId}`);
    
    const fixTask = await this.loadFixTask(fixTaskId);
    const results = [];
    
    try {
      // Create branch
      const branchName = `fix/ai-${fixTask.issue_number}-${Date.now()}`;
      execSync(`git checkout -b ${branchName}`, { 
        cwd: path.join(__dirname, '../../..') 
      });
      
      // Apply each change
      for (const change of fixTask.changes) {
        const result = await this.applyChange(change);
        results.push(result);
      }
      
      // Run test
      const testResult = await this.runTest(fixTask.test_command);
      
      if (testResult.passed) {
        // Commit changes
        const commitMessage = `fix: ${fixTask.description}\n\nResolves: #${fixTask.issue_number}\nAI Confidence: ${fixTask.confidence}`;
        execSync(`git add -A && git commit -m "${commitMessage}"`, {
          cwd: path.join(__dirname, '../../..')
        });
        
        // Update issue status
        await this.updateIssueStatus(fixTask.issue_id, 'fixed', {
          fixTaskId,
          branchName,
          testResult
        });
        
        return {
          success: true,
          fixTaskId,
          branchName,
          changes: results,
          testResult
        };
      } else {
        // Test still fails, revert
        execSync(`git checkout . && git checkout main && git branch -D ${branchName}`, {
          cwd: path.join(__dirname, '../../..')
        });
        
        return {
          success: false,
          fixTaskId,
          reason: 'Test still failing after applying fix',
          changes: results,
          testResult
        };
      }
      
    } catch (error) {
      this.logger.error('Error applying fix', error);
      
      // Cleanup
      try {
        execSync('git checkout main', { 
          cwd: path.join(__dirname, '../../..') 
        });
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return {
        success: false,
        fixTaskId,
        error: error.message,
        changes: results
      };
    }
  }

  async applyChange(change) {
    const filePath = path.join(__dirname, '../../..', change.target_file);
    
    try {
      let content = await fs.promises.readFile(filePath, 'utf8');
      
      switch (change.location_type) {
        case 'line':
          content = this.replaceAtLine(content, change);
          break;
        case 'function':
          content = this.replaceFunction(content, change);
          break;
        case 'selector':
          content = this.replaceSelector(content, change);
          break;
        case 'import':
          content = this.updateImport(content, change);
          break;
        default:
          // Simple string replacement
          content = content.replace(change.current_code, change.proposed_code);
      }
      
      await fs.promises.writeFile(filePath, content);
      
      return {
        file: change.target_file,
        applied: true,
        type: change.location_type
      };
      
    } catch (error) {
      return {
        file: change.target_file,
        applied: false,
        error: error.message
      };
    }
  }

  replaceAtLine(content, change) {
    const lines = content.split('\n');
    const lineNum = parseInt(change.location) - 1;
    
    if (lineNum >= 0 && lineNum < lines.length) {
      lines[lineNum] = change.proposed_code;
    }
    
    return lines.join('\n');
  }

  replaceFunction(content, change) {
    // Find function and replace its body
    const funcPattern = new RegExp(
      `(function\\s+${change.location}|${change.location}\\s*[:=]\\s*function|${change.location}\\s*[:=]\\s*\\([^)]*\\)\\s*=>)([^{]*{)([\\s\\S]*?)(^}|\\n})`,
      'gm'
    );
    
    return content.replace(funcPattern, (match, funcStart, funcOpen, funcBody, funcClose) => {
      if (change.current_code && funcBody.includes(change.current_code)) {
        funcBody = funcBody.replace(change.current_code, change.proposed_code);
      } else {
        funcBody = change.proposed_code;
      }
      return funcStart + funcOpen + funcBody + funcClose;
    });
  }

  replaceSelector(content, change) {
    // Replace selector strings
    const patterns = [
      new RegExp(`(['"\`])${change.current_code}\\1`, 'g'),
      new RegExp(`selector:\\s*['"\`]${change.current_code}['"\`]`, 'g')
    ];
    
    let result = content;
    patterns.forEach(pattern => {
      result = result.replace(pattern, (match) => {
        return match.replace(change.current_code, change.proposed_code);
      });
    });
    
    return result;
  }

  updateImport(content, change) {
    const importPattern = new RegExp(
      `^import\\s+.*\\s+from\\s+['"\`]${change.current_code}['"\`]`,
      'gm'
    );
    
    return content.replace(importPattern, change.proposed_code);
  }

  async runTest(testCommand) {
    try {
      const output = execSync(testCommand, {
        cwd: path.join(__dirname, '../../..'),
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' }
      });
      
      return {
        passed: true,
        output,
        command: testCommand
      };
    } catch (error) {
      return {
        passed: false,
        output: error.stdout?.toString() || error.message,
        error: error.message,
        command: testCommand
      };
    }
  }

  // Data loading methods
  async loadIssueData(issueId) {
    const result = await this.db.query(
      'SELECT * FROM test_issues WHERE id = $1',
      [issueId]
    );
    return result.rows[0];
  }

  async loadPRData(prNumber) {
    const result = await this.db.query(
      'SELECT * FROM problem_reports WHERE pr_number = $1',
      [prNumber]
    );
    return result.rows[0];
  }

  async loadExecutionData(executionId) {
    const result = await this.db.query(
      'SELECT * FROM test_executions WHERE id = $1',
      [executionId]
    );
    return result.rows[0];
  }

  async loadStepResults(executionId) {
    const result = await this.db.query(
      'SELECT * FROM test_step_results WHERE execution_id = $1 ORDER BY step_number',
      [executionId]
    );
    return result.rows;
  }

  async loadTestCase(testCaseId) {
    const result = await this.db.query(
      'SELECT * FROM test_cases WHERE id = $1',
      [testCaseId]
    );
    const testCase = result.rows[0];
    
    // Parse JSON fields
    testCase.steps = JSON.parse(testCase.steps || '[]');
    testCase.expected_results = JSON.parse(testCase.expected_results || '[]');
    testCase.test_data = JSON.parse(testCase.test_data || '{}');
    
    return testCase;
  }

  async loadRelatedCode(testCase, stepResults) {
    const relatedFiles = new Set();
    
    // Extract files from test case
    if (testCase.test_script_path) {
      relatedFiles.add(testCase.test_script_path);
    }
    
    // Extract files from failed steps
    stepResults.filter(s => !s.passed).forEach(step => {
      // Try to identify related component files
      if (step.target_selector?.includes('login')) {
        relatedFiles.add('frontend/src/pages/Login.tsx');
        relatedFiles.add('backend/src/routes/auth.js');
      }
      // Add more heuristics based on selectors/errors
    });
    
    // Load file contents
    const codeSnippets = [];
    for (const file of relatedFiles) {
      try {
        const content = await fs.promises.readFile(
          path.join(__dirname, '../../..', file),
          'utf8'
        );
        codeSnippets.push({
          file,
          content: content.substring(0, 2000), // First 2000 chars
          language: path.extname(file).slice(1),
          relevant: true
        });
      } catch (error) {
        codeSnippets.push({
          file,
          error: error.message,
          relevant: false
        });
      }
    }
    
    return codeSnippets;
  }

  async loadPreviousFixes(components) {
    if (!components || components.length === 0) return [];
    
    const result = await this.db.query(`
      SELECT DISTINCT
        ti.title as issue,
        ti.solution,
        ti.root_cause,
        taa.confidence_score as confidence
      FROM test_issues ti
      LEFT JOIN test_ai_analysis taa ON taa.issue_id = ti.id
      WHERE ti.status = 'fixed'
      AND ti.affected_components && $1
      ORDER BY ti.resolved_at DESC
      LIMIT 5
    `, [components]);
    
    return result.rows;
  }

  calculatePriority(issue, testCase) {
    if (issue.severity === 'critical' || testCase.priority === 'critical') {
      return 'CRITICAL';
    }
    if (issue.severity === 'high' || testCase.priority === 'high') {
      return 'HIGH';
    }
    return 'NORMAL';
  }

  validateAnalysis(analysis) {
    return analysis.rootCauseAnalysis &&
           analysis.proposedFixes &&
           Array.isArray(analysis.proposedFixes) &&
           typeof analysis.confidence === 'number';
  }

  async saveAnalysisRequest(request) {
    await this.db.query(`
      INSERT INTO test_analysis_requests
      (id, request_type, priority, request_data, status, created_at)
      VALUES ($1, $2, $3, $4, 'pending', NOW())
    `, [
      request.id,
      request.type,
      request.priority,
      JSON.stringify(request)
    ]);
  }

  async loadAnalysisRequest(requestId) {
    const result = await this.db.query(
      'SELECT request_data FROM test_analysis_requests WHERE id = $1',
      [requestId]
    );
    return JSON.parse(result.rows[0].request_data);
  }

  async storeAnalysis(request, analysis) {
    const result = await this.db.query(`
      INSERT INTO test_ai_analysis
      (id, issue_id, analysis_type, confidence_score, analysis_data, created_at)
      VALUES ($1, $2, 'claude-analysis', $3, $4, NOW())
      RETURNING *
    `, [
      crypto.randomUUID(),
      request.data.issue.id,
      analysis.confidence,
      JSON.stringify(analysis)
    ]);
    
    // Update issue with root cause
    await this.db.query(`
      UPDATE test_issues
      SET root_cause = $2, updated_at = NOW()
      WHERE id = $1
    `, [request.data.issue.id, analysis.rootCauseAnalysis.description]);
    
    return result.rows[0];
  }

  async createFixTasks(request, analysis) {
    const tasks = [];
    
    for (const fix of analysis.proposedFixes) {
      const task = await this.db.query(`
        INSERT INTO test_fix_tasks
        (id, issue_id, issue_number, description, fix_type, changes, 
         test_command, risk_level, confidence, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW())
        RETURNING *
      `, [
        crypto.randomUUID(),
        request.data.issue.id,
        request.data.issue.number,
        fix.description,
        fix.type,
        JSON.stringify(fix.changes),
        fix.testCommand,
        fix.riskLevel,
        analysis.confidence
      ]);
      
      tasks.push(task.rows[0]);
    }
    
    return tasks;
  }

  async prepareAutomaticFix(fixTask) {
    try {
      const branchName = `fix/ai-${fixTask.issue_number}-prep`;
      execSync(`git checkout -b ${branchName}`, {
        cwd: path.join(__dirname, '../../..')
      });
      
      return {
        prepared: true,
        branch: branchName,
        fixTaskId: fixTask.id
      };
    } catch (error) {
      return {
        prepared: false,
        error: error.message
      };
    }
  }

  async loadFixTask(fixTaskId) {
    const result = await this.db.query(
      'SELECT * FROM test_fix_tasks WHERE id = $1',
      [fixTaskId]
    );
    const task = result.rows[0];
    task.changes = JSON.parse(task.changes);
    return task;
  }

  async updateIssueStatus(issueId, status, details) {
    await this.db.query(`
      UPDATE test_issues
      SET status = $2, solution = $3, fixed_by = 'claude-ai', 
          fix_version = $4, resolved_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [
      issueId,
      status,
      JSON.stringify(details),
      details.branchName
    ]);
  }
}

export default ClaudeTestAgent;