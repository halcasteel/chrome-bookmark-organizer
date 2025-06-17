// Rate limiter to prevent excessive API calls
class RateLimiter {
  private requests: Map<string, number[]> = new Map()
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  canMakeRequest(endpoint: string): boolean {
    const now = Date.now()
    const requests = this.requests.get(endpoint) || []
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs)
    
    if (validRequests.length >= this.maxRequests) {
      return false
    }
    
    // Add new request
    validRequests.push(now)
    this.requests.set(endpoint, validRequests)
    
    return true
  }

  getRemainingTime(endpoint: string): number {
    const now = Date.now()
    const requests = this.requests.get(endpoint) || []
    const validRequests = requests.filter(time => now - time < this.windowMs)
    
    if (validRequests.length < this.maxRequests) {
      return 0
    }
    
    // Return time until oldest request expires
    const oldestRequest = Math.min(...validRequests)
    return Math.max(0, this.windowMs - (now - oldestRequest))
  }
}

// Create singleton instance
export const apiRateLimiter = new RateLimiter(60000, 30) // 30 requests per minute

// Debounce function for frequent operations
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Throttle function for rate-limited operations
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}