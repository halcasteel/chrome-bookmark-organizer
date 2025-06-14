import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// API service functions
export const bookmarkService = {
  getAll: (params) => api.get('/bookmarks', { params }),
  getOne: (id) => api.get(`/bookmarks/${id}`),
  create: (data) => api.post('/bookmarks', data),
  update: (id, data) => api.put(`/bookmarks/${id}`, data),
  delete: (id) => api.delete(`/bookmarks/${id}`),
  validate: (id) => api.post(`/bookmarks/${id}/validate`),
  bulkDelete: (ids) => api.post('/bookmarks/bulk-delete', { ids }),
}

export const searchService = {
  semantic: (query, options) => api.post('/search/semantic', { query, ...options }),
  fullText: (query, options) => api.get('/search/text', { params: { q: query, ...options } }),
  similar: (bookmarkId) => api.get(`/search/similar/${bookmarkId}`),
}

export const importService = {
  upload: (file, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    
    return api.post('/import/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress?.(percentCompleted)
      },
    })
  },
  getHistory: () => api.get('/import/history'),
  getStatus: (importId) => api.get(`/import/status/${importId}`),
}

export const tagService = {
  getAll: () => api.get('/tags'),
  create: (data) => api.post('/tags', data),
  update: (id, data) => api.put(`/tags/${id}`, data),
  delete: (id) => api.delete(`/tags/${id}`),
}

export const collectionService = {
  getAll: () => api.get('/collections'),
  getOne: (id) => api.get(`/collections/${id}`),
  create: (data) => api.post('/collections', data),
  update: (id, data) => api.put(`/collections/${id}`, data),
  delete: (id) => api.delete(`/collections/${id}`),
  addBookmark: (collectionId, bookmarkId) => 
    api.post(`/collections/${collectionId}/bookmarks`, { bookmarkId }),
  removeBookmark: (collectionId, bookmarkId) => 
    api.delete(`/collections/${collectionId}/bookmarks/${bookmarkId}`),
  share: (id) => api.post(`/collections/${id}/share`),
  unshare: (id) => api.delete(`/collections/${id}/share`),
}