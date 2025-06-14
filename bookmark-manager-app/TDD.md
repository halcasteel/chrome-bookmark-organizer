# Technical Design Document (TDD)
## Bookmark Manager Application

### 1. Technical Overview

#### 1.1 Technology Stack
- **Frontend**: React 18, TypeScript (strict mode), Chakra UI, Vite
- **Backend**: Node.js 20+, Express 4, JavaScript ES6+
- **Database**: PostgreSQL 15 with pgvector extension
- **Authentication**: JWT, Speakeasy (TOTP), bcrypt
- **Validation**: Puppeteer (headless Chrome)
- **AI/ML**: OpenAI API (embeddings & classification)
- **Infrastructure**: Google Cloud Platform, Docker
- **Monitoring**: Winston logging, Google Cloud Logging

#### 1.2 Development Environment
```bash
Node.js: v20.17.0+
npm: v11.4.0+
PostgreSQL: 15.x with pgvector
Docker: 20.10+
Git: 2.x
```

### 2. Backend Architecture

#### 2.1 Directory Structure
```
backend/
├── src/
│   ├── config/           # Configuration files
│   │   ├── database.js   # PostgreSQL connection pool
│   │   └── constants.js  # Application constants
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Express middleware
│   │   ├── auth.js       # JWT authentication
│   │   ├── validation.js # Request validation
│   │   └── errorHandler.js
│   ├── routes/           # API route definitions
│   ├── services/         # Business logic
│   │   ├── bookmarkValidator.js  # Puppeteer validation
│   │   ├── bookmarkProcessor.js  # LLM classification
│   │   └── importService.js      # Bulk import
│   ├── utils/            # Utility functions
│   │   └── logger.js     # Winston logger
│   └── index.js          # Application entry
├── scripts/              # Utility scripts
├── tests/                # Test files
└── package.json
```

#### 2.2 Core Services Implementation

##### 2.2.1 BookmarkValidator Service
```javascript
class BookmarkValidator {
  constructor(options) {
    this.browser = null;
    this.options = {
      timeout: 30000,
      headless: 'new',
      maxConcurrent: 5,
      retryAttempts: 2
    };
  }

  async validateBookmark(bookmark) {
    // 1. Launch Puppeteer page
    // 2. Navigate to URL
    // 3. Check response status
    // 4. Extract metadata
    // 5. Take screenshot
    // 6. Return validation result
  }
}
```

##### 2.2.2 Database Connection Pool
```javascript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

##### 2.2.3 JWT Authentication Flow
```javascript
// Token generation
const token = jwt.sign(
  { userId, email },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

// Token verification middleware
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 3. Frontend Architecture

#### 3.1 Directory Structure
```
frontend/
├── src/
│   ├── components/       # Reusable components
│   │   ├── Layout.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── pages/            # Route pages
│   │   ├── Dashboard.tsx
│   │   ├── Bookmarks.tsx
│   │   └── Search.tsx
│   ├── contexts/         # React contexts
│   │   └── AuthContext.tsx
│   ├── services/         # API services
│   │   └── api.ts
│   ├── hooks/            # Custom hooks
│   ├── types/            # TypeScript types
│   │   ├── auth.ts
│   │   ├── bookmark.ts
│   │   └── api.ts
│   ├── utils/            # Utilities
│   ├── theme.ts          # Chakra UI theme
│   └── App.tsx           # Root component
├── public/               # Static assets
└── tsconfig.json         # TypeScript config
```

#### 3.2 TypeScript Configuration
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx"
  }
}
```

#### 3.3 State Management
```typescript
// AuthContext implementation
interface AuthContextType {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  setup2FA: () => Promise<QRCodeData>;
  verify2FA: (code: string) => Promise<void>;
}

// API Service with Axios
class ApiService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: import.meta.env.VITE_API_URL,
      timeout: 10000,
    });

    this.setupInterceptors();
  }
}
```

### 4. Database Design Details

#### 4.1 pgvector Configuration
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embedding column
ALTER TABLE bookmark_embeddings 
ADD COLUMN embedding vector(1536);

-- Create HNSW index for fast similarity search
CREATE INDEX bookmark_embeddings_hnsw_idx 
ON bookmark_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

#### 4.2 Query Optimization
```sql
-- Optimized semantic search query
WITH semantic_search AS (
  SELECT 
    be.bookmark_id,
    1 - (be.embedding <=> $1::vector) AS similarity
  FROM bookmark_embeddings be
  ORDER BY be.embedding <=> $1::vector
  LIMIT 100
)
SELECT 
  b.*,
  bm.category,
  bm.subcategory,
  ss.similarity,
  array_agg(t.name) AS tags
FROM bookmarks b
JOIN semantic_search ss ON b.id = ss.bookmark_id
JOIN bookmark_metadata bm ON b.id = bm.bookmark_id
LEFT JOIN bookmark_tags bt ON b.id = bt.bookmark_id
LEFT JOIN tags t ON bt.tag_id = t.id
WHERE b.user_id = $2
  AND b.is_deleted = false
  AND ss.similarity > 0.7
GROUP BY b.id, bm.category, bm.subcategory, ss.similarity
ORDER BY ss.similarity DESC
LIMIT 20;
```

### 5. API Implementation Details

#### 5.1 Request Validation
```javascript
// Using Zod for validation
import { z } from 'zod';

const bookmarkSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
  collectionId: z.string().uuid().optional()
});

// Middleware
const validateRequest = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (error) {
    res.status(400).json({ errors: error.errors });
  }
};
```

#### 5.2 Error Handling
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

const errorHandler = (err, req, res, next) => {
  const { statusCode = 500, message } = err;
  
  logger.error({
    error: message,
    statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
```

### 6. Security Implementation

#### 6.1 2FA Implementation
```javascript
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

// Generate secret
const secret = speakeasy.generateSecret({
  name: `Bookmarks (${user.email})`,
  issuer: 'Bookmark Manager'
});

// Verify token
const verified = speakeasy.totp.verify({
  secret: user.twoFactorSecret,
  encoding: 'base32',
  token: code,
  window: 2
});
```

#### 6.2 SQL Injection Prevention
```javascript
// Always use parameterized queries
const result = await db.query(
  'SELECT * FROM bookmarks WHERE user_id = $1 AND url = $2',
  [userId, url]
);

// Never use string concatenation
// BAD: `SELECT * FROM users WHERE email = '${email}'`
```

### 7. Performance Optimization

#### 7.1 Database Indexing Strategy
```sql
-- User queries
CREATE INDEX idx_users_email ON users(email);

-- Bookmark queries
CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX idx_bookmarks_created_at ON bookmarks(created_at DESC);
CREATE INDEX idx_bookmarks_is_dead ON bookmarks(is_dead) WHERE is_dead = true;

-- Search optimization
CREATE INDEX idx_bookmark_metadata_category ON bookmark_metadata(category);
CREATE GIN INDEX idx_bookmarks_title_gin ON bookmarks USING gin(to_tsvector('english', title));
```

#### 7.2 Caching Strategy
```javascript
// Redis caching for embeddings
const cacheKey = `embedding:${text}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const embedding = await openai.createEmbedding({ input: text });
await redis.setex(cacheKey, 3600, JSON.stringify(embedding));
```

### 8. Deployment Configuration

#### 8.1 Docker Configuration
```dockerfile
# Backend Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "src/index.js"]

# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

#### 8.2 Environment Variables
```bash
# Backend
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/bookmark_manager
JWT_SECRET=<secure-random-string>
OPENAI_API_KEY=<api-key>
FRONTEND_URL=https://bookmarks.az1.ai

# Frontend
VITE_API_URL=https://api.bookmarks.az1.ai
VITE_APP_NAME=Bookmark Manager
```

### 9. Testing Implementation

#### 9.1 Unit Test Example
```javascript
describe('BookmarkValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new BookmarkValidator();
  });

  afterEach(async () => {
    await validator.close();
  });

  test('validates valid URL successfully', async () => {
    const result = await validator.validateBookmark({
      url: 'https://example.com',
      title: 'Example'
    });

    expect(result.valid).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.metadata.title).toBeDefined();
  });
});
```

#### 9.2 Integration Test Example
```javascript
describe('POST /api/bookmarks', () => {
  test('creates bookmark with valid data', async () => {
    const response = await request(app)
      .post('/api/bookmarks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        url: 'https://example.com',
        title: 'Test Bookmark'
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.url).toBe('https://example.com');
  });
});
```

### 10. Monitoring & Debugging

#### 10.1 Logging Configuration
```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.colorize()
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  ]
});
```

#### 10.2 Performance Monitoring
```javascript
// Request timing middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent')
    });
  });
  
  next();
});
```

### 11. Scalability Considerations

#### 11.1 Horizontal Scaling
- Stateless backend design
- JWT tokens (no server sessions)
- Database connection pooling
- Queue-based bookmark processing

#### 11.2 Performance Targets
- API response time: < 200ms (p95)
- Bookmark validation: < 30s per URL
- Search latency: < 100ms
- Concurrent users: 1000+