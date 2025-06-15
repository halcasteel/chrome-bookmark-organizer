// Import types
export interface ImportHistory {
  id: string
  user_id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_bookmarks?: number
  new_bookmarks?: number
  updated_bookmarks?: number
  failed_bookmarks?: number
  error_message?: string
  started_at: string
  completed_at?: string
}

export interface ImportResult {
  total: number
  new: number
  updated: number
  failed: number
  duplicates: number
}

export interface ImportProgress {
  importId: string
  phase: 'uploading' | 'parsing' | 'chunking' | 'importing' | 'validating' | 'completed'
  percentComplete: number
  chunksProcessed?: number
  chunksTotal?: number
  bookmarksImported?: number
  bookmarksTotal?: number
  currentChunk?: number
  errors?: string[]
}

// Search types
export interface SearchResult {
  id: string
  url: string
  title: string
  description?: string
  score: number
  highlight?: string
  category?: string
  tags?: string[]
}

export interface SearchFilters {
  category?: string
  tags?: string[]
  dateFrom?: Date
  dateTo?: Date
  domain?: string
  isValid?: boolean
}

// Re-export from other type files
export * from './api'
export * from './auth'