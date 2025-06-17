import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test Execution Tracker
 * Tracks all test executions, issues, and resolutions in the database
 */
class TestExecutionTracker {
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.currentRunId = crypto.randomUUID();
    this.executionStats = {
      total: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0
    };
  }

  async startTestRun(name, environment) {
    console.log(`🚀 Starting test run: ${name}`);
    
    this.runMetadata = {
      id: this.currentRunId,
      name,
      environment,
      startedAt: new Date(),
      executedBy: process.env.USER || 'system'
    };
    
    // Log to database if connected
    if (this.dbConfig) {
      await this.logRunStart();
    }
    
    return this.currentRunId;
  }

  async recordTestExecution(testId, result) {
    const execution = {
      id: crypto.randomUUID(),
      execution_id: `EXEC-${Date.now()}-${testId}`,
      test_case_id: testId,
      run_id: this.currentRunId,
      status: result.status, // passed, failed, blocked, skipped
      started_at: result.startedAt,
      completed_at: result.completedAt,
      duration_ms: result.duration,
      executed_by: this.runMetadata.executedBy,
      environment: this.runMetadata.environment,
      test_data_used: result.testData,
      steps_executed: result.steps,
      screenshots: result.screenshots || [],
      videos: result.videos || [],
      logs: result.logs,
      error_message: result.error?.message,
      error_stack: result.error?.stack,
      failure_type: result.failureType,
      retry_count: result.retryCount || 0,
      notes: result.notes
    };
    
    // Update stats
    this.executionStats.total++;
    this.executionStats[result.status]++;
    
    // Save to database
    if (this.dbConfig) {
      await this.saveExecutionToDatabase(execution);
      
      // If test failed, create an issue
      if (result.status === 'failed') {
        await this.createTestIssue(execution, result);
      }
    }
    
    // Save to file for backup
    await this.saveExecutionToFile(execution);
    
    return execution;
  }

  async createTestIssue(execution, testResult) {
    const issue = {
      id: crypto.randomUUID(),
      execution_id: execution.id,
      issue_number: `ISS-${Date.now()}`,
      title: `Test Failure: ${testResult.testName}`,
      description: this.generateIssueDescription(execution, testResult),
      severity: this.determineSeverity(testResult),
      status: 'open',
      root_cause: null,
      solution: null,
      prevention: null,
      affected_tests: [testResult.testId],
      affected_components: testResult.affectedComponents || [],
      assigned_to: null,
      created_at: new Date()
    };
    
    if (this.dbConfig) {
      await this.saveIssueToDatabase(issue);
    }
    
    // Also create a PR (Problem Report)
    await this.createProblemReport(issue, execution, testResult);
    
    return issue;
  }

  async createProblemReport(issue, execution, testResult) {
    const pr = {
      id: crypto.randomUUID(),
      pr_number: `PR-${Date.now()}`,
      issue_id: issue.id,
      type: 'PR',
      title: issue.title,
      description: issue.description,
      steps_to_reproduce: this.formatStepsToReproduce(testResult),
      expected_behavior: testResult.expectedBehavior,
      actual_behavior: testResult.actualBehavior,
      impact_analysis: this.analyzeImpact(testResult),
      workaround: null,
      priority: this.determinePriority(testResult),
      category: this.categorizeIssue(testResult),
      reported_by: execution.executed_by,
      reported_date: new Date(),
      status: 'open',
      attachments: {
        screenshots: execution.screenshots,
        videos: execution.videos,
        logs: execution.logs
      }
    };
    
    if (this.dbConfig) {
      await this.saveProblemReportToDatabase(pr);
    }
    
    return pr;
  }

  async recordIssueResolution(issueId, resolution) {
    const update = {
      status: 'fixed',
      root_cause: resolution.rootCause,
      solution: resolution.solution,
      prevention: resolution.prevention,
      fixed_by: resolution.fixedBy || process.env.USER || 'system',
      fix_version: resolution.version,
      resolved_at: new Date()
    };
    
    if (this.dbConfig) {
      await this.updateIssueInDatabase(issueId, update);
    }
    
    // Log the resolution
    await this.logResolution(issueId, resolution);
  }

  async generateTestReport() {
    const report = {
      runId: this.currentRunId,
      runName: this.runMetadata.name,
      environment: this.runMetadata.environment,
      executedBy: this.runMetadata.executedBy,
      startedAt: this.runMetadata.startedAt,
      completedAt: new Date(),
      duration: new Date() - this.runMetadata.startedAt,
      summary: {
        total: this.executionStats.total,
        passed: this.executionStats.passed,
        failed: this.executionStats.failed,
        blocked: this.executionStats.blocked,
        skipped: this.executionStats.skipped,
        passRate: this.executionStats.total > 0 
          ? (this.executionStats.passed / this.executionStats.total * 100).toFixed(2) + '%'
          : '0%'
      },
      issues: await this.getRunIssues(),
      metrics: await this.calculateMetrics()
    };
    
    // Save report
    const reportPath = path.join(
      __dirname, 
      '..', 
      'reports', 
      `test-report-${this.currentRunId}.json`
    );
    
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Generate HTML report
    await this.generateHTMLReport(report);
    
    // Update metrics in database
    if (this.dbConfig) {
      await this.updateMetrics(report);
    }
    
    return report;
  }

  generateIssueDescription(execution, testResult) {
    return `
## Test Failure Details

**Test ID**: ${testResult.testId}
**Test Name**: ${testResult.testName}
**Execution ID**: ${execution.execution_id}
**Failed At**: ${execution.completed_at}

### Error Information
**Error Type**: ${testResult.failureType || 'Unknown'}
**Error Message**: ${execution.error_message || 'No error message'}

### Stack Trace
\`\`\`
${execution.error_stack || 'No stack trace available'}
\`\`\`

### Test Steps Executed
${this.formatExecutedSteps(execution.steps_executed)}

### Environment
- **OS**: ${process.platform}
- **Node Version**: ${process.version}
- **Test Environment**: ${execution.environment}

### Additional Context
${testResult.context || 'No additional context provided'}
    `.trim();
  }

  formatStepsToReproduce(testResult) {
    if (!testResult.steps) return 'No steps provided';
    
    return testResult.steps.map((step, index) => 
      `${index + 1}. ${step.description}\n   Expected: ${step.expectedResult}\n   Actual: ${step.actualResult || 'Not executed'}`
    ).join('\n');
  }

  formatExecutedSteps(steps) {
    if (!steps || !Array.isArray(steps)) return 'No steps recorded';
    
    return steps.map((step, index) => {
      const status = step.passed ? '✅' : '❌';
      return `${status} Step ${index + 1}: ${step.description}`;
    }).join('\n');
  }

  determineSeverity(testResult) {
    // Determine severity based on test type and failure
    if (testResult.type === 'security' || testResult.priority === 'critical') {
      return 'critical';
    }
    if (testResult.type === 'functional' && testResult.priority === 'high') {
      return 'high';
    }
    if (testResult.type === 'performance') {
      return 'medium';
    }
    return 'low';
  }

  determinePriority(testResult) {
    // Map test priority to issue priority
    const priorityMap = {
      'critical': 'critical',
      'high': 'high',
      'medium': 'medium',
      'low': 'low'
    };
    return priorityMap[testResult.priority] || 'medium';
  }

  categorizeIssue(testResult) {
    // Categorize based on failure type and test type
    if (testResult.failureType) {
      const categoryMap = {
        'assertion': 'functional',
        'timeout': 'performance',
        'crash': 'stability',
        'network': 'integration',
        'validation': 'functional',
        'security': 'security'
      };
      return categoryMap[testResult.failureType] || 'other';
    }
    return testResult.type || 'other';
  }

  analyzeImpact(testResult) {
    const impacts = [];
    
    if (testResult.priority === 'critical') {
      impacts.push('Critical functionality affected');
    }
    
    if (testResult.affectedComponents?.length > 0) {
      impacts.push(`Affects components: ${testResult.affectedComponents.join(', ')}`);
    }
    
    if (testResult.blocksOtherTests) {
      impacts.push('Blocks other test execution');
    }
    
    return impacts.join('\n') || 'Impact analysis pending';
  }

  async getRunIssues() {
    if (!this.dbConfig) return [];
    
    const client = new pg.Client(this.dbConfig);
    await client.connect();
    
    try {
      const result = await client.query(
        `SELECT i.*, pr.pr_number
         FROM test_issues i
         LEFT JOIN problem_reports pr ON pr.issue_id = i.id
         WHERE i.execution_id IN (
           SELECT id FROM test_executions WHERE run_id = $1
         )`,
        [this.currentRunId]
      );
      
      return result.rows;
    } finally {
      await client.end();
    }
  }

  async calculateMetrics() {
    const metrics = {
      meanTimeToFailure: 0,
      meanTimeToRepair: 0,
      defectDensity: 0,
      testEffectiveness: 0,
      automationRate: 0
    };
    
    // Calculate metrics based on execution data
    // This would involve more complex queries in a real system
    
    return metrics;
  }

  async generateHTMLReport(report) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Report - ${report.runId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .blocked { color: #ffc107; }
        .skipped { color: #6c757d; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f0f0f0; }
        .issue { background: #fff3cd; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Test Execution Report</h1>
        <p><strong>Run ID:</strong> ${report.runId}</p>
        <p><strong>Environment:</strong> ${report.environment}</p>
        <p><strong>Executed By:</strong> ${report.executedBy}</p>
        <p><strong>Duration:</strong> ${Math.round(report.duration / 1000)}s</p>
    </div>
    
    <div class="summary">
        <div class="metric">
            <h3>Total Tests</h3>
            <p style="font-size: 2em;">${report.summary.total}</p>
        </div>
        <div class="metric">
            <h3 class="passed">Passed</h3>
            <p style="font-size: 2em;" class="passed">${report.summary.passed}</p>
        </div>
        <div class="metric">
            <h3 class="failed">Failed</h3>
            <p style="font-size: 2em;" class="failed">${report.summary.failed}</p>
        </div>
        <div class="metric">
            <h3>Pass Rate</h3>
            <p style="font-size: 2em;">${report.summary.passRate}</p>
        </div>
    </div>
    
    <h2>Issues Found</h2>
    <table>
        <tr>
            <th>Issue #</th>
            <th>PR #</th>
            <th>Title</th>
            <th>Severity</th>
            <th>Status</th>
        </tr>
        ${report.issues.map(issue => `
        <tr class="issue">
            <td>${issue.issue_number}</td>
            <td>${issue.pr_number || '-'}</td>
            <td>${issue.title}</td>
            <td>${issue.severity}</td>
            <td>${issue.status}</td>
        </tr>
        `).join('')}
    </table>
</body>
</html>
    `;
    
    const htmlPath = path.join(
      __dirname,
      '..',
      'reports',
      `test-report-${report.runId}.html`
    );
    
    fs.writeFileSync(htmlPath, html);
    console.log(`📊 HTML report generated: ${htmlPath}`);
  }

  // Database operations
  async saveExecutionToDatabase(execution) {
    const client = new pg.Client(this.dbConfig);
    await client.connect();
    
    try {
      await client.query(
        `INSERT INTO test_executions 
         (id, test_case_id, execution_id, run_id, status, started_at, completed_at,
          duration_ms, executed_by, environment, test_data_used, steps_executed,
          screenshots, videos, logs, error_message, error_stack, failure_type,
          retry_count, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          execution.id, execution.test_case_id, execution.execution_id,
          execution.run_id, execution.status, execution.started_at,
          execution.completed_at, execution.duration_ms, execution.executed_by,
          JSON.stringify(execution.environment), JSON.stringify(execution.test_data_used),
          JSON.stringify(execution.steps_executed), execution.screenshots,
          execution.videos, execution.logs, execution.error_message,
          execution.error_stack, execution.failure_type, execution.retry_count,
          execution.notes
        ]
      );
    } finally {
      await client.end();
    }
  }

  async saveIssueToDatabase(issue) {
    const client = new pg.Client(this.dbConfig);
    await client.connect();
    
    try {
      await client.query(
        `INSERT INTO test_issues 
         (id, execution_id, issue_number, title, description, severity, status,
          affected_tests, affected_components, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          issue.id, issue.execution_id, issue.issue_number, issue.title,
          issue.description, issue.severity, issue.status,
          issue.affected_tests, issue.affected_components, issue.created_at
        ]
      );
    } finally {
      await client.end();
    }
  }

  async saveProblemReportToDatabase(pr) {
    const client = new pg.Client(this.dbConfig);
    await client.connect();
    
    try {
      await client.query(
        `INSERT INTO problem_reports 
         (id, pr_number, issue_id, type, title, description, steps_to_reproduce,
          expected_behavior, actual_behavior, impact_analysis, priority, category,
          reported_by, reported_date, status, attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          pr.id, pr.pr_number, pr.issue_id, pr.type, pr.title, pr.description,
          pr.steps_to_reproduce, pr.expected_behavior, pr.actual_behavior,
          pr.impact_analysis, pr.priority, pr.category, pr.reported_by,
          pr.reported_date, pr.status, JSON.stringify(pr.attachments)
        ]
      );
    } finally {
      await client.end();
    }
  }

  async updateIssueInDatabase(issueId, update) {
    const client = new pg.Client(this.dbConfig);
    await client.connect();
    
    try {
      await client.query(
        `UPDATE test_issues 
         SET status = $2, root_cause = $3, solution = $4, prevention = $5,
             fixed_by = $6, fix_version = $7, resolved_at = $8, updated_at = NOW()
         WHERE id = $1`,
        [
          issueId, update.status, update.root_cause, update.solution,
          update.prevention, update.fixed_by, update.fix_version, update.resolved_at
        ]
      );
    } finally {
      await client.end();
    }
  }

  async updateMetrics(report) {
    const client = new pg.Client(this.dbConfig);
    await client.connect();
    
    try {
      await client.query(
        `INSERT INTO test_metrics 
         (run_id, metric_date, total_tests, tests_executed, tests_passed,
          tests_failed, tests_blocked, tests_skipped, pass_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          this.currentRunId, new Date(), report.summary.total,
          report.summary.total, report.summary.passed, report.summary.failed,
          report.summary.blocked, report.summary.skipped,
          parseFloat(report.summary.passRate)
        ]
      );
    } finally {
      await client.end();
    }
  }

  // File operations for backup
  async saveExecutionToFile(execution) {
    const dir = path.join(__dirname, '..', 'executions', this.currentRunId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, `${execution.execution_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(execution, null, 2));
  }

  async logResolution(issueId, resolution) {
    const logPath = path.join(__dirname, '..', 'logs', 'resolutions.log');
    const logEntry = `
[${new Date().toISOString()}] Issue Resolution
Issue ID: ${issueId}
Root Cause: ${resolution.rootCause}
Solution: ${resolution.solution}
Prevention: ${resolution.prevention}
Fixed By: ${resolution.fixedBy}
---
`;
    
    fs.appendFileSync(logPath, logEntry);
  }
}

export default TestExecutionTracker;