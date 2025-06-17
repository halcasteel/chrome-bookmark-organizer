# Comprehensive Test Naming Convention

## Overview
This document defines the standardized naming convention for all tests in the Bookmark Manager application. Following these conventions ensures consistency, traceability, and automated test discovery.

## Hierarchical Naming Pattern

```
<Layer>.<Module>.<Feature>.<TestType>.<TestCase>.<Scenario>
```

### Components:

1. **Layer**: The architectural layer being tested
   - `Frontend` - UI components and user interactions
   - `Backend` - Server-side logic and APIs
   - `Database` - Data persistence and queries
   - `Integration` - Cross-layer interactions
   - `E2E` - End-to-end user workflows

2. **Module**: The specific module or component
   - Frontend: `Auth`, `Bookmarks`, `Collections`, `Admin`, `Import`, `Search`
   - Backend: `API`, `Services`, `Workers`, `Middleware`
   - Database: `Tables`, `Migrations`, `Queries`

3. **Feature**: The specific feature being tested
   - Examples: `Login`, `Create`, `Update`, `Delete`, `Search`, `Export`

4. **TestType**: The type of test
   - `Unit` - Isolated component/function tests
   - `Integration` - Component interaction tests
   - `Functional` - Feature functionality tests
   - `Performance` - Speed and resource tests
   - `Security` - Security validation tests
   - `Accessibility` - A11y compliance tests

5. **TestCase**: Specific test scenario
   - `Success` - Happy path scenarios
   - `Failure` - Error scenarios
   - `Validation` - Input validation
   - `EdgeCase` - Boundary conditions
   - `Concurrency` - Parallel operation tests

6. **Scenario**: Detailed scenario description (optional)
   - Use descriptive names like `EmptyInput`, `MaxLength`, `InvalidFormat`

## Examples

### Frontend Tests
```
Frontend.Auth.Login.Unit.Validation.EmptyEmail
Frontend.Auth.Login.Unit.Validation.InvalidEmailFormat
Frontend.Auth.Login.Functional.Success.ValidCredentials
Frontend.Auth.Login.Functional.Failure.WrongPassword
Frontend.Auth.TwoFactor.Unit.Success.ValidCode
Frontend.Bookmarks.Create.Unit.Validation.MissingURL
Frontend.Bookmarks.List.Performance.LargeDataset.1000Items
Frontend.Admin.Dashboard.Accessibility.KeyboardNavigation
```

### Backend Tests
```
Backend.API.Auth.Unit.Validation.MissingToken
Backend.API.Auth.Integration.Success.TokenGeneration
Backend.API.Bookmarks.Unit.Success.CreateBookmark
Backend.API.Bookmarks.Integration.Failure.DuplicateURL
Backend.Services.ImportService.Unit.Success.ParseHTML
Backend.Services.ImportService.Performance.LargeFile.10MB
Backend.Workers.EnrichmentWorker.Integration.Success.FetchMetadata
Backend.Middleware.Auth.Unit.Failure.ExpiredToken
```

### Database Tests
```
Database.Tables.Bookmarks.Unit.Success.CreateRecord
Database.Tables.Bookmarks.Unit.Validation.UniqueConstraint
Database.Queries.Search.Performance.ComplexQuery
Database.Migrations.001.Unit.Success.UpMigration
Database.Migrations.001.Unit.Success.DownMigration
```

### Integration Tests
```
Integration.Auth.Login.Functional.Success.CompleteFlow
Integration.Import.FileUpload.Functional.Success.ChromeBookmarks
Integration.Search.Semantic.Functional.Success.RelevantResults
Integration.WebSocket.Connection.Functional.Success.RealtimeUpdates
```

### E2E Tests
```
E2E.UserFlow.Registration.Success.NewUserSignup
E2E.UserFlow.BookmarkManagement.Success.CreateEditDelete
E2E.UserFlow.Import.Success.LargeFileWithProgress
E2E.AdminFlow.UserManagement.Success.CreateAndAssignRole
E2E.Performance.PageLoad.Success.Under3Seconds
```

## File Naming Convention

Test files should follow this pattern:
```
<module>.<feature>.<testType>.test.[js|ts]
```

Examples:
- `auth.login.unit.test.js`
- `bookmarks.create.integration.test.js`
- `admin.dashboard.e2e.test.js`

## Test Suite Organization

```
testing-framework/
├── tests/
│   ├── unit/
│   │   ├── frontend/
│   │   │   ├── auth.login.unit.test.js
│   │   │   └── bookmarks.create.unit.test.js
│   │   └── backend/
│   │       ├── api.auth.unit.test.js
│   │       └── services.import.unit.test.js
│   ├── integration/
│   │   ├── auth.flow.integration.test.js
│   │   └── import.process.integration.test.js
│   └── e2e/
│       ├── user.registration.e2e.test.js
│       └── admin.management.e2e.test.js
```

## Test Description Format

Each test should have a clear description following this pattern:

```javascript
describe('Layer.Module.Feature', () => {
  describe('TestType', () => {
    it('should <action> when <condition>', () => {
      // Test implementation
    });
  });
});
```

Example:
```javascript
describe('Frontend.Auth.Login', () => {
  describe('Validation', () => {
    it('should display error when email is empty', () => {
      // Test implementation
    });
    
    it('should display error when email format is invalid', () => {
      // Test implementation
    });
  });
  
  describe('Success', () => {
    it('should redirect to dashboard when credentials are valid', () => {
      // Test implementation
    });
  });
});
```

## Test ID Generation

For traceability and automation, each test should have a unique ID:

```
TEST-<LAYER>-<MODULE>-<FEATURE>-<NUMBER>
```

Examples:
- `TEST-FE-AUTH-LOGIN-001`
- `TEST-BE-API-BOOKMARKS-042`
- `TEST-E2E-FLOW-IMPORT-003`

## Mapping to Requirements

Tests should be mapped to requirements using comments:

```javascript
/**
 * Test ID: TEST-FE-AUTH-LOGIN-001
 * Requirement: REQ-AUTH-001
 * User Story: US-123
 * Feature: User Authentication
 */
it('should successfully log in with valid credentials', () => {
  // Test implementation
});
```

## Automated Test Discovery

The naming convention enables automated test discovery:

1. **By Layer**: Find all Frontend tests
   ```
   Frontend.*
   ```

2. **By Module**: Find all Auth tests
   ```
   *.Auth.*
   ```

3. **By Feature**: Find all Login tests
   ```
   *.*.Login.*
   ```

4. **By Type**: Find all Unit tests
   ```
   *.*.*.Unit.*
   ```

5. **By Status**: Find all Success tests
   ```
   *.*.*.*.Success.*
   ```

## Best Practices

1. **Be Descriptive**: Test names should clearly indicate what is being tested
2. **Use Consistent Terminology**: Stick to defined terms (Create, not Add or Insert)
3. **Include Context**: Provide enough context to understand the test without reading code
4. **Avoid Abbreviations**: Use full words for clarity
5. **Group Related Tests**: Use describe blocks to group related test cases
6. **Number Sequential Tests**: When order matters, use numbers (Step1, Step2)

## Common Patterns

### CRUD Operations
- `*.Create.Unit.Success.ValidData`
- `*.Read.Unit.Success.SingleRecord`
- `*.Update.Unit.Success.PartialUpdate`
- `*.Delete.Unit.Success.SoftDelete`

### Validation Tests
- `*.Validation.Required.MissingField`
- `*.Validation.Format.InvalidEmail`
- `*.Validation.Length.ExceedsMaximum`
- `*.Validation.Type.WrongDataType`

### Error Handling
- `*.Failure.Network.Timeout`
- `*.Failure.Auth.Unauthorized`
- `*.Failure.Data.NotFound`
- `*.Failure.Server.InternalError`

### Performance Tests
- `*.Performance.Load.ConcurrentUsers`
- `*.Performance.Speed.ResponseTime`
- `*.Performance.Memory.Usage`
- `*.Performance.Database.QueryOptimization`

## CLI Test Execution

Run tests by pattern:
```bash
# Run all Frontend tests
npm test -- --pattern="Frontend.*"

# Run all Auth Login tests
npm test -- --pattern="*.Auth.Login.*"

# Run all Unit tests
npm test -- --pattern="*.*.*.Unit.*"

# Run specific test
npm test -- --pattern="Frontend.Auth.Login.Unit.Validation.EmptyEmail"
```

## Reporting

Test reports should include:
1. Full test name (hierarchical)
2. Test ID
3. Execution time
4. Pass/Fail status
5. Error details (if failed)
6. Coverage mapping

## Maintenance

1. Review naming conventions quarterly
2. Update when new modules/features added
3. Ensure all tests follow convention
4. Use linting rules to enforce naming
5. Generate documentation from test names