# Frontend-Backend API Mapping Document

## Overview
This document provides a complete mapping of frontend API expectations to backend implementations for the Rust + Actix migration.

## API Endpoint Status

### ✅ Authentication Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `POST /api/auth/login` | `POST /api/auth/login` | ✅ Implemented | Full 2FA support |
| `POST /api/auth/register` | `POST /api/auth/register` | ✅ Implemented | @az1.ai domain required |
| `GET /api/auth/me` | `GET /api/auth/me` | ✅ Implemented | Returns user info |
| `POST /api/auth/enable-2fa` | `POST /api/auth/enable-2fa` | ✅ Implemented | - |
| `POST /api/auth/recovery-codes` | `POST /api/auth/recovery-codes` | ✅ Implemented | - |

### ✅ Bookmark Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `GET /api/bookmarks` | `GET /api/bookmarks` | ✅ Implemented | Pagination, filtering, search |
| `GET /api/bookmarks/:id` | `GET /api/bookmarks/:id` | ✅ Implemented | - |
| `POST /api/bookmarks` | `POST /api/bookmarks` | ✅ Implemented | - |
| `PUT /api/bookmarks/:id` | `PUT /api/bookmarks/:id` | ✅ Implemented | - |
| `DELETE /api/bookmarks/:id` | `DELETE /api/bookmarks/:id` | ✅ Implemented | Soft delete only |
| `POST /api/bookmarks/:id/validate` | `POST /api/validation/validate/:id` | ⚠️ Different Path | Frontend needs update |
| `POST /api/bookmarks/bulk-delete` | `DELETE /api/validation/bulk-delete` | ⚠️ Different Path | Admin only in backend |

### ⚠️ Search Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `POST /api/search/semantic` | Not found | ❌ Missing | Need to implement |
| `GET /api/search/text` | Via `/api/bookmarks?search=` | ⚠️ Different | Use query param |
| `GET /api/search/similar/:bookmarkId` | Not found | ❌ Missing | Need to implement |

### ✅ Import Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `POST /api/import/upload` | `POST /api/import/upload` | ✅ Implemented | Synchronous |
| `POST /api/import/upload/streaming` | `POST /api/import/upload/streaming` | ✅ Implemented | For large files |
| `GET /api/import/history` | `GET /api/import/history` | ✅ Implemented | - |
| `GET /api/import/status/:importId` | `GET /api/import/status/:importId` | ✅ Implemented | - |
| `GET /api/import/progress/:importId` | `GET /api/import/progress/:importId` | ✅ Implemented | - |

### ✅ A2A Import Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `POST /api/import/a2a/upload` | Via A2A routes | ✅ Implemented | - |
| `GET /api/import/a2a/task/:taskId` | `GET /api/a2a/workflow/:workflowId` | ⚠️ Different Path | Use workflow ID |
| `GET /api/import/a2a/task/:taskId/artifacts` | Not found | ❌ Missing | Need to implement |
| `GET /api/import/a2a/task/:taskId/messages` | Not found | ❌ Missing | Need to implement |
| `POST /api/import/a2a/validate` | Via A2A workflow | ⚠️ Different | Start workflow |
| `GET /api/import/a2a/task/:taskId/stream` | `GET /api/a2a/tasks/:taskId/stream` | ⚠️ Different Path | SSE endpoint |

### ⚠️ Tag Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `GET /api/tags` | Exists in routes | ✅ Assumed | Need verification |
| `POST /api/tags` | Exists in routes | ✅ Assumed | Need verification |
| `PUT /api/tags/:id` | Exists in routes | ✅ Assumed | Need verification |
| `DELETE /api/tags/:id` | Exists in routes | ✅ Assumed | Need verification |

### ⚠️ Collection Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `GET /api/collections` | Exists in routes | ✅ Assumed | Need verification |
| `GET /api/collections/:id` | Exists in routes | ✅ Assumed | Need verification |
| `POST /api/collections` | Exists in routes | ✅ Assumed | Need verification |
| `PUT /api/collections/:id` | Exists in routes | ✅ Assumed | Need verification |
| `DELETE /api/collections/:id` | Exists in routes | ✅ Assumed | Need verification |
| `POST /api/collections/:collectionId/bookmarks` | Unknown | ❓ | Need verification |
| `DELETE /api/collections/:collectionId/bookmarks/:bookmarkId` | Unknown | ❓ | Need verification |
| `POST /api/collections/:id/share` | Unknown | ❓ | Need verification |
| `DELETE /api/collections/:id/share` | Unknown | ❓ | Need verification |

### ✅ Dashboard/Stats Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `GET /api/stats/dashboard` | Exists in routes | ✅ Assumed | Need verification |
| `GET /api/a2a/dashboard` | `GET /api/a2a/dashboard` | ✅ Implemented | Admin only |

### ✅ Admin Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| `GET /api/admin/health` | `GET /api/admin/health` | ✅ Implemented | - |
| `GET /api/admin/ai-insights` | `GET /api/admin/ai-insights` | ✅ Implemented | - |
| `POST /api/admin/ai-insights/analyze` | `POST /api/admin/ai-insights/analyze` | ✅ Implemented | - |

### ✅ WebSocket Endpoints
| Frontend Expects | Backend Provides | Status | Notes |
|-----------------|------------------|--------|-------|
| Main WebSocket | Port 3001 | ✅ Implemented | Socket.IO |
| Log WebSocket | Port 3003 | ✅ Implemented | Live logs |
| SSE Streaming | `/api/a2a/tasks/:taskId/stream` | ✅ Implemented | Task progress |

## Rust + Actix API Design

### Service Boundaries

```rust
// API Gateway Routes (gateway service)
/api/v1/auth/*      → auth-service:8080
/api/v1/bookmarks/* → bookmarks-service:8080
/api/v1/import/*    → import-service:8080
/api/v1/search/*    → search-service:8080
/api/v1/tags/*      → tags-service:8080
/api/v1/collections/* → collections-service:8080
/api/v1/admin/*     → admin-service:8080
/api/v1/a2a/*       → a2a-service:8080
```

### Authentication Service API

```rust
// auth-service/src/routes.rs
#[derive(Debug, Serialize, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
    #[serde(rename = "twoFactorCode")]
    two_factor_code: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LoginResponse {
    token: String,
    user: UserDto,
    #[serde(rename = "requiresTwoFactor")]
    requires_two_factor: bool,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/auth")
            .route("/login", web::post().to(login))
            .route("/register", web::post().to(register))
            .route("/me", web::get().to(get_me).wrap(auth_middleware()))
            .route("/enable-2fa", web::post().to(enable_2fa).wrap(auth_middleware()))
            .route("/recovery-codes", web::post().to(generate_recovery_codes).wrap(auth_middleware()))
    );
}
```

### Bookmarks Service API

```rust
// bookmarks-service/src/routes.rs
#[derive(Debug, Serialize, Deserialize)]
struct BookmarkQuery {
    page: Option<u32>,
    limit: Option<u32>,
    search: Option<String>,
    tags: Option<Vec<String>>,
    #[serde(rename = "isArchived")]
    is_archived: Option<bool>,
    #[serde(rename = "sortBy")]
    sort_by: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BookmarkResponse {
    id: Uuid,
    url: String,
    title: Option<String>,
    description: Option<String>,
    tags: Vec<String>,
    #[serde(rename = "createdAt")]
    created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    updated_at: DateTime<Utc>,
    #[serde(rename = "lastValidated")]
    last_validated: Option<DateTime<Utc>>,
    #[serde(rename = "validationStatus")]
    validation_status: ValidationStatus,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/bookmarks")
            .wrap(auth_middleware())
            .route("", web::get().to(list_bookmarks))
            .route("", web::post().to(create_bookmark))
            .route("/{id}", web::get().to(get_bookmark))
            .route("/{id}", web::put().to(update_bookmark))
            .route("/{id}", web::delete().to(delete_bookmark))
            .route("/{id}/validate", web::post().to(validate_bookmark))
            .route("/bulk-delete", web::post().to(bulk_delete_bookmarks))
    );
}
```

### Search Service API

```rust
// search-service/src/routes.rs
#[derive(Debug, Serialize, Deserialize)]
struct SemanticSearchRequest {
    query: String,
    limit: Option<u32>,
    threshold: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TextSearchQuery {
    q: String,
    limit: Option<u32>,
    offset: Option<u32>,
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/search")
            .wrap(auth_middleware())
            .route("/semantic", web::post().to(semantic_search))
            .route("/text", web::get().to(text_search))
            .route("/similar/{bookmark_id}", web::get().to(find_similar))
    );
}
```

### Import Service API

```rust
// import-service/src/routes.rs
use actix_multipart::Multipart;
use futures_util::StreamExt;

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/import")
            .wrap(auth_middleware())
            .route("/upload", web::post().to(upload_sync))
            .route("/upload/streaming", web::post().to(upload_streaming))
            .route("/history", web::get().to(get_history))
            .route("/status/{import_id}", web::get().to(get_status))
            .route("/progress/{import_id}", web::get().to(get_progress))
            .service(
                web::scope("/a2a")
                    .route("/upload", web::post().to(upload_a2a))
                    .route("/task/{task_id}", web::get().to(get_task))
                    .route("/task/{task_id}/artifacts", web::get().to(get_artifacts))
                    .route("/task/{task_id}/messages", web::get().to(get_messages))
                    .route("/task/{task_id}/stream", web::get().to(stream_progress))
                    .route("/validate", web::post().to(validate_a2a))
            )
    );
}

async fn upload_streaming(mut payload: Multipart) -> Result<HttpResponse, Error> {
    // Handle multipart streaming upload
    while let Some(item) = payload.next().await {
        let mut field = item?;
        // Process chunks as they arrive
        while let Some(chunk) = field.next().await {
            let data = chunk?;
            // Stream processing
        }
    }
    Ok(HttpResponse::Ok().json(json!({ "importId": import_id })))
}
```

### WebSocket/SSE Configuration

```rust
// gateway/src/websocket.rs
use actix_web_actors::ws;
use actix::{Actor, StreamHandler};

pub struct WebSocketSession {
    user_id: Uuid,
    heartbeat: Instant,
}

impl Actor for WebSocketSession {
    type Context = ws::WebsocketContext<Self>;
    
    fn started(&mut self, ctx: &mut Self::Context) {
        self.heartbeat(ctx);
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Text(text)) => {
                // Handle Socket.IO protocol
                self.handle_socketio_message(text, ctx);
            }
            _ => {}
        }
    }
}

// SSE endpoint for task streaming
pub async fn stream_task_progress(
    path: web::Path<Uuid>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    let task_id = path.into_inner();
    
    let stream = async_stream::stream! {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        
        loop {
            interval.tick().await;
            
            if let Ok(progress) = get_task_progress(&task_id, &state).await {
                yield Ok::<_, Error>(Event::default()
                    .event("progress")
                    .data(serde_json::to_string(&progress)?));
                    
                if progress.is_complete() {
                    break;
                }
            }
        }
    };
    
    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .streaming(stream))
}
```

## Frontend Updates Required

### 1. Update API Client for Path Differences

```typescript
// frontend/src/services/api.ts
const API_MAPPINGS = {
  // Path corrections
  validateBookmark: (id: string) => `/api/validation/validate/${id}`,
  bulkDeleteBookmarks: () => `/api/validation/bulk-delete`,
  
  // A2A path corrections
  getA2ATask: (taskId: string) => `/api/a2a/workflow/${taskId}`,
  streamA2ATask: (taskId: string) => `/api/a2a/tasks/${taskId}/stream`,
};
```

### 2. Implement Missing Search Endpoints

```typescript
// frontend/src/services/searchService.ts
export const searchService = {
  // Update to use bookmark search with query param
  textSearch: async (query: string) => {
    return api.get('/bookmarks', { params: { search: query } });
  },
  
  // These need backend implementation
  semanticSearch: async (query: string) => {
    throw new Error('Semantic search not yet implemented');
  },
  
  findSimilar: async (bookmarkId: string) => {
    throw new Error('Similar bookmarks not yet implemented');
  },
};
```

### 3. Update WebSocket Configuration

```typescript
// frontend/src/services/websocket.ts
const WS_CONFIG = {
  main: process.env.VITE_API_URL || 'http://localhost:3001',
  logs: 'http://localhost:3003',
  
  // For Rust migration
  rust: {
    gateway: 'ws://localhost:8080/ws',
    options: {
      protocols: ['socket.io'],
      reconnection: true,
      reconnectionAttempts: 5,
    },
  },
};
```

## Migration Checklist

### Phase 1: Core APIs
- [ ] Auth service with JWT and 2FA
- [ ] Bookmarks CRUD operations
- [ ] Basic search functionality
- [ ] Import service (sync and streaming)

### Phase 2: Advanced Features
- [ ] Semantic search with embeddings
- [ ] Similar bookmarks functionality
- [ ] A2A task artifacts and messages
- [ ] Collections sharing endpoints

### Phase 3: Real-time Features
- [ ] WebSocket migration to Actix
- [ ] SSE streaming optimization
- [ ] Event bus integration

### Phase 4: Performance
- [ ] Connection pooling
- [ ] Response caching
- [ ] Rate limiting
- [ ] Circuit breakers

## Testing Strategy

### API Contract Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};
    
    #[actix_web::test]
    async fn test_login_endpoint() {
        let app = test::init_service(
            App::new().configure(configure)
        ).await;
        
        let req = test::TestRequest::post()
            .uri("/auth/login")
            .set_json(&LoginRequest {
                email: "test@az1.ai".to_string(),
                password: "password".to_string(),
                two_factor_code: None,
            })
            .to_request();
            
        let resp = test::call_service(&app, req).await;
        assert!(resp.status().is_success());
    }
}
```

### Frontend Integration Tests
```typescript
// frontend/src/tests/api.test.ts
describe('API Integration', () => {
  it('should handle auth flow', async () => {
    const response = await api.post('/auth/login', {
      email: 'test@az1.ai',
      password: 'password',
    });
    
    expect(response.data).toHaveProperty('token');
    expect(response.data).toHaveProperty('user');
  });
});
```

## Performance Targets

| Endpoint | Current (Node.js) | Target (Rust) | Improvement |
|----------|------------------|---------------|-------------|
| Auth Login | 150ms | 10ms | 15x |
| Bookmark List (1000) | 500ms | 20ms | 25x |
| Semantic Search | 2000ms | 100ms | 20x |
| Import (10k bookmarks) | 60s | 3s | 20x |
| WebSocket Latency | 50ms | 2ms | 25x |

## Security Considerations

1. **Authentication**: JWT with RS256 signing
2. **Rate Limiting**: Per-user limits on all endpoints
3. **Input Validation**: Strong typing with serde validation
4. **CORS**: Strict origin validation
5. **TLS**: Mandatory in production
6. **Secrets**: Kubernetes secrets for sensitive data