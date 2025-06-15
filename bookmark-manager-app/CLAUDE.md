# CLAUDE.md - AI Assistant Context for Bookmark Manager Application

## Project Overview
This is a production-grade bookmark management application with AI-powered features, built with React/TypeScript frontend and Node.js/Express backend. The application is designed for the @az1.ai domain with mandatory 2FA authentication.

## 🚨 CRITICAL: How to Run the Application

**ALWAYS use the unified startup script:**
```bash
node start-services.js
```

This script is the **ONLY** supported way to start the application. It handles:
- Docker container orchestration (PostgreSQL on 5434, Redis on 6382)
- Health checks and dependency management
- Database migrations
- Service startup with proper logging
- Real-time progress monitoring
- Graceful error handling

**Never start services individually** - the startup script ensures proper initialization order and dependency management.

## Current State (June 2025)

### ✅ Completed
- Unified logging system across entire stack
- Production-ready startup script with comprehensive monitoring
- Environment configuration consolidation (single .env file)
- Redis port conflict resolution (now using 6382)
- Project cleanup - archived 74+ non-essential files
- Comprehensive dependency analysis
- WebSocket implementation for real-time updates
- Async import system with progress tracking

### ❌ Known Issues
- **Authentication is broken** - users cannot log in
- 2FA verification may have issues
- Some frontend components may not properly connect to backend

## Architecture Highlights

### Unified Logging System
- Central logger service: `backend/src/services/unifiedLogger.js`
- Frontend logger: `frontend/src/services/logger.ts`
- Real-time log viewer: `frontend/src/pages/LogViewer.tsx`
- All logs stream to `logs/` directory with rotation
- WebSocket server for live log streaming

### Service Ports
- Frontend: 5173
- Backend API: 3001
- PostgreSQL: 5434 (non-standard to avoid conflicts)
- Redis: 6382 (non-standard to avoid conflicts)
- Log WebSocket: 3003

### Key Technologies
- **Frontend**: React 18, TypeScript (strict), Vite, Chakra UI
- **Backend**: Node.js 20+, Express, ES6 modules
- **Database**: PostgreSQL 15 with pgvector extension
- **Cache/Queue**: Redis with Bull for job processing
- **AI**: OpenAI API for classification and embeddings
- **Validation**: Puppeteer for URL checking

## File Structure (Post-Cleanup)
```
bookmark-manager-app/
├── backend/
│   ├── src/
│   │   ├── agents/          # AI processing agents
│   │   ├── config/          # Configuration files
│   │   ├── db/              # Database connection and migrations
│   │   ├── middleware/      # Express middleware
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utility functions
│   │   └── workers/         # Background job processors
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── contexts/        # React contexts
│   │   ├── pages/           # Page components
│   │   ├── services/        # API and logging services
│   │   └── types/           # TypeScript definitions
│   └── Dockerfile
├── database/
│   └── schema.sql           # Database schema
├── scripts/                 # Deployment and setup scripts
├── logs/                    # Application logs (gitignored)
├── _archive/                # Archived non-essential files (gitignored)
├── start-services.js        # 🚨 MAIN STARTUP SCRIPT
├── docker-compose.yml       # Docker configuration
└── .env                     # Environment configuration
```

## Essential Files Count
- **127 essential files** remain after cleanup
- 62 source code files
- 21 configuration files
- 19 deployment/utility scripts
- 7 documentation files
- 15 other essential files

## Environment Variables
Key variables in `.env`:
- `DATABASE_URL`: PostgreSQL connection (port 5434)
- `REDIS_URL`: Redis connection (port 6382)
- `JWT_SECRET`: Authentication token secret
- `OPENAI_API_KEY`: For AI features
- `ENABLE_2FA`: Two-factor authentication (true)
- `LOG_LEVEL`: Logging verbosity (info)

## Development Workflow

1. **Always start with:**
   ```bash
   node start-services.js
   ```

2. **Monitor logs:**
   ```bash
   tail -f logs/unified.log
   ```

3. **Check service health:**
   ```bash
   curl http://localhost:3001/health
   ```

4. **View logs in UI:**
   Navigate to http://localhost:5173/logs (requires admin auth)

## Debugging Tips

- All services log to unified logging system
- Check `logs/errors.log` for error-level events
- Use log viewer UI for real-time monitoring
- Each service has health check endpoints
- WebSocket issues visible in browser console

## AI Context Notes

When working on this codebase:
1. Always use the startup script - never start services manually
2. Check logs first when debugging issues
3. The application currently has authentication problems
4. Port numbers are non-standard (PostgreSQL: 5434, Redis: 6382)
5. All async operations use Bull queues with Redis
6. Frontend uses strict TypeScript - no `any` types
7. All database operations should use transactions
8. WebSocket is used for real-time updates

## Next Priority Tasks
1. Fix authentication/login functionality
2. Verify 2FA implementation
3. Test bookmark import workflow
4. Validate AI classification features
5. Ensure WebSocket connections work properly