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

## Current State (June 17, 2025 - Updated)

### 🔄 MAJOR ARCHITECTURE MIGRATION IN PROGRESS

**Status**: Migrating to Google A2A (Agent2Agent) standard-compliant architecture
**Timeline**: 8-week systematic refactoring
**Phase**: 2 - Agent Migration (Week 2-3)

#### Migration Goals
- ✅ Industry-standard agent interoperability following Google A2A protocol
- ✅ Task-centric workflow management with immutable artifacts
- ✅ Real-time progress streaming via Server-Sent Events (SSE)
- ✅ Enterprise-grade security and scalability patterns
- ✅ Replace Puppeteer with Playwright across all validation
- ✅ Integrate Claude Code processing (replace OpenAI dependency)

#### Key Documents
- `AGENT_ARCHITECTURE_DESIGN_A2A.md` - Complete A2A design specification
- `MIGRATION_CHECKLIST.md` - 8-week phase-by-phase migration plan

### ✅ Completed
- **Foundation (Phase 1)**:
  - A2A base agent class with full test coverage
  - A2A task manager with integration tests
  - Database schema for tasks/artifacts/messages
  - Agent discovery endpoints
  - REAL TESTING philosophy - NO MOCKS

- **Agents (Phase 2)**:
  - Import Agent - parses HTML bookmarks
  - Validation Agent - validates URLs with Playwright
  - Enrichment Agent - AI categorization and tagging
  - Categorization Agent - smart organization

- **Production Optimizations**:
  - Browser pool management (5x performance)
  - Concurrent processing with rate limiting
  - Database batch operations
  - Multi-layer caching (in-memory + Redis)
  - Resource lifecycle management

- **Infrastructure**:
  - Unified logging system across entire stack
  - Production-ready startup script
  - Environment consolidation
  - Fixed port conflicts (PostgreSQL: 5434, Redis: 6382)
  - Project cleanup - archived 74+ non-essential files

### 🚧 Current Tasks
- [ ] Create Embedding Agent for vector search
- [ ] Register all agents with Task Manager
- [ ] Update API routes to use A2A Task Manager
- [ ] Integrate A2A system with main application
- [ ] Migrate existing data to new system
- [ ] Remove old orchestrator code

### ❌ Known Issues
- **A2A system partially integrated** - Import A2A page exists but needs testing
- **WebSocket verification failing** - but doesn't affect main functionality
- **No bookmarks in database** - expected, need to import some first
- Frontend dependencies resolved (Chakra UI icons fixed)

## Architecture Highlights

### Unified Logging System
- Central logger service: `backend/src/services/unifiedLogger.js`
- Frontend logger: `frontend/src/services/logger.ts`
- Real-time log viewer: `frontend/src/pages/LogViewer.tsx`
- Log files:
  - `logs/error.log` - Error level events with rotation
  - `logs/combined.log` - All events with rotation
  - `logs/http.log` - HTTP request logs
- WebSocket server for live log streaming on port 3003
- Consistent logging format across all services
- Performance timing with `startTimer()` method
- Structured context with service/method tagging

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
- **AI**: Claude Code for classification and embeddings (no API key needed), with OpenAI as fallback
- **Browser Automation**: Playwright for ALL headless browser operations (URL validation, content extraction, screenshots) - NEVER use Puppeteer

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
- 62 source code files (all with unified logging)
- 21 configuration files
- 19 deployment/utility scripts
- 7 documentation files
- 15 other essential files
- All non-essential files archived to `_archive/` directory

## Environment Variables
Key variables in `.env`:
- `DATABASE_URL`: PostgreSQL connection (port 5434)
- `REDIS_URL`: Redis connection (port 6382)
- `JWT_SECRET`: Authentication token secret
- `OPENAI_API_KEY`: For AI features (fallback only - Claude Code handles primary AI tasks)
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
3. Port numbers are non-standard (PostgreSQL: 5434, Redis: 6382)
4. All async operations use Bull queues with Redis
5. Frontend uses strict TypeScript - no `any` types
6. Frontend uses Chakra UI - use Chakra icons, not external icon libraries
7. All database operations should use transactions
8. WebSocket is used for real-time updates (has minor issues)
9. All logging must use unifiedLogger - never use console.log
10. Import paths: services use `./unifiedLogger.js`, others use `../services/unifiedLogger.js`
11. Always include service and method context in log messages
12. The admin user is admin@az1.ai with password "changeme123"
13. **TESTING: NEVER USE MOCKS** - All tests must use real services (real database, real file system, real Redis, etc.). This is the "REAL TESTING" philosophy. No mocks, no fakes, no stubs - only real integration with actual services.
14. Database has comprehensive schema with 24 tables including A2A architecture support
15. Recent migration (005_schema_improvements.sql) added performance indexes and constraints
16. **BROWSER AUTOMATION: ALWAYS USE PLAYWRIGHT** - Never use Puppeteer. All headless browser operations must use Playwright for consistency, better performance, and superior JavaScript handling.
17. **AI PROVIDER: CLAUDE CODE FIRST** - Use Claude Code tasks for embeddings, classification, and enrichment (no API key needed). OpenAI is only a fallback option.

## Next Priority Tasks
1. Test A2A import functionality with real bookmark files
2. Complete A2A agent registration with Task Manager
3. Debug WebSocket frame error (low priority - not affecting functionality)
4. Test bookmark import workflow end-to-end
5. Validate AI enrichment and categorization
6. Performance test with large bookmark files (10k+ bookmarks)
7. Complete migration from old orchestrator to A2A system