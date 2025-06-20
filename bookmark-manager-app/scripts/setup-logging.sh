#!/bin/bash

# Setup script for dual storage logging architecture
set -e

echo "Setting up dual storage logging architecture..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from the correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from bookmark-manager-app directory${NC}"
    exit 1
fi

# Function to check if a service is running
check_service() {
    local service=$1
    local port=$2
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✓ $service is running on port $port${NC}"
        return 0
    else
        echo -e "${RED}✗ $service is not running on port $port${NC}"
        return 1
    fi
}

# Step 1: Create Docker network if not exists
echo -e "\n${YELLOW}Step 1: Creating Docker network...${NC}"
docker network create bookmark-network 2>/dev/null || echo "Network already exists"

# Step 2: Start Elasticsearch stack
echo -e "\n${YELLOW}Step 2: Starting Elasticsearch stack...${NC}"
if [ -f "docker-compose.elasticsearch.yml" ]; then
    docker-compose -f docker-compose.elasticsearch.yml up -d
    echo "Waiting for Elasticsearch to start..."
    sleep 30
    check_service "Elasticsearch" 9200
    check_service "Kibana" 5601
else
    echo -e "${RED}Error: docker-compose.elasticsearch.yml not found${NC}"
    exit 1
fi

# Step 3: Build log writer service
echo -e "\n${YELLOW}Step 3: Building log writer service...${NC}"
if [ -d "rust-migration/log-writer-service" ]; then
    cd rust-migration/log-writer-service
    cargo build --release
    cd ../..
    echo -e "${GREEN}✓ Log writer service built${NC}"
else
    echo -e "${RED}Error: log-writer-service directory not found${NC}"
    exit 1
fi

# Step 4: Start log writer service
echo -e "\n${YELLOW}Step 4: Starting log writer service...${NC}"
if [ -f "rust-migration/log-writer-service/target/release/log-writer-service" ]; then
    # Kill existing process if running
    pkill -f log-writer-service || true
    
    # Start in background
    DATABASE_URL="postgres://postgres:postgres@localhost:5434/bookmark_manager" \
        ./rust-migration/log-writer-service/target/release/log-writer-service > logs/log-writer.log 2>&1 &
    
    echo "Log writer service PID: $!"
    sleep 2
    check_service "Log writer service" 8688
else
    echo -e "${RED}Error: log-writer-service binary not found${NC}"
    exit 1
fi

# Step 5: Configure Elasticsearch
echo -e "\n${YELLOW}Step 5: Configuring Elasticsearch...${NC}"

# Create index template
curl -X PUT "localhost:9200/_index_template/logs_template" -H 'Content-Type: application/json' -d'
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "logs_policy"
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "level": { "type": "keyword" },
        "service": { "type": "keyword" },
        "message": { "type": "text" },
        "correlation_id": { "type": "keyword" },
        "user_id": { "type": "keyword" },
        "fields": { "type": "object" },
        "error_details": { "type": "object" },
        "performance_metrics": { "type": "object" },
        "tags": { "type": "keyword" },
        "ai_analysis": { "type": "object" }
      }
    }
  }
}' 2>/dev/null && echo -e "${GREEN}✓ Index template created${NC}" || echo -e "${YELLOW}! Index template may already exist${NC}"

# Create lifecycle policy
curl -X PUT "localhost:9200/_ilm/policy/logs_policy" -H 'Content-Type: application/json' -d'
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "50GB",
            "max_age": "7d"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}' 2>/dev/null && echo -e "${GREEN}✓ Lifecycle policy created${NC}" || echo -e "${YELLOW}! Lifecycle policy may already exist${NC}"

# Step 6: Update Vector configuration
echo -e "\n${YELLOW}Step 6: Updating Vector configuration...${NC}"
if [ -f "vector-enhanced.toml" ]; then
    cp vector.toml vector.toml.backup
    cp vector-enhanced.toml vector.toml
    echo -e "${GREEN}✓ Vector configuration updated${NC}"
    echo -e "${YELLOW}! Please restart Vector manually to apply changes${NC}"
else
    echo -e "${RED}Error: vector-enhanced.toml not found${NC}"
fi

# Step 7: Create necessary directories
echo -e "\n${YELLOW}Step 7: Creating directories...${NC}"
mkdir -p logs/backup
mkdir -p logs/structured
echo -e "${GREEN}✓ Log directories created${NC}"

# Final status check
echo -e "\n${YELLOW}=== Status Check ===${NC}"
check_service "PostgreSQL" 5434
check_service "Elasticsearch" 9200
check_service "Kibana" 5601
check_service "Log writer service" 8688

echo -e "\n${GREEN}=== Setup Complete ===${NC}"
echo -e "Kibana is available at: ${YELLOW}http://localhost:5601${NC}"
echo -e "Elasticsearch is available at: ${YELLOW}http://localhost:9200${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Restart Vector: docker restart bookmark-vector (or systemctl restart vector)"
echo "2. Start your Rust services"
echo "3. Monitor logs in Kibana"
echo "4. Check PostgreSQL logs: psql -h localhost -p 5434 -U postgres -d bookmark_manager -c 'SELECT * FROM application_logs ORDER BY timestamp DESC LIMIT 10;'"