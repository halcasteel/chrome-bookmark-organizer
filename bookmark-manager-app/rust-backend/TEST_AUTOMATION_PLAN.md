# Test Automation Strategy for Rust Bookmark Manager

## Current State Analysis

### ❌ What's Missing:
1. **Unit Tests** - No tests written for services
2. **Integration Tests** - No automated API testing
3. **CI/CD Pipeline** - No GitHub Actions
4. **Test Coverage** - No coverage reporting
5. **E2E Tests** - No browser automation
6. **Database Tests** - No migration testing
7. **Contract Tests** - No API contract validation

### ✅ What We Have:
1. Manual API testing script
2. Performance benchmarking tools
3. Code quality checks
4. Rust's built-in test framework (unused)

## Comprehensive Test Automation Plan

### 1. Unit Tests (Rust Native)
```rust
// Example: services/auth/src/handlers.rs
#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    #[actix_web::test]
    async fn test_health_check() {
        let app = test::init_service(
            App::new().route("/health", web::get().to(health))
        ).await;
        
        let req = test::TestRequest::get()
            .uri("/health")
            .to_request();
            
        let resp = test::call_service(&app, req).await;
        assert!(resp.status().is_success());
    }

    #[actix_web::test]
    async fn test_register_user() {
        // Test user registration with real database
        let pool = setup_test_db().await;
        // ... test implementation
    }
}
```

### 2. Integration Tests
```rust
// tests/auth_integration.rs
use sqlx::PgPool;
use bookmark_manager::start_server;

#[tokio::test]
async fn test_full_auth_flow() {
    // Start test database
    let db_url = start_test_postgres().await;
    
    // Start auth service
    let server = start_server(&db_url).await;
    
    // Test registration
    let client = reqwest::Client::new();
    let res = client.post(&format!("{}/api/auth/register", server.url()))
        .json(&json!({
            "email": "test@example.com",
            "password": "Test123!@#"
        }))
        .send()
        .await
        .unwrap();
        
    assert_eq!(res.status(), 201);
    
    // Test login
    // Test protected route
    // Cleanup
}
```

### 3. GitHub Actions CI/CD
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5434:5432
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6382:6379
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Install Rust
      uses: actions-rs/toolchain@v1
      with:
        profile: minimal
        toolchain: stable
        override: true
        components: rustfmt, clippy
    
    - name: Cache dependencies
      uses: actions/cache@v3
      with:
        path: |
          ~/.cargo/registry
          ~/.cargo/git
          target
        key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
    
    - name: Check formatting
      run: cargo fmt --all -- --check
    
    - name: Run clippy
      run: cargo clippy --all-features -- -D warnings
    
    - name: Run tests
      run: cargo test --all-features
      env:
        DATABASE_URL: postgres://postgres:postgres@localhost:5434/test_db
        REDIS_URL: redis://localhost:6382
    
    - name: Run integration tests
      run: |
        ./scripts/run-integration-tests.sh
    
    - name: Generate coverage report
      run: |
        cargo install cargo-tarpaulin
        cargo tarpaulin --out Xml
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
```

### 4. E2E Tests with Playwright
```javascript
// e2e/auth.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Authentication Flow', () => {
  test('user can register and login', async ({ page }) => {
    // Start with clean database
    await resetTestDatabase();
    
    // Navigate to app
    await page.goto('http://localhost:5173');
    
    // Click register
    await page.click('text=Register');
    
    // Fill form
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    // Verify redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Verify welcome message
    await expect(page.locator('h1')).toContainText('Welcome');
  });
});
```

### 5. Test Automation Script
```bash
#!/bin/bash
# scripts/run-all-tests.sh

echo "🧪 Running Complete Test Suite"

# 1. Unit tests
echo "📦 Running unit tests..."
cargo test --lib

# 2. Integration tests  
echo "🔗 Running integration tests..."
cargo test --test '*'

# 3. API tests
echo "🌐 Running API tests..."
./scripts/quick-test.sh

# 4. E2E tests
echo "🖥️ Running E2E tests..."
npx playwright test

# 5. Performance tests
echo "⚡ Running performance baseline..."
./scripts/benchmark.sh

# 6. Coverage report
echo "📊 Generating coverage report..."
cargo tarpaulin --out Html

echo "✅ All tests completed!"
```

### 6. Pre-commit Hooks
```bash
# .git/hooks/pre-commit
#!/bin/bash

# Run formatting
cargo fmt --all -- --check || {
    echo "❌ Formatting errors found. Run 'cargo fmt --all'"
    exit 1
}

# Run clippy
cargo clippy --all-features -- -D warnings || {
    echo "❌ Clippy errors found"
    exit 1
}

# Run quick tests
cargo test --lib || {
    echo "❌ Unit tests failed"
    exit 1
}

echo "✅ Pre-commit checks passed"
```

## Implementation Priority

### Phase 1: Foundation (Week 1)
1. Write unit tests for auth service
2. Set up GitHub Actions CI
3. Add pre-commit hooks
4. Configure test database

### Phase 2: Integration (Week 2)
1. Write integration tests
2. Add coverage reporting
3. Set up test fixtures
4. Create test data generators

### Phase 3: E2E & Performance (Week 3)
1. Set up Playwright
2. Write E2E tests
3. Automate performance benchmarks
4. Create test reporting dashboard

### Phase 4: Continuous Improvement
1. Add mutation testing
2. Contract testing with Pact
3. Chaos engineering tests
4. Security scanning automation

## Benefits of Full Automation

1. **Catch bugs early** - Before they reach production
2. **Confidence in changes** - Refactor without fear
3. **Faster development** - No manual testing bottleneck
4. **Better code quality** - Enforced standards
5. **Documentation** - Tests show how code should work
6. **Regression prevention** - Old bugs don't come back

## Quick Start Commands

```bash
# Run all tests
make test

# Run with coverage
make coverage

# Run only unit tests
cargo test --lib

# Run only integration tests
cargo test --test '*'

# Watch mode
cargo watch -x test

# Run specific test
cargo test test_auth_flow
```