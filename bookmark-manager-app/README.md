# Bookmark Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.17.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-blue)](https://www.postgresql.org/)

A cloud-based bookmark management system with AI-powered classification, semantic search, and automatic URL validation. Built for the @az1.ai domain with mandatory 2FA authentication.

## 🚧 Current Status

**🔄 Architecture Migration in Progress**: Transitioning to A2A-compliant agent system
**📋 Migration Timeline**: 8-week systematic refactoring following Google A2A standard
**📖 Documentation**: See `AGENT_ARCHITECTURE_DESIGN_A2A.md` and `MIGRATION_CHECKLIST.md`

### Migration Overview
We are moving from a custom orchestrator system to Google's **A2A (Agent2Agent) standard** to enable:
- ✅ Industry-standard agent interoperability
- ✅ Task-centric workflow management 
- ✅ Immutable artifact tracking
- ✅ Real-time progress streaming via SSE
- ✅ Enterprise-grade security and scalability
- ✅ Future integration with other A2A-compliant systems

**Current Phase**: Phase 2 - Agent Migration (Week 2-3)
**Completed**: 
- ✅ A2A base agent class with full test coverage
- ✅ A2A task manager with integration tests
- ✅ Import agent migrated to A2A pattern
- ✅ Validation agent with Playwright browser pool
- ✅ Enrichment agent with AI integration
- ✅ Categorization agent with smart classification
- ✅ Database schema for A2A (tasks, artifacts, messages)
- ✅ Agent discovery endpoints
- ✅ Comprehensive A2A test suite created
- ✅ REAL TESTING philosophy implemented - NO MOCKS
- ✅ Production optimizations (browser pool, caching, concurrency)
- ✅ All tests use real database, filesystem, and services

**In Progress**:
- 🚧 Create Embedding Agent for vector search
- 🚧 Register agents with Task Manager
- 🚧 Update API routes to use A2A Task Manager
- 🚧 Integrate A2A system with main application

### Recent Updates (June 17, 2025)
- ✅ Implemented unified logging system across entire stack (30+ files)
- ✅ Created robust startup script with health checks and real-time monitoring
- ✅ Consolidated environment configurations (single .env file)
- ✅ Fixed Redis port conflicts (now using 6382)
- ✅ Fixed PostgreSQL port conflicts (now using 5434)
- ✅ Archived 74+ non-essential files for production readiness
- ✅ Comprehensive dependency analysis completed
- ✅ Fixed all import path errors for unified logger
- ✅ Added comprehensive error logging throughout codebase
- ✅ Implemented REAL TESTING philosophy - removed all mocks
- ✅ Created comprehensive A2A test suite with 100% real services
- ✅ Fixed all UUID validation errors in tests
- ✅ Resolved test data conflicts with unique data per test
- ✅ Fixed frontend dependencies (replaced lucide-react with Chakra UI icons)
- ✅ Added A2A Import page to frontend navigation
- ✅ Created comprehensive database schema improvements migration
- ✅ Added 13 new performance indexes and data integrity constraints
- ⚠️ WebSocket verification fails but doesn't affect functionality
- ℹ️ Dashboard shows no bookmarks (expected - none imported yet)

## 🌟 Key Features

- **🔒 Secure Access**: Restricted to @az1.ai email addresses with mandatory 2FA
- **🤖 AI Classification**: Automatic categorization and tagging using OpenAI
- **🔍 Semantic Search**: Vector-based search using pgvector for finding related content
- **✅ URL Validation**: Asynchronous validation with Puppeteer
- **📊 Smart Organization**: Collections, tags, and AI-generated categories
- **☁️ Cloud Native**: Deployed on Google Cloud Run with automatic scaling
- **📱 Responsive Design**: Works seamlessly across all devices
- **🔄 Import System**: Async processing with real-time progress via WebSockets
- **📈 Unified Logging**: Comprehensive logging with real-time monitoring

## 📋 Documentation

- [Software Design Document (SDD)](./SDD.md) - High-level architecture and design
- [Technical Design Document (TDD)](./TDD.md) - Implementation details and code structure
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Step-by-step deployment instructions
- [Logging Standards](./LOGGING_STANDARDS.md) - Comprehensive logging system documentation
- [Checkpoint Status](./CHECKPOINT.md) - Current development status
- [Task Checklist](./TODO-LIST-with-CHECKBOXES.md) - Pending tasks with checkboxes
- [Claude AI Context](./CLAUDE.md) - AI assistant context and instructions

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript (strict mode)
- **Chakra UI** for modern, accessible components
- **Vite** for fast development and building
- **Axios** for API communication
- **React Router** for navigation

### Backend
- **Node.js 20+** with ES6 modules
- **Express 4** web framework
- **PostgreSQL 15** with **pgvector** extension
- **Puppeteer** for URL validation
- **OpenAI API** for embeddings and classification
- **Winston** for structured logging
- **JWT** + **Speakeasy** for auth & 2FA

### Infrastructure
- **Google Cloud Run** for serverless deployment
- **Cloud SQL** for managed PostgreSQL
- **Cloud Storage** for file uploads
- **Docker** for containerization
- **Redis** for job queues and caching
- **Bull** for async job processing

## 🚀 Quick Start

### Prerequisites

- Node.js 20.17.0 or higher
- Docker and Docker Compose (for PostgreSQL & Redis)
- Google Cloud SDK (for deployment only)
- OpenAI API key (optional - falls back to Claude Code)

### Important Notes
- **Database is currently empty** - import bookmarks after setup
- **Use the unified startup script** - never start services individually
- **Non-standard ports**: PostgreSQL (5434), Redis (6382)
- **Admin credentials**: admin@az1.ai / changeme123
- **Frontend uses Chakra UI** - all icons from @chakra-ui/icons

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/halcasteel/chrome-bookmark-organizer.git
   cd bookmark-manager-app
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **🚨 IMPORTANT: Start the application using the unified startup script**
   ```bash
   node start-services.js
   ```
   
   **This is the ONLY recommended way to start the application.** The script provides:
   - ✅ Automatic Docker container management (PostgreSQL & Redis)
   - ✅ Health checks for all services
   - ✅ Database migration execution
   - ✅ Real-time progress with colored output
   - ✅ Unified logging to `logs/` directory
   - ✅ Graceful error handling and recovery
   - ✅ Service dependency management
   
   The script will:
   - Start PostgreSQL on port 5434 with pgvector
   - Start Redis on port 6382
   - Run all database migrations
   - Start backend API on port 3001
   - Start frontend dev server on port 5173
   - Stream logs to both console and log files

4. **Monitor the application**
   - Check combined logs: `tail -f logs/combined.log`
   - View errors only: `tail -f logs/error.log`
   - Check HTTP requests: `tail -f logs/http.log`
   - Access log viewer UI: http://localhost:5173/logs (admin only)

5. **Create admin user**
   ```bash
   node scripts/create-admin-user.js
   ```

6. **Start development server**
   ```bash
   ./scripts/start-local.sh
   ```

   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

### Running Tests

```bash
# Run all tests
npm test

# Run A2A tests specifically
npm run test:a2a

# Run linting
./scripts/lint-all.sh

# Test bookmark validation
npm run validate-bookmarks:test
```

**Note**: All tests follow the REAL TESTING philosophy - no mocks, no stubs, only real services. Tests use actual database connections, real file I/O, and live Redis instances.

## 📁 Project Structure

```
bookmark-manager-app/
├── backend/              # Express API server
│   ├── src/
│   │   ├── agents/      # AI processing agents
│   │   ├── config/      # Configuration files
│   │   ├── db/          # Database connection and migrations
│   │   ├── middleware/  # Auth, validation, error handling
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic & unified logger
│   │   ├── utils/       # Helper utilities
│   │   └── workers/     # Background job processors
│   └── scripts/         # Utility scripts
├── frontend/            # React application
│   ├── src/
│   │   ├── pages/      # Route components
│   │   ├── components/ # Reusable UI components
│   │   ├── contexts/   # React contexts (Auth, Socket)
│   │   ├── services/   # API client & logger
│   │   └── types/      # TypeScript definitions
│   └── public/         # Static assets
├── database/           # SQL schemas and migrations
├── scripts/            # Deployment and setup scripts
├── logs/               # Application logs (gitignored)
├── _archive/           # Archived files (gitignored)
├── start-services.js   # Main startup script
└── imports/            # Bookmark import directory
```

## 🔧 Configuration

### Environment Variables

```bash
# Backend
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://admin:admin@localhost:5434/bookmark_manager
POSTGRES_PORT=5434
REDIS_URL=redis://localhost:6382
REDIS_PORT=6382
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-key
ENABLE_2FA=true
LOG_LEVEL=info

# Frontend
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME=Bookmark Manager
VITE_WS_URL=ws://localhost:3001
```

## 🚢 Deployment

### Local Development
```bash
./scripts/start-local.sh
```

### Production Deployment
```bash
# Enable GCP APIs
./scripts/enable-apis.sh

# Deploy to Cloud Run
gcloud builds submit --config cloudbuild.yaml

# Set up custom domain
./scripts/setup-custom-domain.sh
```

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

## 📝 API Documentation

### Authentication
- `POST /api/auth/register` - Register new user (@az1.ai only)
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/2fa/setup` - Setup 2FA
- `POST /api/auth/2fa/verify` - Verify 2FA code

### Bookmarks
- `GET /api/bookmarks` - List bookmarks (paginated)
- `POST /api/bookmarks` - Create new bookmark
- `PUT /api/bookmarks/:id` - Update bookmark
- `DELETE /api/bookmarks/:id` - Delete bookmark

### Search
- `POST /api/search` - Semantic search with filters
- `GET /api/search/suggest` - Search suggestions

### Import/Export
- `POST /api/import/upload` - Upload bookmarks HTML
- `GET /api/export` - Export bookmarks

## 🧪 Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# E2E tests
npm run test:e2e

# Validate bookmarks
npm run validate-bookmarks sample-bookmarks.html <user-id>
```

## 📊 Monitoring

### Unified Logging System
- **Winston Logger**: Centralized logging with structured output
- **Log Levels**: error, warn, info, http, debug
- **Log Files**:
  - `logs/error.log` - Error level events only
  - `logs/combined.log` - All log events
  - `logs/http.log` - HTTP request logs
- **Real-time Monitoring**: WebSocket-based log streaming
- **Log Viewer UI**: Built-in web interface at `/logs`

### Metrics
- Request latency tracking
- Database query performance
- Import job progress
- Validation success rates
- Authentication attempts

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests and linting (`./scripts/lint-all.sh`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details

## 🙏 Acknowledgments

- OpenAI for GPT API
- Google Cloud Platform
- Puppeteer team
- pgvector contributors