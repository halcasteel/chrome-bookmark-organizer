# Installing Vitest for A2A Testing

The A2A test suite has been created but requires Vitest to be installed. Run the following command to install the necessary dependencies:

```bash
npm install -D vitest @vitest/coverage-v8
```

This will install:
- `vitest`: Modern test runner with native ESM support
- `@vitest/coverage-v8`: Coverage reporting using V8

## Why Vitest?

Vitest was chosen for A2A testing because:
1. Native ES modules support (matches our backend's `type: "module"`)
2. Compatible with our existing test structure
3. Fast execution with parallel test running
4. Built-in coverage support
5. Watch mode for development
6. Compatible with existing Jest assertions

## Running A2A Tests

After installation, you can run the A2A tests using:

```bash
# Run all A2A tests
npm run test:a2a

# Run only unit tests
npm run test:a2a:unit

# Run only integration tests
npm run test:a2a:integration

# Run in watch mode
npm run test:a2a:watch

# Run with coverage
npm run test:a2a:coverage
```

## Test Files Created

The following test files have been created and are ready to run:

1. **Unit Tests**:
   - `tests/a2a/unit/baseAgent.test.js` - Base agent class tests
   - `tests/a2a/unit/importAgent.test.js` - Import agent tests

2. **Integration Tests**:
   - `tests/a2a/integration/taskManager.test.js` - Task manager integration tests

3. **Test Utilities**:
   - `tests/a2a/utils/testHelpers.js` - Helper functions for A2A testing
   - `tests/a2a/fixtures/testData.js` - Test data fixtures

## Next Steps

1. Install vitest: `npm install -D vitest @vitest/coverage-v8`
2. Run the tests: `npm run test:a2a`
3. Fix any failing tests
4. Continue with Phase 2 of the A2A migration