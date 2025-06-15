import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
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
  AuthResponse
} from '@/types'

// Get API URL from runtime config or environment variable
const getApiUrl = (): string => {
  // Check for runtime configuration (injected by Docker)
  if (typeof window !== 'undefined' && (window as any).__RUNTIME_CONFIG__?.API_URL) {
    return (window as any).__RUNTIME_CONFIG__.API_URL
  }
  
  // Fall back to build-time environment variable
  return import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
}

const API_URL = getApiUrl()

// Create axios instance with proper typing
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor with proper typing
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// Response interceptor with proper typing
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// Bookmark service with strict types
export const bookmarkService = {
  getAll: (params?: BookmarkFilters) => 
    api.get<{ bookmarks: Bookmark[]; total: number }>('/bookmarks', { params }),
  
  getOne: (id: string) => 
    api.get<Bookmark>(`/bookmarks/${id}`),
  
  create: (data: Partial<Bookmark>) => 
    api.post<Bookmark>('/bookmarks', data),
  
  update: (id: string, data: Partial<Bookmark>) => 
    api.put<Bookmark>(`/bookmarks/${id}`, data),
  
  delete: (id: string) => 
    api.delete<{ message: string }>(`/bookmarks/${id}`),
  
  validate: (id: string) => 
    api.post<{ valid: boolean; status: number }>(`/bookmarks/${id}/validate`),
  
  bulkDelete: (ids: string[]) => 
    api.post<{ deleted: number }>('/bookmarks/bulk-delete', { ids }),
} as const

// Search service with strict types
export const searchService = {
  semantic: (query: string, options?: SearchOptions) => 
    api.post<{ results: SearchResult[] }>('/search/semantic', { query, ...options }),
  
  fullText: (query: string, options?: SearchOptions) => 
    api.get<{ results: SearchResult[] }>('/search/text', { 
      params: { q: query, ...options } 
    }),
  
  similar: (bookmarkId: string) => 
    api.get<{ results: SearchResult[] }>(`/search/similar/${bookmarkId}`),
} as const

// Import service with strict types
export const importService = {
  upload: (file: File, onProgress?: UploadProgressCallback) => {
    const formData = new FormData()
    formData.append('file', file)
    
    return api.post<ImportResult>('/import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    })
  },
  
  getHistory: () => 
    api.get<ImportHistory[]>('/import/history'),
  
  getStatus: (importId: string) => 
    api.get<ImportHistory>(`/import/status/${importId}`),
} as const

// Tag service with strict types
export const tagService = {
  getAll: () => 
    api.get<Tag[]>('/tags'),
  
  create: (data: Omit<Tag, 'id' | 'user_id' | 'created_at'>) => 
    api.post<Tag>('/tags', data),
  
  update: (id: string, data: Partial<Omit<Tag, 'id' | 'user_id' | 'created_at'>>) => 
    api.put<Tag>(`/tags/${id}`, data),
  
  delete: (id: string) => 
    api.delete<{ message: string }>(`/tags/${id}`),
} as const

// Collection service with strict types
export const collectionService = {
  getAll: () => 
    api.get<Collection[]>('/collections'),
  
  getOne: (id: string) => 
    api.get<Collection>(`/collections/${id}`),
  
  create: (data: Omit<Collection, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => 
    api.post<Collection>('/collections', data),
  
  update: (id: string, data: Partial<Omit<Collection, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => 
    api.put<Collection>(`/collections/${id}`, data),
  
  delete: (id: string) => 
    api.delete<{ message: string }>(`/collections/${id}`),
  
  addBookmark: (collectionId: string, bookmarkId: string) => 
    api.post<{ message: string }>(`/collections/${collectionId}/bookmarks`, { bookmarkId }),
  
  removeBookmark: (collectionId: string, bookmarkId: string) => 
    api.delete<{ message: string }>(`/collections/${collectionId}/bookmarks/${bookmarkId}`),
  
  share: (id: string) => 
    api.post<{ share_token: string }>(`/collections/${id}/share`),
  
  unshare: (id: string) => 
    api.delete<{ message: string }>(`/collections/${id}/share`),
} as const

// Auth service (for use in AuthContext)
export const authService = {
  login: (email: string, password: string, twoFactorCode?: string) =>
    api.post<AuthResponse>('/auth/login', { email, password, twoFactorCode }),
  
  register: (email: string, password: string, name: string) =>
    api.post<AuthResponse & { twoFactorSetup: { secret: string; qrCode: string } }>('/auth/register', { email, password, name }),
  
  me: () =>
    api.get<{ user: User }>('/auth/me'),
  
  enable2FA: (email: string, password: string, twoFactorCode: string) =>
    api.post<{ message: string }>('/auth/enable-2fa', { email, password, twoFactorCode }),
  
  generateRecoveryCodes: () =>
    api.post<{ recoveryCodes: string[]; message: string }>('/auth/recovery-codes'),
} as const

// Import User type for auth service
import type { User } from '@/types'