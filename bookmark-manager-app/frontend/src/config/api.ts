// API configuration for Rust backend
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Service-specific endpoints
export const API_ENDPOINTS = {
  // Auth service (port 8001)
  auth: {
    login: `${API_BASE_URL}/auth/login`,
    register: `${API_BASE_URL}/auth/register`,
    logout: `${API_BASE_URL}/auth/logout`,
    me: `${API_BASE_URL}/auth/me`,
    twoFactor: {
      setup: `${API_BASE_URL}/auth/2fa/setup`,
      verify: `${API_BASE_URL}/auth/2fa/verify`,
      disable: `${API_BASE_URL}/auth/2fa/disable`
    }
  },

  // Bookmarks service (port 8002)
  bookmarks: {
    list: `${API_BASE_URL}/bookmarks`,
    create: `${API_BASE_URL}/bookmarks`,
    get: (id: string) => `${API_BASE_URL}/bookmarks/${id}`,
    update: (id: string) => `${API_BASE_URL}/bookmarks/${id}`,
    delete: (id: string) => `${API_BASE_URL}/bookmarks/${id}`,
    archive: (id: string) => `${API_BASE_URL}/bookmarks/${id}/archive`,
    unarchive: (id: string) => `${API_BASE_URL}/bookmarks/${id}/unarchive`
  },

  // Import service (port 8003)
  import: {
    upload: `${API_BASE_URL}/import/upload`,
    status: `${API_BASE_URL}/import/status`,
    history: `${API_BASE_URL}/import/history`
  },

  // Search service (port 8004)
  search: {
    query: `${API_BASE_URL}/search`,
    suggestions: `${API_BASE_URL}/search/suggestions`,
    related: (id: string) => `${API_BASE_URL}/search/related/${id}`
  },

  // Health check
  health: `${API_BASE_URL}/health`
};

// WebSocket configuration
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

// Helper to check if using Rust backend
export const isRustBackend = () => {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  return apiUrl.includes(':8000') || apiUrl.includes('gateway');
};

// Backward compatibility layer for Node.js backend
export const LEGACY_API_ENDPOINTS = {
  auth: {
    login: '/api/auth/login',
    register: '/api/auth/register',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
    twoFactor: {
      setup: '/api/auth/2fa/setup',
      verify: '/api/auth/2fa/verify',
      disable: '/api/auth/2fa/disable'
    }
  },
  bookmarks: {
    list: '/api/bookmarks',
    create: '/api/bookmarks',
    get: (id: string) => `/api/bookmarks/${id}`,
    update: (id: string) => `/api/bookmarks/${id}`,
    delete: (id: string) => `/api/bookmarks/${id}`,
    archive: (id: string) => `/api/bookmarks/${id}/archive`,
    unarchive: (id: string) => `/api/bookmarks/${id}/unarchive`
  },
  import: {
    upload: '/api/import/upload',
    status: '/api/import/status',
    history: '/api/import/history'
  },
  search: {
    query: '/api/search',
    suggestions: '/api/search/suggestions',
    related: (id: string) => `/api/search/related/${id}`
  }
};

// Use Rust endpoints if configured, otherwise fall back to Node.js
export const getApiEndpoints = () => {
  return isRustBackend() ? API_ENDPOINTS : LEGACY_API_ENDPOINTS;
};