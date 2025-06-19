# Running the Rust Services

## Quick Start

### 1. Start PostgreSQL and Redis (from bookmark-manager-app)
```bash
cd ~/BOOKMARKS/bookmark-manager-app
docker-compose up -d postgres redis
```

### 2. Run Auth Service
```bash
cd ~/RUST-ACTIX-MIGRATION/services/auth

# Create .env file
cat > .env << EOF
BOOKMARKS_DATABASE_URL=postgres://postgres:postgres@localhost:5434/bookmarks
BOOKMARKS_REDIS_URL=redis://localhost:6382
BOOKMARKS_JWT_SECRET=your-super-secret-jwt-key-change-this
BOOKMARKS_SERVER_PORT=8001
BOOKMARKS_LOG_LEVEL=info
EOF

# Run migrations
sqlx migrate run

# Start the service
cargo run
```

### 3. Run Gateway
```bash
# In a new terminal
cd ~/RUST-ACTIX-MIGRATION/services/gateway

# Create .env file
cat > .env << EOF
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=8080
AUTH_SERVICE_URL=http://localhost:8001
BOOKMARKS_SERVICE_URL=http://localhost:8002
EOF

# Start the gateway
cargo run
```

## Testing the Services

### Health Check
```bash
# Auth service health
curl http://localhost:8001/health

# Gateway health (checks all services)
curl http://localhost:8080/health
```

### Register a User
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@az1.ai",
    "password": "password123"
  }'
```

### Login
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@az1.ai",
    "password": "password123"
  }'
```

Save the token from the response for authenticated requests.

### Get Current User
```bash
TOKEN="your-jwt-token-here"

curl http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## Next Steps

1. **Connect Frontend**:
   ```bash
   cd ~/BOOKMARKS/bookmark-manager-app/frontend
   VITE_API_URL=http://localhost:8080/api npm run dev
   ```

2. **Implement Bookmarks Service**:
   - CRUD operations
   - Tag management
   - Search functionality

3. **Add Authentication Middleware**:
   - Protect routes that require auth
   - Add role-based access control

4. **Performance Testing**:
   - Load test with `wrk` or `ab`
   - Compare with Node.js backend