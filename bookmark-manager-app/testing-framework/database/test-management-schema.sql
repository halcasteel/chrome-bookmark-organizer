-- Test Management Database Schema
-- This creates a comprehensive test tracking system with full auditability

-- Test Plans table
CREATE TABLE IF NOT EXISTS test_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    description TEXT,
    scope TEXT,
    objectives JSONB,
    acceptance_criteria JSONB,
    risk_assessment JSONB,
    created_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255),
    approval_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'draft', -- draft, approved, active, archived
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Test Suites table
CREATE TABLE IF NOT EXISTS test_suites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES test_plans(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    layer VARCHAR(50) NOT NULL, -- frontend, backend, database, integration, e2e
    module VARCHAR(100) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium', -- critical, high, medium, low
    estimated_duration INTEGER, -- minutes
    dependencies JSONB,
    tags TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Test Cases table
CREATE TABLE IF NOT EXISTS test_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suite_id UUID REFERENCES test_suites(id) ON DELETE CASCADE,
    test_id VARCHAR(100) UNIQUE NOT NULL, -- e.g., TEST-FE-AUTH-LOGIN-001
    name VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL, -- unit, integration, functional, performance, security, accessibility
    category VARCHAR(50), -- positive, negative, edge, boundary
    preconditions TEXT,
    test_data JSONB,
    steps JSONB NOT NULL, -- Array of step objects
    expected_results JSONB NOT NULL,
    actual_results JSONB,
    requirements TEXT[], -- Requirement IDs this test covers
    user_stories TEXT[], -- User story IDs
    priority VARCHAR(20) DEFAULT 'medium',
    automated BOOLEAN DEFAULT false,
    test_script_path VARCHAR(500),
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Test Executions table
CREATE TABLE IF NOT EXISTS test_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
    execution_id VARCHAR(100) UNIQUE NOT NULL,
    run_id UUID, -- Groups executions in a test run
    status VARCHAR(50) NOT NULL, -- pending, running, passed, failed, blocked, skipped
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    executed_by VARCHAR(255),
    environment JSONB, -- Test environment details
    test_data_used JSONB,
    steps_executed JSONB, -- Detailed step execution results
    screenshots TEXT[], -- Array of screenshot URLs
    videos TEXT[], -- Array of video URLs
    logs TEXT, -- Execution logs
    error_message TEXT,
    error_stack TEXT,
    failure_type VARCHAR(100), -- assertion, timeout, crash, network, etc.
    retry_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Test Issues table
CREATE TABLE IF NOT EXISTS test_issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID REFERENCES test_executions(id) ON DELETE CASCADE,
    issue_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL, -- critical, high, medium, low
    status VARCHAR(50) DEFAULT 'open', -- open, investigating, fixed, verified, closed, wont_fix
    root_cause TEXT,
    solution TEXT,
    prevention TEXT,
    affected_tests UUID[], -- Array of test_case_ids
    affected_components TEXT[],
    assigned_to VARCHAR(255),
    fixed_by VARCHAR(255),
    fix_version VARCHAR(50),
    verified_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PR/PQ (Problem Report/Problem Query) table
CREATE TABLE IF NOT EXISTS problem_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pr_number VARCHAR(50) UNIQUE NOT NULL,
    issue_id UUID REFERENCES test_issues(id),
    type VARCHAR(20) NOT NULL, -- PR (Problem Report) or PQ (Problem Query)
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    steps_to_reproduce TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    impact_analysis TEXT,
    workaround TEXT,
    priority VARCHAR(20) NOT NULL,
    category VARCHAR(100), -- functional, performance, security, usability, etc.
    reported_by VARCHAR(255) NOT NULL,
    reported_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolution TEXT,
    resolution_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'open',
    attachments JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Test Metrics table
CREATE TABLE IF NOT EXISTS test_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID,
    metric_date DATE NOT NULL,
    total_tests INTEGER,
    tests_executed INTEGER,
    tests_passed INTEGER,
    tests_failed INTEGER,
    tests_blocked INTEGER,
    tests_skipped INTEGER,
    pass_rate DECIMAL(5,2),
    automation_rate DECIMAL(5,2),
    defect_density DECIMAL(10,2),
    mean_time_to_failure INTEGER, -- minutes
    mean_time_to_repair INTEGER, -- minutes
    test_coverage JSONB, -- Coverage by module/layer
    performance_metrics JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Test Coverage Mapping table
CREATE TABLE IF NOT EXISTS test_coverage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE,
    component_type VARCHAR(50) NOT NULL, -- page, api, function, table, etc.
    component_name VARCHAR(255) NOT NULL,
    component_path VARCHAR(500),
    coverage_type VARCHAR(50), -- statement, branch, function, line
    coverage_percentage DECIMAL(5,2),
    last_tested TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Test Audit Log table
CREATE TABLE IF NOT EXISTS test_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- test_plan, test_case, execution, issue, etc.
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- created, updated, deleted, executed, passed, failed
    changes JSONB,
    performed_by VARCHAR(255) NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Indexes for performance
CREATE INDEX idx_test_cases_suite_id ON test_cases(suite_id);
CREATE INDEX idx_test_cases_test_id ON test_cases(test_id);
CREATE INDEX idx_test_cases_automated ON test_cases(automated);
CREATE INDEX idx_test_executions_test_case_id ON test_executions(test_case_id);
CREATE INDEX idx_test_executions_run_id ON test_executions(run_id);
CREATE INDEX idx_test_executions_status ON test_executions(status);
CREATE INDEX idx_test_executions_started_at ON test_executions(started_at DESC);
CREATE INDEX idx_test_issues_status ON test_issues(status);
CREATE INDEX idx_test_issues_severity ON test_issues(severity);
CREATE INDEX idx_problem_reports_status ON problem_reports(status);
CREATE INDEX idx_test_metrics_run_id ON test_metrics(run_id);
CREATE INDEX idx_test_metrics_date ON test_metrics(metric_date DESC);
CREATE INDEX idx_test_coverage_component ON test_coverage(component_type, component_name);
CREATE INDEX idx_test_audit_entity ON test_audit_log(entity_type, entity_id);
CREATE INDEX idx_test_audit_performed_at ON test_audit_log(performed_at DESC);

-- Views for reporting
CREATE OR REPLACE VIEW test_execution_summary AS
SELECT 
    tc.test_id,
    tc.name as test_name,
    ts.name as suite_name,
    tc.type as test_type,
    te.status as last_status,
    te.executed_by as last_executed_by,
    te.started_at as last_executed_at,
    te.duration_ms,
    COUNT(DISTINCT ti.id) as issue_count
FROM test_cases tc
LEFT JOIN test_suites ts ON tc.suite_id = ts.id
LEFT JOIN LATERAL (
    SELECT * FROM test_executions 
    WHERE test_case_id = tc.id 
    ORDER BY started_at DESC 
    LIMIT 1
) te ON true
LEFT JOIN test_issues ti ON ti.execution_id = te.id
GROUP BY tc.id, ts.id, te.id;

-- Functions
CREATE OR REPLACE FUNCTION calculate_test_metrics(p_run_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total INTEGER;
    v_executed INTEGER;
    v_passed INTEGER;
    v_failed INTEGER;
    v_blocked INTEGER;
    v_skipped INTEGER;
BEGIN
    SELECT 
        COUNT(DISTINCT tc.id),
        COUNT(DISTINCT CASE WHEN te.status IS NOT NULL THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'passed' THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'failed' THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'blocked' THEN tc.id END),
        COUNT(DISTINCT CASE WHEN te.status = 'skipped' THEN tc.id END)
    INTO v_total, v_executed, v_passed, v_failed, v_blocked, v_skipped
    FROM test_cases tc
    LEFT JOIN test_executions te ON tc.id = te.test_case_id AND te.run_id = p_run_id;
    
    INSERT INTO test_metrics (
        run_id, metric_date, total_tests, tests_executed, 
        tests_passed, tests_failed, tests_blocked, tests_skipped,
        pass_rate, automation_rate
    ) VALUES (
        p_run_id, CURRENT_DATE, v_total, v_executed,
        v_passed, v_failed, v_blocked, v_skipped,
        CASE WHEN v_executed > 0 THEN (v_passed::DECIMAL / v_executed) * 100 ELSE 0 END,
        (SELECT COUNT(*)::DECIMAL / v_total * 100 FROM test_cases WHERE automated = true)
    );
END;
$$ LANGUAGE plpgsql;

-- Test Step Results table for detailed step tracking
CREATE TABLE IF NOT EXISTS test_step_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id UUID REFERENCES test_executions(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    description TEXT,
    passed BOOLEAN NOT NULL,
    duration_ms INTEGER,
    action_type VARCHAR(50),
    target_selector TEXT,
    validation_type VARCHAR(50),
    expected JSONB,
    actual JSONB,
    error_message TEXT,
    error_stack TEXT,
    screenshots TEXT[],
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ai_analysis JSONB
);

CREATE INDEX idx_step_results_execution ON test_step_results(execution_id);
CREATE INDEX idx_step_results_passed ON test_step_results(passed);

-- AI Analysis tables
CREATE TABLE IF NOT EXISTS test_analysis_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    request_data JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    response_data JSONB
);

CREATE TABLE IF NOT EXISTS test_ai_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID REFERENCES test_issues(id),
    analysis_type VARCHAR(50) NOT NULL,
    confidence_score DECIMAL(3,2),
    analysis_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_fix_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issue_id UUID REFERENCES test_issues(id),
    issue_number VARCHAR(50),
    description TEXT NOT NULL,
    fix_type VARCHAR(50) NOT NULL,
    changes JSONB NOT NULL,
    test_command VARCHAR(500),
    risk_level VARCHAR(20),
    confidence DECIMAL(3,2),
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    applied_at TIMESTAMP WITH TIME ZONE,
    result JSONB
);

CREATE INDEX idx_analysis_requests_status ON test_analysis_requests(status);
CREATE INDEX idx_ai_analysis_issue ON test_ai_analysis(issue_id);
CREATE INDEX idx_fix_tasks_issue ON test_fix_tasks(issue_id);
CREATE INDEX idx_fix_tasks_status ON test_fix_tasks(status);

-- Triggers for audit logging
CREATE OR REPLACE FUNCTION audit_test_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO test_audit_log (entity_type, entity_id, action, changes, performed_by)
    VALUES (
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        TG_OP,
        CASE 
            WHEN TG_OP = 'INSERT' THEN row_to_json(NEW)
            WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW))
            WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        END,
        COALESCE(current_setting('app.current_user', true), 'system')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_test_plans AFTER INSERT OR UPDATE OR DELETE ON test_plans
    FOR EACH ROW EXECUTE FUNCTION audit_test_changes();
CREATE TRIGGER audit_test_cases AFTER INSERT OR UPDATE OR DELETE ON test_cases
    FOR EACH ROW EXECUTE FUNCTION audit_test_changes();
CREATE TRIGGER audit_test_executions AFTER INSERT OR UPDATE OR DELETE ON test_executions
    FOR EACH ROW EXECUTE FUNCTION audit_test_changes();
CREATE TRIGGER audit_test_issues AFTER INSERT OR UPDATE OR DELETE ON test_issues
    FOR EACH ROW EXECUTE FUNCTION audit_test_changes();