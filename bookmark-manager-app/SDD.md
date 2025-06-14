# Software Design Document (SDD)
## Bookmark Manager Application

### 1. Introduction

#### 1.1 Purpose
This document describes the software design for the Bookmark Manager application, a cloud-based system for organizing, validating, and searching web bookmarks with AI-powered classification and dead link detection.

#### 1.2 Scope
The application provides:
- Secure bookmark storage with @az1.ai email restriction
- Automatic bookmark validation using headless browser technology
- AI-powered categorization and tagging
- Semantic search capabilities using vector embeddings
- Multi-device synchronization
- Dead link detection and monitoring
- 2FA authentication requirement

#### 1.3 Definitions
- **Bookmark**: A saved URL with metadata (title, description, tags)
- **Collection**: A group of related bookmarks
- **Vector Embedding**: Mathematical representation of bookmark content for semantic search
- **Dead Link**: A URL that returns 4xx/5xx errors or fails to load

### 2. System Architecture

#### 2.1 High-Level Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  Express Backend │────▶│  PostgreSQL DB  │
│   (TypeScript)  │     │    (Node.js)     │     │   (pgvector)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                        │                         │
         ▼                        ▼                         ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Chakra UI     │     │    Puppeteer     │     │  Cloud Storage  │
│   Components    │     │   Validation     │     │   (GCS/S3)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │   OpenAI API     │
                        │  Classification  │
                        └──────────────────┘
```

#### 2.2 Component Design

##### 2.2.1 Frontend Components
- **Authentication**
  - Login/Register forms
  - 2FA setup and verification
  - Session management
  
- **Dashboard**
  - Statistics overview
  - Recent bookmarks
  - Quick actions
  
- **Bookmark Management**
  - List view with filtering
  - Grid/card view
  - Bulk operations
  
- **Search Interface**
  - Semantic search input
  - Filter controls
  - Result display
  
- **Import/Export**
  - File upload interface
  - Progress tracking
  - History view

##### 2.2.2 Backend Services
- **AuthService**
  - JWT token generation
  - 2FA verification
  - Email domain validation
  
- **BookmarkService**
  - CRUD operations
  - Validation orchestration
  - Metadata extraction
  
- **SearchService**
  - Vector similarity search
  - Full-text search
  - Hybrid ranking
  
- **ImportService**
  - HTML parsing
  - Batch processing
  - Progress tracking
  
- **ValidationService**
  - URL health checks
  - Screenshot capture
  - Metadata extraction

#### 2.3 Data Flow

##### 2.3.1 Bookmark Import Flow
```
1. User uploads HTML file
2. System parses bookmarks
3. Creates individual JSON records
4. Validates each URL with Puppeteer
5. Classifies with OpenAI
6. Stores in database with embeddings
7. Updates user interface
```

##### 2.3.2 Search Flow
```
1. User enters search query
2. System generates query embedding
3. Performs vector similarity search
4. Combines with keyword matching
5. Ranks results by relevance
6. Returns paginated results
```

### 3. Database Design

#### 3.1 Schema Overview
```sql
users
├── id (UUID, PK)
├── email (VARCHAR, UNIQUE, CHECK @az1.ai)
├── password_hash (VARCHAR)
├── two_factor_secret (VARCHAR)
└── created_at (TIMESTAMP)

bookmarks
├── id (UUID, PK)
├── user_id (UUID, FK)
├── url (TEXT)
├── title (VARCHAR)
├── description (TEXT)
├── is_dead (BOOLEAN)
└── created_at (TIMESTAMP)

bookmark_embeddings
├── bookmark_id (UUID, FK)
├── embedding (VECTOR(1536))
└── model_version (VARCHAR)

bookmark_metadata
├── bookmark_id (UUID, FK)
├── category (VARCHAR)
├── subcategory (VARCHAR)
├── quality_score (INTEGER)
└── validation_data (JSONB)
```

#### 3.2 Indexes
- `users_email_idx` on `users(email)`
- `bookmarks_user_id_idx` on `bookmarks(user_id)`
- `bookmarks_url_idx` on `bookmarks(url)`
- `embeddings_vector_idx` on `bookmark_embeddings` using ivfflat

### 4. API Design

#### 4.1 RESTful Endpoints

##### Authentication
```
POST   /api/auth/register     - Register new user
POST   /api/auth/login        - Login with email/password
POST   /api/auth/2fa/setup    - Setup 2FA
POST   /api/auth/2fa/verify   - Verify 2FA code
POST   /api/auth/logout       - Logout user
```

##### Bookmarks
```
GET    /api/bookmarks         - List bookmarks (paginated)
POST   /api/bookmarks         - Create bookmark
GET    /api/bookmarks/:id     - Get bookmark details
PUT    /api/bookmarks/:id     - Update bookmark
DELETE /api/bookmarks/:id     - Delete bookmark
POST   /api/bookmarks/validate - Validate URLs
```

##### Search
```
POST   /api/search            - Semantic search
GET    /api/search/suggest    - Search suggestions
```

##### Import/Export
```
POST   /api/import/upload     - Upload bookmarks file
GET    /api/import/status/:id - Check import status
GET    /api/export            - Export bookmarks
```

#### 4.2 Request/Response Formats

##### Create Bookmark Request
```json
{
  "url": "https://example.com",
  "title": "Example Site",
  "description": "Optional description",
  "tags": ["tag1", "tag2"],
  "collectionId": "uuid"
}
```

##### Search Request
```json
{
  "query": "javascript tutorials",
  "filters": {
    "category": "Technology",
    "dateRange": {
      "from": "2024-01-01",
      "to": "2024-12-31"
    },
    "isDeadLink": false
  },
  "limit": 20,
  "offset": 0
}
```

### 5. Security Design

#### 5.1 Authentication & Authorization
- JWT tokens with 24-hour expiration
- Refresh token rotation
- 2FA using TOTP (Time-based One-Time Password)
- Email domain restriction (@az1.ai only)

#### 5.2 Data Protection
- Passwords hashed with bcrypt (10 rounds)
- HTTPS only in production
- SQL injection prevention via parameterized queries
- XSS protection with input sanitization

#### 5.3 Rate Limiting
- 100 requests per 15 minutes per IP
- 1000 requests per hour per user
- Exponential backoff for failed auth attempts

### 6. Performance Considerations

#### 6.1 Caching Strategy
- Redis for session storage
- Browser caching for static assets
- API response caching (5 minutes)
- Embedding cache for repeated searches

#### 6.2 Optimization Techniques
- Database query optimization
- Lazy loading for bookmark lists
- Image compression for screenshots
- Connection pooling

#### 6.3 Scalability
- Horizontal scaling with Cloud Run
- Database read replicas
- CDN for static assets
- Queue-based bookmark processing

### 7. Monitoring & Logging

#### 7.1 Application Metrics
- Request rate and latency
- Error rates by endpoint
- Database query performance
- External API usage

#### 7.2 Business Metrics
- Active users
- Bookmarks per user
- Search queries per day
- Import success rate

#### 7.3 Logging Strategy
- Structured JSON logging
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized log aggregation
- Alert thresholds

### 8. Deployment Architecture

#### 8.1 Infrastructure
```
Google Cloud Platform
├── Cloud Run (Frontend & Backend)
├── Cloud SQL (PostgreSQL with pgvector)
├── Cloud Storage (Screenshots & Exports)
├── Cloud CDN (Static Assets)
└── Cloud Load Balancer (HTTPS)
```

#### 8.2 CI/CD Pipeline
```
GitHub Push → GitHub Actions → Build & Test → Deploy to Cloud Run
```

#### 8.3 Environment Configuration
- Development: Local Docker containers
- Staging: Separate GCP project
- Production: bookmarks.az1.ai domain

### 9. Testing Strategy

#### 9.1 Unit Tests
- Service layer logic
- Utility functions
- React component testing

#### 9.2 Integration Tests
- API endpoint testing
- Database operations
- External service mocking

#### 9.3 E2E Tests
- User workflows
- Cross-browser testing
- Performance testing

### 10. Future Enhancements

#### 10.1 Phase 2 Features
- Browser extension
- Mobile applications
- Collaborative collections
- Advanced analytics

#### 10.2 Technical Improvements
- GraphQL API option
- Real-time notifications
- Machine learning for better classification
- Blockchain for bookmark verification