# AI-Ops Core

A universal AI-powered infrastructure for agent-driven tool construction and autonomous system management.

## Overview

AI-Ops Core provides a foundation for building self-managing, self-healing systems through:

- **Universal Agent Framework**: Base traits and implementations for autonomous agents
- **Knowledge Graph**: Semantic storage of problems, solutions, and patterns with vector embeddings
- **Event Mesh**: Distributed event processing using Redis Streams
- **Service Registry**: Dynamic service discovery and health monitoring
- **AI Integration**: Support for OpenAI, Anthropic, and local models
- **Pattern Library**: Reusable solutions that evolve over time
- **Tool Construction**: Framework for building and deploying new tools

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AI-Ops Core                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Agents    │  │  Knowledge   │  │   Event Mesh     │  │
│  │             │  │    Graph     │  │                  │  │
│  │ • Monitor   │  │              │  │ • Pub/Sub        │  │
│  │ • Diagnose  │  │ • Problems   │  │ • Streaming      │  │
│  │ • Heal      │  │ • Solutions  │  │ • Routing        │  │
│  │ • Learn     │  │ • Patterns   │  │ • Processing     │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Service    │  │      AI      │  │    Pattern       │  │
│  │  Registry   │  │  Providers   │  │    Library       │  │
│  │             │  │              │  │                  │  │
│  │ • Discovery │  │ • OpenAI     │  │ • Detection      │  │
│  │ • Health    │  │ • Anthropic  │  │ • Application    │  │
│  │ • Load Bal. │  │ • Local      │  │ • Evolution      │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
ai-ops-core = { path = "../ai-ops-core" }
```

### Basic Usage

```rust
use ai_ops_core::*;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize knowledge graph
    let kg = knowledge::KnowledgeGraph::new(
        "postgres://admin:admin@localhost:5434/bookmark_manager"
    ).await?;
    
    // Create event mesh
    let mesh = events::EventMesh::new("redis://localhost:6382").await?;
    
    // Record a problem
    let problem = knowledge::Problem {
        fingerprint: "db-timeout-001".to_string(),
        category: "database".to_string(),
        description: "Database connection timeouts".to_string(),
        // ... other fields
    };
    
    let problem_id = kg.add_problem(problem).await?;
    
    // Find solutions
    let solutions = kg.find_solutions("Database timing out").await?;
    
    Ok(())
}
```

## Core Components

### 1. Universal Agent Framework

Base trait for all agents:

```rust
#[async_trait]
pub trait UniversalAgent {
    fn id(&self) -> AgentId;
    fn agent_type(&self) -> AgentType;
    fn capabilities(&self) -> Vec<Capability>;
    async fn process(&mut self, event: Event) -> Result<Vec<Event>>;
    async fn learn(&mut self, experience: Experience) -> Result<Knowledge>;
    async fn collaborate(&mut self, request: CollaborationRequest) -> Result<CollaborationResponse>;
}
```

### 2. Knowledge Graph

Semantic storage with vector embeddings:

```rust
// Add problems and solutions
let problem_id = kg.add_problem(problem).await?;
let solution_id = kg.add_solution(solution, problem_id).await?;

// Find similar problems and their solutions
let candidates = kg.find_solutions("Service is slow").await?;

// Track solution effectiveness
kg.update_solution_outcome(solution_id, success).await?;
```

### 3. Event Mesh

Distributed event processing:

```rust
// Publish events
mesh.publish(event).await?;

// Subscribe with filters
mesh.subscribe("my-processor", filter, handler).await?;

// Query event history
let events = mesh.get_events(Some(filter), limit).await?;
```

### 4. Service Registry

Dynamic service discovery:

```rust
// Register a service
registry.register(service_definition).await?;

// Discover services by capability
let filter = ServiceFilter {
    capabilities: Some(vec!["monitoring".to_string()]),
    healthy_only: true,
    ..Default::default()
};
let services = registry.discover(filter).await?;
```

### 5. Pattern Library

Reusable patterns that evolve:

```rust
// Define a pattern
let pattern = Pattern {
    pattern_type: PatternType::Error,
    matching_rules: vec![/* rules */],
    actions: vec![/* actions */],
    // ...
};

// Apply pattern
let result = pattern_library.apply(pattern, context).await?;
```

## Foundation Agents

### Monitor Agent
- Continuous health monitoring
- Metric collection and analysis
- Anomaly detection
- Alert generation

### Diagnostic Agent
- Root cause analysis
- Log correlation
- Trace analysis
- Problem identification

### Healing Agent
- Automated remediation
- Self-healing actions
- Rollback capabilities
- Success tracking

### Learning Agent
- Pattern extraction
- Knowledge acquisition
- Model training
- Continuous improvement

## Database Schema

The system requires PostgreSQL with pgvector extension:

```sql
-- Knowledge nodes with embeddings
CREATE TABLE knowledge_nodes (
    id UUID PRIMARY KEY,
    node_type knowledge_node_type NOT NULL,
    data JSONB NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Relationships between nodes
CREATE TABLE knowledge_edges (
    id UUID PRIMARY KEY,
    from_node UUID REFERENCES knowledge_nodes(id),
    to_node UUID REFERENCES knowledge_nodes(id),
    relationship knowledge_relationship NOT NULL,
    weight DOUBLE PRECISION DEFAULT 1.0
);

-- Event storage
CREATE TABLE events (
    id UUID PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    source UUID NOT NULL,
    payload JSONB NOT NULL
);
```

## Configuration

Environment variables:

```bash
# Database
DATABASE_URL=postgres://admin:admin@localhost:5434/bookmark_manager

# Redis
REDIS_URL=redis://localhost:6382

# AI Providers (optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## Examples

See the `examples/` directory for:

- `basic_usage.rs` - Getting started example
- `custom_agent.rs` - Building a custom agent
- `pattern_matching.rs` - Pattern detection and application
- `event_processing.rs` - Event mesh usage

## Testing

Run tests with a real database and Redis:

```bash
# Start infrastructure
docker-compose up -d postgres redis

# Run tests
cargo test --all-features
```

## Performance Considerations

- Knowledge graph uses in-memory caching for frequently accessed nodes
- Event mesh supports batching and parallel processing
- Vector embeddings enable fast similarity search
- Service registry uses health check caching

## Future Enhancements

- [ ] Distributed agent coordination
- [ ] Multi-model AI support
- [ ] Advanced pattern mining algorithms
- [ ] Kubernetes operator integration
- [ ] Prometheus metrics export
- [ ] GraphQL API
- [ ] Web UI for visualization

## Contributing

1. Follow Rust best practices
2. Write tests for new features
3. Update documentation
4. Run `cargo fmt` and `cargo clippy`

## License

This project is part of the Bookmark Manager application.