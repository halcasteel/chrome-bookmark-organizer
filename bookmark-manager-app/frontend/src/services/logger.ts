// Unified Logger for Frontend
// Sends logs to Vector for aggregation with backend logs

interface LogLevel {
  ERROR: 'ERROR';
  WARN: 'WARN';
  INFO: 'INFO';
  DEBUG: 'DEBUG';
}

interface LogContext {
  userId?: string;
  userEmail?: string;
  requestId?: string;
  correlationId?: string;
  sessionId?: string;
  component?: string;
  action?: string;
  error?: Error;
  performanceMetrics?: {
    duration_ms?: number;
    api_calls?: number;
    render_time?: number;
  };
  [key: string]: any;
}

interface LogEntry {
  timestamp: string;
  level: keyof LogLevel;
  message: string;
  service: 'frontend';
  environment: string;
  url: string;
  userAgent: string;
  context: LogContext;
}

class UnifiedLogger {
  private static instance: UnifiedLogger;
  private buffer: LogEntry[] = [];
  private flushInterval: number = 5000; // 5 seconds
  private maxBufferSize: number = 50;
  private vectorEndpoint: string = 'http://localhost:8687/logs';
  private sessionId: string;
  private correlationId: string | null = null;

  private constructor() {
    this.sessionId = this.generateId();
    this.startFlushInterval();
    this.setupErrorHandlers();
    this.setupPerformanceObserver();
  }

  static getInstance(): UnifiedLogger {
    if (!UnifiedLogger.instance) {
      UnifiedLogger.instance = new UnifiedLogger();
    }
    return UnifiedLogger.instance;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  setUser(userId: string, userEmail: string): void {
    this.defaultContext.userId = userId;
    this.defaultContext.userEmail = userEmail;
  }

  private get defaultContext(): LogContext {
    return {
      sessionId: this.sessionId,
      correlationId: this.correlationId,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
  }

  private createLogEntry(
    level: keyof LogLevel,
    message: string,
    context: LogContext = {}
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'frontend',
      environment: import.meta.env.MODE || 'development',
      url: window.location.href,
      userAgent: navigator.userAgent,
      context: {
        ...this.defaultContext,
        ...context,
      },
    };
  }

  private async sendToVector(entries: LogEntry[]): Promise<void> {
    try {
      const response = await fetch(this.vectorEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entries),
      });

      if (!response.ok) {
        console.error('Failed to send logs to Vector:', response.statusText);
      }
    } catch (error) {
      // Fallback to console if Vector is not available
      console.error('Failed to send logs to Vector:', error);
      entries.forEach(entry => {
        console.log(`[${entry.level}] ${entry.message}`, entry.context);
      });
    }
  }

  private addToBuffer(entry: LogEntry): void {
    this.buffer.push(entry);
    
    // Also log to console in development
    if (import.meta.env.DEV) {
      const style = this.getConsoleStyle(entry.level);
      console.log(
        `%c[${entry.level}] ${entry.message}`,
        style,
        entry.context
      );
    }

    // Flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  private getConsoleStyle(level: keyof LogLevel): string {
    const styles = {
      ERROR: 'color: #ff0000; font-weight: bold;',
      WARN: 'color: #ff9800; font-weight: bold;',
      INFO: 'color: #2196f3;',
      DEBUG: 'color: #9e9e9e;',
    };
    return styles[level];
  }

  private flush(): void {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];
    this.sendToVector(entries);
  }

  private startFlushInterval(): void {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  private setupErrorHandlers(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.error('Uncaught error', {
        error: event.error,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', {
        reason: event.reason,
        promise: event.promise,
      });
    });
  }

  private setupPerformanceObserver(): void {
    if ('PerformanceObserver' in window) {
      // Navigation timing
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const nav = entry as PerformanceNavigationTiming;
            this.info('Page load performance', {
              performanceMetrics: {
                dns_lookup: nav.domainLookupEnd - nav.domainLookupStart,
                tcp_connection: nav.connectEnd - nav.connectStart,
                request_time: nav.responseStart - nav.requestStart,
                response_time: nav.responseEnd - nav.responseStart,
                dom_interactive: nav.domInteractive - nav.fetchStart,
                dom_complete: nav.domComplete - nav.fetchStart,
                load_complete: nav.loadEventEnd - nav.fetchStart,
              },
            });
          }
        }
      });
      navObserver.observe({ entryTypes: ['navigation'] });

      // Resource timing
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 1000) { // Log slow resources
            this.warn('Slow resource load', {
              resource: entry.name,
              duration_ms: entry.duration,
              type: (entry as any).initiatorType,
            });
          }
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
    }
  }

  // Public logging methods
  error(message: string, context: LogContext = {}): void {
    const entry = this.createLogEntry('ERROR', message, context);
    this.addToBuffer(entry);
  }

  warn(message: string, context: LogContext = {}): void {
    const entry = this.createLogEntry('WARN', message, context);
    this.addToBuffer(entry);
  }

  info(message: string, context: LogContext = {}): void {
    const entry = this.createLogEntry('INFO', message, context);
    this.addToBuffer(entry);
  }

  debug(message: string, context: LogContext = {}): void {
    const entry = this.createLogEntry('DEBUG', message, context);
    this.addToBuffer(entry);
  }

  // API request logging
  logApiRequest(
    method: string,
    url: string,
    requestId: string,
    body?: any
  ): void {
    this.info(`API Request: ${method} ${url}`, {
      component: 'api',
      action: 'request',
      requestId,
      method,
      url,
      body: body ? JSON.stringify(body).substring(0, 1000) : undefined,
    });
  }

  logApiResponse(
    method: string,
    url: string,
    requestId: string,
    status: number,
    duration: number,
    error?: any
  ): void {
    const level = status >= 400 ? 'ERROR' : 'INFO';
    const message = `API Response: ${method} ${url} - ${status}`;
    
    this[level.toLowerCase() as 'error' | 'info'](message, {
      component: 'api',
      action: 'response',
      requestId,
      method,
      url,
      status,
      performanceMetrics: { duration_ms: duration },
      error: error ? String(error) : undefined,
    });
  }

  // Component lifecycle logging
  logComponentMount(componentName: string, props?: any): void {
    this.debug(`Component mounted: ${componentName}`, {
      component: componentName,
      action: 'mount',
      props: props ? JSON.stringify(props).substring(0, 500) : undefined,
    });
  }

  logComponentError(componentName: string, error: Error, errorInfo?: any): void {
    this.error(`Component error: ${componentName}`, {
      component: componentName,
      action: 'error',
      error: {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
      },
    });
  }

  // User action logging
  logUserAction(action: string, target: string, details?: any): void {
    this.info(`User action: ${action}`, {
      component: 'user-interaction',
      action,
      target,
      details,
    });
  }

  // Performance logging
  logPerformance(operation: string, duration: number, details?: any): void {
    const level = duration > 1000 ? 'WARN' : 'INFO';
    
    this[level.toLowerCase() as 'warn' | 'info'](
      `Performance: ${operation} took ${duration}ms`,
      {
        component: 'performance',
        operation,
        performanceMetrics: { duration_ms: duration },
        details,
      }
    );
  }
}

// Export singleton instance
export const logger = UnifiedLogger.getInstance();

// React Error Boundary integration
export const logErrorBoundary = (error: Error, errorInfo: any) => {
  logger.error('React Error Boundary triggered', {
    component: 'error-boundary',
    error: {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    },
  });
};

// API interceptor helper
export const createApiInterceptor = (axiosInstance: any) => {
  // Request interceptor
  axiosInstance.interceptors.request.use(
    (config: any) => {
      const requestId = logger['generateId']();
      config.headers['X-Request-ID'] = requestId;
      config.metadata = { startTime: Date.now(), requestId };
      
      logger.logApiRequest(
        config.method?.toUpperCase() || 'GET',
        config.url || '',
        requestId,
        config.data
      );
      
      return config;
    },
    (error: any) => {
      logger.error('API request setup failed', { error: error.message });
      return Promise.reject(error);
    }
  );

  // Response interceptor
  axiosInstance.interceptors.response.use(
    (response: any) => {
      const duration = Date.now() - (response.config.metadata?.startTime || 0);
      const requestId = response.config.metadata?.requestId || 'unknown';
      
      logger.logApiResponse(
        response.config.method?.toUpperCase() || 'GET',
        response.config.url || '',
        requestId,
        response.status,
        duration
      );
      
      return response;
    },
    (error: any) => {
      const duration = Date.now() - (error.config?.metadata?.startTime || 0);
      const requestId = error.config?.metadata?.requestId || 'unknown';
      
      logger.logApiResponse(
        error.config?.method?.toUpperCase() || 'GET',
        error.config?.url || '',
        requestId,
        error.response?.status || 0,
        duration,
        error.message
      );
      
      return Promise.reject(error);
    }
  );
};

export default logger;