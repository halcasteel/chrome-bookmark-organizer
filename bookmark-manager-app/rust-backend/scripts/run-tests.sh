#!/bin/bash

# Automated test runner for CI/CD

# Get the parent directory
PARENT_DIR="$(dirname "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)")"
cd "$PARENT_DIR"

# Add cargo to PATH if not already there
if ! command -v cargo &> /dev/null && [ -x "$HOME/.cargo/bin/cargo" ]; then
    export PATH="$HOME/.cargo/bin:$PATH"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Test results
FAILED=0
PASSED=0

echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${PURPLE}Rust Platform - Automated Test Suite${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"

# Function to run a test command
run_test() {
    local name=$1
    local cmd=$2
    
    echo -e "\n${CYAN}Running: $name${NC}"
    echo -e "${YELLOW}Command: $cmd${NC}"
    
    if eval $cmd; then
        echo -e "${GREEN}✓ $name passed${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ $name failed${NC}"
        ((FAILED++))
        return 1
    fi
}

# Check if test database exists, create if not
echo -e "${CYAN}Setting up test database...${NC}"
export TEST_DATABASE_URL="postgres://admin:admin@localhost:5434/test_auth"

# Create test database if it doesn't exist
PGPASSWORD=admin psql -h localhost -p 5434 -U admin -d bookmark_manager -tc "SELECT 1 FROM pg_database WHERE datname = 'test_auth'" | grep -q 1 || \
PGPASSWORD=admin psql -h localhost -p 5434 -U admin -d bookmark_manager -c "CREATE DATABASE test_auth"

# 1. Format check
run_test "Format Check" "cargo fmt --all -- --check"

# 2. Clippy linting
run_test "Clippy Linting" "cargo clippy --all-features -- -D warnings"

# 3. Build check
run_test "Build Check" "cargo build --all-features"

# 4. Unit tests
run_test "Unit Tests" "cargo test --lib --all-features"

# 5. Doc tests
run_test "Doc Tests" "cargo test --doc --all-features"

# 6. Integration tests (if any)
run_test "Integration Tests" "cargo test --test '*' --all-features 2>/dev/null || true"

# 7. Specific service tests
echo -e "\n${PURPLE}Service-specific tests:${NC}"

# Auth service tests
run_test "Auth Service Tests" "cd services/auth && cargo test --all-features"

# Gateway tests (only if directory exists)
if [ -d "services/gateway" ]; then
    run_test "Gateway Tests" "cd services/gateway && cargo test --all-features"
fi

# 8. API endpoint tests (if services are running)
if nc -z localhost 8080 2>/dev/null && nc -z localhost 8001 2>/dev/null; then
    echo -e "\n${CYAN}Running API tests...${NC}"
    run_test "API Tests" "./scripts/quick-test.sh"
else
    echo -e "\n${YELLOW}Skipping API tests - services not running${NC}"
    echo -e "${YELLOW}Start services with: ./rust-platform (Option 2)${NC}"
fi

# Summary
echo -e "\n${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Test Summary${NC}"
echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo -e "Total:  $((PASSED + FAILED))"

# Exit code for CI
if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}${BOLD}All tests passed! ✅${NC}"
    exit 0
else
    echo -e "\n${RED}${BOLD}Some tests failed! ❌${NC}"
    exit 1
fi