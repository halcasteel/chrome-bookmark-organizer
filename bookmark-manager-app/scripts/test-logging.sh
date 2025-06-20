#!/bin/bash
# Test the unified logging system

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Testing Unified Logging System${NC}"
echo ""

# 1. Test frontend logging endpoint
echo -e "${YELLOW}1. Testing frontend logging endpoint...${NC}"
curl -X POST http://localhost:8687/logs \
  -H "Content-Type: application/json" \
  -d '[{
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "level": "INFO",
    "message": "Test log from frontend",
    "service": "frontend",
    "environment": "test",
    "url": "http://localhost:5173/test",
    "userAgent": "test-script",
    "context": {
      "test": true,
      "source": "test-script"
    }
  }]' || echo -e "${RED}Frontend endpoint not available${NC}"

echo ""

# 2. Test Rust service logging
echo -e "${YELLOW}2. Testing Rust service logging...${NC}"
echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","level":"INFO","service":"test-service","target":"test","message":"Test log from Rust","correlation_id":"test-123","fields":{"test":true}}' >> /tmp/rust-services.log

# 3. Check Vector API
echo -e "${YELLOW}3. Checking Vector API health...${NC}"
curl -s http://localhost:8686/health | jq '.' || echo -e "${RED}Vector API not available${NC}"

echo ""

# 4. Check log files
echo -e "${YELLOW}4. Checking log files...${NC}"
if [ -f "logs/unified.log" ]; then
    echo -e "${GREEN}✓ Unified log exists${NC}"
    echo "Latest entries:"
    tail -5 logs/unified.log | sed 's/^/  /'
else
    echo -e "${RED}✗ Unified log not found${NC}"
fi

echo ""

if [ -f "logs/structured/all.json" ]; then
    echo -e "${GREEN}✓ Structured log exists${NC}"
    echo "Latest entry:"
    tail -1 logs/structured/all.json | jq '.' | head -10 | sed 's/^/  /'
else
    echo -e "${RED}✗ Structured log not found${NC}"
fi

echo ""

# 5. Test database logging
echo -e "${YELLOW}5. Testing database log query...${NC}"
PGPASSWORD=admin psql -h localhost -p 5434 -U admin -d bookmark_manager -c "
SELECT COUNT(*) as log_count, 
       MAX(timestamp) as latest_log,
       array_agg(DISTINCT service) as services
FROM application_logs
WHERE timestamp > NOW() - INTERVAL '1 hour';
" || echo -e "${RED}Database query failed${NC}"

echo ""
echo -e "${GREEN}Logging system test complete!${NC}"