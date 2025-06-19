/**
 * Rust API Service Adapter
 * TypeScript strict mode compliant
 * Handles response format differences between Node.js and Rust backends
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import type { 
  Bookmark, 
  Tag, 
  Collection, 
  ImportHistory, 
  SearchResult,
  ImportResult,
  BookmarkFilters,
  SearchOptions,
  UploadProgressCallback,
  ApiError,
  AuthResponse,
  User,
  ImportProgress
} from '../types';

// Rust API response wrappers
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

// Get API URL from environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Create axios instance
const rustApi: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth
rustApi.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && token !== 'undefined' && token !== 'null' && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and response unwrapping
rustApi.interceptors.response.use(
  (response: AxiosResponse) => {
    // Unwrap Rust API response format
    if (response.data && 'data' in response.data) {
      response.data = response.data.data;
    }
    return response;
  },
  (error: AxiosError<RustApiError>) => {
    // Handle 401 - Unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    }
    
    // Transform Rust error format to match frontend expectations
    if (error.response?.data?.error) {
      const rustError = error.response.data.error;
      const apiError: ApiError = {
        message: rustError.message,
        code: rustError.code,
        details: rustError.details
      };
      
      // Replace the error response data
      (error.response as any).data = apiError;
    }
    
    return Promise.reject(error);
  }
);

// Helper function to transform filters for Rust API
function transformFilters(filters?: BookmarkFilters): Record<string, any> {
  if (!filters) return {};
  
  const params: Record<string, any> = {};
  
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.per_page = filters.limit;
  if (filters.category) params.category = filters.category;
  if (filters.tags) params.tags = Array.isArray(filters.tags) ? filters.tags.join(',') : filters.tags;
  if (filters.search) params.q = filters.search;
  if (filters.isArchived !== undefined) params.archived = filters.isArchived;
  
  return params;
}

// Authentication service
export const authService = {
  login: async (credentials: { email: string; password: string }) => {
    const response = await rustApi.post<{
      token: string;
      refresh_token: string;
      user: User;
    }>('/auth/login', credentials);
    
    // Store tokens
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('refresh_token', response.data.refresh_token);
    
    return response;
  },
  
  register: async (userData: { email: string; password: string; name: string }) => {
    const response = await rustApi.post<{
      token: string;
      refresh_token: string;
      user: User;
    }>('/auth/register', userData);
    
    // Store tokens
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('refresh_token', response.data.refresh_token);
    
    return response;
  },
  
  logout: async () => {
    try {
      await rustApi.post('/auth/logout');
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    }
  },
  
  getCurrentUser: () => 
    rustApi.get<User>('/auth/me'),
  
  refreshToken: async (refreshToken: string) => {
    const response = await rustApi.post<{
      token: string;
      refresh_token: string;
    }>('/auth/refresh', { refresh_token: refreshToken });
    
    // Update stored tokens
    localStorage.setItem('token', response.data.token);
    localStorage.setItem('refresh_token', response.data.refresh_token);
    
    return response;
  },
} as const;

// Bookmark service with Rust API adaptations
export const bookmarkService = {
  getAll: async (params?: BookmarkFilters) => {
    const response = await rustApi.get<RustPaginatedResponse<Bookmark>>(
      '/bookmarks', 
      { params: transformFilters(params) }
    );
    
    // Transform to match expected format
    return {
      ...response,
      data: {
        bookmarks: response.data.data,
        total: response.data.total
      }
    };
  },
  
  getOne: (id: string) => 
    rustApi.get<Bookmark>(`/bookmarks/${id}`),
  
  create: (data: Partial<Bookmark>) => 
    rustApi.post<Bookmark>('/bookmarks', data),
  
  update: (id: string, data: Partial<Bookmark>) => 
    rustApi.put<Bookmark>(`/bookmarks/${id}`, data),
  
  delete: (id: string) => 
    rustApi.delete<void>(`/bookmarks/${id}`),
  
  archive: (id: string) =>
    rustApi.post<Bookmark>(`/bookmarks/${id}/archive`),
    
  unarchive: (id: string) =>
    rustApi.post<Bookmark>(`/bookmarks/${id}/unarchive`),
  
  bulkDelete: async (ids: string[]) => {
    // Rust API might not have bulk delete, so we do it sequentially
    const results = await Promise.allSettled(
      ids.map(id => rustApi.delete(`/bookmarks/${id}`))
    );
    
    const deleted = results.filter(r => r.status === 'fulfilled').length;
    return { data: { deleted } };
  },
} as const;

// Search service
export const searchService = {
  search: async (query: string, options?: SearchOptions) => {
    const params: Record<string, any> = { q: query };
    
    if (options?.limit) params.limit = options.limit;
    if (options?.offset) params.offset = options.offset;
    if (options?.tags) params.tags = options.tags.join(',');
    if (options?.category) params.category = options.category;
    
    const response = await rustApi.get<SearchResult[]>('/search', { params });
    
    return {
      ...response,
      data: { results: response.data }
    };
  },
  
  getSuggestions: async (query: string) => {
    const response = await rustApi.get<string[]>('/search/suggestions', {
      params: { q: query }
    });
    
    return response;
  },
  
  getRelated: (bookmarkId: string) =>
    rustApi.get<SearchResult[]>(`/search/related/${bookmarkId}`),
} as const;

// Import service
export const importService = {
  uploadFile: async (file: File, onProgress?: UploadProgressCallback) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await rustApi.post<{ importId: string }>('/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentComplete);
        }
      },
    });
    
    return response;
  },
  
  getHistory: async () => {
    const response = await rustApi.get<ImportHistory[]>('/import/history');
    return response;
  },
  
  getProgress: (importId: string) =>
    rustApi.get<ImportProgress>(`/import/${importId}/progress`),
} as const;

// Tag service
export const tagService = {
  getAll: () => 
    rustApi.get<Tag[]>('/tags'),
  
  getPopular: (limit: number = 20) =>
    rustApi.get<Tag[]>('/tags/popular', { params: { limit } }),
    
  merge: (fromTag: string, toTag: string) =>
    rustApi.post('/tags/merge', { from: fromTag, to: toTag }),
} as const;

// Collection service
export const collectionService = {
  getAll: () =>
    rustApi.get<Collection[]>('/collections'),
    
  getOne: (id: string) =>
    rustApi.get<Collection>(`/collections/${id}`),
    
  create: (data: Partial<Collection>) =>
    rustApi.post<Collection>('/collections', data),
    
  update: (id: string, data: Partial<Collection>) =>
    rustApi.put<Collection>(`/collections/${id}`, data),
    
  delete: (id: string) =>
    rustApi.delete<void>(`/collections/${id}`),
    
  addBookmark: (collectionId: string, bookmarkId: string) =>
    rustApi.post(`/collections/${collectionId}/bookmarks`, { bookmarkId }),
    
  removeBookmark: (collectionId: string, bookmarkId: string) =>
    rustApi.delete(`/collections/${collectionId}/bookmarks/${bookmarkId}`),
} as const;

// Export the configured axios instance for custom requests
export default rustApi;

// Type guards for runtime type checking
export function isRustApiError(error: unknown): error is AxiosError<RustApiError> {
  return axios.isAxiosError(error) && 
    error.response?.data !== undefined &&
    typeof (error.response.data as any)?.error === 'object';
}

export function isValidationError(error: unknown): error is AxiosError<RustApiError> {
  return isRustApiError(error) && 
    error.response?.data.error.code === 'VALIDATION_ERROR';
}