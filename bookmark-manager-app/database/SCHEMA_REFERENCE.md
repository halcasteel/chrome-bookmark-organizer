# PostgreSQL Database Schema Reference
## bookmark_manager Database

Generated on: 2025-06-18
PostgreSQL Version: 16.8

## Database Overview

- **Database Size**: ~296 MB
- **Extensions**: pgcrypto, plpgsql, uuid-ossp, vector
- **Total Tables**: 26

## Tables Summary

| Table Name | Size | Description |
|------------|------|-------------|
| bookmarks | 3.2 MB | Main bookmarks table |
| bookmark_embeddings | 1.6 MB | Vector embeddings for semantic search |
| system_logs | 268 MB | Application logs |
| a2a_tasks | 256 KB | Agent-to-Agent task management |
| a2a_messages | 128 KB | A2A communication messages |
| a2a_artifacts | 128 KB | A2A task artifacts |
| import_history | 112 KB | Bookmark import tracking |
| users | 96 KB | User accounts |
| tags | 56 KB | Bookmark tags |
| collections | 40 KB | Bookmark collections |
| bookmark_tags | 24 KB | Many-to-many bookmark-tag relations |
| bookmark_collections | 8 KB | Many-to-many bookmark-collection relations |

## Detailed Table Schemas

### 1. users
Primary user account table with role-based access control.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NOT NULL | uuid_generate_v4() | Primary key |
| email | varchar(255) | NOT NULL | | User email (must end with @az1.ai) |
| password_hash | varchar(255) | NOT NULL | | Argon2 hashed password |
| name | varchar(255) | NULL | | User display name |
| role | varchar(50) | NULL | 'user' | Role: 'user' or 'admin' |
| two_factor_enabled | boolean | NOT NULL | false | 2FA status |
| two_factor_secret | varchar(255) | NULL | | 2FA secret key |
| two_factor_verified | boolean | NULL | false | 2FA verification status |
| recovery_codes | jsonb | NULL | | 2FA recovery codes |
| last_login | timestamptz | NULL | | Last login timestamp |
| created_at | timestamptz | NULL | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NULL | CURRENT_TIMESTAMP | |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: email
- INDEX: idx_users_email

**Constraints:**
- CHECK: email must end with '@az1.ai'

### 2. bookmarks
Main bookmarks storage table.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NOT NULL | uuid_generate_v4() | Primary key |
| user_id | uuid | NOT NULL | | Foreign key to users |
| url | text | NOT NULL | | Bookmark URL |
| title | text | NOT NULL | | Bookmark title |
| description | text | NULL | | Description/notes |
| domain | varchar(255) | NULL | | Extracted domain |
| favicon_url | text | NULL | | Favicon URL |
| status | validation_status | NULL | 'pending' | pending/valid/invalid/redirect/error |
| last_checked | timestamptz | NULL | | Last validation check |
| http_status | integer | NULL | | HTTP response code |
| content_hash | varchar(64) | NULL | | Content hash for change detection |
| screenshot_url | text | NULL | | Screenshot URL |
| page_content | text | NULL | | Extracted page content |
| metadata | jsonb | NULL | {} | Additional metadata |
| ai_summary | text | NULL | | AI-generated summary |
| ai_tags | text[] | NULL | | AI-suggested tags |
| ai_category | varchar(255) | NULL | | AI-suggested category |
| enriched | boolean | NULL | false | AI enrichment status |
| import_id | uuid | NULL | | Import batch reference |
| created_at | timestamptz | NULL | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NULL | CURRENT_TIMESTAMP | |

**Indexes:**
- PRIMARY KEY: id
- INDEX: idx_bookmarks_user_id
- INDEX: idx_bookmarks_domain
- INDEX: idx_bookmarks_status
- INDEX: idx_bookmarks_ai_category
- INDEX: idx_bookmarks_created_at
- INDEX: idx_bookmarks_enriched

**Foreign Keys:**
- user_id → users(id) ON DELETE CASCADE

### 3. bookmark_embeddings
Vector embeddings for semantic search using pgvector.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NOT NULL | uuid_generate_v4() | Primary key |
| bookmark_id | uuid | NOT NULL | | Foreign key to bookmarks |
| embedding | vector(1536) | NULL | | OpenAI embedding vector |
| model_version | varchar(50) | NULL | 'text-embedding-ada-002' | Model version |
| created_at | timestamptz | NULL | CURRENT_TIMESTAMP | |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: bookmark_id
- INDEX: idx_bookmark_embeddings_vector (IVFFlat index for similarity search)

### 4. collections
User-defined bookmark collections.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NOT NULL | uuid_generate_v4() | Primary key |
| user_id | uuid | NOT NULL | | Foreign key to users |
| name | varchar(255) | NOT NULL | | Collection name |
| description | text | NULL | | Collection description |
| color | varchar(7) | NULL | | Hex color code |
| icon | varchar(50) | NULL | | Icon identifier |
| is_public | boolean | NULL | false | Public visibility |
| parent_id | uuid | NULL | | Parent collection for nesting |
| position | integer | NULL | | Sort order |
| created_at | timestamptz | NULL | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NULL | CURRENT_TIMESTAMP | |

**Indexes:**
- PRIMARY KEY: id
- INDEX: idx_collections_user_id

### 5. tags
User-defined tags for bookmarks.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NOT NULL | uuid_generate_v4() | Primary key |
| user_id | uuid | NOT NULL | | Foreign key to users |
| name | varchar(100) | NOT NULL | | Tag name |
| color | varchar(7) | NULL | | Hex color code |
| created_at | timestamptz | NULL | CURRENT_TIMESTAMP | |
| updated_at | timestamptz | NULL | CURRENT_TIMESTAMP | |

**Indexes:**
- PRIMARY KEY: id
- UNIQUE: (user_id, name)

### 6. a2a_tasks
Agent-to-Agent architecture task management.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | varchar(255) | NOT NULL | | Task ID |
| type | varchar(255) | NOT NULL | | Task type |
| status | varchar(50) | NOT NULL | | pending/running/completed/failed/cancelled |
| workflow_type | varchar(255) | NULL | | Workflow identifier |
| workflow_agents | text[] | NULL | | Array of agent types |
| current_agent | varchar(255) | NULL | | Currently executing agent |
| current_step | integer | NULL | 0 | Current workflow step |
| total_steps | integer | NULL | | Total workflow steps |
| context | jsonb | NOT NULL | {} | Task context data |
| metadata | jsonb | NULL | {} | Additional metadata |
| user_id | uuid | NULL | | Associated user |
| error_message | text | NULL | | Error details if failed |
| created | timestamptz | NOT NULL | now() | |
| updated | timestamptz | NOT NULL | now() | |

**Indexes:**
- PRIMARY KEY: id
- INDEX: idx_a2a_tasks_status
- INDEX: idx_a2a_tasks_type
- INDEX: idx_a2a_tasks_workflow_type
- INDEX: idx_a2a_tasks_user_id
- INDEX: idx_a2a_tasks_active (partial index for pending/running)

### 7. a2a_messages
Communication messages between agents.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | varchar(255) | NOT NULL | | Message ID |
| task_id | varchar(255) | NOT NULL | | Associated task |
| agent_type | varchar(255) | NOT NULL | | Sending agent type |
| type | varchar(50) | NOT NULL | | progress/status/error/warning/info/completion |
| content | text | NOT NULL | | Message content |
| timestamp | timestamptz | NOT NULL | now() | |
| metadata | jsonb | NULL | {} | Additional data |

**Foreign Keys:**
- task_id → a2a_tasks(id) ON DELETE CASCADE

### 8. import_history
Tracks bookmark import operations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NOT NULL | uuid_generate_v4() | Primary key |
| user_id | uuid | NOT NULL | | Foreign key to users |
| filename | varchar(255) | NOT NULL | | Imported file name |
| file_size | integer | NULL | | File size in bytes |
| total_bookmarks | integer | NULL | | Total bookmarks in file |
| imported_count | integer | NULL | 0 | Successfully imported |
| failed_count | integer | NULL | 0 | Failed imports |
| duplicate_count | integer | NULL | 0 | Duplicates found |
| status | varchar(50) | NULL | 'pending' | Import status |
| error_message | text | NULL | | Error details |
| metadata | jsonb | NULL | {} | Import metadata |
| started_at | timestamptz | NULL | | Import start time |
| completed_at | timestamptz | NULL | | Import completion time |
| created_at | timestamptz | NULL | CURRENT_TIMESTAMP | |

## Enums

### validation_status
```sql
VALUES: 'pending', 'valid', 'invalid', 'redirect', 'error'
```

### log_level_enum
```sql
VALUES: 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'
```

### problem_status_enum
```sql
VALUES: 'open', 'investigating', 'resolved', 'ignored'
```

### problem_severity_enum
```sql
VALUES: 'low', 'medium', 'high', 'critical'
```

## Key Functions

### update_updated_at_column()
Trigger function that automatically updates the `updated_at` column.

### update_task_timestamp()
Updates the `updated` timestamp for a2a_tasks.

## Triggers

- All tables with `updated_at` columns have triggers to automatically update the timestamp
- Named pattern: `update_{tablename}_updated_at`

## Important Constraints

1. **Email Domain Restriction**: Users must have email ending with '@az1.ai'
2. **Unique Tags**: Each user can only have one tag with a given name
3. **Cascade Deletes**: Deleting a user cascades to all their bookmarks, tags, collections
4. **Status Validation**: Tasks and bookmarks have enum constraints on status fields

## Notes

- The database uses UUID v4 for all primary keys
- All timestamps are stored with timezone (timestamptz)
- JSONB columns are used for flexible metadata storage
- The vector extension enables similarity search on embeddings
- System uses both role-based ('user', 'admin') and feature-based access control