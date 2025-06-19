#!/bin/bash

# Docker build and deployment script

# Get the parent directory
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Docker registry (change this for your registry)
REGISTRY="localhost:5000"
PROJECT="bookmarks-platform"
VERSION=$(date +%Y%m%d-%H%M%S)

echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Docker Build & Deployment${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"

# Function to build service
build_service() {
    local service=$1
    local dockerfile=$2
    local image_name="${REGISTRY}/${PROJECT}/${service}:${VERSION}"
    local latest_tag="${REGISTRY}/${PROJECT}/${service}:latest"
    
    echo -e "\n${CYAN}Building $service...${NC}"
    
    if [ -f "$dockerfile" ]; then
        docker build -f "$dockerfile" -t "$image_name" -t "$latest_tag" . 
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Built $service successfully${NC}"
            echo -e "  Image: $image_name"
            return 0
        else
            echo -e "${RED}✗ Failed to build $service${NC}"
            return 1
        fi
    else
        echo -e "${RED}✗ Dockerfile not found: $dockerfile${NC}"
        return 1
    fi
}

# Create root Dockerfile for workspace build
create_workspace_dockerfile() {
    cat > Dockerfile.workspace << 'EOF'
# Build stage
FROM rust:1.75-alpine AS builder
RUN apk add --no-cache musl-dev openssl-dev

WORKDIR /app

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
COPY crates/domain/Cargo.toml crates/domain/
COPY crates/shared/Cargo.toml crates/shared/
COPY services/gateway/Cargo.toml services/gateway/
COPY services/auth/Cargo.toml services/auth/
COPY services/bookmarks/Cargo.toml services/bookmarks/
COPY services/import/Cargo.toml services/import/
COPY services/search/Cargo.toml services/search/

# Create dummy files for caching
RUN mkdir -p crates/domain/src crates/shared/src \
    services/gateway/src services/auth/src \
    services/bookmarks/src services/import/src services/search/src && \
    echo "fn main() {}" > services/gateway/src/main.rs && \
    echo "fn main() {}" > services/auth/src/main.rs && \
    echo "fn main() {}" > services/bookmarks/src/main.rs && \
    echo "fn main() {}" > services/import/src/main.rs && \
    echo "fn main() {}" > services/search/src/main.rs && \
    echo "" > crates/domain/src/lib.rs && \
    echo "" > crates/shared/src/lib.rs

RUN cargo build --release

# Copy actual source
COPY crates crates
COPY services services

# Touch to force rebuild
RUN touch services/*/src/main.rs crates/*/src/lib.rs

# Build all services
RUN cargo build --release

# Runtime base
FROM alpine:3.19 AS runtime-base
RUN apk add --no-cache ca-certificates
RUN addgroup -g 1000 app && adduser -D -u 1000 -G app app

# Individual service images
FROM runtime-base AS gateway
COPY --from=builder /app/target/release/gateway /usr/local/bin/
USER app
EXPOSE 8080
CMD ["gateway"]

FROM runtime-base AS auth-service
COPY --from=builder /app/target/release/auth-service /usr/local/bin/
USER app
EXPOSE 8001
CMD ["auth-service"]

FROM runtime-base AS bookmarks-service
COPY --from=builder /app/target/release/bookmarks-service /usr/local/bin/
USER app
EXPOSE 8002
CMD ["bookmarks-service"]

FROM runtime-base AS import-service
COPY --from=builder /app/target/release/import-service /usr/local/bin/
USER app
EXPOSE 8003
CMD ["import-service"]

FROM runtime-base AS search-service
COPY --from=builder /app/target/release/search-service /usr/local/bin/
USER app
EXPOSE 8004
CMD ["search-service"]
EOF
}

# Create docker-compose for deployment
create_docker_compose() {
    cat > docker-compose.deploy.yml << EOF
version: '3.9'

services:
  gateway:
    image: ${REGISTRY}/${PROJECT}/gateway:${VERSION}
    ports:
      - "8080:8080"
    environment:
      - GATEWAY_HOST=0.0.0.0
      - GATEWAY_PORT=8080
      - AUTH_SERVICE_URL=http://auth:8001
      - BOOKMARKS_SERVICE_URL=http://bookmarks:8002
      - IMPORT_SERVICE_URL=http://import:8003
      - SEARCH_SERVICE_URL=http://search:8004
    depends_on:
      - auth
      - bookmarks
    networks:
      - bookmarks-net

  auth:
    image: ${REGISTRY}/${PROJECT}/auth:${VERSION}
    environment:
      - BOOKMARKS_DATABASE_URL=postgres://postgres:postgres@postgres:5432/bookmarks
      - BOOKMARKS_REDIS_URL=redis://redis:6379
      - BOOKMARKS_JWT_SECRET=\${JWT_SECRET}
      - BOOKMARKS_SERVER_PORT=8001
    depends_on:
      - postgres
      - redis
    networks:
      - bookmarks-net

  bookmarks:
    image: ${REGISTRY}/${PROJECT}/bookmarks:${VERSION}
    environment:
      - BOOKMARKS_DATABASE_URL=postgres://postgres:postgres@postgres:5432/bookmarks
      - BOOKMARKS_REDIS_URL=redis://redis:6379
      - BOOKMARKS_SERVER_PORT=8002
    depends_on:
      - postgres
      - redis
    networks:
      - bookmarks-net

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=bookmarks
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - bookmarks-net

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - bookmarks-net

networks:
  bookmarks-net:
    driver: bridge

volumes:
  postgres-data:
  redis-data:
EOF
}

# Menu
echo -e "${CYAN}Docker Build Options:${NC}"
echo "1) Build all services"
echo "2) Build specific service"
echo "3) Build and push to registry"
echo "4) Create Kubernetes manifests"
echo "5) Local Docker Compose deployment"
echo ""
read -p "Select option: " choice

case $choice in
    1)
        # Build all services
        create_workspace_dockerfile
        
        echo -e "${CYAN}Building all services with multi-stage build...${NC}"
        
        # Build each service target
        for service in gateway auth-service bookmarks-service import-service search-service; do
            docker build -f Dockerfile.workspace \
                --target $service \
                -t "${REGISTRY}/${PROJECT}/${service}:${VERSION}" \
                -t "${REGISTRY}/${PROJECT}/${service}:latest" .
                
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓ Built $service${NC}"
            else
                echo -e "${RED}✗ Failed to build $service${NC}"
            fi
        done
        
        echo -e "\n${CYAN}Docker images:${NC}"
        docker images | grep "${PROJECT}"
        ;;
    
    2)
        # Build specific service
        echo -e "${CYAN}Available services:${NC}"
        echo "1) gateway"
        echo "2) auth"
        echo "3) bookmarks"
        echo "4) import"
        echo "5) search"
        read -p "Select service: " service_choice
        
        case $service_choice in
            1) service="gateway" ;;
            2) service="auth-service" ;;
            3) service="bookmarks-service" ;;
            4) service="import-service" ;;
            5) service="search-service" ;;
            *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
        esac
        
        create_workspace_dockerfile
        docker build -f Dockerfile.workspace \
            --target $service \
            -t "${REGISTRY}/${PROJECT}/${service}:${VERSION}" \
            -t "${REGISTRY}/${PROJECT}/${service}:latest" .
        ;;
    
    3)
        # Build and push
        echo -e "${YELLOW}Registry: $REGISTRY${NC}"
        read -p "Continue? (y/N): " confirm
        
        if [ "$confirm" = "y" ]; then
            create_workspace_dockerfile
            
            for service in gateway auth-service bookmarks-service import-service search-service; do
                echo -e "\n${CYAN}Building and pushing $service...${NC}"
                
                docker build -f Dockerfile.workspace \
                    --target $service \
                    -t "${REGISTRY}/${PROJECT}/${service}:${VERSION}" \
                    -t "${REGISTRY}/${PROJECT}/${service}:latest" .
                
                if [ $? -eq 0 ]; then
                    docker push "${REGISTRY}/${PROJECT}/${service}:${VERSION}"
                    docker push "${REGISTRY}/${PROJECT}/${service}:latest"
                    echo -e "${GREEN}✓ Pushed $service${NC}"
                fi
            done
        fi
        ;;
    
    4)
        # Create K8s manifests
        echo -e "${CYAN}Creating Kubernetes manifests...${NC}"
        mkdir -p k8s-deploy
        
        # Create namespace
        cat > k8s-deploy/namespace.yaml << EOF
apiVersion: v1
kind: Namespace
metadata:
  name: bookmarks-platform
EOF
        
        # Create deployment for each service
        for service in gateway auth bookmarks; do
            cat > k8s-deploy/${service}-deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${service}
  namespace: bookmarks-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${service}
  template:
    metadata:
      labels:
        app: ${service}
    spec:
      containers:
      - name: ${service}
        image: ${REGISTRY}/${PROJECT}/${service}-service:${VERSION}
        ports:
        - containerPort: 8080
        env:
        - name: RUST_LOG
          value: info
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: ${service}
  namespace: bookmarks-platform
spec:
  selector:
    app: ${service}
  ports:
  - port: 80
    targetPort: 8080
EOF
        done
        
        echo -e "${GREEN}✓ Kubernetes manifests created in k8s-deploy/${NC}"
        ;;
    
    5)
        # Local deployment
        create_docker_compose
        
        echo -e "${CYAN}Starting local Docker Compose deployment...${NC}"
        docker-compose -f docker-compose.deploy.yml up -d
        
        echo -e "\n${CYAN}Services:${NC}"
        docker-compose -f docker-compose.deploy.yml ps
        ;;
esac

echo -e "\n${GREEN}Done!${NC}"