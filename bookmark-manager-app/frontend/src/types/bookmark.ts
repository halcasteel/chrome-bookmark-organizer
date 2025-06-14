export interface Bookmark {
  id: string;
  user_id: string;
  url: string;
  title: string;
  description?: string;
  domain: string;
  favicon_url?: string;
  is_valid: boolean;
  last_checked?: string;
  http_status?: number;
  content_hash?: string;
  created_at: string;
  updated_at: string;
  imported_at?: string;
  chrome_add_date?: number;
  tags?: Tag[];
  semantic_summary?: string;
  keywords?: string[];
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_public: boolean;
  share_token?: string;
  created_at: string;
  updated_at: string;
  bookmarks?: Bookmark[];
  bookmark_count?: number;
}

export interface ImportHistory {
  id: string;
  user_id: string;
  filename: string;
  file_size?: number;
  total_bookmarks?: number;
  new_bookmarks?: number;
  updated_bookmarks?: number;
  failed_bookmarks?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface SearchResult {
  bookmark_id: string;
  url: string;
  title: string;
  description?: string;
  domain: string;
  similarity?: number;
}

export interface DashboardStats {
  totalBookmarks: number;
  totalCollections: number;
  totalTags: number;
  recentImports: number;
  bookmarkChange?: number;
  domainStats?: Array<{
    domain: string;
    count: number;
  }>;
  recentActivity?: Array<{
    action: string;
    timestamp: string;
  }>;
}