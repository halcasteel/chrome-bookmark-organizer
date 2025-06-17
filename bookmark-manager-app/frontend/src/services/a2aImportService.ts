import api from './api'
import type { UploadProgressCallback } from '../types'

// A2A Task types
export interface A2ATask {
  id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  currentAgent?: string
  currentStep?: number
  totalSteps?: number
  artifacts?: any[]
  error?: string
  created: string
  updated: string
  context?: any
}

export interface A2AImportResponse {
  message: string
  taskId: string
  importId: string
  status: string
  workflow: string
}

export interface A2AArtifact {
  id: string
  agentType: string
  type: string
  data: any
  created: string
}

export interface A2AMessage {
  id: string
  agentType: string
  type: string
  content: string
  timestamp: string
  metadata?: any
}

/**
 * A2A Import Service
 * Handles bookmark imports using the new A2A architecture
 */
export const a2aImportService = {
  /**
   * Upload bookmark file and create A2A task
   */
  upload: (file: File, onProgress?: UploadProgressCallback) => {
    const formData = new FormData()
    formData.append('file', file)
    
    return api.post<A2AImportResponse>('/import/a2a/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    })
  },
  
  /**
   * Get task status
   */
  getTaskStatus: (taskId: string) => 
    api.get<A2ATask>(`/import/a2a/task/${taskId}`),
  
  /**
   * Get task artifacts (results)
   */
  getTaskArtifacts: (taskId: string) => 
    api.get<{ taskId: string; artifacts: A2AArtifact[]; count: number }>(
      `/import/a2a/task/${taskId}/artifacts`
    ),
  
  /**
   * Get task messages (progress updates)
   */
  getTaskMessages: (taskId: string, since?: string) => 
    api.get<{ taskId: string; messages: A2AMessage[]; count: number }>(
      `/import/a2a/task/${taskId}/messages`,
      { params: since ? { since } : {} }
    ),
  
  /**
   * Create validation task for existing bookmarks
   */
  validateBookmarks: (bookmarkIds: string[]) => 
    api.post<A2AImportResponse>('/import/a2a/validate', { bookmarkIds }),
  
  /**
   * Subscribe to task progress via Server-Sent Events
   * Returns an EventSource that emits progress events
   */
  subscribeToTaskProgress: (taskId: string, token: string): EventSource => {
    const apiUrl = api.defaults.baseURL || 'http://localhost:3001/api'
    const eventSource = new EventSource(
      `${apiUrl}/import/a2a/task/${taskId}/stream`,
      {
        withCredentials: true,
      }
    )
    
    // Add auth header via URL param since EventSource doesn't support headers
    const url = new URL(eventSource.url)
    url.searchParams.append('token', token)
    
    return new EventSource(url.toString(), { withCredentials: true })
  },
} as const

export default a2aImportService