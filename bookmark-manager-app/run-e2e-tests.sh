#!/bin/bash

# E2E Test Runner Script
# ======================
# This script runs the Playwright E2E tests with proper setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                        E2E TEST RUNNER                                 ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        exit 1
    fi
}

# 1. Check if services are running
echo -e "${BLUE}1. Checking services...${NC}"

# Check backend
if curl -f -s http://localhost:3001/health > /dev/null; then
    print_status 0 "Backend is running"
else
    echo -e "${YELLOW}⚠${NC} Backend not running. Starting services..."
    node start-services.js &
    
    # Wait for services to start
    sleep 10
    
    if curl -f -s http://localhost:3001/health > /dev/null; then
        print_status 0 "Backend started successfully"
    else
        print_status 1 "Failed to start backend"
    fi
fi

# Check frontend
if curl -f -s http://localhost:5173 > /dev/null; then
    print_status 0 "Frontend is running"
else
    print_status 1 "Frontend not running"
fi

# 2. Install Playwright if needed
echo -e "\n${BLUE}2. Checking Playwright installation...${NC}"

if [ ! -d "node_modules/@playwright" ]; then
    echo "Installing Playwright..."
    npm install @playwright/test
    print_status $? "Playwright installed"
fi

# Install browsers if needed
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "Installing Playwright browsers..."
    npx playwright install
    print_status $? "Browsers installed"
else
    print_status 0 "Playwright browsers already installed"
fi

# 3. Run tests based on arguments
echo -e "\n${BLUE}3. Running E2E tests...${NC}"

case "$1" in
    "headed")
        echo "Running tests in headed mode..."
        npm run test:headed
        ;;
    "ui")
        echo "Opening Playwright UI..."
        npm run test:ui
        ;;
    "debug")
        echo "Running tests in debug mode..."
        npm run test:debug
        ;;
    "specific")
        if [ -z "$2" ]; then
            echo -e "${RED}Error: Please specify a test file${NC}"
            echo "Usage: ./run-e2e-tests.sh specific <test-file>"
            exit 1
        fi
        echo "Running specific test: $2"
        npx playwright test "$2"
        ;;
    "performance")
        echo "Running performance tests only..."
        npx playwright test performance.spec.js
        ;;
    "auth")
        echo "Running authentication tests only..."
        npx playwright test auth.spec.js
        ;;
    "admin")
        echo "Running admin dashboard tests only..."
        npx playwright test admin-dashboard.spec.js
        ;;
    "report")
        echo "Opening last test report..."
        npm run test:report
        ;;
    *)
        echo "Running all tests in headless mode..."
        npm test
        ;;
esac

# 4. Show results
echo -e "\n${BLUE}4. Test Results${NC}"

if [ -f "test-results/results.json" ]; then
    # Parse and display test results
    TOTAL=$(jq '.suites | length' test-results/results.json 2>/dev/null || echo "0")
    echo -e "Total test suites: ${TOTAL}"
fi

# Check if HTML report exists
if [ -d "playwright-report" ]; then
    echo -e "\n${GREEN}HTML report generated successfully!${NC}"
    echo "To view the report, run: npm run test:report"
fi

# Show any test failures
if [ -d "test-results" ] && [ "$(ls -A test-results/*.webm 2>/dev/null)" ]; then
    echo -e "\n${YELLOW}Video recordings available for failed tests:${NC}"
    ls -la test-results/*.webm
fi

echo -e "\n${BLUE}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                        TEST RUN COMPLETE                               ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════╝${NC}"

# Usage instructions
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo -e "\nUsage: ./run-e2e-tests.sh [mode]"
    echo -e "\nModes:"
    echo -e "  ${GREEN}(no args)${NC}    - Run all tests in headless mode"
    echo -e "  ${GREEN}headed${NC}       - Run tests with browser visible"
    echo -e "  ${GREEN}ui${NC}           - Open Playwright test UI"
    echo -e "  ${GREEN}debug${NC}        - Run tests in debug mode"
    echo -e "  ${GREEN}specific${NC}     - Run a specific test file"
    echo -e "  ${GREEN}performance${NC}  - Run performance tests only"
    echo -e "  ${GREEN}auth${NC}         - Run authentication tests only"
    echo -e "  ${GREEN}admin${NC}        - Run admin dashboard tests only"
    echo -e "  ${GREEN}report${NC}       - Open the last test report"
    echo -e "\nExamples:"
    echo -e "  ./run-e2e-tests.sh"
    echo -e "  ./run-e2e-tests.sh headed"
    echo -e "  ./run-e2e-tests.sh specific tests/e2e/auth.spec.js"
fi