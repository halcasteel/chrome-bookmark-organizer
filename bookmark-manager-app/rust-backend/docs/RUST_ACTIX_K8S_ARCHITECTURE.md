# Rust + Actix Web Complete Architecture - Kubernetes Native Design

## Executive Summary

Complete rip-and-replace architecture using Rust + Actix Web, designed for cloud-native deployment on Kubernetes. This architecture prioritizes:
- **Performance**: Sub-millisecond latency, 1M+ RPS capability
- **Safety**: Memory-safe, race-free by design
- **Scalability**: Horizontal auto-scaling, event-driven
- **Observability**: Full distributed tracing, metrics, logging
- **Developer Experience**: Type-safe APIs, self-documenting

## Architecture Overview

```mermaid
graph TB
    subgraph "Ingress Layer"
        IL[Kubernetes Ingress/Istio]
    end
    
    subgraph "API Gateway - Rust/Actix"
        GW[Gateway Service<br/>Load Balancing<br/>Rate Limiting<br/>Auth]
    end
    
    subgraph "Core Services - Rust/Actix"
        AUTH[Auth Service<br/>JWT/2FA]
        BOOK[Bookmarks Service<br/>CRUD/Search]
        IMPORT[Import Service<br/>HTML Parser]
        ENRICH[Enrichment Service<br/>AI Processing]
        TASK[Task Service<br/>A2A Orchestration]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Primary Store)]
        REDIS[(Redis<br/>Cache/Queue)]
        S3[S3/MinIO<br/>Object Store]
    end
    
    subgraph "Infrastructure"
        NATS[NATS<br/>Event Bus]
        PROM[Prometheus<br/>Metrics]
        JAEGER[Jaeger<br/>Tracing]
    end
    
    IL --> GW
    GW --> AUTH
    GW --> BOOK
    GW --> IMPORT
    GW --> ENRICH
    GW --> TASK
    
    AUTH --> REDIS
    BOOK --> PG
    BOOK --> REDIS
    IMPORT --> S3
    ENRICH --> PG
    TASK --> NATS
    
    all --> PROM
    all --> JAEGER
```

## 1. Service Architecture

### 1.1 API Gateway Service

```rust
// gateway/src/main.rs
use actix_web::{web, App, HttpServer, middleware};
use actix_web_prom::PrometheusMetrics;
use opentelemetry::trace::TracerProvider;
use tracing_actix_web::TracingLogger;

#[derive(Clone)]
struct GatewayState {
    services: ServiceRegistry,
    rate_limiter: Arc<RateLimiter>,
    circuit_breakers: Arc<DashMap<String, CircuitBreaker>>,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing
    let tracer = init_tracer()?;
    
    // Initialize metrics
    let prometheus = PrometheusMetrics::new("gateway", Some("/metrics"), None);
    
    // Service discovery from K8s
    let services = ServiceRegistry::from_k8s_discovery().await?;
    
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(GatewayState {
                services: services.clone(),
                rate_limiter: Arc::new(RateLimiter::new()),
                circuit_breakers: Arc::new(DashMap::new()),
            }))
            .wrap(TracingLogger::default())
            .wrap(prometheus.clone())
            .wrap(middleware::Compress::default())
            .wrap(Cors::permissive())
            .service(
                web::scope("/api/v1")
                    .service(proxy_routes())
                    .wrap(auth_middleware())
                    .wrap(rate_limit_middleware())
            )
            .service(health_endpoints())
    })
    .bind("0.0.0.0:8080")?
    .workers(num_cpus::get())
    .run()
    .await
}

// Service discovery integration
impl ServiceRegistry {
    async fn from_k8s_discovery() -> Result<Self, Error> {
        let client = kube::Client::try_default().await?;
        let services: Api<Service> = Api::namespaced(client, "bookmark-system");
        
        // Watch for service changes
        let watcher = watcher(services, ListParams::default());
        
        // Build service map from K8s services
        let registry = Arc::new(RwLock::new(HashMap::new()));
        
        tokio::spawn(async move {
            pin_mut!(watcher);
            while let Some(event) = watcher.next().await {
                match event {
                    Ok(Event::Applied(service)) => {
                        update_service_registry(service, &registry).await;
                    }
                    _ => {}
                }
            }
        });
        
        Ok(ServiceRegistry { inner: registry })
    }
}
```

### 1.2 Microservice Template

```rust
// services/bookmarks/src/main.rs
use actix_web::{web, App, HttpServer};
use sqlx::PgPool;
use redis::aio::ConnectionManager;

struct AppState {
    db: PgPool,
    redis: ConnectionManager,
    nats: async_nats::Client,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load config from K8s ConfigMap/Secrets
    let config = Config::from_k8s().await?;
    
    // Database with connection pooling
    let db = PgPool::connect_with(
        PgConnectOptions::from_str(&config.database_url)?
            .application_name("bookmarks-service")
            .max_connections(32)
    ).await?;
    
    // Run migrations
    sqlx::migrate!("./migrations").run(&db).await?;
    
    // Redis connection
    let redis = ConnectionManager::new(config.redis_url).await?;
    
    // NATS for event bus
    let nats = async_nats::connect(&config.nats_url).await?;
    
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                db: db.clone(),
                redis: redis.clone(),
                nats: nats.clone(),
            }))
            .configure(configure_routes)
            .wrap(middleware::Logger::default())
            .wrap(TracingLogger::default())
    })
    .bind("0.0.0.0:8080")?
    .workers(4)
    .run()
    .await
}

fn configure_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/bookmarks")
            .route("", web::post().to(create_bookmark))
            .route("", web::get().to(list_bookmarks))
            .route("/{id}", web::get().to(get_bookmark))
            .route("/{id}", web::put().to(update_bookmark))
            .route("/{id}", web::delete().to(delete_bookmark))
            .route("/search", web::post().to(search_bookmarks))
    );
}
```

### 1.3 Event-Driven Communication

```rust
// Event definitions
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum BookmarkEvent {
    Created { id: Uuid, url: String, user_id: Uuid },
    Updated { id: Uuid, changes: HashMap<String, Value> },
    Deleted { id: Uuid },
    Imported { batch_id: Uuid, count: usize },
    ValidationRequested { id: Uuid, url: String },
    EnrichmentCompleted { id: Uuid, tags: Vec<String>, summary: String },
}

// Event publisher trait
#[async_trait]
trait EventPublisher {
    async fn publish(&self, event: BookmarkEvent) -> Result<(), Error>;
}

// NATS implementation
struct NatsPublisher {
    client: async_nats::Client,
}

#[async_trait]
impl EventPublisher for NatsPublisher {
    async fn publish(&self, event: BookmarkEvent) -> Result<(), Error> {
        let subject = format!("bookmarks.{}", event.event_type());
        let payload = serde_json::to_vec(&event)?;
        
        self.client
            .publish(subject, payload.into())
            .await?;
            
        Ok(())
    }
}

// Event handler
async fn handle_bookmark_created(
    event: BookmarkEvent,
    state: web::Data<AppState>,
) -> Result<(), Error> {
    match event {
        BookmarkEvent::Created { id, url, .. } => {
            // Trigger validation
            state.nats.publish(
                "tasks.validation.request",
                serde_json::to_vec(&ValidationTask { id, url })?.into()
            ).await?;
            
            // Update cache
            let _: () = state.redis
                .set_ex(
                    format!("bookmark:{}", id),
                    serde_json::to_string(&bookmark)?,
                    300
                )
                .await?;
        }
        _ => {}
    }
    Ok(())
}
```

## 2. Docker Strategy

### 2.1 Multi-Stage Dockerfile

```dockerfile
# Base builder image
FROM rust:1.75-alpine AS builder
RUN apk add --no-cache musl-dev openssl-dev

# Create app user
ENV USER=app
ENV UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid "${UID}" \
    "${USER}"

WORKDIR /app

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release --locked
RUN rm -rf src

# Build application
COPY . .
RUN touch src/main.rs
RUN cargo build --release --locked

# Runtime stage
FROM alpine:3.19
RUN apk add --no-cache ca-certificates

# Import user from builder
COPY --from=builder /etc/passwd /etc/passwd
COPY --from=builder /etc/group /etc/group

# Copy binary
COPY --from=builder /app/target/release/gateway /usr/local/bin/

# Use non-root user
USER app:app

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/usr/local/bin/gateway", "health"]

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/gateway"]
```

### 2.2 Docker Compose for Development

```yaml
version: '3.9'

services:
  # API Gateway
  gateway:
    build:
      context: ./gateway
      target: development
    ports:
      - "8080:8080"
    environment:
      - RUST_LOG=debug
      - SERVICE_DISCOVERY=docker
    volumes:
      - ./gateway:/app
      - cargo-cache:/usr/local/cargo/registry
    depends_on:
      - auth
      - bookmarks
      - redis
      - postgres

  # Auth Service
  auth:
    build: ./services/auth
    environment:
      - DATABASE_URL=postgres://user:pass@postgres/auth
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis

  # Bookmarks Service
  bookmarks:
    build: ./services/bookmarks
    environment:
      - DATABASE_URL=postgres://user:pass@postgres/bookmarks
      - REDIS_URL=redis://redis:6379
      - NATS_URL=nats://nats:4222
    depends_on:
      - postgres
      - redis
      - nats

  # Infrastructure
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_MULTIPLE_DATABASES=auth,bookmarks,tasks
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./scripts/init-db.sh:/docker-entrypoint-initdb.d/init-db.sh

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data

  nats:
    image: nats:2.10-alpine
    command: ["-js", "-sd", "/data"]
    volumes:
      - nats-data:/data

volumes:
  cargo-cache:
  postgres-data:
  redis-data:
  nats-data:
```

## 3. Kubernetes Deployment

### 3.1 Namespace and Configuration

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: bookmark-system
  labels:
    istio-injection: enabled

---
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: bookmark-system
data:
  LOG_LEVEL: "info"
  NATS_URL: "nats://nats-cluster:4222"
  ENABLE_TRACING: "true"
  JAEGER_ENDPOINT: "http://jaeger-collector:14268/api/traces"

---
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: bookmark-system
type: Opaque
stringData:
  JWT_SECRET: "your-secret-here"
  DATABASE_URL: "postgres://user:pass@postgres:5432/bookmarks"
  REDIS_URL: "redis://redis-master:6379"
```

### 3.2 Gateway Deployment

```yaml
# k8s/gateway/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway
  namespace: bookmark-system
  labels:
    app: gateway
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gateway
  template:
    metadata:
      labels:
        app: gateway
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: gateway
      containers:
      - name: gateway
        image: bookmarks/gateway:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8080
          name: http
          protocol: TCP
        env:
        - name: RUST_LOG
          value: "info,gateway=debug"
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets
        resources:
          requests:
            memory: "128Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
        securityContext:
          runAsNonRoot: true
          runAsUser: 10001
          readOnlyRootFilesystem: true
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL

---
# k8s/gateway/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: gateway
  namespace: bookmark-system
  labels:
    app: gateway
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  selector:
    app: gateway

---
# k8s/gateway/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gateway-hpa
  namespace: bookmark-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
```

### 3.3 Service Deployment Pattern

```yaml
# k8s/services/bookmarks/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bookmarks-service
  namespace: bookmark-system
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bookmarks
  template:
    metadata:
      labels:
        app: bookmarks
    spec:
      initContainers:
      # Database migration container
      - name: migrate
        image: bookmarks/bookmarks:latest
        command: ["sqlx", "migrate", "run"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: DATABASE_URL
      containers:
      - name: bookmarks
        image: bookmarks/bookmarks:latest
        ports:
        - containerPort: 8080
        env:
        - name: RUST_LOG
          value: "info,bookmarks=debug"
        envFrom:
        - configMapRef:
            name: app-config
        - secretRef:
            name: app-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        volumeMounts:
        - name: cache
          mountPath: /tmp
      volumes:
      - name: cache
        emptyDir:
          sizeLimit: 1Gi

---
# k8s/services/bookmarks/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: bookmarks
  namespace: bookmark-system
spec:
  selector:
    app: bookmarks
  ports:
  - port: 80
    targetPort: 8080
```

### 3.4 StatefulSet for Databases

```yaml
# k8s/postgres/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: bookmark-system
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: bookmarks
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 100Gi
```

### 3.5 Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: bookmarks-ingress
  namespace: bookmark-system
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.bookmarks.example.com
    secretName: bookmarks-tls
  rules:
  - host: api.bookmarks.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: gateway
            port:
              number: 80
```

## 4. Service Mesh Integration (Istio)

```yaml
# k8s/istio/virtual-service.yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: bookmarks-vs
  namespace: bookmark-system
spec:
  hosts:
  - bookmarks
  http:
  - match:
    - headers:
        canary:
          exact: "true"
    route:
    - destination:
        host: bookmarks
        subset: v2
      weight: 100
  - route:
    - destination:
        host: bookmarks
        subset: v1
      weight: 90
    - destination:
        host: bookmarks
        subset: v2
      weight: 10

---
# k8s/istio/destination-rule.yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: bookmarks-dr
  namespace: bookmark-system
spec:
  host: bookmarks
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        http1MaxPendingRequests: 50
        http2MaxRequests: 100
    loadBalancer:
      simple: LEAST_REQUEST
    outlierDetection:
      consecutiveErrors: 5
      interval: 30s
      baseEjectionTime: 30s
  subsets:
  - name: v1
    labels:
      version: v1
  - name: v2
    labels:
      version: v2
```

## 5. Observability Stack

### 5.1 Prometheus Monitoring

```yaml
# k8s/monitoring/prometheus-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
    scrape_configs:
    - job_name: 'kubernetes-pods'
      kubernetes_sd_configs:
      - role: pod
      relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
```

### 5.2 Grafana Dashboards

```json
{
  "dashboard": {
    "title": "Bookmarks System Overview",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{namespace=\"bookmark-system\"}[5m])) by (service)"
          }
        ]
      },
      {
        "title": "Response Time P99",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{namespace=\"bookmark-system\"}[5m])) by (service, le))"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{namespace=\"bookmark-system\",status=~\"5..\"}[5m])) by (service)"
          }
        ]
      }
    ]
  }
}
```

## 6. CI/CD Pipeline

```yaml
# .github/workflows/deploy.yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions-rs/toolchain@v1
      with:
        toolchain: stable
    - name: Run tests
      run: |
        cargo test --all-features
        cargo clippy -- -D warnings

  build:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [gateway, auth, bookmarks, import, enrichment, tasks]
    steps:
    - uses: actions/checkout@v3
    - name: Build and push Docker image
      uses: docker/build-push-action@v4
      with:
        context: ./${{ matrix.service }}
        push: true
        tags: |
          ghcr.io/${{ github.repository }}/${{ matrix.service }}:latest
          ghcr.io/${{ github.repository }}/${{ matrix.service }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/gateway gateway=ghcr.io/${{ github.repository }}/gateway:${{ github.sha }} -n bookmark-system
        kubectl set image deployment/bookmarks-service bookmarks=ghcr.io/${{ github.repository }}/bookmarks:${{ github.sha }} -n bookmark-system
        kubectl rollout status deployment/gateway -n bookmark-system
        kubectl rollout status deployment/bookmarks-service -n bookmark-system
```

## 7. Migration Strategy

### Phase 1: Infrastructure Setup (Week 1)
1. Set up Kubernetes cluster with Istio
2. Deploy PostgreSQL, Redis, NATS
3. Configure monitoring stack
4. Set up CI/CD pipelines

### Phase 2: Gateway Implementation (Week 2)
1. Implement Rust/Actix gateway
2. Deploy with traffic shadowing
3. Validate performance metrics
4. Gradual traffic migration

### Phase 3: Service Migration (Weeks 3-6)
1. Auth service (critical path)
2. Bookmarks service (core functionality)
3. Import service (async processing)
4. Enrichment service (AI features)
5. Task orchestration (A2A system)

### Phase 4: Data Migration (Week 7)
1. Set up database replication
2. Migrate user data
3. Migrate bookmarks data
4. Validate data integrity

### Phase 5: Cutover (Week 8)
1. Final validation
2. DNS cutover
3. Monitor and optimize
4. Decommission old system

## Key Benefits

1. **Performance**: 10-100x improvement in throughput
2. **Resource Usage**: 50-80% reduction in memory/CPU
3. **Latency**: Sub-millisecond P99 response times
4. **Reliability**: Zero-downtime deployments
5. **Scalability**: Auto-scaling based on real metrics
6. **Security**: Memory-safe, type-safe, secure by default