# Quick Reference Guide

**Last Updated**: 2025-06-19T02:53:00-04:00

## 🚀 Quick Start

### Start Everything (Rust Backend)
```bash
# Terminal 1: Infrastructure
cd bookmark-manager-app
node start-services.js  # PostgreSQL + Redis only

# Terminal 2: Rust services
cd rust-migration
cargo build --release
./target/release/auth-service &
./target/release/bookmarks-service &
./target/release/import-service &
./target/release/search-service &
GATEWAY_PORT=8000 ./target/release/gateway

# Terminal 3: Frontend
cd frontend
echo "VITE_API_URL=http://localhost:8000/api" > .env
npm run dev
```

## 🔑 Essential Information

### Credentials
- **Admin**: admin@az1.ai / changeme123
- **Test User**: Create via registration

### Service URLs
- **Frontend**: http://localhost:5173
- **API Gateway**: http://localhost:8000
- **Health Check**: http://localhost:8000/health

### Ports
- **PostgreSQL**: 5434 (non-standard!)
- **Redis**: 6382 (non-standard!)
- **Rust Gateway**: 8000
- **Rust Services**: 8001-8004 (internal)

## 📡 API Endpoints

### Authentication
```bash
# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@az1.ai","password":"changeme123"}'

# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@az1.ai","password":"password123","name":"Test User"}'

# Get current user
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Bookmarks
```bash
# List bookmarks
curl http://localhost:8000/api/bookmarks \
  -H "Authorization: Bearer <token>"

# Create bookmark
curl -X POST http://localhost:8000/api/bookmarks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","title":"Example"}'

# Update bookmark
curl -X PUT http://localhost:8000/api/bookmarks/<id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title"}'
```

### Search
```bash
# Search bookmarks
curl "http://localhost:8000/api/search?q=rust" \
  -H "Authorization: Bearer <token>"
```

## 🛠️ Common Tasks

### Check Service Health
```bash
curl http://localhost:8000/health
```

### View Logs
```bash
# Rust services (set RUST_LOG=debug for verbose)
RUST_LOG=debug ./target/release/gateway

# PostgreSQL logs
docker logs bookmark-postgres

# Redis logs
docker logs bookmark-redis
```

### Database Access
```bash
# Connect to PostgreSQL
psql -h localhost -p 5434 -U bookmarkuser -d bookmark_manager

# Common queries
SELECT COUNT(*) FROM users;
SELECT * FROM bookmarks ORDER BY created_at DESC LIMIT 10;
```

### Reset Everything
```bash
# Stop all services
pkill -f "auth-service|bookmarks-service|import-service|search-service|gateway"

# Stop and remove Docker containers
docker-compose down -v

# Clean build artifacts
cd rust-migration && cargo clean
```

## 🔧 Troubleshooting

### CORS Errors
- Check gateway CORS configuration
- Ensure frontend uses correct API URL

### 401 Unauthorized
- Token might be expired
- Check JWT_SECRET matches between services
- Verify token format in Authorization header

### Connection Refused
- Ensure all Rust services are running
- Check service ports are not in use
- Verify PostgreSQL/Redis are running

### Database Connection Failed
- Check DATABASE_URL in environment
- Ensure PostgreSQL is on port 5434
- Verify credentials are correct

## 🌐 Environment Variables

### Required
```bash
DATABASE_URL=postgresql://bookmarkuser:bookmarkpass@localhost:5434/bookmark_manager
REDIS_URL=redis://localhost:6382
JWT_SECRET=local-dev-jwt-secret-change-in-production
```

### Optional
```bash
RUST_LOG=info  # or debug for verbose logging
OPENAI_API_KEY=sk-...  # For embeddings in search
```

## 📚 Documentation

- **Architecture**: See [2025-06-19-0253-CHECKPOINT.md](./2025-06-19-0253-CHECKPOINT.md)
- **Tasks**: See [2025-06-19-0253-TODO.md](./2025-06-19-0253-TODO.md)
- **Rust Details**: See [RUST_MIGRATION_COMPLETE.md](./RUST_MIGRATION_COMPLETE.md)
- **Commands**: Use `#HELP` for CLAUDE command palette

## 🚨 Important Notes

1. **Node.js is deprecated** - Use Rust backend only
2. **Non-standard ports** - PostgreSQL (5434), Redis (6382)
3. **Frontend config** - Must set VITE_API_URL to Rust gateway
4. **No WebSockets** - Use polling or implement SSE
5. **2FA optional** - Not required for login currently

---

For detailed information, see the latest checkpoint document.