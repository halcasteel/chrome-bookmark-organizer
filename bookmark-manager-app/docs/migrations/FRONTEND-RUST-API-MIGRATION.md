# Frontend Migration to Rust API

## Overview
This guide details the migration process from Node.js API to Rust API for the TypeScript strict frontend.

## Key Differences

### 1. Response Format
```typescript
// Node.js API
response.data = { bookmarks: [...], total: 50 }

// Rust API
response.data = { data: [...], total: 50, page: 1, per_page: 10 }
```

### 2. Error Format
```typescript
// Node.js API
error.response.data = { error: "Something went wrong" }

// Rust API
error.response.data = { 
  error: { 
    code: "VALIDATION_ERROR", 
    message: "Something went wrong",
    details: { field: "error details" }
  } 
}
```

### 3. Authentication Response
```typescript
// Node.js API
{ token: "jwt", user: {...} }

// Rust API
{ data: { token: "jwt", refresh_token: "refresh", user: {...} } }
```

## Migration Steps

### Step 1: Update Environment Variables
```bash
# frontend/.env
VITE_API_URL=http://localhost:8000/api
```

### Step 2: Update API Service Imports
Replace imports in components:
```typescript
// Before
import api, { bookmarkService } from '@/services/api';

// After
import rustApi, { bookmarkService } from '@/services/rustApi';
```

### Step 3: Update Component Error Handling
```typescript
// Before
catch (error) {
  setError(error.response?.data?.error || 'Unknown error');
}

// After
catch (error) {
  if (isRustApiError(error)) {
    setError(error.response?.data.error.message || 'Unknown error');
  }
}
```

### Step 4: Update Pagination Handling
```typescript
// Before
const { bookmarks, total } = response.data;

// After
const { bookmarks, total } = response.data;
// Note: rustApi.ts already transforms this for compatibility
```

### Step 5: Update Auth Flow
```typescript
// Login component
const handleLogin = async (credentials) => {
  try {
    const response = await authService.login(credentials);
    // Token is automatically stored by authService
    navigate('/dashboard');
  } catch (error) {
    if (isValidationError(error)) {
      // Handle validation errors
      const details = error.response?.data.error.details as Record<string, string>;
      setFieldErrors(details);
    }
  }
};
```

## Component Migration Checklist

### Auth Components
- [ ] Login.tsx - Update error handling
- [ ] Register.tsx - Handle new response format
- [ ] AuthContext.tsx - Update token refresh logic

### Bookmark Components
- [ ] BookmarkList.tsx - Already compatible via service adapter
- [ ] BookmarkForm.tsx - Update validation error handling
- [ ] BookmarkCard.tsx - No changes needed

### Search Components
- [ ] SearchBar.tsx - Update suggestion handling
- [ ] SearchResults.tsx - Already compatible

### Import Components
- [ ] ImportModal.tsx - Update progress tracking
- [ ] ImportHistory.tsx - Compatible

## Testing Migration

### 1. Type Checking
```bash
npm run type-check
```

### 2. Run Integration Tests
```bash
npm run test:integration
```

### 3. E2E Tests
```bash
npm run test:e2e
```

## Common Issues and Solutions

### Issue 1: Type Errors
**Problem**: TypeScript errors after switching to Rust API
**Solution**: Ensure all imports use rustApi.ts which has proper type adaptations

### Issue 2: 401 Errors
**Problem**: Authentication failing
**Solution**: Check that refresh token is being stored and used

### Issue 3: Pagination
**Problem**: Pagination controls not working
**Solution**: Update page parameter names (limit → per_page)

## Rollback Plan
If issues arise, switch back to Node.js API:
```bash
# frontend/.env
VITE_API_URL=http://localhost:3001/api
```

Then revert service imports.