#!/bin/bash
# Setup hybrid logging with PostgreSQL and Elasticsearch

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Setting up hybrid logging system...${NC}"

# Function to check if service is running
check_service() {
    local service=$1
    local port=$2
    nc -z localhost $port 2>/dev/null
}

# 1. Start Elasticsearch and Kibana
echo -e "${YELLOW}Starting Elasticsearch and Kibana...${NC}"
docker-compose -f docker-compose.elastic.yml up -d

# Wait for Elasticsearch to be ready
echo -e "${YELLOW}Waiting for Elasticsearch to be ready...${NC}"
for i in {1..30}; do
    if check_service "elasticsearch" 9200; then
        echo -e "${GREEN}Elasticsearch is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# 2. Create Elasticsearch index template
echo -e "${YELLOW}Creating Elasticsearch index template...${NC}"
curl -X PUT "localhost:9200/_index_template/bookmark-logs" \
  -H 'Content-Type: application/json' \
  -d '{
    "index_patterns": ["bookmark-logs-*", "bookmark-errors-*"],
    "template": {
      "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "index.lifecycle.name": "bookmark-logs-policy",
        "index.lifecycle.rollover_alias": "bookmark-logs"
      },
      "mappings": {
        "properties": {
          "timestamp": { "type": "date" },
          "level": { "type": "keyword" },
          "service": { "type": "keyword" },
          "message": { 
            "type": "text",
            "fields": {
              "keyword": { "type": "keyword" }
            }
          },
          "correlation_id": { "type": "keyword" },
          "request_id": { "type": "keyword" },
          "user_id": { "type": "keyword" },
          "hostname": { "type": "keyword" },
          "severity": { "type": "keyword" },
          "error_details": { "type": "object" },
          "performance_metrics": { "type": "object" }
        }
      }
    }
  }'

# 3. Create index lifecycle policy (30-day retention)
echo -e "${YELLOW}Creating index lifecycle policy...${NC}"
curl -X PUT "localhost:9200/_ilm/policy/bookmark-logs-policy" \
  -H 'Content-Type: application/json' \
  -d '{
    "policy": {
      "phases": {
        "hot": {
          "actions": {
            "rollover": {
              "max_size": "5GB",
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
  }'

# 4. Build and start log-writer service
echo -e "${YELLOW}Building log-writer service...${NC}"
cd rust-backend/services/log-writer
cargo build --release
cd ../../..

# Start log-writer
echo -e "${YELLOW}Starting log-writer service...${NC}"
./rust-backend/target/release/log-writer > logs/log-writer.log 2>&1 &
LOG_WRITER_PID=$!
echo "Log-writer started with PID: $LOG_WRITER_PID"

# Wait for log-writer to be ready
sleep 3
if check_service "log-writer" 8688; then
    echo -e "${GREEN}Log-writer is ready!${NC}"
else
    echo -e "${RED}Log-writer failed to start!${NC}"
    exit 1
fi

# 5. Stop existing Vector if running
if pgrep -x "vector" > /dev/null; then
    echo -e "${YELLOW}Stopping existing Vector instance...${NC}"
    pkill -x vector
    sleep 2
fi

# 6. Start Vector with hybrid configuration
echo -e "${YELLOW}Starting Vector with hybrid configuration...${NC}"
vector --config vector-hybrid.toml > logs/vector.log 2>&1 &
VECTOR_PID=$!
echo "Vector started with PID: $VECTOR_PID"

# Wait for Vector to be ready
sleep 3
if check_service "vector" 8686; then
    echo -e "${GREEN}Vector is ready!${NC}"
else
    echo -e "${RED}Vector failed to start!${NC}"
    exit 1
fi

# 7. Create Kibana dashboards
echo -e "${YELLOW}Waiting for Kibana to be ready...${NC}"
for i in {1..30}; do
    if check_service "kibana" 5601; then
        echo -e "${GREEN}Kibana is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

# 8. Test the setup
echo -e "${YELLOW}Testing the logging pipeline...${NC}"

# Send a test log via HTTP
curl -X POST http://localhost:8687/logs \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "level": "INFO",
    "service": "test",
    "message": "Hybrid logging system test",
    "correlation_id": "test-123"
  }'

# Summary
echo -e "${GREEN}=== Hybrid Logging System Setup Complete ===${NC}"
echo ""
echo "Services running:"
echo "  - Elasticsearch: http://localhost:9200"
echo "  - Kibana: http://localhost:5601"
echo "  - Log Writer: http://localhost:8688/health"
echo "  - Vector API: http://localhost:8686"
echo "  - Vector Logs Input: http://localhost:8687/logs"
echo ""
echo "Log files:"
echo "  - Unified: logs/unified.log"
echo "  - Structured: logs/structured/*.json"
echo "  - PostgreSQL: application_logs table"
echo "  - Elasticsearch: bookmark-logs-* indices"
echo ""
echo "To view logs in Kibana:"
echo "  1. Open http://localhost:5601"
echo "  2. Go to Analytics > Discover"
echo "  3. Create index pattern: bookmark-logs-*"
echo ""
echo "To stop all services:"
echo "  pkill vector"
echo "  pkill log-writer"
echo "  docker-compose -f docker-compose.elastic.yml down"