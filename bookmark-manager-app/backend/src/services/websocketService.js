import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logInfo, logError } from '../utils/logger.js';

class WebSocketService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> Set of socket IDs
  }

  initialize(server) {
    const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:5173'];
    
    logInfo('Initializing WebSocket server', { corsOrigins });
    
    this.io = new Server(server, {
      cors: {
        origin: corsOrigins,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        logInfo('WebSocket auth attempt', { 
          hasToken: !!token,
          tokenPrefix: token?.substring(0, 20)
        });
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id || decoded.userId;
        logInfo('WebSocket auth success', { userId: socket.userId });
        next();
      } catch (err) {
        next(new Error('Invalid token'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      const userId = socket.userId;
      logInfo('WebSocket client connected', { userId, socketId: socket.id });
      
      // Send immediate confirmation to client
      socket.emit('connection_confirmed', { 
        socketId: socket.id, 
        userId,
        timestamp: new Date() 
      });

      // Track user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);

      // Join user-specific room
      socket.join(`user:${userId}`);

      // Handle disconnection
      socket.on('disconnect', () => {
        logInfo('WebSocket client disconnected', { userId, socketId: socket.id });
        
        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            this.userSockets.delete(userId);
          }
        }
      });

      // Subscribe to import progress
      socket.on('subscribe:import', (importId) => {
        socket.join(`import:${importId}`);
        logInfo('Client subscribed to import', { userId, importId });
      });

      // Unsubscribe from import progress
      socket.on('unsubscribe:import', (importId) => {
        socket.leave(`import:${importId}`);
      });

      // Subscribe to workflow updates
      socket.on('subscribe:workflow', (workflowId) => {
        socket.join(`workflow:${workflowId}`);
        logInfo('Client subscribed to workflow', { userId, workflowId });
      });

      // Unsubscribe from workflow updates
      socket.on('unsubscribe:workflow', (workflowId) => {
        socket.leave(`workflow:${workflowId}`);
      });

      // Subscribe to orchestrator health updates
      socket.on('subscribe:orchestrator', () => {
        socket.join('orchestrator:health');
        logInfo('Client subscribed to orchestrator health', { userId });
      });
    });
  }

  // Emit to specific user
  emitToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Emit import progress
  emitImportProgress(importId, progress) {
    this.io.to(`import:${importId}`).emit('import:progress', progress);
  }

  // Emit bookmark validation update
  emitBookmarkValidated(userId, bookmarkId, data) {
    this.io.to(`user:${userId}`).emit('bookmark:validated', {
      bookmarkId,
      ...data,
    });
  }

  // Emit bookmark enrichment update
  emitBookmarkEnriched(userId, bookmarkId, data) {
    this.io.to(`user:${userId}`).emit('bookmark:enriched', {
      bookmarkId,
      ...data,
    });
  }

  // Emit new bookmark added
  emitBookmarkAdded(userId, bookmark) {
    this.io.to(`user:${userId}`).emit('bookmark:added', bookmark);
  }

  // Emit bookmark deleted
  emitBookmarkDeleted(userId, bookmarkId) {
    this.io.to(`user:${userId}`).emit('bookmark:deleted', { bookmarkId });
  }

  // Emit import completed
  emitImportCompleted(userId, importId, summary) {
    this.io.to(`user:${userId}`).emit('import:completed', {
      importId,
      ...summary,
    });
  }

  // Emit job progress for debugging
  emitJobProgress(userId, jobType, data) {
    this.io.to(`user:${userId}`).emit('job:progress', {
      type: jobType,
      ...data,
    });
  }

  // Orchestrator-specific events

  /**
   * Emit workflow update
   */
  emitWorkflowUpdate(workflowId, data) {
    this.io.to(`workflow:${workflowId}`).emit('workflow:update', data);
  }

  /**
   * Emit workflow progress
   */
  emitWorkflowProgress(workflowId, progress) {
    this.io.to(`workflow:${workflowId}`).emit('workflow:progress', progress);
  }

  /**
   * Emit orchestrator health status
   */
  emitOrchestratorHealth(health) {
    this.io.to('orchestrator:health').emit('orchestrator:health', health);
    
    // Also emit to all connected clients for dashboard
    this.io.emit('orchestrator:health', health);
  }

  /**
   * Emit agent status update
   */
  emitAgentStatus(agentType, status) {
    this.io.emit('agent:status', { agentType, status });
  }

  /**
   * Emit workflow started
   */
  emitWorkflowStarted(workflowId, data) {
    this.io.to(`workflow:${workflowId}`).emit('workflow:started', data);
  }

  /**
   * Emit workflow completed
   */
  emitWorkflowCompleted(workflowId, data) {
    this.io.to(`workflow:${workflowId}`).emit('workflow:completed', data);
  }

  /**
   * Emit workflow failed
   */
  emitWorkflowFailed(workflowId, data) {
    this.io.to(`workflow:${workflowId}`).emit('workflow:failed', data);
  }

  /**
   * Emit import progress
   */
  emitImportProgress(userId, importId, data) {
    this.io.to(`user:${userId}`).emit('import:progress', { importId, ...data });
  }

  /**
   * Emit import completed
   */
  emitImportCompleted(userId, importId, data) {
    this.io.to(`user:${userId}`).emit('import:completed', { importId, ...data });
  }

  /**
   * Emit import error
   */
  emitImportError(userId, importId, error) {
    this.io.to(`user:${userId}`).emit('import:error', { importId, error });
  }
}

export default new WebSocketService();