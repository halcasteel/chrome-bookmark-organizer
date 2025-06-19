# CLAUDE.md - AI Assistant Context for Rust Bookmark Manager

```json
{
  "automation": {
    "triggers": ["#CHK:", "#TODO"],
    "prompts": {
      "checkpoint": "./CHECKPOINT-PROMPT.json",
      "todo": "./TODO.json"
    },
    "environment": "./.env",
    "config": {
      "database": "postgres://admin:admin@localhost:5434/bookmark_manager",
      "test_framework": "/home/halcasteel/BOOKMARKS/bookmark-manager-app/testing-framework/"
    },
    "last_execution": "2025-06-18-0415",
    "status": "active"
  }
}
```

**🤖 Automation Commands:**
- `#CHK:` - Create comprehensive checkpoint (see [CHECKPOINT-PROMPT.json](./CHECKPOINT-PROMPT.json))
- `#TODO` - Execute TODO tasks autonomously (see [TODO.json](./TODO.json))

**📍 Latest Checkpoint**: [2025-06-18-0340-CHECKPOINT.md](./2025-06-18-0340-CHECKPOINT.md)  
**📋 Active TODO**: [2025-06-18-0415-TODO.md](./2025-06-18-0415-TODO.md)  
**Last Updated**: June 18, 2025 - 04:15 AM  
**Project Type**: Rust Microservices Migration  
**Repository**: https://github.com/AZ1-ai/bookmark-manager

## 🎯 Project Overview

This is a Rust-based microservices platform being built to replace the Node.js bookmark manager backend. The project uses Actix Web, SQLx, and follows clean architecture principles with domain-driven design.

## 📍 Current State

### ✅ What's Complete
- **Auth Service** (Port 8001)
  - JWT authentication with refresh tokens
  - User registration/login/logout
  - Argon2 password hashing
  - Email validation (@az1.ai only)
  - Comprehensive unit tests
  - Real database integration

### 🚧 What's In Progress
- Fixing User entity to match existing database schema
- Implementing remaining microservices

### ❌ Known Issues
1. **Database Schema Mismatch**
   - Existing DB uses `role` field in users table
   - Rust code expects `is_active` and `is_admin` booleans
   - **ACTION NEEDED**: Update User struct and queries

## ⚠️ Critical Configuration

**ALWAYS use these database credentials:**
```
Host: localhost
Port: 5434 (NOT 5432!)
Username: admin (NOT postgres!)
Password: admin
Database: bookmark_manager
```

**Environment Variables MUST use `BOOKMARKS_` prefix!**

## 🏗️ Project Structure

```
/home/halcasteel/RUST-ACTIX-MIGRATION/        # This Rust project
├── services/
│   ├── auth/          # ✅ Complete - Authentication service
│   ├── bookmarks/     # 🚧 TODO - CRUD operations
│   ├── gateway/       # 🚧 TODO - API gateway
│   ├── import/        # 🚧 TODO - Import service
│   └── search/        # 🚧 TODO - Search service
├── crates/
│   ├── domain/        # Business entities and logic
│   └── shared/        # Shared utilities, config, middleware
├── scripts/           # Test and deployment scripts
└── target/debug/      # Compiled binaries

/home/halcasteel/BOOKMARKS/bookmark-manager-app/  # Existing Node.js app
├── backend/           # Current running backend
├── frontend/          # React frontend (shared)
└── database/          # Schema exports and documentation
```

## 🔧 Development Workflow

### Starting the Auth Service
```bash
cd ~/RUST-ACTIX-MIGRATION

# Option 1: Using start script (recommended)
./start-auth.sh

# Option 2: Direct cargo run
cargo run --bin auth-service

# Option 3: Run compiled binary
./target/debug/auth-service
```

### Running Tests
```bash
# All tests with proper database setup
./scripts/run-tests.sh

# Just cargo tests
cargo test --all

# Specific service tests
cargo test -p auth-service
```

### Checking Service Health
```bash
curl http://localhost:8001/health
```

## 📝 Code Style Guidelines

1. **No Mocks in Tests** - Always use real services (database, Redis, etc.)
2. **Error Handling** - Use proper Result types and error propagation
3. **Logging** - Use tracing crate for structured logging
4. **Config** - All config via environment with BOOKMARKS_ prefix
5. **Database** - Use SQLx with compile-time query verification

## 🗄️ Database Schema Notes

The existing PostgreSQL database has:
- **users** table with `role` field (not `is_active`/`is_admin`)
- **bookmarks** table with extensive metadata
- **a2a_tasks** for agent architecture
- **bookmark_embeddings** for vector search
- pgvector extension enabled
- UUID primary keys throughout

Schema documentation: `/home/halcasteel/BOOKMARKS/bookmark-manager-app/database/SCHEMA_REFERENCE.md`

## 🎯 Next Priority Tasks

1. **Fix User Entity** ⚡
   ```rust
   // Current (wrong)
   pub struct User {
       pub is_active: bool,
       pub is_admin: bool,
   }
   
   // Should be
   pub struct User {
       pub role: String, // "user" or "admin"
   }
   ```

2. **Implement Bookmarks Service**
   - CRUD operations
   - Status field handling
   - Validation integration

3. **Test with Existing Data**
   - Ensure compatibility with current database
   - No data migration needed (same DB)

## 🔑 Key Commands Reference

```bash
# View logs
tail -f auth.log

# Test login
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@az1.ai","password":"changeme123"}'

# Database connection test
psql -h localhost -p 5434 -U admin -d bookmark_manager

# Check running services
ps aux | grep auth-service
```

## 🐛 Debugging Tips

1. **Database Connection Issues**
   - Check port is 5434, not 5432
   - Verify admin/admin credentials
   - Ensure PostgreSQL container is running

2. **Test Failures**
   - Check TEST_DATABASE_URL in environment
   - Verify test_auth database exists
   - Look for port conflicts

3. **Config Not Loading**
   - All vars must have BOOKMARKS_ prefix
   - Check .env file is in project root
   - Use debug scripts: `./test-config.sh`

## 📊 Testing Philosophy

This project follows **REAL TESTING** principles:
- NO mocks, stubs, or fakes
- Test against real PostgreSQL
- Test with real Redis
- Integration tests over unit tests
- If it can't be tested with real services, it shouldn't be in production

## 🚀 Deployment Notes

- Binary location: `target/debug/auth-service`
- Runs on port 8001 by default
- Expects PostgreSQL on localhost:5434
- Expects Redis on localhost:6382
- All services will be containerized eventually

## 📚 Related Documentation

- Original Node.js app: `/home/halcasteel/BOOKMARKS/bookmark-manager-app/CLAUDE.md`
- Database schema: `/home/halcasteel/BOOKMARKS/bookmark-manager-app/database/SCHEMA_REFERENCE.md`
- Migration strategy: `MIGRATION_STRATEGY.md`
- Test plan: `TEST_AUTOMATION_PLAN.md`

## 🎪 Current Session Context

We just completed:
1. Setting up the Rust project structure
2. Implementing full auth service with tests
3. Discovering correct database credentials (admin/admin)
4. Exporting complete database schema
5. Pushing everything to GitHub

Ready to continue with fixing the User entity schema mismatch tomorrow.