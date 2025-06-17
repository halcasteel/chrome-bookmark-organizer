# Test Naming Convention

## Overview
This document defines the standardized naming convention for all tests in the Bookmark Manager application. The convention ensures consistency, traceability, and easy identification of test purpose and scope.

## Test ID Format

### Structure
```
[PAGE]-[FEATURE]-[NUMBER]-[TYPE]
```

### Components

#### 1. PAGE (Uppercase, abbreviated)
- **AUTH** - Authentication (Login, Register, Logout)
- **DASH** - Dashboard
- **BOOK** - Bookmarks
- **SRCH** - Search
- **IMPT** - Import
- **COLL** - Collections
- **TAGS** - Tags
- **SETT** - Settings
- **ADMN** - Admin Dashboard
- **PROF** - Profile
- **COMM** - Common/Shared Components

#### 2. FEATURE (Uppercase, 3-4 characters)
- **FORM** - Form submissions
- **BTN** - Button interactions
- **INPT** - Input field validations
- **SLCT** - Select/dropdown interactions
- **MODL** - Modal dialogs
- **TBL** - Table operations
- **NAV** - Navigation
- **API** - API calls
- **WSKT** - WebSocket connections
- **FLTR** - Filters
- **SRCH** - Search functionality
- **SORT** - Sorting
- **PAGE** - Pagination
- **UPLD** - File upload
- **DWNL** - Download
- **AUTH** - Authorization checks
- **VALD** - Validation
- **NOTF** - Notifications
- **ERR** - Error handling
- **PERF** - Performance

#### 3. NUMBER (3 digits, padded)
- Sequential number within feature category
- Format: 001, 002, 003...

#### 4. TYPE (Optional suffix)
- **-POS** - Positive test case
- **-NEG** - Negative test case
- **-EDG** - Edge case
- **-SEC** - Security test
- **-PERF** - Performance test
- **-ACC** - Accessibility test
- **-INT** - Integration test
- **-E2E** - End-to-end test

## Examples

### Authentication Page Tests
```
AUTH-FORM-001-POS  - Login with valid credentials
AUTH-FORM-002-NEG  - Login with invalid password
AUTH-FORM-003-NEG  - Login with non-existent email
AUTH-INPT-001-NEG  - Email field with invalid format
AUTH-BTN-001-POS   - Click login button with valid form
AUTH-API-001-POS   - Successful login API call
AUTH-API-002-NEG   - Failed login API call handling
AUTH-SEC-001-NEG   - SQL injection in login form
AUTH-PERF-001      - Login response time under load
```

### Bookmarks Page Tests
```
BOOK-FORM-001-POS  - Add bookmark with all fields
BOOK-FORM-002-POS  - Add bookmark with minimal fields
BOOK-FORM-003-NEG  - Add bookmark without URL
BOOK-BTN-001-POS   - Delete bookmark confirmation
BOOK-TBL-001-POS   - Sort bookmarks by date
BOOK-FLTR-001-POS  - Filter bookmarks by tag
BOOK-SRCH-001-POS  - Search bookmarks by title
BOOK-API-001-POS   - Fetch bookmarks successfully
BOOK-PAGE-001-POS  - Navigate through pagination
```

### Import Page Tests
```
IMPT-UPLD-001-POS  - Upload valid HTML file
IMPT-UPLD-002-NEG  - Upload invalid file type
IMPT-UPLD-003-EDG  - Upload empty file
IMPT-WSKT-001-POS  - Receive import progress updates
IMPT-API-001-POS   - Start import process
IMPT-NOTF-001-POS  - Show import completion notification
```

## Test Suite Organization

### Directory Structure
```
tests/
├── unit/
│   ├── frontend/
│   │   ├── AUTH/
│   │   ├── BOOK/
│   │   └── ...
│   └── backend/
│       ├── api/
│       ├── services/
│       └── ...
├── integration/
│   ├── AUTH-INT/
│   ├── BOOK-INT/
│   └── ...
├── e2e/
│   ├── AUTH-E2E/
│   ├── BOOK-E2E/
│   └── ...
└── performance/
    ├── AUTH-PERF/
    ├── BOOK-PERF/
    └── ...
```

## Test File Naming

### Format
```
[PAGE]-[FEATURE].test.[ext]
```

### Examples
```
AUTH-FORM.test.ts
BOOK-API.test.ts
DASH-WSKT.test.ts
```

## Test Description Format

### Structure
```
describe('[PAGE] - [Feature Name]', () => {
  describe('[FEATURE] - [Specific Functionality]', () => {
    it('[TEST-ID]: should [expected behavior]', () => {
      // Test implementation
    });
  });
});
```

### Example
```typescript
describe('AUTH - Authentication Page', () => {
  describe('FORM - Login Form', () => {
    it('AUTH-FORM-001-POS: should login with valid credentials', () => {
      // Test implementation
    });
    
    it('AUTH-FORM-002-NEG: should show error with invalid password', () => {
      // Test implementation
    });
  });
});
```

## CLI Test Naming

### Format
```
cli-[command]-[subcommand]-[number]-[type]
```

### Examples
```
cli-import-file-001-pos     - Import bookmarks via CLI
cli-export-json-001-pos     - Export bookmarks as JSON
cli-user-create-001-pos     - Create user via CLI
cli-db-migrate-001-pos      - Run database migrations
```

## API Test Naming

### Format
```
api-[method]-[endpoint]-[number]-[type]
```

### Examples
```
api-get-bookmarks-001-pos      - GET /api/bookmarks success
api-post-bookmark-001-pos      - POST /api/bookmark success
api-post-bookmark-002-neg      - POST /api/bookmark invalid data
api-delete-bookmark-001-pos    - DELETE /api/bookmark/:id success
api-get-bookmarks-001-perf     - GET /api/bookmarks performance
```

## Test Metadata

Each test should include metadata in comments:

```typescript
/**
 * Test ID: AUTH-FORM-001-POS
 * Feature: Login Form
 * Type: Positive
 * Priority: P0
 * Component: frontend/src/pages/Login.tsx
 * API: POST /api/auth/login
 * Dependencies: Database, Redis
 * Last Updated: 2025-06-16
 */
```

## Traceability Matrix Format

Tests should be traceable to:
1. **Requirements**: REQ-[number]
2. **User Stories**: US-[number]
3. **Bugs**: BUG-[number]
4. **Components**: Path to component file
5. **API Endpoints**: Method and path

## Priority Levels

- **P0**: Critical - Must pass for release
- **P1**: High - Important functionality
- **P2**: Medium - Nice to have
- **P3**: Low - Optional/future enhancement

## Coverage Requirements

Each page/feature must have:
1. At least one positive test case
2. At least one negative test case
3. Input validation tests for all forms
4. API error handling tests
5. Performance baseline test
6. Accessibility test (where applicable)

## Automation Tags

Tests should be tagged for selective execution:

```typescript
// @smoke - Quick smoke tests
// @regression - Full regression suite
// @critical - Critical path tests
// @nightly - Nightly build tests
// @performance - Performance tests
// @security - Security tests
// @accessibility - Accessibility tests
```