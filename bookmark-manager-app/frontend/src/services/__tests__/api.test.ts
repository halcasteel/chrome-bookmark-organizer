/**
 * Frontend API Service Tests
 * TypeScript strict mode compliant
 * Tests API client adaptation for Rust backend
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios, { AxiosError, AxiosResponse } from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { bookmarkService, searchService, importService, authService } from '../api';
import type { 
  Bookmark, 
  SearchResult, 
  ApiError,
  AuthResponse,
  User,
  ImportProgress,
  PaginatedResponse
} from '../../types';

// Type definitions for Rust API responses
interface RustApiResponse<T> {
  data: T;
}

interface RustApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface RustPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

// Mock adapter for controlled testing
let mock: MockAdapter;

describe('Frontend.API.RustBackend.TypeSafety', () => {
  beforeEach(() => {
    mock = new MockAdapter(axios);
    localStorage.clear();
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Frontend.API.RustBackend.TypeSafety.ResponseFormat', () => {
    it('should handle Rust API success response format', async () => {
      const expectedBookmark: Bookmark = {
        id: '123',
        url: 'https://example.com',
        title: 'Example',
        description: 'Test bookmark',
        tags: ['test'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Rust API wraps data in { data: ... }
      const rustResponse: RustApiResponse<Bookmark> = {
        data: expectedBookmark
      };

      mock.onGet('/bookmarks/123').reply(200, rustResponse);

      const result = await bookmarkService.getOne('123');
      
      // Type assertion to ensure proper typing
      const bookmark: Bookmark = result.data;
      expect(bookmark).toEqual(expectedBookmark);
      expect(bookmark.id).toBe('123');
      expect(bookmark.url).toBe('https://example.com');
    });

    it('should handle Rust API error response format', async () => {
      const rustError: RustApiError = {
        error: {
          code: 'NOT_FOUND',
          message: 'Bookmark not found',
          details: { id: '123' }
        }
      };

      mock.onGet('/bookmarks/123').reply(404, rustError);

      try {
        await bookmarkService.getOne('123');
        expect.fail('Should have thrown an error');
      } catch (error) {
        const axiosError = error as AxiosError<RustApiError>;
        expect(axiosError.response?.status).toBe(404);
        expect(axiosError.response?.data.error.code).toBe('NOT_FOUND');
        expect(axiosError.response?.data.error.message).toBe('Bookmark not found');
      }
    });

    it('should handle Rust API paginated response format', async () => {
      const bookmarks: Bookmark[] = [
        {
          id: '1',
          url: 'https://example1.com',
          title: 'Example 1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: '2',
          url: 'https://example2.com',
          title: 'Example 2',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const rustPaginatedResponse: RustPaginatedResponse<Bookmark> = {
        data: bookmarks,
        total: 50,
        page: 1,
        per_page: 10
      };

      mock.onGet('/bookmarks').reply(200, rustPaginatedResponse);

      const result = await bookmarkService.getAll({ page: 1, limit: 10 });
      
      // Ensure proper typing of paginated response
      const response = result.data as unknown as RustPaginatedResponse<Bookmark>;
      expect(response.data).toHaveLength(2);
      expect(response.total).toBe(50);
      expect(response.page).toBe(1);
      expect(response.per_page).toBe(10);
      
      // Type check individual items
      response.data.forEach((bookmark: Bookmark) => {
        expect(bookmark).toHaveProperty('id');
        expect(bookmark).toHaveProperty('url');
        expect(bookmark).toHaveProperty('title');
      });
    });
  });

  describe('Frontend.API.RustBackend.TypeSafety.Authentication', () => {
    it('should handle Rust auth response with proper types', async () => {
      const user: User = {
        id: 'user-123',
        email: 'test@az1.ai',
        name: 'Test User',
        role: 'user',
        created_at: new Date().toISOString()
      };

      const rustAuthResponse: RustApiResponse<{
        token: string;
        refresh_token: string;
        user: User;
      }> = {
        data: {
          token: 'jwt-token',
          refresh_token: 'refresh-token',
          user
        }
      };

      mock.onPost('/auth/login').reply(200, rustAuthResponse);

      const result = await authService.login({
        email: 'test@az1.ai',
        password: 'password123'
      });

      // Type assertions
      const authData = result.data.data;
      expect(authData.token).toBe('jwt-token');
      expect(authData.refresh_token).toBe('refresh-token');
      expect(authData.user.email).toBe('test@az1.ai');
      
      // Ensure token is stored
      expect(localStorage.getItem('token')).toBe('jwt-token');
      expect(localStorage.getItem('refresh_token')).toBe('refresh-token');
    });

    it('should include auth token in subsequent requests', async () => {
      localStorage.setItem('token', 'test-jwt-token');

      mock.onGet('/auth/me').reply((config) => {
        expect(config.headers?.Authorization).toBe('Bearer test-jwt-token');
        return [200, { data: { id: '123', email: 'test@az1.ai' } }];
      });

      await authService.getCurrentUser();
    });

    it('should handle token refresh with proper types', async () => {
      const refreshResponse: RustApiResponse<{
        token: string;
        refresh_token: string;
      }> = {
        data: {
          token: 'new-jwt-token',
          refresh_token: 'new-refresh-token'
        }
      };

      mock.onPost('/auth/refresh').reply(200, refreshResponse);

      const result = await authService.refreshToken('old-refresh-token');
      
      const tokens = result.data.data;
      expect(tokens.token).toBe('new-jwt-token');
      expect(tokens.refresh_token).toBe('new-refresh-token');
    });
  });

  describe('Frontend.API.RustBackend.TypeSafety.ErrorHandling', () => {
    it('should handle validation errors with proper types', async () => {
      const validationError: RustApiError = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: {
            fields: {
              url: 'URL is required',
              title: 'Title must be at least 3 characters'
            }
          }
        }
      };

      mock.onPost('/bookmarks').reply(400, validationError);

      try {
        await bookmarkService.create({ description: 'No URL or title' });
        expect.fail('Should have thrown validation error');
      } catch (error) {
        const axiosError = error as AxiosError<RustApiError>;
        expect(axiosError.response?.status).toBe(400);
        expect(axiosError.response?.data.error.code).toBe('VALIDATION_ERROR');
        
        // Type-safe access to validation details
        const details = axiosError.response?.data.error.details as {
          fields: Record<string, string>;
        };
        expect(details.fields.url).toBe('URL is required');
      }
    });

    it('should handle 401 and redirect to login', async () => {
      const unauthorizedError: RustApiError = {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token expired'
        }
      };

      // Mock window.location for testing
      const mockLocation = { href: '' };
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true
      });

      mock.onGet('/bookmarks').reply(401, unauthorizedError);

      try {
        await bookmarkService.getAll();
      } catch (error) {
        // Response interceptor should handle 401
        expect(localStorage.getItem('token')).toBeNull();
        expect(mockLocation.href).toBe('/login');
      }
    });
  });

  describe('Frontend.API.RustBackend.TypeSafety.Search', () => {
    it('should handle search results with proper types', async () => {
      const searchResults: SearchResult[] = [
        {
          id: '1',
          url: 'https://rust-lang.org',
          title: 'Rust Programming',
          description: 'Systems programming language',
          score: 0.95,
          highlight: '<em>Rust</em> Programming',
          tags: ['rust', 'programming']
        }
      ];

      const rustSearchResponse: RustApiResponse<SearchResult[]> = {
        data: searchResults
      };

      mock.onGet('/search').reply(200, rustSearchResponse);

      const result = await searchService.fullText('rust');
      
      const results = result.data.data;
      expect(results).toHaveLength(1);
      
      // Type assertions
      const firstResult: SearchResult = results[0];
      expect(firstResult.score).toBe(0.95);
      expect(firstResult.highlight).toContain('<em>Rust</em>');
      expect(firstResult.tags).toContain('rust');
    });

    it('should handle search suggestions with proper types', async () => {
      const suggestions: string[] = ['rust', 'rustlang', 'rust-analyzer'];

      mock.onGet('/search/suggestions').reply(200, {
        data: suggestions
      });

      const result = await searchService.getSuggestions('rus');
      
      const suggestionList: string[] = result.data.data;
      expect(suggestionList).toHaveLength(3);
      expect(suggestionList[0]).toBe('rust');
    });
  });

  describe('Frontend.API.RustBackend.TypeSafety.Import', () => {
    it('should handle import progress with proper types', async () => {
      const progress: ImportProgress = {
        importId: 'import-123',
        phase: 'importing',
        percentComplete: 45,
        chunksProcessed: 9,
        chunksTotal: 20,
        bookmarksImported: 450,
        bookmarksTotal: 1000
      };

      mock.onGet('/import/import-123/progress').reply(200, {
        data: progress
      });

      const result = await importService.getProgress('import-123');
      
      const importProgress: ImportProgress = result.data.data;
      expect(importProgress.phase).toBe('importing');
      expect(importProgress.percentComplete).toBe(45);
      expect(importProgress.bookmarksImported).toBe(450);
    });

    it('should handle file upload with progress callback', async () => {
      const progressUpdates: number[] = [];
      
      mock.onPost('/import').reply((config) => {
        // Simulate progress updates
        if (config.onUploadProgress) {
          config.onUploadProgress({ loaded: 50, total: 100 } as ProgressEvent);
          config.onUploadProgress({ loaded: 100, total: 100 } as ProgressEvent);
        }
        
        return [200, { data: { importId: 'import-456' } }];
      });

      const file = new File(['bookmarks'], 'bookmarks.html', { type: 'text/html' });
      
      await importService.uploadFile(file, (progress) => {
        progressUpdates.push(progress);
      });

      expect(progressUpdates).toEqual([50, 100]);
    });
  });

  describe('Frontend.API.RustBackend.TypeSafety.TypeGuards', () => {
    it('should properly type guard API responses', () => {
      // Type guard for Rust API response
      function isRustApiResponse<T>(response: unknown): response is RustApiResponse<T> {
        return (
          typeof response === 'object' &&
          response !== null &&
          'data' in response
        );
      }

      // Type guard for Rust API error
      function isRustApiError(error: unknown): error is RustApiError {
        return (
          typeof error === 'object' &&
          error !== null &&
          'error' in error &&
          typeof (error as any).error === 'object' &&
          'code' in (error as any).error &&
          'message' in (error as any).error
        );
      }

      // Test type guards
      const validResponse: RustApiResponse<string> = { data: 'test' };
      const validError: RustApiError = {
        error: { code: 'TEST', message: 'Test error' }
      };

      expect(isRustApiResponse(validResponse)).toBe(true);
      expect(isRustApiResponse({ notData: 'test' })).toBe(false);
      
      expect(isRustApiError(validError)).toBe(true);
      expect(isRustApiError({ error: 'string' })).toBe(false);
    });
  });
});

// Export test metadata for type checking
export const apiTestMetadata = {
  framework: 'vitest',
  typeChecking: 'strict',
  philosophy: 'Type-safe API integration',
  coverage: [
    'Response format adaptation',
    'Error handling',
    'Authentication flow',
    'Pagination',
    'File uploads',
    'Type guards'
  ]
} as const;