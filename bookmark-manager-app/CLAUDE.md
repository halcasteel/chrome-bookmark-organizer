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
- **Rust Project Location**: `./rust-migration/`
- **Status**: All 4 microservices complete and operational
- **GitHub**: https://github.com/AZ1-ai/bookmark-manager

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
cd rust-migration
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
├── rust-migration/        # Production Rust backend
├── frontend/             # React frontend (needs API updates)
├── backend/              # DEPRECATED - to be removed
├── database/             # Shared schemas
├── archive/              # Checkpoint archives
└── 2025-06-19-0253-CHECKPOINT.md  # Latest checkpoint
```

### Checkpoint Command Notes
- `#CHK:` used to create comprehensive system checkpoints
- Always includes system state, configuration, and current progress
- Automatically generates markdown documentation
- Stores checkpoint in `/archive/` with timestamp
- Helps track project evolution and maintain detailed historical records