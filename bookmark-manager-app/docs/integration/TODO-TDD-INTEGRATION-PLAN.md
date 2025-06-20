# TDD Integration Plan - Test-Driven TODO List
**Date**: 2025-06-19T19:40:00-04:00
**Approach**: Write failing tests first, then make them pass

## Phase 0: Test Infrastructure Setup
**Write the test framework before any changes**

- [ ] Create integration test suite structure
- [ ] Set up test database with known state
- [ ] Create test fixtures for users, bookmarks, collections
- [ ] Write health check test endpoints
- [ ] Create automated test runner script

## Phase 1: Configuration Tests (Write Tests First!)

### 1.1 Write Failing Tests
- [ ] Test: Frontend can reach Rust API at port 8000 (will fail)
- [ ] Test: Database connection uses admin:admin@5434 (will fail)
- [ ] Test: Redis connection uses port 6382 (will fail)
- [ ] Test: No Node.js backend processes running (will fail)
- [ ] Test: All services use consistent database name (will fail)

### 1.2 Make Tests Pass
- [ ] Fix database credentials consistency (use admin:admin everywhere)
- [ ] Update frontend .env.local to point to Rust backend (port 8000)
- [ ] Fix docker-compose.yml PostgreSQL port mapping to 5434:5432
- [ ] Fix docker-compose.yml Redis port mapping to 6382:6379
- [ ] Remove Node.js backend service from docker-compose.yml

## Phase 2: API Contract Tests

### 2.1 Write API Contract Tests
```javascript
// tests/api-contracts/auth.test.js
describe('Auth API Contract', () => {
  it('POST /api/auth/login returns JWT in expected format', async () => {
    const response = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@az1.ai', password: 'changeme123' })
    });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
    expect(response.body.user).toHaveProperty('id');
    expect(response.body.user).toHaveProperty('email');
  });
});
```

- [ ] Write test: Login endpoint returns correct response format
- [ ] Write test: Bookmark CRUD endpoints match expected schema
- [ ] Write test: Import endpoint accepts file upload
- [ ] Write test: Search endpoint returns paginated results
- [ ] Write test: Error responses follow consistent format

### 2.2 Fix Implementation to Match Tests
- [ ] Update Rust API responses to match frontend expectations
- [ ] Ensure error handling returns expected format
- [ ] Implement missing endpoints identified by tests

## Phase 3: Integration Tests

### 3.1 Write End-to-End Test Scenarios
```javascript
// tests/e2e/user-journey.test.js
describe('User Journey', () => {
  it('User can login, view, create, and delete bookmarks', async () => {
    // 1. Login
    const auth = await login('admin@az1.ai', 'changeme123');
    expect(auth.token).toBeDefined();
    
    // 2. Get bookmarks
    const bookmarks = await getBookmarks(auth.token);
    expect(Array.isArray(bookmarks)).toBe(true);
    
    // 3. Create bookmark
    const newBookmark = await createBookmark(auth.token, {
      url: 'https://example.com',
      title: 'Test Bookmark'
    });
    expect(newBookmark.id).toBeDefined();
    
    // 4. Delete bookmark
    const deleted = await deleteBookmark(auth.token, newBookmark.id);
    expect(deleted.success).toBe(true);
  });
});
```

- [ ] Write test: Complete user authentication flow
- [ ] Write test: Bookmark CRUD operations
- [ ] Write test: Collection management
- [ ] Write test: Import flow with real file
- [ ] Write test: Search functionality

### 3.2 Implement Missing Functionality
- [ ] Fix any endpoints that fail tests
- [ ] Implement missing features discovered by tests
- [ ] Ensure all user journeys pass

## Phase 4: Performance Tests

### 4.1 Write Performance Benchmarks
```javascript
// tests/performance/benchmarks.test.js
describe('Performance Benchmarks', () => {
  it('Search returns results in <100ms for 10k bookmarks', async () => {
    const start = Date.now();
    const results = await search('test');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(100);
  });
  
  it('Import handles 1000 bookmarks in <5s', async () => {
    const start = Date.now();
    await importBookmarks(largeFile);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000);
  });
});
```

- [ ] Write test: API response time < 100ms
- [ ] Write test: Database queries use indexes
- [ ] Write test: Memory usage stays under limits
- [ ] Write test: Concurrent user handling

### 4.2 Optimize to Pass Performance Tests
- [ ] Add database indexes where needed
- [ ] Implement caching for frequent queries
- [ ] Optimize slow endpoints

## Phase 5: Security Tests

### 5.1 Write Security Tests
```javascript
// tests/security/auth.test.js
describe('Security', () => {
  it('Rejects requests without valid JWT', async () => {
    const response = await fetch('http://localhost:8000/api/bookmarks');
    expect(response.status).toBe(401);
  });
  
  it('Prevents SQL injection', async () => {
    const malicious = "'; DROP TABLE users; --";
    const response = await search(malicious);
    expect(response.status).toBe(200); // Should handle safely
  });
});
```

- [ ] Write test: Authentication required for protected endpoints
- [ ] Write test: SQL injection prevention
- [ ] Write test: XSS prevention
- [ ] Write test: CORS properly configured
- [ ] Write test: Rate limiting works

### 5.2 Fix Security Issues
- [ ] Implement missing security measures
- [ ] Fix any vulnerabilities found by tests

## Phase 6: AI-Ops Tests

### 6.1 Write AI-Ops Behavior Tests
```rust
// tests/ai-ops/agent-behavior.rs
#[test]
fn test_import_failure_triggers_agent() {
    // Simulate import failure
    let event = ImportFailed { 
        job_id: "123",
        error: "Timeout after 30s" 
    };
    
    // Agent should respond
    let response = agent.handle_event(event);
    assert_eq!(response.action, "RetryWithBatching");
}
```

- [ ] Write test: Agents respond to failure events
- [ ] Write test: Knowledge graph stores solutions
- [ ] Write test: Patterns evolve based on outcomes
- [ ] Write test: Learning improves over time

### 6.2 Deploy and Verify AI-Ops
- [ ] Deploy agents that pass tests
- [ ] Verify monitoring is active
- [ ] Confirm learning is occurring

## Test Execution Strategy

### Run Tests Continuously
```bash
#!/bin/bash
# watch-tests.sh

# Run tests on file change
nodemon --watch tests --watch src --exec "npm test"

# Run Rust tests
cargo watch -x test

# Run integration tests
npm run test:integration
```

### Test Categories
1. **Unit Tests**: Individual functions
2. **Integration Tests**: Service interactions  
3. **E2E Tests**: Complete user flows
4. **Performance Tests**: Speed and scale
5. **Security Tests**: Vulnerabilities
6. **AI-Ops Tests**: Agent behaviors

## Success Criteria
- [ ] All tests pass (100% green)
- [ ] Code coverage > 80%
- [ ] No manual testing required
- [ ] Tests run in < 5 minutes
- [ ] Tests are deterministic (no flaky tests)

## TDD Benefits for This Project
1. **Confidence**: Know exactly what works
2. **Documentation**: Tests show how to use the system
3. **Regression Prevention**: Changes don't break existing features
4. **Design Improvement**: TDD forces better API design
5. **Faster Debugging**: Tests pinpoint failures

## Command Reference
```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --grep "Auth API"

# Run with coverage
npm test -- --coverage

# Run Rust tests
cd rust-backend && cargo test

# Run integration tests only
npm run test:integration

# Watch mode
npm test -- --watch
```

Remember: **Red → Green → Refactor**
1. Write a failing test (Red)
2. Write minimal code to pass (Green)
3. Refactor for quality (Refactor)