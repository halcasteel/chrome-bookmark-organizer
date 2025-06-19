# Compiling and Running the Rust Services

## Quick Compile Check

```bash
cd ~/RUST-ACTIX-MIGRATION

# Check if everything compiles (fast check, no optimization)
cargo check

# Build all services
cargo build

# Build with optimizations (for production)
cargo build --release
```

## Running Services Individually

### 1. Auth Service
```bash
# Terminal 1 - Auth Service
cd ~/RUST-ACTIX-MIGRATION/services/auth

# Create .env file
cat > .env << EOF
BOOKMARKS_DATABASE_URL=postgres://postgres:postgres@localhost:5434/bookmarks
BOOKMARKS_REDIS_URL=redis://localhost:6382
BOOKMARKS_JWT_SECRET=your-super-secret-jwt-key-change-this
BOOKMARKS_SERVER_PORT=8001
BOOKMARKS_LOG_LEVEL=info
EOF

# Run database migrations (first time only)
sqlx migrate run

# Run the service
cargo run

# Or with auto-reload during development
cargo watch -x run
```

### 2. Gateway Service
```bash
# Terminal 2 - Gateway
cd ~/RUST-ACTIX-MIGRATION/services/gateway

# Create .env file
cat > .env << EOF
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=8080
AUTH_SERVICE_URL=http://localhost:8001
BOOKMARKS_SERVICE_URL=http://localhost:8002
EOF

# Run the gateway
cargo run

# Or with auto-reload
cargo watch -x run
```

## Testing the Services

### Test Health Endpoints
```bash
# Test auth service directly
curl http://localhost:8001/health

# Test gateway health (checks all services)
curl http://localhost:8080/health
```

### Test Registration
```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@az1.ai",
    "password": "password123"
  }'
```

### Test Login
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@az1.ai",
    "password": "password123"
  }'
```

## Common Compilation Issues

### 1. Missing Dependencies
```bash
# If you get linking errors
sudo apt-get install pkg-config libssl-dev

# On macOS
brew install openssl
```

### 2. Database Connection Issues
```bash
# Make sure PostgreSQL is running on port 5434
docker ps | grep postgres

# If not, start it from bookmark-manager-app
cd ~/BOOKMARKS/bookmark-manager-app
docker-compose up -d postgres
```

### 3. Type Errors
The Rust compiler will catch all type errors at compile time. Read the error messages carefully - they're very helpful!

## Development Workflow

1. **Make changes to code**
2. **Run `cargo check`** - Fast syntax/type checking
3. **Run `cargo test`** - Run unit tests
4. **Run `cargo run`** - Actually run the service
5. **Test with curl or frontend**

## Watching for Changes

Install cargo-watch for automatic recompilation:
```bash
cargo install cargo-watch

# Then in each service directory:
cargo watch -x check -x test -x run
```

## Building for Production

```bash
# Build all services with optimizations
cargo build --release

# Binaries will be in:
# target/release/auth-service
# target/release/gateway
# etc.
```

## Next Steps

1. **Get auth service compiling and running**
2. **Test registration/login endpoints**
3. **Add bookmarks service**
4. **Connect frontend to new gateway**