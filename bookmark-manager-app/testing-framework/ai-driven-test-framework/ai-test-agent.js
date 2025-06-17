import OpenAI from 'openai';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import unifiedLogger from '../../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * AI Test Agent - Analyzes test failures and proposes/implements fixes
 */
class AITestAgent {
  constructor(config) {
    this.config = config;
    this.logger = unifiedLogger.child({ service: 'ai-test-agent' });
    this.db = new pg.Pool(config.database);
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.fixAttempts = new Map();
  }

  async analyzeTestFailure(issueId, prId) {
    this.logger.info(`Analyzing test failure - Issue: ${issueId}, PR: ${prId}`);
    
    try {
      // Load issue and PR details from database
      const issueData = await this.loadIssueData(issueId);
      const prData = await this.loadPRData(prId);
      const stepResults = await this.loadStepResults(issueData.execution_id);
      
      // Analyze the failure
      const analysis = await this.performAIAnalysis(issueData, prData, stepResults);
      
      // Store analysis in database
      await this.storeAnalysis(issueId, analysis);
      
      // Generate fix proposals
      const fixes = await this.generateFixProposals(analysis);
      
      // Attempt automatic fix if confidence is high
      if (analysis.confidence > 0.8 && this.config.autoFix) {
        await this.attemptAutomaticFix(issueId, fixes[0]);
      }
      
      return {
        analysis,
        fixes,
        autoFixAttempted: analysis.confidence > 0.8
      };
      
    } catch (error) {
      this.logger.error('Failed to analyze test failure', error);
      throw error;
    }
  }

  async performAIAnalysis(issueData, prData, stepResults) {
    const prompt = this.buildAnalysisPrompt(issueData, prData, stepResults);
    
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert test automation engineer analyzing test failures in a web application.
          The application is a bookmark manager built with React frontend and Node.js backend.
          Analyze the test failure and provide:
          1. Root cause analysis
          2. Specific fix recommendations
          3. Code changes needed
          4. Confidence level (0-1) in your analysis`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 2000
    });
    
    const response = JSON.parse(completion.choices[0].message.content);
    
    return {
      rootCause: response.rootCause,
      category: response.category,
      affectedComponents: response.affectedComponents,
      fixes: response.fixes,
      confidence: response.confidence,
      aiExplanation: response.explanation,
      timestamp: new Date()
    };
  }

  buildAnalysisPrompt(issueData, prData, stepResults) {
    const failedStep = stepResults.find(step => !step.passed);
    
    return `
## Test Failure Analysis Request

### Test Information
- Test Case: ${prData.title}
- Failed Step: ${failedStep?.step_number} - ${failedStep?.description}
- Error Type: ${issueData.severity}

### Error Details
\`\`\`
${issueData.description}
\`\`\`

### Failed Step Details
- Action Type: ${failedStep?.action_type}
- Target Selector: ${failedStep?.target_selector}
- Validation Type: ${failedStep?.validation_type}
- Expected: ${JSON.stringify(failedStep?.expected)}
- Actual: ${JSON.stringify(failedStep?.actual)}
- Error Message: ${failedStep?.error_message}

### Test Context
${prData.description}

### Steps to Reproduce
${prData.steps_to_reproduce}

### Previous Successful Steps
${stepResults.filter(s => s.passed).map(s => `✓ Step ${s.step_number}: ${s.description}`).join('\n')}

### Environment
- Browser: Chromium
- OS: ${process.platform}
- Node: ${process.version}

Please analyze this failure and provide:
1. The most likely root cause
2. Category of issue (selector-change, timing, data, logic, environment)
3. Affected components in the codebase
4. Specific fixes with code examples
5. Confidence level in your analysis (0-1)

Format your response as JSON.`;
  }

  async generateFixProposals(analysis) {
    const fixes = [];
    
    for (const fix of analysis.fixes) {
      const proposal = {
        id: `FIX-${Date.now()}-${fixes.length}`,
        type: fix.type,
        description: fix.description,
        changes: fix.changes,
        estimatedImpact: fix.impact,
        riskLevel: fix.risk || 'low',
        implementation: await this.generateImplementation(fix)
      };
      
      fixes.push(proposal);
    }
    
    return fixes;
  }

  async generateImplementation(fix) {
    switch (fix.type) {
      case 'selector-update':
        return this.generateSelectorFix(fix);
      case 'timing-adjustment':
        return this.generateTimingFix(fix);
      case 'data-fix':
        return this.generateDataFix(fix);
      case 'logic-fix':
        return this.generateLogicFix(fix);
      default:
        return { manual: true, instructions: fix.description };
    }
  }

  generateSelectorFix(fix) {
    return {
      automatic: true,
      fileChanges: [{
        file: fix.targetFile,
        changes: [{
          type: 'replace',
          search: fix.oldSelector,
          replace: fix.newSelector
        }]
      }],
      testCommand: `npm test -- --filter="${fix.testId}"`
    };
  }

  generateTimingFix(fix) {
    return {
      automatic: true,
      fileChanges: [{
        file: fix.targetFile,
        changes: [{
          type: 'update-timeout',
          location: fix.stepId,
          newTimeout: fix.recommendedTimeout
        }]
      }]
    };
  }

  generateDataFix(fix) {
    return {
      automatic: fix.automatic || false,
      databaseChanges: fix.sqlStatements || [],
      seedDataChanges: fix.seedDataUpdates || [],
      instructions: fix.manualSteps || []
    };
  }

  generateLogicFix(fix) {
    return {
      automatic: false,
      codeChanges: fix.codeSnippets || [],
      affectedFiles: fix.files || [],
      pullRequestTemplate: this.generatePRTemplate(fix)
    };
  }

  generatePRTemplate(fix) {
    return `
## Fix for Test Failure

### Problem
${fix.problem}

### Solution
${fix.solution}

### Changes Made
${fix.changes.map(c => `- ${c}`).join('\n')}

### Testing
- [ ] Test case now passes
- [ ] No regression in other tests
- [ ] Manual testing completed

### AI Confidence: ${fix.confidence}
`;
  }

  async attemptAutomaticFix(issueId, fix) {
    this.logger.info(`Attempting automatic fix for issue ${issueId}`);
    
    const attemptId = `ATTEMPT-${Date.now()}`;
    this.fixAttempts.set(attemptId, {
      issueId,
      fix,
      startTime: Date.now(),
      status: 'in-progress'
    });
    
    try {
      // Create a branch for the fix
      const branchName = `fix/test-issue-${issueId}`;
      execSync(`git checkout -b ${branchName}`, { cwd: path.join(__dirname, '../../..') });
      
      // Apply the fix
      const result = await this.applyFix(fix);
      
      // Run the affected test
      const testResult = await this.runAffectedTest(fix);
      
      if (testResult.passed) {
        // Commit the fix
        execSync(`git add -A && git commit -m "Fix: Resolve test issue ${issueId}\n\n${fix.description}"`, {
          cwd: path.join(__dirname, '../../..')
        });
        
        // Update issue status
        await this.markIssueResolved(issueId, {
          fixId: attemptId,
          fix: fix,
          testResult: testResult
        });
        
        this.logger.info(`Successfully fixed issue ${issueId}`);
        
        return {
          success: true,
          attemptId,
          branchName,
          testResult
        };
      } else {
        // Revert changes
        execSync(`git checkout . && git checkout main && git branch -D ${branchName}`, {
          cwd: path.join(__dirname, '../../..')
        });
        
        this.logger.warn(`Automatic fix failed for issue ${issueId}`);
        
        return {
          success: false,
          attemptId,
          reason: 'Test still failing after fix',
          testResult
        };
      }
      
    } catch (error) {
      this.logger.error(`Error applying automatic fix`, error);
      
      // Clean up
      try {
        execSync('git checkout main', { cwd: path.join(__dirname, '../../..') });
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return {
        success: false,
        attemptId,
        error: error.message
      };
    } finally {
      this.fixAttempts.get(attemptId).status = 'completed';
    }
  }

  async applyFix(fix) {
    const results = [];
    
    if (fix.implementation.automatic && fix.implementation.fileChanges) {
      for (const fileChange of fix.implementation.fileChanges) {
        const filePath = path.join(__dirname, '../../..', fileChange.file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        for (const change of fileChange.changes) {
          if (change.type === 'replace') {
            content = content.replace(
              new RegExp(change.search, 'g'),
              change.replace
            );
          } else if (change.type === 'insert') {
            // Insert at specific line or pattern
            content = this.insertAtLocation(content, change);
          }
        }
        
        fs.writeFileSync(filePath, content);
        results.push({ file: fileChange.file, applied: true });
      }
    }
    
    if (fix.implementation.databaseChanges) {
      for (const sql of fix.implementation.databaseChanges) {
        await this.db.query(sql);
        results.push({ type: 'database', sql, applied: true });
      }
    }
    
    return results;
  }

  insertAtLocation(content, change) {
    if (change.afterPattern) {
      const regex = new RegExp(change.afterPattern);
      const match = content.match(regex);
      if (match) {
        const index = match.index + match[0].length;
        return content.slice(0, index) + '\n' + change.content + content.slice(index);
      }
    } else if (change.line) {
      const lines = content.split('\n');
      lines.splice(change.line, 0, change.content);
      return lines.join('\n');
    }
    return content;
  }

  async runAffectedTest(fix) {
    try {
      const testCommand = fix.implementation.testCommand || 
        `npx vitest run ${fix.testFile || ''}`;
      
      const output = execSync(testCommand, {
        cwd: path.join(__dirname, '../../..'),
        encoding: 'utf8'
      });
      
      return {
        passed: !output.includes('FAIL'),
        output,
        command: testCommand
      };
    } catch (error) {
      return {
        passed: false,
        error: error.message,
        output: error.stdout?.toString() || error.message
      };
    }
  }

  async markIssueResolved(issueId, resolution) {
    await this.db.query(`
      UPDATE test_issues
      SET 
        status = 'fixed',
        root_cause = $2,
        solution = $3,
        fixed_by = 'ai-agent',
        fix_version = $4,
        resolved_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [
      issueId,
      resolution.fix.description,
      JSON.stringify(resolution.fix.implementation),
      resolution.fixId
    ]);
    
    // Update related PR
    await this.db.query(`
      UPDATE problem_reports
      SET
        status = 'resolved',
        resolution = $2,
        resolution_date = NOW()
      WHERE issue_id = $1
    `, [
      issueId,
      `Automatically fixed by AI agent. Fix ID: ${resolution.fixId}`
    ]);
  }

  async loadIssueData(issueId) {
    const result = await this.db.query(
      'SELECT * FROM test_issues WHERE id = $1',
      [issueId]
    );
    return result.rows[0];
  }

  async loadPRData(prId) {
    const result = await this.db.query(
      'SELECT * FROM problem_reports WHERE pr_number = $1',
      [prId]
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

  async storeAnalysis(issueId, analysis) {
    await this.db.query(`
      UPDATE test_issues
      SET 
        root_cause = $2,
        updated_at = NOW()
      WHERE id = $1
    `, [issueId, analysis.rootCause]);
    
    // Store detailed analysis
    await this.db.query(`
      INSERT INTO test_ai_analysis
      (id, issue_id, analysis_type, confidence_score, analysis_data, created_at)
      VALUES ($1, $2, 'root-cause', $3, $4, NOW())
    `, [
      crypto.randomUUID(),
      issueId,
      analysis.confidence,
      JSON.stringify(analysis)
    ]);
  }

  async monitorTestRuns() {
    this.logger.info('Starting test run monitoring');
    
    // Poll for new failures
    setInterval(async () => {
      try {
        const failures = await this.getUnanalyzedFailures();
        
        for (const failure of failures) {
          await this.analyzeTestFailure(failure.issue_id, failure.pr_number);
        }
      } catch (error) {
        this.logger.error('Error in test monitoring', error);
      }
    }, 30000); // Check every 30 seconds
  }

  async getUnanalyzedFailures() {
    const result = await this.db.query(`
      SELECT i.id as issue_id, pr.pr_number
      FROM test_issues i
      JOIN problem_reports pr ON pr.issue_id = i.id
      WHERE i.status = 'open'
      AND i.root_cause IS NULL
      ORDER BY i.created_at DESC
      LIMIT 10
    `);
    
    return result.rows;
  }
}

export default AITestAgent;