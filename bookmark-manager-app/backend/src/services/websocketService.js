import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import unifiedLogger from './unifiedLogger.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set of socket IDs
    this.messageStats = new Map(); // Track message statistics
  }

  initialize(server) {
    const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:5173'];
    
    unifiedLogger.info('Initializing WebSocket server', { 
      service: 'websocket', 
      source: 'initialize',
      corsOrigins,
      transports: ['websocket', 'polling']
    });
    
    // Fix: Ensure proper Socket.IO initialization with explicit configuration
    this.io = new Server(server, {
      cors: {
        origin: corsOrigins,
        credentials: true,
        methods: ['GET', 'POST'],
        allowedHeaders: ['content-type', 'authorization']
      },
      transports: ['polling', 'websocket'], // Fix: Start with polling, then upgrade
      allowEIO3: true, // Fix: Allow Engine.IO v3 clients
      pingTimeout: 60000,
      pingInterval: 25000,
      path: '/socket.io/', // Fix: Ensure proper path
      serveClient: false, // Fix: Don't serve client files
      cookie: false, // Fix: Disable cookies to prevent conflicts
      // Fix: Add upgrade timeout and max HTTP buffer size
      upgradeTimeout: 10000,
      maxHttpBufferSize: 1e6,
      // Fix: Allow requests from Vite dev server
      allowRequest: (req, callback) => {
        // Always allow requests in development
        callback(null, true);
      }
    });

    // Fix: Add engine-level error handling
    this.io.engine.on('connection_error', (err) => {
      unifiedLogger.error('Engine.IO connection error', {
        service: 'websocket',
        source: 'engine_error',
        error: err.message,
        type: err.type,
        req: err.req ? {
          url: err.req.url,
          headers: err.req.headers
        } : undefined
      });
    });

    // Fix: Handle pre-upgrade errors
    this.io.engine.on('headers', (headers, req) => {
      // Add CORS headers for WebSocket upgrade
      // Only set the origin that matches the request
      const origin = req.headers.origin;
      if (origin && corsOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      // Fix: Add WebSocket-specific headers for Vite proxy
      headers['X-Powered-By'] = 'Socket.IO';
    });

    // Log engine configuration
    this.io.on('connection_error', (err) => {
      unifiedLogger.error('WebSocket connection error', {
        service: 'websocket',
        source: 'connection_error',
        error: err.message,
        type: err.type,
        stack: err.stack
      });
    });

    // Authentication middleware with better error handling
    this.io.use(async (socket, next) => {
      const startTime = Date.now();
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        const clientIp = socket.handshake.address;
        const userAgent = socket.handshake.headers['user-agent'];
        
        unifiedLogger.debug('WebSocket auth attempt', { 
          service: 'websocket',
          source: 'auth',
          hasToken: !!token,
          tokenPrefix: token?.substring(0, 20),
          clientIp,
          userAgent,
          transport: socket.conn.transport.name,
          protocol: socket.conn.protocol,
          headers: Object.keys(socket.handshake.headers)
        });
        
        if (!token) {
          const error = new Error('Authentication required - No token provided');
          error.data = { code: 'NO_TOKEN' };
          unifiedLogger.error('WebSocket auth failed - no token', {
            service: 'websocket',
            source: 'auth',
            error: error.message,
            clientIp,
            userAgent,
            authHeader: socket.handshake.auth,
            headers: socket.handshake.headers
          });
          return next(error);
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id || decoded.userId;
        
        const authTime = Date.now() - startTime;
        unifiedLogger.info('WebSocket auth success', { 
          service: 'websocket',
          source: 'auth',
          userId: socket.userId,
          authTimeMs: authTime,
          transport: socket.conn.transport.name
        });
        next();
      } catch (err) {
        const authTime = Date.now() - startTime;
        const error = new Error('Invalid token');
        error.data = { code: 'INVALID_TOKEN', details: err.message };
        
        unifiedLogger.error('WebSocket auth failed - invalid token', {
          service: 'websocket',
          source: 'auth',
          error: err.message,
          errorType: err.name,
          authTimeMs: authTime,
          tokenPrefix: socket.handshake.auth.token?.substring(0, 20),
          jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not set',
          clientIp: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent']
        });
        next(error);
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      const userId = socket.userId;
      const connectionTime = Date.now();
      
      unifiedLogger.info('WebSocket client connected', {
        service: 'websocket',
        source: 'connection',
        userId, 
        socketId: socket.id,
        transport: socket.conn.transport.name,
        protocol: socket.conn.protocol,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        query: socket.handshake.query
      });
      
      // Send immediate confirmation to client
      const confirmData = { 
        socketId: socket.id, 
        userId,
        timestamp: new Date(),
        transport: socket.conn.transport.name,
        protocol: socket.conn.protocol
      };
      socket.emit('connection_confirmed', confirmData);
      
      unifiedLogger.debug('Emitted connection_confirmed', {
        service: 'websocket',
        source: 'emit',
        event: 'connection_confirmed',
        userId,
        socketId: socket.id,
        dataSize: JSON.stringify(confirmData).length
      });

      // Track user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);

      // Join user-specific room
      socket.join(`user:${userId}`);
      unifiedLogger.debug('Socket joined room', {
        service: 'websocket',
        source: 'room',
        action: 'join',
        room: `user:${userId}`,
        userId,
        socketId: socket.id
      });

      // Handle transport upgrade
      socket.on('upgrade', (transport) => {
        unifiedLogger.info('Transport upgraded', {
          service: 'websocket',
          source: 'transport',
          userId,
          socketId: socket.id,
          transport: transport.name
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        const connectionDuration = Date.now() - connectionTime;
        unifiedLogger.info('WebSocket client disconnected', {
          service: 'websocket',
          source: 'disconnect',
          userId, 
          socketId: socket.id,
          reason,
          connectionDurationMs: connectionDuration,
          transport: socket.conn.transport.name
        });
        
        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            this.userSockets.delete(userId);
          }
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        unifiedLogger.error('Socket error', {
          service: 'websocket',
          source: 'socket_error',
          userId,
          socketId: socket.id,
          error: error.message,
          type: error.type,
          stack: error.stack
        });
      });

      // Subscribe to import progress
      socket.on('subscribe:import', (importId) => {
        const startTime = Date.now();
        socket.join(`import:${importId}`);
        unifiedLogger.info('Client subscribed to import', {
          service: 'websocket',
          source: 'subscribe',
          userId, 
          importId,
          socketId: socket.id,
          joinTimeMs: Date.now() - startTime
        });
      });

      // Unsubscribe from import progress
      socket.on('unsubscribe:import', (importId) => {
        socket.leave(`import:${importId}`);
        unifiedLogger.debug('Client unsubscribed from import', {
          service: 'websocket',
          source: 'unsubscribe',
          userId,
          importId,
          socketId: socket.id
        });
      });

      // Subscribe to workflow updates
      socket.on('subscribe:workflow', (workflowId) => {
        const startTime = Date.now();
        socket.join(`workflow:${workflowId}`);
        unifiedLogger.info('Client subscribed to workflow', {
          service: 'websocket',
          source: 'subscribe',
          userId, 
          workflowId,
          socketId: socket.id,
          joinTimeMs: Date.now() - startTime
        });
      });

      // Unsubscribe from workflow updates
      socket.on('unsubscribe:workflow', (workflowId) => {
        socket.leave(`workflow:${workflowId}`);
        unifiedLogger.debug('Client unsubscribed from workflow', {
          service: 'websocket',
          source: 'unsubscribe',
          userId,
          workflowId,
          socketId: socket.id
        });
      });

      // Subscribe to orchestrator health updates
      socket.on('subscribe:orchestrator', () => {
        socket.join('orchestrator:health');
        unifiedLogger.info('Client subscribed to orchestrator health', {
          service: 'websocket',
          source: 'subscribe',
          userId,
          socketId: socket.id
        });
      });
    });
  }

  // Helper method to log emissions
  _logEmission(event, room, data, startTime = Date.now()) {
    const dataSize = data ? JSON.stringify(data).length : 0;
    const emitTime = Date.now() - startTime;
    
    unifiedLogger.debug('WebSocket emission', {
      service: 'websocket',
      source: 'emit',
      event,
      room,
      dataSize,
      emitTimeMs: emitTime,
      hasData: !!data
    });
    
    // Track message stats
    if (!this.messageStats.has(event)) {
      this.messageStats.set(event, { count: 0, totalSize: 0, totalTime: 0 });
    }
    const stats = this.messageStats.get(event);
    stats.count++;
    stats.totalSize += dataSize;
    stats.totalTime += emitTime;
  }

  // Emit to specific user
  emitToUser(userId, event, data) {
    const startTime = Date.now();
    try {
      this.io.to(`user:${userId}`).emit(event, data);
      this._logEmission(event, `user:${userId}`, data, startTime);
    } catch (error) {
      unifiedLogger.error('Failed to emit to user', {
        service: 'websocket',
        source: 'emit_error',
        event,
        userId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Emit import progress
  emitImportProgress(importId, progress) {
    const startTime = Date.now();
    try {
      this.io.to(`import:${importId}`).emit('import:progress', progress);
      this._logEmission('import:progress', `import:${importId}`, progress, startTime);
    } catch (error) {
      unifiedLogger.error('Failed to emit import progress', {
        service: 'websocket',
        source: 'emit_error',
        event: 'import:progress',
        importId,
        error: error.message
      });
    }
  }

  // Emit bookmark validation update
  emitBookmarkValidated(userId, bookmarkId, data) {
    const startTime = Date.now();
    const payload = { bookmarkId, ...data };
    try {
      this.io.to(`user:${userId}`).emit('bookmark:validated', payload);
      this._logEmission('bookmark:validated', `user:${userId}`, payload, startTime);
    } catch (error) {
      unifiedLogger.error('Failed to emit bookmark validation', {
        service: 'websocket',
        source: 'emit_error',
        event: 'bookmark:validated',
        userId,
        bookmarkId,
        error: error.message
      });
    }
  }

  // Emit bookmark enrichment update
  emitBookmarkEnriched(userId, bookmarkId, data) {
    const startTime = Date.now();
    const payload = { bookmarkId, ...data };
    try {
      this.io.to(`user:${userId}`).emit('bookmark:enriched', payload);
      this._logEmission('bookmark:enriched', `user:${userId}`, payload, startTime);
    } catch (error) {
      unifiedLogger.error('Failed to emit bookmark enrichment', {
        service: 'websocket',
        source: 'emit_error',
        event: 'bookmark:enriched',
        userId,
        bookmarkId,
        error: error.message
      });
    }
  }

  // Emit new bookmark added
  emitBookmarkAdded(userId, bookmark) {
    const startTime = Date.now();
    try {
      this.io.to(`user:${userId}`).emit('bookmark:added', bookmark);
      this._logEmission('bookmark:added', `user:${userId}`, bookmark, startTime);
    } catch (error) {
      unifiedLogger.error('Failed to emit bookmark added', {
        service: 'websocket',
        source: 'emit_error',
        event: 'bookmark:added',
        userId,
        bookmarkId: bookmark?.id,
        error: error.message
      });
    }
  }

  // Emit bookmark deleted
  emitBookmarkDeleted(userId, bookmarkId) {
    const startTime = Date.now();
    const payload = { bookmarkId };
    try {
      this.io.to(`user:${userId}`).emit('bookmark:deleted', payload);
      this._logEmission('bookmark:deleted', `user:${userId}`, payload, startTime);
    } catch (error) {
      unifiedLogger.error('Failed to emit bookmark deleted', {
        service: 'websocket',
        source: 'emit_error',
        event: 'bookmark:deleted',
        userId,
        bookmarkId,
        error: error.message
      });
    }
  }

  // Emit import completed
  emitImportCompleted(userId, importId, summary) {
    const startTime = Date.now();
    const payload = { importId, ...summary };
    try {
      this.io.to(`user:${userId}`).emit('import:completed', payload);
      this._logEmission('import:completed', `user:${userId}`, payload, startTime);
      
      // Log performance summary
      unifiedLogger.info('Import completed emission', {
        service: 'websocket',
        source: 'import_complete',
        userId,
        importId,
        totalBookmarks: summary.totalBookmarks || 0,
        successCount: summary.successCount || 0,
        errorCount: summary.errorCount || 0
      });
    } catch (error) {
      unifiedLogger.error('Failed to emit import completed', {
        service: 'websocket',
        source: 'emit_error',
        event: 'import:completed',
        userId,
        importId,
        error: error.message
      });
    }
  }

  // Emit job progress for debugging
  emitJobProgress(userId, jobType, data) {
    const startTime = Date.now();
    const payload = { type: jobType, ...data };
    try {
      this.io.to(`user:${userId}`).emit('job:progress', payload);
      this._logEmission('job:progress', `user:${userId}`, payload, startTime);
    } catch (error) {
      unifiedLogger.error('Failed to emit job progress', {
        service: 'websocket',
        source: 'emit_error',
        event: 'job:progress',
        userId,
        jobType,
        error: error.message
      });
    }
  }

  // Orchestrator-specific events

  /**
   * Emit workflow update
   */
  emitWorkflowUpdate(workflowId, data) {
    const startTime = Date.now();
    try {
      this.io.to(`workflow:${workflowId}`).emit('workflow:update', data);
      this._logEmission('workflow:update', `workflow:${workflowId}`, data, startTime);
      
      unifiedLogger.info('Workflow update emitted', {
        service: 'websocket',
        source: 'workflow_update',
        workflowId,
        stage: data.stage,
        status: data.status
      });
    } catch (error) {
      unifiedLogger.error('Failed to emit workflow update', {
        service: 'websocket',
        source: 'emit_error',
        event: 'workflow:update',
        workflowId,
        error: error.message
      });
    }
  }

  /**
   * Emit workflow progress
   */
  emitWorkflowProgress(workflowId, progress) {
    const startTime = Date.now();
    try {
      this.io.to(`workflow:${workflowId}`).emit('workflow:progress', progress);
      this._logEmission('workflow:progress', `workflow:${workflowId}`, progress, startTime);
      
      if (progress.percentage !== undefined) {
        unifiedLogger.debug('Workflow progress emitted', {
          service: 'websocket',
          source: 'workflow_progress',
          workflowId,
          percentage: progress.percentage,
          stage: progress.stage
        });
      }
    } catch (error) {
      unifiedLogger.error('Failed to emit workflow progress', {
        service: 'websocket',
        source: 'emit_error',
        event: 'workflow:progress',
        workflowId,
        error: error.message
      });
    }
  }

  /**
   * Emit orchestrator health status
   */
  emitOrchestratorHealth(health) {
    const startTime = Date.now();
    
    // Check if WebSocket is initialized
    if (!this.io) {
      unifiedLogger.debug('WebSocket not initialized, skipping health emission', {
        service: 'websocket',
        source: 'emitOrchestratorHealth'
      });
      return;
    }
    
    try {
      // Emit to subscribers
      this.io.to('orchestrator:health').emit('orchestrator:health', health);
      this._logEmission('orchestrator:health', 'orchestrator:health', health, startTime);
      
      // Also emit to all connected clients for dashboard
      this.io.emit('orchestrator:health', health);
      
      unifiedLogger.info('Orchestrator health emitted', {
        service: 'websocket',
        source: 'orchestrator_health',
        status: health.status,
        activeWorkflows: health.activeWorkflows,
        queuedWorkflows: health.queuedWorkflows,
        agents: Object.keys(health.agents || {})
      });
    } catch (error) {
      unifiedLogger.error('Failed to emit orchestrator health', {
        service: 'websocket',
        source: 'emit_error',
        event: 'orchestrator:health',
        error: error.message
      });
    }
  }

  /**
   * Emit agent status update
   */
  emitAgentStatus(agentType, status) {
    const startTime = Date.now();
    const payload = { agentType, status };
    try {
      this.io.emit('agent:status', payload);
      this._logEmission('agent:status', 'global', payload, startTime);
      
      unifiedLogger.info('Agent status emitted', {
        service: 'websocket',
        source: 'agent_status',
        agentType,
        status: status.state,
        activeJobs: status.activeJobs,
        queueSize: status.queueSize
      });
    } catch (error) {
      unifiedLogger.error('Failed to emit agent status', {
        service: 'websocket',
        source: 'emit_error',
        event: 'agent:status',
        agentType,
        error: error.message
      });
    }
  }

  /**
   * Emit workflow started
   */
  emitWorkflowStarted(workflowId, data) {
    const startTime = Date.now();
    try {
      this.io.to(`workflow:${workflowId}`).emit('workflow:started', data);
      this._logEmission('workflow:started', `workflow:${workflowId}`, data, startTime);
      
      unifiedLogger.info('Workflow started emitted', {
        service: 'websocket',
        source: 'workflow_started',
        workflowId,
        type: data.type,
        userId: data.userId
      });
    } catch (error) {
      unifiedLogger.error('Failed to emit workflow started', {
        service: 'websocket',
        source: 'emit_error',
        event: 'workflow:started',
        workflowId,
        error: error.message
      });
    }
  }

  /**
   * Emit workflow completed
   */
  emitWorkflowCompleted(workflowId, data) {
    const startTime = Date.now();
    try {
      this.io.to(`workflow:${workflowId}`).emit('workflow:completed', data);
      this._logEmission('workflow:completed', `workflow:${workflowId}`, data, startTime);
      
      unifiedLogger.info('Workflow completed emitted', {
        service: 'websocket',
        source: 'workflow_completed',
        workflowId,
        duration: data.duration,
        successCount: data.successCount,
        errorCount: data.errorCount
      });
    } catch (error) {
      unifiedLogger.error('Failed to emit workflow completed', {
        service: 'websocket',
        source: 'emit_error',
        event: 'workflow:completed',
        workflowId,
        error: error.message
      });
    }
  }

  /**
   * Emit workflow failed
   */
  emitWorkflowFailed(workflowId, data) {
    const startTime = Date.now();
    try {
      this.io.to(`workflow:${workflowId}`).emit('workflow:failed', data);
      this._logEmission('workflow:failed', `workflow:${workflowId}`, data, startTime);
      
      unifiedLogger.error('Workflow failed emitted', {
        service: 'websocket',
        source: 'workflow_failed',
        workflowId,
        error: data.error,
        stage: data.stage,
        duration: data.duration
      });
    } catch (error) {
      unifiedLogger.error('Failed to emit workflow failed', {
        service: 'websocket',
        source: 'emit_error',
        event: 'workflow:failed',
        workflowId,
        error: error.message
      });
    }
  }

  /**
   * Emit import error
   */
  emitImportError(userId, importId, error) {
    const startTime = Date.now();
    const payload = { importId, error };
    try {
      this.io.to(`user:${userId}`).emit('import:error', payload);
      this._logEmission('import:error', `user:${userId}`, payload, startTime);
      
      unifiedLogger.error('Import error emitted', {
        service: 'websocket',
        source: 'import_error',
        userId,
        importId,
        error: error.message || error
      });
    } catch (emitError) {
      unifiedLogger.error('Failed to emit import error', {
        service: 'websocket',
        source: 'emit_error',
        event: 'import:error',
        userId,
        importId,
        error: emitError.message
      });
    }
  }

  /**
   * Get message statistics
   */
  getMessageStats() {
    const stats = {};
    for (const [event, data] of this.messageStats.entries()) {
      stats[event] = {
        count: data.count,
        totalSize: data.totalSize,
        averageSize: Math.round(data.totalSize / data.count),
        totalTimeMs: data.totalTime,
        averageTimeMs: Math.round(data.totalTime / data.count)
      };
    }
    return stats;
  }

  /**
   * Reset message statistics
   */
  resetMessageStats() {
    this.messageStats.clear();
    unifiedLogger.info('WebSocket message statistics reset', {
      service: 'websocket',
      source: 'stats'
    });
  }
}

export default new WebSocketService();