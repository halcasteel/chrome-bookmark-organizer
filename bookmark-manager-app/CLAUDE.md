# CLAUDE.md - AI Assistant Context for Bookmark Manager Application

**Last Updated**: 2025-06-19T02:53:00-04:00

## Project Overview
This is a production-grade bookmark management application with AI-powered features, built with React/TypeScript frontend and Node.js/Express backend. The application is designed for the @az1.ai domain with mandatory 2FA authentication.

## 🚨 CRITICAL: Environment Setup
```bash
# Add Rust to PATH - REQUIRED for all Rust commands
export PATH="$HOME/.cargo/bin:$PATH"
```

## 🚨 CRITICAL UPDATE: Rust Backend is Production - Node.js Deprecated
**Decision Date**: 2025-06-19T02:46:00-04:00

### Production Architecture
- **Rust Backend ONLY** - Node.js backend is being completely removed
- **Rust Project Location**: `./rust-backend/` (consolidated from separate repo)
- **Status**: All 4 microservices complete and operational
- **Previous GitHub**: https://github.com/AZ1-ai/bookmark-manager (now consolidated here)

### Latest Checkpoint
- **File**: `2025-06-19-0253-CHECKPOINT.md`
- **Status**: Rust migration complete, frontend integration needed
- **Active TODO**: `2025-06-19-0253-TODO.md`

## 🚨 CRITICAL: How to Run the Application

### Step 1: Start Infrastructure (PostgreSQL & Redis)
```bash
node start-services.js  # This now ONLY starts Docker containers
```

### Step 2: Start Rust Backend Services
```bash
cd rust-backend
cargo build --release

# Start all services (or use upcoming start script)
./target/release/auth-service &
./target/release/bookmarks-service &
./target/release/import-service &
./target/release/search-service &
GATEWAY_PORT=8000 ./target/release/gateway
```

### Step 3: Configure Frontend
```bash
# Update frontend/.env
VITE_API_URL=http://localhost:8000/api

# Start frontend
cd frontend && npm run dev
```

## Help Commands
- The project includes a comprehensive CLAUDE command palette with powerful automation commands
- Use `#HELP` to display all available commands
- Key commands:
  - `#CHK:` - Create comprehensive checkpoint with all documentation
  - `#FIX:` - Diagnose and fix issues automatically
  - `#TODO` - Manage task lists and priorities
  - `#REVIEW` - Comprehensive code review with AI
  - `#DEBUG` - Interactive debugging assistant
  - `#SHIP` - Complete deployment pipeline
  - `#MONITOR` - Real-time system monitoring
  - `#PERF` - Performance analysis and optimization
  - And many more detailed in `CLAUDE-CODE-CORE-MASTER-PROMPTS/`

## ⚠️ IMPORTANT: CLAUDE-CODE-CORE-MASTER-PROMPTS Directory
**DO NOT MODIFY** the `CLAUDE-CODE-CORE-MASTER-PROMPTS/` directory unless specifically instructed by the user. This directory contains template files that should remain unchanged. If you need to create project-specific versions of these files, copy them to the project root directory first. Always ask for user confirmation before making any changes to this directory.

## Current Focus: Frontend Integration with Rust

### Immediate Tasks
1. Update all frontend API endpoints to use Rust backend (port 8000)
2. Modify authentication flow for Rust JWT format
3. Handle Rust API response format differences
4. Remove all Node.js backend references
5. Test core functionality with Rust backend

### Known Issues
- WebSocket support not implemented in Rust yet
- 2FA flow incomplete
- A2A agents not integrated with Rust import service

## Key Information

### Credentials
- **Admin**: admin@az1.ai / changeme123
- **Database**: bookmark_manager on port 5434
- **Redis**: Port 6382

### Service Ports
- **Frontend**: 5173
- **Rust Gateway**: 8000
- **Auth Service**: 8001 (internal)
- **Bookmarks Service**: 8002 (internal)
- **Import Service**: 8003 (internal)
- **Search Service**: 8004 (internal)

### Project Structure
```
bookmark-manager-app/
├── rust-backend/         # Production Rust backend (consolidated)
├── frontend/             # React frontend (needs API updates)
├── backend/              # DEPRECATED - to be removed
├── database/             # Shared schemas
├── ai-ops-core/          # AI-Ops documentation
├── docs/                 # Project documentation
└── archive/              # Historical checkpoints
```

### Checkpoint Command Notes
- `#CHK:` used to create comprehensive system checkpoints
- Always includes system state, configuration, and current progress
- Automatically generates markdown documentation
- Stores checkpoint in `/archive/` with timestamp
- Helps track project evolution and maintain detailed historical records

## 🧪 TDD Integration Approach
**IMPORTANT**: We follow Test-Driven Development (TDD) for all integration work.

### Current Integration Status (2025-06-19)
- **Total Tasks**: 83 (13 completed, 70 pending)
- **Approach**: Write failing tests first, then implement solutions
- **Critical Path**: Fix configuration inconsistencies blocking all progress

### Test-First Workflow
1. **Set up test infrastructure** before making any changes
2. **Write failing tests** for each configuration/feature
3. **Implement minimal code** to make tests pass
4. **Refactor** for quality and performance
5. **Run continuous tests** during development

### Key Test Commands
```bash
# Run all tests
npm test

# Run Rust tests
cd rust-backend && cargo test

# Run integration tests
npm run test:integration

# Watch mode for continuous testing
npm test -- --watch
```

### Critical Configuration Issues to Fix
1. **Database credentials mismatch**: Some use `bookmarkuser:bookmarkpass`, others use `admin:admin`
2. **Frontend pointing to wrong backend**: Currently points to port 3001 (Node.js) instead of 8000 (Rust)
3. **Docker ports mismatch**: PostgreSQL on 5432 vs 5434, Redis on 6379 vs 6382
4. **Database name inconsistency**: Some use `bookmarks`, should be `bookmark_manager`

**Remember**: No manual testing! All verification should be through automated tests.
```