// ============================================================================
// Frontend Logger Service - Sends logs to unified backend logger
// ============================================================================

interface LogContext {
  component?: string;
  action?: string;
  userId?: string;
  error?: any;
  [key: string]: any;
}

interface LogEntry {
  type: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  context: LogContext;
  timestamp: string;
  url: string;
  userAgent: string;
}

class FrontendLogger {
  private logBuffer: LogEntry[] = [];
  private flushInterval: number = 5000; // 5 seconds
  private maxBufferSize: number = 50;
  private apiEndpoint: string;
  private isOnline: boolean = navigator.onLine;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.apiEndpoint = `${import.meta.env.VITE_API_URL}/logs/frontend`;
    
    // Start periodic flush
    this.startPeriodicFlush();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flush();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
    
    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush(true);
    });
    
    // Catch unhandled errors
    this.setupErrorHandlers();
  }

  // ============================================================================
  // Core Logging Methods
  // ============================================================================

  private log(type: LogEntry['type'], message: string, context: LogContext = {}) {
    const entry: LogEntry = {
      type,
      message,
      context: {
        ...context,
        sessionId: this.getSessionId(),
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    // Add to buffer
    this.logBuffer.push(entry);
    
    // Console output in development
    if (import.meta.env.DEV) {
      const style = this.getConsoleStyle(type);
      console.log(
        `%c[${type.toUpperCase()}] ${message}`,
        style,
        context
      );
    }
    
    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.flush();
    }
    
    // For errors, flush immediately
    if (type === 'error') {
      this.flush();
    }
  }

  error(message: string, error?: Error | any, context: LogContext = {}) {
    this.log('error', message, {
      ...context,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...error
      } : undefined
    });
  }

  warn(message: string, context: LogContext = {}) {
    this.log('warn', message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.log('info', message, context);
  }

  debug(message: string, context: LogContext = {}) {
    this.log('debug', message, context);
  }

  // ============================================================================
  // Specialized Logging Methods
  // ============================================================================

  // API call logging
  logApiCall(method: string, endpoint: string, status: number, duration: number, error?: any) {
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
    
    this.log(level as LogEntry['type'], `API ${method} ${endpoint}`, {
      component: 'api',
      action: 'request',
      api: {
        method,
        endpoint,
        status,
        duration: `${duration}ms`,
        error: error?.message
      }
    });
  }

  // User action logging
  logUserAction(action: string, details: any = {}) {
    this.info(`User action: ${action}`, {
      component: 'ui',
      action: 'user-interaction',
      interaction: {
        action,
        ...details
      }
    });
  }

  // Performance logging
  logPerformance(metric: string, value: number, context: LogContext = {}) {
    this.debug(`Performance: ${metric}`, {
      ...context,
      performance: {
        metric,
        value,
        unit: 'ms'
      }
    });
  }

  // Component lifecycle logging
  logComponentLifecycle(component: string, event: string, props?: any) {
    this.debug(`Component ${event}: ${component}`, {
      component,
      lifecycle: event,
      props: props ? Object.keys(props) : undefined
    });
  }

  // Navigation logging
  logNavigation(from: string, to: string, params?: any) {
    this.info('Navigation', {
      component: 'router',
      navigation: {
        from,
        to,
        params
      }
    });
  }

  // ============================================================================
  // Error Handlers
  // ============================================================================

  private setupErrorHandlers() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.error('Unhandled error', event.error || {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }, {
        component: 'window',
        action: 'error'
      });
    });

    // Promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', event.reason, {
        component: 'window',
        action: 'unhandledRejection'
      });
    });

    // React Error Boundary can call this
    window.__logReactError = (error: Error, errorInfo: any) => {
      this.error('React error boundary', error, {
        component: 'react',
        action: 'errorBoundary',
        componentStack: errorInfo.componentStack
      });
    };
  }

  // ============================================================================
  // Buffer Management
  // ============================================================================

  private async flush(synchronous = false) {
    if (this.logBuffer.length === 0 || !this.isOnline) {
      return;
    }

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const request = fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({ logs: logsToSend }),
        keepalive: synchronous // For beforeunload
      });

      if (!synchronous) {
        await request;
      }
    } catch (error) {
      // Put logs back in buffer if send failed
      this.logBuffer = [...logsToSend, ...this.logBuffer];
      
      // Don't log the logging error to avoid infinite loop
      if (import.meta.env.DEV) {
        console.error('Failed to send logs:', error);
      }
    }
  }

  private startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private getConsoleStyle(type: LogEntry['type']): string {
    const styles = {
      error: 'color: #ff0000; font-weight: bold;',
      warn: 'color: #ff9800; font-weight: bold;',
      info: 'color: #2196f3;',
      debug: 'color: #9e9e9e;'
    };
    return styles[type];
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('logSessionId');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('logSessionId', sessionId);
    }
    return sessionId;
  }

  private getAuthToken(): string {
    // Get auth token from your auth context/store
    return localStorage.getItem('authToken') || '';
  }

  // ============================================================================
  // Performance Monitoring
  // ============================================================================

  measurePerformance<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    const start = performance.now();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - start;
          this.logPerformance(name, duration);
        });
      } else {
        const duration = performance.now() - start;
        this.logPerformance(name, duration);
        return result;
      }
    } catch (error) {
      const duration = performance.now() - start;
      this.logPerformance(name, duration);
      throw error;
    }
  }

  // React hook for component performance
  useComponentPerformance(componentName: string) {
    const mountTime = performance.now();
    
    return {
      logMount: () => {
        const duration = performance.now() - mountTime;
        this.logPerformance(`${componentName} mount`, duration, {
          component: componentName,
          lifecycle: 'mount'
        });
      },
      logRender: (renderCount: number) => {
        this.debug(`${componentName} render #${renderCount}`, {
          component: componentName,
          lifecycle: 'render',
          renderCount
        });
      }
    };
  }
}

// Create singleton instance
const logger = new FrontendLogger();

// ============================================================================
// React Error Boundary Helper
// ============================================================================

export class LoggingErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('React Error Boundary caught error', error, {
      component: 'ErrorBoundary',
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>The error has been logged. Please refresh the page.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// API Interceptor for Axios
// ============================================================================

export function setupAxiosLogging(axios: any) {
  // Request interceptor
  axios.interceptors.request.use(
    (config: any) => {
      config.metadata = { startTime: performance.now() };
      return config;
    },
    (error: any) => {
      logger.error('API request setup failed', error, {
        component: 'axios',
        action: 'request-interceptor'
      });
      return Promise.reject(error);
    }
  );

  // Response interceptor
  axios.interceptors.response.use(
    (response: any) => {
      const duration = performance.now() - response.config.metadata.startTime;
      logger.logApiCall(
        response.config.method?.toUpperCase() || 'GET',
        response.config.url || '',
        response.status,
        duration
      );
      return response;
    },
    (error: any) => {
      if (error.config?.metadata?.startTime) {
        const duration = performance.now() - error.config.metadata.startTime;
        logger.logApiCall(
          error.config.method?.toUpperCase() || 'GET',
          error.config.url || '',
          error.response?.status || 0,
          duration,
          error
        );
      }
      return Promise.reject(error);
    }
  );
}

export default logger;