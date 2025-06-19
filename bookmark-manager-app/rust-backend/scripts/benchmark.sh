#!/bin/bash

# Performance benchmarking script

# Get the parent directory
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Default values
DURATION="30s"
THREADS=4
CONNECTIONS=100
TARGET_URL="http://localhost:8080/health"

echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Performance Benchmark Suite${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"

# Function to check tool availability
check_tool() {
    local tool=$1
    if command -v $tool &> /dev/null; then
        echo -e "${GREEN}✓ $tool is available${NC}"
        return 0
    else
        echo -e "${RED}✗ $tool is not installed${NC}"
        return 1
    fi
}

# Function to run wrk benchmark
run_wrk_benchmark() {
    local name=$1
    local url=$2
    local script=$3
    
    echo -e "\n${CYAN}Running benchmark: $name${NC}"
    echo -e "${YELLOW}URL: $url${NC}"
    echo -e "${YELLOW}Duration: $DURATION, Threads: $THREADS, Connections: $CONNECTIONS${NC}\n"
    
    if [ -z "$script" ]; then
        wrk -t$THREADS -c$CONNECTIONS -d$DURATION --latency $url
    else
        wrk -t$THREADS -c$CONNECTIONS -d$DURATION --latency -s $script $url
    fi
}

# Check for benchmarking tools
echo -e "${CYAN}Checking benchmark tools...${NC}"
has_wrk=$(check_tool "wrk")
has_ab=$(check_tool "ab")
has_hey=$(check_tool "hey")

if [ $has_wrk -eq 1 ] && [ $has_ab -eq 1 ] && [ $has_hey -eq 1 ]; then
    echo -e "\n${RED}No benchmarking tools found!${NC}"
    echo -e "${YELLOW}Install one of the following:${NC}"
    echo -e "  - wrk:    ${CYAN}sudo apt install wrk${NC}"
    echo -e "  - ab:     ${CYAN}sudo apt install apache2-utils${NC}"
    echo -e "  - hey:    ${CYAN}go install github.com/rakyll/hey@latest${NC}"
    exit 1
fi

# Check if services are running
echo -e "\n${CYAN}Checking services...${NC}"
if ! nc -z localhost 8080 2>/dev/null; then
    echo -e "${RED}Gateway is not running on port 8080${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Gateway is running${NC}"

# Menu
echo -e "\n${CYAN}Select benchmark type:${NC}"
echo "1) Quick benchmark (30 seconds)"
echo "2) Extended benchmark (2 minutes)"
echo "3) Stress test (5 minutes, high load)"
echo "4) Custom benchmark"
echo "5) Compare endpoints"
echo ""
read -p "Select option (1-5): " choice

case $choice in
    1)
        # Quick benchmark
        if [ $has_wrk -eq 0 ]; then
            run_wrk_benchmark "Quick Health Check" "$TARGET_URL"
        elif [ $has_hey -eq 0 ]; then
            echo -e "\n${CYAN}Running quick benchmark with hey...${NC}"
            hey -z 30s -c 100 -m GET $TARGET_URL
        else
            echo -e "\n${CYAN}Running quick benchmark with ab...${NC}"
            ab -t 30 -c 100 -k $TARGET_URL
        fi
        ;;
    
    2)
        # Extended benchmark
        DURATION="2m"
        if [ $has_wrk -eq 0 ]; then
            run_wrk_benchmark "Extended Health Check" "$TARGET_URL"
        elif [ $has_hey -eq 0 ]; then
            hey -z 2m -c 100 -m GET $TARGET_URL
        else
            ab -t 120 -c 100 -k $TARGET_URL
        fi
        ;;
    
    3)
        # Stress test
        DURATION="5m"
        CONNECTIONS=500
        echo -e "\n${RED}${BOLD}WARNING: This will generate high load!${NC}"
        read -p "Continue? (y/N): " confirm
        if [ "$confirm" = "y" ]; then
            if [ $has_wrk -eq 0 ]; then
                run_wrk_benchmark "Stress Test" "$TARGET_URL"
            elif [ $has_hey -eq 0 ]; then
                hey -z 5m -c 500 -m GET $TARGET_URL
            else
                ab -t 300 -c 500 -k $TARGET_URL
            fi
        fi
        ;;
    
    4)
        # Custom benchmark
        read -p "Enter URL (default: $TARGET_URL): " custom_url
        custom_url=${custom_url:-$TARGET_URL}
        
        read -p "Duration (default: 30s): " custom_duration
        DURATION=${custom_duration:-30s}
        
        read -p "Connections (default: 100): " custom_conn
        CONNECTIONS=${custom_conn:-100}
        
        if [ $has_wrk -eq 0 ]; then
            run_wrk_benchmark "Custom Benchmark" "$custom_url"
        elif [ $has_hey -eq 0 ]; then
            hey -z $DURATION -c $CONNECTIONS -m GET $custom_url
        else
            duration_seconds=$(echo $DURATION | sed 's/[^0-9]*//g')
            ab -t $duration_seconds -c $CONNECTIONS -k $custom_url
        fi
        ;;
    
    5)
        # Compare endpoints
        echo -e "\n${CYAN}Comparing different endpoints...${NC}"
        
        endpoints=(
            "http://localhost:8080/health:Gateway Health"
            "http://localhost:8001/health:Auth Health Direct"
            "http://localhost:8080/api/auth/login:Login Endpoint"
        )
        
        mkdir -p benchmark-results
        timestamp=$(date +%Y%m%d_%H%M%S)
        
        for endpoint in "${endpoints[@]}"; do
            IFS=':' read -r url name <<< "$endpoint"
            echo -e "\n${PURPLE}Testing: $name${NC}"
            
            if [ $has_wrk -eq 0 ]; then
                wrk -t2 -c50 -d15s --latency $url > "benchmark-results/${timestamp}_${name// /_}.txt"
                tail -20 "benchmark-results/${timestamp}_${name// /_}.txt"
            elif [ $has_hey -eq 0 ]; then
                hey -z 15s -c 50 -m GET $url > "benchmark-results/${timestamp}_${name// /_}.txt"
                tail -20 "benchmark-results/${timestamp}_${name// /_}.txt"
            fi
            
            sleep 2
        done
        
        echo -e "\n${GREEN}Results saved in benchmark-results/${NC}"
        ;;
esac

# Create a Lua script for authenticated requests benchmark
cat > benchmark-auth.lua << 'EOF'
-- Authenticated requests benchmark script
token = nil
counter = 0

request = function()
    if counter == 0 then
        -- First request: login
        wrk.method = "POST"
        wrk.headers["Content-Type"] = "application/json"
        wrk.body = '{"email":"test@az1.ai","password":"password123"}'
        path = "/api/auth/login"
    else
        -- Subsequent requests: authenticated endpoint
        wrk.method = "GET"
        if token then
            wrk.headers["Authorization"] = "Bearer " .. token
        end
        path = "/api/auth/me"
    end
    
    counter = counter + 1
    return wrk.format(nil, path)
end

response = function(status, headers, body)
    if counter == 1 and status == 200 then
        -- Extract token from login response
        local json = require "json"
        local data = json.decode(body)
        if data and data.token then
            token = data.token
        end
    end
end
EOF

echo -e "\n${CYAN}Benchmark complete!${NC}"
echo -e "${YELLOW}Tip: For authenticated endpoint testing, use:${NC}"
echo -e "${GREEN}wrk -t2 -c50 -d30s -s benchmark-auth.lua http://localhost:8080${NC}"