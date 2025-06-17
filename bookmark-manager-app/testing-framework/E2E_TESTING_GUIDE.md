# E2E Testing Guide

## Overview
This guide covers the automated End-to-End (E2E) testing setup for the Bookmark Manager application using Playwright. The tests run in headless browsers and cover all major user workflows.

## Technology Stack
- **Playwright**: Modern E2E testing framework
- **Browsers**: Chromium, Firefox, WebKit
- **Headless Mode**: Runs without UI by default
- **Parallel Execution**: Tests run in parallel for speed
- **Video Recording**: Captures failures for debugging
- **HTML Reports**: Interactive test reports

## Test Structure

```
tests/e2e/
├── fixtures/
│   ├── auth.fixture.js      # Authentication helpers
│   └── test-data.js         # Test data constants
├── auth.spec.js             # Authentication tests
├── bookmarks.spec.js        # Bookmark CRUD tests
├── import.spec.js           # Import functionality tests
├── collections.spec.js      # Collections management tests
├── admin-dashboard.spec.js  # Admin dashboard tests
└── performance.spec.js      # Performance benchmarks
```

## Running Tests

### Quick Start
```bash
# Install dependencies and browsers
npm install
npm run test:install

# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with visible browser
npm run test:headed

# Debug tests
npm run test:debug

# View test report
npm run test:report
```

### Using the Test Runner Script
```bash
# Run all tests
./run-e2e-tests.sh

# Run specific test suites
./run-e2e-tests.sh auth
./run-e2e-tests.sh admin
./run-e2e-tests.sh performance

# Run with visible browser
./run-e2e-tests.sh headed

# Open Playwright UI
./run-e2e-tests.sh ui
```

## Test Coverage

### 1. Authentication (auth.spec.js)
- ✅ Login page display
- ✅ Invalid credentials error
- ✅ Successful login
- ✅ Logout functionality
- ✅ Protected route access
- ✅ Session persistence

### 2. Bookmarks (bookmarks.spec.js)
- ✅ Display bookmarks page
- ✅ Add new bookmark
- ✅ Search bookmarks
- ✅ Edit bookmark
- ✅ Delete bookmark
- ✅ Filter by tag
- ✅ Bulk operations

### 3. Import (import.spec.js)
- ✅ Display import page
- ✅ File upload
- ✅ Import progress
- ✅ Drag and drop
- ✅ File validation
- ✅ Import history
- ✅ WebSocket updates

### 4. Collections (collections.spec.js)
- ✅ Create collection
- ✅ Add bookmarks to collection
- ✅ Edit collection
- ✅ Delete collection
- ✅ Collection statistics
- ✅ Share collection

### 5. Admin Dashboard (admin-dashboard.spec.js)
- ✅ Display dashboard
- ✅ System health monitoring
- ✅ Logs viewer
- ✅ Log filtering and search
- ✅ Analytics charts
- ✅ AI insights
- ✅ User activity
- ✅ Auto-refresh
- ✅ Export logs
- ✅ Access control

### 6. Performance (performance.spec.js)
- ✅ Page load times
- ✅ Search performance
- ✅ Large list rendering
- ✅ WebSocket connection time
- ✅ Memory usage monitoring
- ✅ API response times

## Writing New Tests

### Basic Test Structure
```javascript
import { test, expect } from '@playwright/test';
import { testData } from './fixtures/test-data';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await page.goto('/login');
    // ... login steps
  });

  test('should do something', async ({ page }) => {
    // Test implementation
    await page.click('button');
    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

### Best Practices
1. **Use data-testid attributes** for reliable element selection
2. **Wait for elements** before interacting: `await page.waitForSelector()`
3. **Use meaningful assertions**: Check both positive and negative cases
4. **Clean up after tests**: Delete test data created during tests
5. **Keep tests independent**: Each test should run in isolation
6. **Use fixtures** for common setup like authentication

### Common Patterns

#### Waiting for API calls
```javascript
// Wait for specific API response
const responsePromise = page.waitForResponse('/api/bookmarks');
await page.click('button[type="submit"]');
await responsePromise;
```

#### Testing file uploads
```javascript
const fileChooserPromise = page.waitForEvent('filechooser');
await page.click('button:has-text("Choose File")');
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles('./test-file.html');
```

#### Measuring performance
```javascript
const startTime = Date.now();
await page.goto('/dashboard');
const loadTime = Date.now() - startTime;
expect(loadTime).toBeLessThan(3000);
```

## CI/CD Integration

The project includes GitHub Actions workflow for automated testing:

```yaml
# .github/workflows/e2e-tests.yml
- Runs on push to main/develop
- Runs on pull requests
- Sets up PostgreSQL and Redis services
- Runs all E2E tests
- Uploads test reports and videos
```

## Debugging Failed Tests

### 1. Video Recordings
Failed tests automatically record video:
```bash
# Videos stored in:
test-results/**/*.webm
```

### 2. Screenshots
Screenshots captured on failure:
```bash
# Screenshots stored in:
test-results/**/*.png
```

### 3. Trace Files
Enable trace for detailed debugging:
```javascript
await page.context().tracing.start({ 
  screenshots: true, 
  snapshots: true 
});
```

### 4. Debug Mode
Run tests with Playwright Inspector:
```bash
npm run test:debug
```

## Performance Benchmarks

Current performance targets:
- Dashboard load: < 3 seconds
- Search response: < 1 second
- Large list render (100 items): < 2 seconds
- WebSocket connection: < 2 seconds
- API responses: < 1 second
- Memory growth: < 50MB per session

## Troubleshooting

### Common Issues

1. **Tests fail with "Connection refused"**
   - Ensure services are running: `node start-services.js`
   - Check ports 3001 (backend) and 5173 (frontend)

2. **Browser not installed**
   - Run: `npx playwright install`
   - Or: `npm run test:install`

3. **Timeout errors**
   - Increase timeout in playwright.config.js
   - Check if services are responding slowly

4. **WebSocket tests fail**
   - Verify WebSocket service is running
   - Check authentication token is valid

5. **File upload tests fail**
   - Ensure test files exist
   - Check file permissions

## Future Enhancements

1. **Visual Regression Testing**
   - Screenshot comparison
   - UI change detection

2. **Accessibility Testing**
   - WCAG compliance checks
   - Screen reader testing

3. **Cross-browser Testing**
   - Extended browser support
   - Mobile browser testing

4. **Load Testing**
   - Concurrent user simulation
   - Stress testing

5. **API Contract Testing**
   - Schema validation
   - Breaking change detection