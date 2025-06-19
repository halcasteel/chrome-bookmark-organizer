# Rust + Actix Migration Strategy - Direct Replacement

## Overview
Direct replacement of Node.js backend with Rust + Actix, no parallel operation.

## Phase 1: Core MVP (Week 1-2)
Build the absolute minimum to get the frontend working:

### 1.1 Authentication Service (3 days)
```rust
// Start here - without auth, nothing works
- POST /api/auth/login
- POST /api/auth/register  
- GET /api/auth/me
- JWT validation middleware
- 2FA can wait for Phase 2
```

### 1.2 Bookmarks Service (3 days)
```rust
// Core CRUD - the heart of your app
- GET /api/bookmarks (with pagination)
- POST /api/bookmarks
- GET /api/bookmarks/:id
- PUT /api/bookmarks/:id
- DELETE /api/bookmarks/:id
```

### 1.3 API Gateway (2 days)
```rust
// Simple routing, no fancy features yet
- Route requests to services
- Basic health checks
- CORS handling
- Static file serving for frontend
```

### 1.4 Database Migration (2 days)
```sql
-- Use existing PostgreSQL database
-- No schema changes initially
-- Just connect and query
```

## Phase 2: Import & Validation (Week 3)
Add the features users need most:

### 2.1 Import Service
```rust
- POST /api/import/upload
- GET /api/import/history
- Background processing with Tokio
```

### 2.2 Validation Service
```rust
- URL validation with reqwest
- Async batch processing
- Update bookmark status
```

## Phase 3: Advanced Features (Week 4-5)
Add the nice-to-haves:

### 3.1 Search Service
```rust
- Full-text search (existing DB)
- Tag filtering
- Skip semantic search initially
```

### 3.2 Real-time Updates
```rust
- WebSocket for live updates
- Server-Sent Events for progress
```

## Phase 4: Production Ready (Week 6)
Polish and deploy:

### 4.1 Performance
- Connection pooling
- Response caching
- Rate limiting

### 4.2 Monitoring
- Prometheus metrics
- Health endpoints
- Error tracking

## Quick Start Commands

### 1. Create Workspace
```bash
cd ~/RUST-ACTIX-MIGRATION
cargo new --name bookmarks-backend .
```

### 2. Add Dependencies
```toml
[workspace]
members = [
    "gateway",
    "auth-service",
    "bookmarks-service",
    "shared"
]

[workspace.dependencies]
actix-web = "4.5"
tokio = { version = "1.36", features = ["full"] }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-native-tls"] }
serde = { version = "1.0", features = ["derive"] }
```

### 3. Start with Auth Service
```bash
cd services
cargo new auth-service
cd auth-service
```

### 4. Minimal Auth Implementation
```rust
// services/auth-service/src/main.rs
use actix_web::{web, App, HttpServer, Result};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResponse {
    token: String,
    user: User,
}

#[derive(Serialize)]
struct User {
    id: String,
    email: String,
}

async fn login(req: web::Json<LoginRequest>) -> Result<web::Json<LoginResponse>> {
    // TODO: Validate credentials against DB
    // TODO: Generate JWT token
    
    Ok(web::Json(LoginResponse {
        token: "temporary-token".to_string(),
        user: User {
            id: "1".to_string(),
            email: req.email.clone(),
        },
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Auth service starting on :8001");
    
    HttpServer::new(|| {
        App::new()
            .route("/auth/login", web::post().to(login))
    })
    .bind("0.0.0.0:8001")?
    .run()
    .await
}
```

## Decision: Where to Start

### Option A: Start Fresh in RUST-ACTIX-MIGRATION ✅
**Pros:**
- Clean workspace
- No confusion with old code
- Proper Rust project structure
- Can test independently

**Cons:**
- Need to update frontend API URLs
- Manual testing initially

### Option B: Replace in Place ❌
**Pros:**
- Frontend keeps working
- Gradual replacement

**Cons:**
- Messy directory structure
- Port conflicts
- Confusion between old/new

## Recommended Next Steps

1. **Set up Rust development environment**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   cargo --version
   ```

2. **Create the workspace structure**
   ```bash
   cd ~/RUST-ACTIX-MIGRATION
   cargo init --name bookmarks-workspace
   ```

3. **Start with Auth Service**
   - Get login working
   - Test with frontend
   - Add JWT generation

4. **Add Bookmarks Service**
   - Connect to existing DB
   - Implement CRUD
   - Test with frontend

5. **Simple Gateway**
   - Route /api/auth/* → auth-service
   - Route /api/bookmarks/* → bookmarks-service
   - Serve frontend files

## Testing Strategy

### Local Development
```bash
# Terminal 1: Auth Service
cd services/auth-service && cargo run

# Terminal 2: Bookmarks Service  
cd services/bookmarks-service && cargo run

# Terminal 3: Gateway
cd gateway && cargo run

# Terminal 4: Frontend (update API_URL)
cd ../../bookmark-manager-app/frontend
VITE_API_URL=http://localhost:8080/api npm run dev
```

### Database Connection
Use your existing PostgreSQL on port 5434:
```rust
let pool = PgPoolOptions::new()
    .max_connections(5)
    .connect("postgres://user:pass@localhost:5434/bookmarks")
    .await?;
```

## Why This Works

1. **Focused Development**: One service at a time
2. **Early Testing**: Frontend works with each service
3. **No Maintenance Burden**: Old system can be ignored
4. **Clear Progress**: Each service is a milestone
5. **Production Ready**: Built right from the start

## The Key Insight

Your current system is already broken. Trying to keep it alive while building the new one will:
- Double your work
- Increase complexity  
- Delay the solution
- Risk introducing more bugs

**Just build the new system right and switch over.**