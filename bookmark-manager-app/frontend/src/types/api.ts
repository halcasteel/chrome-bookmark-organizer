import { AxiosProgressEvent } from 'axios';

export interface ApiError {
  message: string;
  error?: string;
  statusCode?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface BookmarkFilters extends PaginationParams {
  search?: string;
  domain?: string;
  tag?: string;
  collection?: string;
  is_valid?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
}

export interface ImportResult {
  importId: string;
  total: number;
  new: number;
  updated: number;
  failed: number;
  errors?: Array<{
    url: string;
    error: string;
  }>;
}

export type UploadProgressCallback = (progressEvent: AxiosProgressEvent) => void;