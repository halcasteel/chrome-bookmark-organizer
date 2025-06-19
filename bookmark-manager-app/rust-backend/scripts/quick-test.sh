#!/bin/bash

# Quick API testing script

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

# Test configuration
GATEWAY_URL="http://localhost:8080"
AUTH_URL="http://localhost:8001"
TEST_EMAIL="test$(date +%s)@az1.ai"
TEST_PASSWORD="TestPassword123!"

echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Quick API Test Suite${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"

# Function to check if service is running
check_service() {
    local name=$1
    local port=$2
    
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✓ $name is running on port $port${NC}"
        return 0
    else
        echo -e "${RED}✗ $name is not running on port $port${NC}"
        return 1
    fi
}

# Function to test endpoint
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    local expected_status=$5
    local auth_token=$6
    
    echo -ne "${YELLOW}Testing $name...${NC} "
    
    # Build curl command
    local curl_cmd="curl -s -w '\n%{http_code}' -X $method $url"
    
    if [ ! -z "$data" ]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    
    if [ ! -z "$auth_token" ]; then
        curl_cmd="$curl_cmd -H 'Authorization: Bearer $auth_token'"
    fi
    
    # Execute curl
    local response=$(eval $curl_cmd)
    local status_code=$(echo "$response" | tail -1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ (Status: $status_code)${NC}"
        if [ ! -z "$body" ] && command -v jq &> /dev/null; then
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        fi
        return 0
    else
        echo -e "${RED}✗ (Expected: $expected_status, Got: $status_code)${NC}"
        if [ ! -z "$body" ]; then
            echo -e "${RED}Response: $body${NC}"
        fi
        return 1
    fi
}

# Check services
echo -e "${CYAN}Checking services...${NC}"
services_ok=true

check_service "Gateway" 8080 || services_ok=false
check_service "Auth Service" 8001 || services_ok=false
check_service "PostgreSQL" 5434 || services_ok=false
check_service "Redis" 6382 || services_ok=false

if [ "$services_ok" = false ]; then
    echo -e "${RED}Some services are not running. Please start them first.${NC}"
    exit 1
fi

echo ""
echo -e "${CYAN}Running API tests...${NC}"
echo ""

# Test health endpoints
echo -e "${PURPLE}1. Health Checks${NC}"
test_endpoint "Gateway Health" "GET" "$GATEWAY_URL/health" "" "200"
test_endpoint "Auth Health" "GET" "$AUTH_URL/health" "" "200"

echo ""
echo -e "${PURPLE}2. Authentication Flow${NC}"

# Register user
register_response=$(curl -s -X POST $GATEWAY_URL/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

if echo "$register_response" | grep -q "token"; then
    echo -e "${GREEN}✓ Registration successful${NC}"
    TOKEN=$(echo "$register_response" | jq -r '.token' 2>/dev/null || echo "")
    
    if [ ! -z "$TOKEN" ]; then
        echo -e "${CYAN}Token received: ${TOKEN:0:20}...${NC}"
    fi
else
    echo -e "${RED}✗ Registration failed${NC}"
    echo "$register_response"
fi

# Login test
echo ""
login_response=$(curl -s -X POST $GATEWAY_URL/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

if echo "$login_response" | grep -q "token"; then
    echo -e "${GREEN}✓ Login successful${NC}"
    TOKEN=$(echo "$login_response" | jq -r '.token' 2>/dev/null || echo "")
else
    echo -e "${RED}✗ Login failed${NC}"
    echo "$login_response"
fi

# Test authenticated endpoint
if [ ! -z "$TOKEN" ]; then
    echo ""
    echo -e "${PURPLE}3. Authenticated Endpoints${NC}"
    test_endpoint "Get Current User" "GET" "$GATEWAY_URL/api/auth/me" "" "200" "$TOKEN"
fi

echo ""
echo -e "${PURPLE}4. Performance Check${NC}"

# Simple performance test
if command -v ab &> /dev/null; then
    echo -e "${CYAN}Running quick performance test (100 requests)...${NC}"
    ab -n 100 -c 10 -q $GATEWAY_URL/health 2>&1 | grep -E "Requests per second:|Time per request:|Transfer rate:"
elif command -v wrk &> /dev/null; then
    echo -e "${CYAN}Running quick performance test (2 seconds)...${NC}"
    wrk -t2 -c10 -d2s --latency $GATEWAY_URL/health
else
    echo -e "${YELLOW}Install 'ab' or 'wrk' for performance testing${NC}"
fi

echo ""
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Test suite completed!${NC}"