# Quick Reference Card - Rust Bookmark Manager

## 🚀 Start Development
```bash
cd ~/RUST-ACTIX-MIGRATION
./start-auth.sh
```

## 🔑 Database Credentials
```
Host: localhost
Port: 5434 (NOT 5432!)
User: admin (NOT postgres!)
Pass: admin
DB: bookmark_manager
```

## 🧪 Run Tests
```bash
./scripts/run-tests.sh
```

## 🔍 Check Service
```bash
# Health check
curl http://localhost:8001/health

# Test login
curl -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@az1.ai","password":"changeme123"}'
```

## 📁 Key Paths
- **Rust Project**: `~/RUST-ACTIX-MIGRATION/`
- **Node.js App**: `~/BOOKMARKS/bookmark-manager-app/`
- **DB Schema**: `~/BOOKMARKS/bookmark-manager-app/database/SCHEMA_REFERENCE.md`

## ⚡ Common Commands
```bash
# Compile only
cargo build --bin auth-service

# Run with logging
RUST_LOG=debug cargo run --bin auth-service

# Watch logs
tail -f auth.log

# Connect to DB
psql -h localhost -p 5434 -U admin -d bookmark_manager

# Format code
cargo fmt --all

# Lint code
cargo clippy --all
```

## 🐛 Troubleshooting
- **Port 5432 error** → Use port 5434
- **postgres user error** → Use admin/admin
- **Config not loading** → Check BOOKMARKS_ prefix
- **Test DB error** → Create test_auth database

## 📝 Remember
- All env vars need `BOOKMARKS_` prefix
- NO MOCKS in tests - use real services
- Auth service is DONE and WORKING
- User entity needs `role` field fix