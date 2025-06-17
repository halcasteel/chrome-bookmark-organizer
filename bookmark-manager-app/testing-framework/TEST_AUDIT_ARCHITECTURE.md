# Test Audit Architecture

## Overview
This document defines the complete audit trail architecture for test execution, ensuring end-to-end traceability from test plan to execution results, screenshots, and database records.

## Directory Structure

```
testing-framework/
├── test-runs/                              # All test execution data
│   └── {YYYY-MM-DD}/                      # Daily folders
│       └── run-{RUN_ID}/                  # Unique run ID (UUID)
│           ├── metadata.json              # Run metadata
│           ├── test-plan.json             # Copy of test plan used
│           ├── execution-log.json         # Detailed execution log
│           ├── screenshots/               # All screenshots for this run
│           │   └── {TEST_ID}/            # Per test case
│           │       └── {STEP_NUMBER}-{STEP_ID}-{TIMESTAMP}.png
│           ├── network-logs/              # HAR files and API logs
│           │   └── {TEST_ID}/
│           │       └── {STEP_NUMBER}-{API_CALL}.har
│           ├── console-logs/              # Browser console logs
│           │   └── {TEST_ID}.log
│           ├── videos/                    # Test execution videos
│           │   └── {TEST_ID}.webm
│           └── reports/                   # Generated reports
│               ├── summary.html
│               ├── detailed-report.json
│               └── audit-trail.json
```

## Naming Conventions

### Run ID Format
```
RUN-{YYYY}{MM}{DD}-{HHMMSS}-{RANDOM_4_CHARS}
Example: RUN-20250616-143022-A7B9
```

### Test Execution ID Format
```
EXEC-{RUN_ID}-{TEST_ID}-{TIMESTAMP}
Example: EXEC-RUN-20250616-143022-A7B9-TEST-FE-AUTH-LOGIN-001-1750110182000
```

### Screenshot Naming
```
{STEP_NUMBER:03d}-{STEP_ID}-{ACTION}-{RESULT}-{TIMESTAMP}.png
Example: 001-navigate-to-login-PAGE_LOAD-SUCCESS-1750110182000.png
         002-enter-email-INPUT-SUCCESS-1750110183000.png
         003-click-submit-CLICK-FAILED-1750110184000.png
```

### File Checksum
All files will include SHA-256 checksums for integrity verification.

## Database Schema Extensions

```sql
-- Test Run Tracking
CREATE TABLE test_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id VARCHAR(50) UNIQUE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL, -- running, completed, failed, aborted
    environment JSONB NOT NULL,
    test_plan_checksum VARCHAR(64) NOT NULL,
    total_tests INTEGER,
    passed INTEGER,
    failed INTEGER,
    skipped INTEGER,
    artifacts_path VARCHAR(500) NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    machine_info JSONB,
    git_commit VARCHAR(40),
    git_branch VARCHAR(100)
);

-- Detailed Step Execution with Audit Trail
CREATE TABLE test_step_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID REFERENCES test_executions(id),
    step_number INTEGER NOT NULL,
    step_id VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    target_element TEXT,
    input_data JSONB,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    status VARCHAR(20) NOT NULL,
    screenshot_before VARCHAR(500),
    screenshot_after VARCHAR(500),
    screenshot_checksum VARCHAR(64),
    network_log_path VARCHAR(500),
    console_log_path VARCHAR(500),
    error_details JSONB,
    validation_results JSONB,
    audit_metadata JSONB NOT NULL -- includes user, IP, session info
);

-- File Integrity Tracking
CREATE TABLE test_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES test_runs(id),
    execution_id UUID REFERENCES test_executions(id),
    artifact_type VARCHAR(50) NOT NULL, -- screenshot, video, har, log
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    checksum_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    metadata JSONB
);

-- Audit Log for All Actions
CREATE TABLE test_audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES test_runs(id),
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    action_details JSONB,
    system_state JSONB
);
```

## Traceability Features

### 1. Unique Identifiers
- Every test run has a unique RUN_ID
- Every test execution has a unique EXEC_ID
- Every screenshot/artifact has a checksum
- All IDs are traceable across filesystem and database

### 2. Timestamp Synchronization
- All timestamps use ISO 8601 with timezone
- Synchronized between filesystem, database, and logs
- Millisecond precision for ordering

### 3. Data Integrity
- SHA-256 checksums for all files
- Database transactions for atomic updates
- Immutable audit logs
- File versioning for test plans

### 4. Chain of Custody
- Who initiated the test
- What machine/environment
- What version of code (git commit)
- What test plan version
- Complete environment snapshot

### 5. Compliance Features
- GDPR compliant data retention
- Automated cleanup policies
- Encrypted sensitive data
- Access control logging

## Implementation Example

```javascript
class AuditableTestRunner {
  async executeTest(testCase) {
    const runId = this.generateRunId();
    const execId = this.generateExecId(runId, testCase.id);
    
    // Create audit entry
    await this.auditLog('TEST_STARTED', {
      runId,
      execId,
      testCase: testCase.id,
      actor: process.env.USER || 'system',
      machine: os.hostname(),
      environment: this.captureEnvironment()
    });
    
    // Execute with full tracking
    for (const step of testCase.steps) {
      const stepResult = await this.executeStep(step, {
        runId,
        execId,
        beforeScreenshot: true,
        afterScreenshot: true,
        captureNetwork: true,
        captureConsole: true
      });
      
      // Store all artifacts with checksums
      await this.storeArtifacts(stepResult);
    }
  }
}
```

## Reporting and Verification

### Audit Report Contents
1. Complete test execution timeline
2. All artifacts with checksums
3. Environment configuration
4. User actions and system responses
5. Network traffic summary
6. Performance metrics
7. Compliance verification

### Verification Process
```bash
# Verify test run integrity
npm run verify-test-run --run-id=RUN-20250616-143022-A7B9

# Generate audit report
npm run generate-audit-report --run-id=RUN-20250616-143022-A7B9 --format=pdf

# Export for external audit
npm run export-test-evidence --run-id=RUN-20250616-143022-A7B9 --output=./audit-package.zip
```

## Retention Policy

- Test runs: 90 days
- Screenshots: 30 days
- Videos: 7 days
- Audit logs: 365 days
- Summary reports: Indefinite

## Security Considerations

1. All sensitive data (passwords, tokens) are masked in logs
2. Screenshots are sanitized for PII
3. Access to test results requires authentication
4. All file operations are logged
5. Checksums prevent tampering