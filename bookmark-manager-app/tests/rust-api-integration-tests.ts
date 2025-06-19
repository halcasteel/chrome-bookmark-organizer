/**
 * Rust API Integration Tests
 * Following REAL TESTING philosophy - no mocks, only real services
 * 
 * Test Naming Convention:
 * Backend.RustAPI.<Module>.<TestType>.<TestCase>.<Scenario>
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import pg from 'pg';
import { TestExecutionTracker } from '../testing-framework/core/test-execution-tracker.js';

// Test configuration
const RUST_API_URL = 'http://localhost:8000/api';
const TEST_USER = {
  email: 'test@az1.ai',
  password: 'testpass123',
  name: 'Test User'
};

// Database connection for REAL testing
const dbConfig = {
  host: 'localhost',
  port: 5434,
  database: 'bookmark_manager',
  user: 'bookmarkuser',
  password: 'bookmarkpass'
};

// Test execution tracker
const tracker = new TestExecutionTracker(dbConfig);

// Axios instance for API calls
let api: AxiosInstance;
let authToken: string;
let refreshToken: string;

describe('Backend.RustAPI.Authentication.Integration', () => {
  beforeAll(async () => {
    // Start test run
    await tracker.startTestRun('Rust API Integration Tests', 'local');
    
    // Create axios instance
    api = axios.create({
      baseURL: RUST_API_URL,
      validateStatus: () => true // Don't throw on any status
    });
  });

  afterAll(async () => {
    // Complete test run
    await tracker.completeTestRun();
  });

  describe('Backend.RustAPI.Authentication.Integration.Registration', () => {
    beforeEach(async () => {
      // Clean up test user if exists
      const client = new pg.Client(dbConfig);
      await client.connect();
      await client.query('DELETE FROM users WHERE email = $1', [TEST_USER.email]);
      await client.end();
    });

    it('Backend.RustAPI.Authentication.Integration.Registration.Success', async () => {
      const testId = 'rust-auth-register-success';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.post('/auth/register', TEST_USER);
        
        // Rust API returns { data: { token, refresh_token, user } }
        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty('data');
        expect(response.data.data).toHaveProperty('token');
        expect(response.data.data).toHaveProperty('refresh_token');
        expect(response.data.data).toHaveProperty('user');
        expect(response.data.data.user.email).toBe(TEST_USER.email);
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Authentication.Integration.Registration.DuplicateEmail', async () => {
      const testId = 'rust-auth-register-duplicate';
      const result = await tracker.recordTestStart(testId);
      
      try {
        // First registration
        await api.post('/auth/register', TEST_USER);
        
        // Duplicate registration
        const response = await api.post('/auth/register', TEST_USER);
        
        // Rust API returns { error: { code, message } }
        expect(response.status).toBe(409);
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toHaveProperty('code');
        expect(response.data.error).toHaveProperty('message');
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Authentication.Integration.Registration.InvalidDomain', async () => {
      const testId = 'rust-auth-register-invalid-domain';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const invalidUser = { ...TEST_USER, email: 'test@gmail.com' };
        const response = await api.post('/auth/register', invalidUser);
        
        expect(response.status).toBe(400);
        expect(response.data.error.message).toContain('az1.ai');
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });
  });

  describe('Backend.RustAPI.Authentication.Integration.Login', () => {
    beforeAll(async () => {
      // Ensure test user exists
      await api.post('/auth/register', TEST_USER);
    });

    it('Backend.RustAPI.Authentication.Integration.Login.Success', async () => {
      const testId = 'rust-auth-login-success';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.post('/auth/login', {
          email: TEST_USER.email,
          password: TEST_USER.password
        });
        
        expect(response.status).toBe(200);
        expect(response.data.data).toHaveProperty('token');
        expect(response.data.data).toHaveProperty('refresh_token');
        expect(response.data.data.user.email).toBe(TEST_USER.email);
        
        // Store tokens for subsequent tests
        authToken = response.data.data.token;
        refreshToken = response.data.data.refresh_token;
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Authentication.Integration.Login.InvalidPassword', async () => {
      const testId = 'rust-auth-login-invalid-password';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.post('/auth/login', {
          email: TEST_USER.email,
          password: 'wrongpassword'
        });
        
        expect(response.status).toBe(401);
        expect(response.data).toHaveProperty('error');
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });
  });

  describe('Backend.RustAPI.Authentication.Integration.TokenRefresh', () => {
    it('Backend.RustAPI.Authentication.Integration.TokenRefresh.Success', async () => {
      const testId = 'rust-auth-refresh-success';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.post('/auth/refresh', {
          refresh_token: refreshToken
        });
        
        expect(response.status).toBe(200);
        expect(response.data.data).toHaveProperty('token');
        expect(response.data.data).toHaveProperty('refresh_token');
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });
  });

  describe('Backend.RustAPI.Authentication.Integration.ProtectedRoutes', () => {
    it('Backend.RustAPI.Authentication.Integration.ProtectedRoutes.WithToken', async () => {
      const testId = 'rust-auth-protected-with-token';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        
        expect(response.status).toBe(200);
        expect(response.data.data.email).toBe(TEST_USER.email);
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Authentication.Integration.ProtectedRoutes.WithoutToken', async () => {
      const testId = 'rust-auth-protected-without-token';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.get('/auth/me');
        
        expect(response.status).toBe(401);
        expect(response.data).toHaveProperty('error');
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });
  });
});

describe('Backend.RustAPI.Bookmarks.Integration', () => {
  let testBookmarkId: string;
  
  beforeAll(async () => {
    // Ensure we have auth token
    if (!authToken) {
      const response = await api.post('/auth/login', {
        email: TEST_USER.email,
        password: TEST_USER.password
      });
      authToken = response.data.data.token;
    }
    
    // Set auth header for all requests
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  });

  describe('Backend.RustAPI.Bookmarks.Integration.CRUD', () => {
    it('Backend.RustAPI.Bookmarks.Integration.CRUD.Create', async () => {
      const testId = 'rust-bookmarks-create';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const bookmark = {
          url: 'https://example.com',
          title: 'Example Site',
          description: 'Test bookmark',
          tags: ['test', 'example']
        };
        
        const response = await api.post('/bookmarks', bookmark);
        
        expect(response.status).toBe(201);
        expect(response.data.data).toHaveProperty('id');
        expect(response.data.data.url).toBe(bookmark.url);
        expect(response.data.data.title).toBe(bookmark.title);
        
        testBookmarkId = response.data.data.id;
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          testData: { bookmark },
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Bookmarks.Integration.CRUD.Read', async () => {
      const testId = 'rust-bookmarks-read';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.get(`/bookmarks/${testBookmarkId}`);
        
        expect(response.status).toBe(200);
        expect(response.data.data.id).toBe(testBookmarkId);
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Bookmarks.Integration.CRUD.Update', async () => {
      const testId = 'rust-bookmarks-update';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const updates = {
          title: 'Updated Title',
          description: 'Updated description'
        };
        
        const response = await api.put(`/bookmarks/${testBookmarkId}`, updates);
        
        expect(response.status).toBe(200);
        expect(response.data.data.title).toBe(updates.title);
        expect(response.data.data.description).toBe(updates.description);
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          testData: { updates },
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Bookmarks.Integration.CRUD.List', async () => {
      const testId = 'rust-bookmarks-list';
      const result = await tracker.recordTestStart(testId);
      
      try {
        // Rust API returns paginated results
        const response = await api.get('/bookmarks', {
          params: { page: 1, per_page: 10 }
        });
        
        expect(response.status).toBe(200);
        expect(response.data.data).toBeInstanceOf(Array);
        expect(response.data).toHaveProperty('total');
        expect(response.data).toHaveProperty('page');
        expect(response.data).toHaveProperty('per_page');
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });

    it('Backend.RustAPI.Bookmarks.Integration.CRUD.Delete', async () => {
      const testId = 'rust-bookmarks-delete';
      const result = await tracker.recordTestStart(testId);
      
      try {
        const response = await api.delete(`/bookmarks/${testBookmarkId}`);
        
        expect(response.status).toBe(204);
        
        // Verify deletion
        const getResponse = await api.get(`/bookmarks/${testBookmarkId}`);
        expect(getResponse.status).toBe(404);
        
        await tracker.recordTestExecution(testId, {
          status: 'passed',
          ...result
        });
      } catch (error) {
        await tracker.recordTestExecution(testId, {
          status: 'failed',
          error,
          ...result
        });
        throw error;
      }
    });
  });
});

describe('Backend.RustAPI.Search.Integration', () => {
  beforeAll(async () => {
    // Create test bookmarks for search
    const bookmarks = [
      { url: 'https://rust-lang.org', title: 'Rust Programming Language', tags: ['rust', 'programming'] },
      { url: 'https://actix.rs', title: 'Actix Web Framework', tags: ['rust', 'web', 'framework'] },
      { url: 'https://tokio.rs', title: 'Tokio Async Runtime', tags: ['rust', 'async'] }
    ];
    
    for (const bookmark of bookmarks) {
      await api.post('/bookmarks', bookmark);
    }
  });

  it('Backend.RustAPI.Search.Integration.FullText', async () => {
    const testId = 'rust-search-fulltext';
    const result = await tracker.recordTestStart(testId);
    
    try {
      const response = await api.get('/search', {
        params: { q: 'rust' }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data).toBeInstanceOf(Array);
      expect(response.data.data.length).toBeGreaterThan(0);
      expect(response.data.data[0]).toHaveProperty('score');
      
      await tracker.recordTestExecution(testId, {
        status: 'passed',
        testData: { query: 'rust', results: response.data.data.length },
        ...result
      });
    } catch (error) {
      await tracker.recordTestExecution(testId, {
        status: 'failed',
        error,
        ...result
      });
      throw error;
    }
  });

  it('Backend.RustAPI.Search.Integration.WithFilters', async () => {
    const testId = 'rust-search-with-filters';
    const result = await tracker.recordTestStart(testId);
    
    try {
      const response = await api.get('/search', {
        params: {
          q: 'web',
          tags: 'framework'
        }
      });
      
      expect(response.status).toBe(200);
      expect(response.data.data).toBeInstanceOf(Array);
      
      await tracker.recordTestExecution(testId, {
        status: 'passed',
        testData: { query: 'web', filter: 'framework' },
        ...result
      });
    } catch (error) {
      await tracker.recordTestExecution(testId, {
        status: 'failed',
        error,
        ...result
      });
      throw error;
    }
  });
});

describe('Backend.RustAPI.ErrorHandling.Integration', () => {
  it('Backend.RustAPI.ErrorHandling.Integration.404NotFound', async () => {
    const testId = 'rust-error-404';
    const result = await tracker.recordTestStart(testId);
    
    try {
      const response = await api.get('/bookmarks/non-existent-id');
      
      expect(response.status).toBe(404);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toHaveProperty('code');
      expect(response.data.error).toHaveProperty('message');
      
      await tracker.recordTestExecution(testId, {
        status: 'passed',
        ...result
      });
    } catch (error) {
      await tracker.recordTestExecution(testId, {
        status: 'failed',
        error,
        ...result
      });
      throw error;
    }
  });

  it('Backend.RustAPI.ErrorHandling.Integration.ValidationError', async () => {
    const testId = 'rust-error-validation';
    const result = await tracker.recordTestStart(testId);
    
    try {
      const response = await api.post('/bookmarks', {
        // Missing required fields
        description: 'No URL or title'
      });
      
      expect(response.status).toBe(400);
      expect(response.data.error.code).toBe('VALIDATION_ERROR');
      
      await tracker.recordTestExecution(testId, {
        status: 'passed',
        ...result
      });
    } catch (error) {
      await tracker.recordTestExecution(testId, {
        status: 'failed',
        error,
        ...result
      });
      throw error;
    }
  });
});

// Export test metadata for database storage
export const testPlan = {
  id: 'rust-api-integration',
  name: 'Rust API Integration Test Plan',
  version: '1.0.0',
  description: 'Comprehensive integration tests for Rust backend API',
  metadata: {
    framework: 'vitest',
    philosophy: 'REAL Testing - No Mocks',
    services: ['PostgreSQL:5434', 'Redis:6382', 'Rust API:8000'],
    namingConvention: 'Backend.RustAPI.<Module>.<TestType>.<TestCase>.<Scenario>'
  }
};