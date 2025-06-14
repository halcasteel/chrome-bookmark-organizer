#!/bin/bash

echo "🔍 Running comprehensive linting and formatting checks..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
OVERALL_STATUS=0

# Function to check command existence
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 not found. Please install it first.${NC}"
        exit 1
    fi
}

# Check required tools
echo "Checking required tools..."
check_command npm
check_command node

# Backend linting
echo -e "\n${YELLOW}Backend Linting & Formatting${NC}"
echo "==============================="
cd backend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# ESLint check
echo -e "\n📝 Running ESLint..."
npm run lint:check
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ ESLint passed${NC}"
else
    echo -e "${RED}❌ ESLint failed${NC}"
    OVERALL_STATUS=1
fi

# Prettier check
echo -e "\n🎨 Running Prettier..."
npm run format:check
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Prettier passed${NC}"
else
    echo -e "${RED}❌ Prettier failed${NC}"
    OVERALL_STATUS=1
fi

# Frontend linting
echo -e "\n${YELLOW}Frontend Linting & Formatting${NC}"
echo "================================"
cd ../frontend

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# TypeScript check
echo -e "\n📘 Running TypeScript type check..."
npx tsc --noEmit
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ TypeScript passed${NC}"
else
    echo -e "${RED}❌ TypeScript failed${NC}"
    OVERALL_STATUS=1
fi

# ESLint check
echo -e "\n📝 Running ESLint..."
npm run lint
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ ESLint passed${NC}"
else
    echo -e "${RED}❌ ESLint failed${NC}"
    OVERALL_STATUS=1
fi

# Check for console.log statements
echo -e "\n🔍 Checking for console.log statements..."
CONSOLE_LOGS=$(grep -r "console\.log" src --exclude-dir=node_modules --exclude="*.test.*" | wc -l)
if [ $CONSOLE_LOGS -eq 0 ]; then
    echo -e "${GREEN}✅ No console.log statements found${NC}"
else
    echo -e "${YELLOW}⚠️  Found $CONSOLE_LOGS console.log statements${NC}"
    grep -r "console\.log" src --exclude-dir=node_modules --exclude="*.test.*" | head -5
    if [ $CONSOLE_LOGS -gt 5 ]; then
        echo "... and $(($CONSOLE_LOGS - 5)) more"
    fi
fi

# Check for TODO comments
echo -e "\n📋 Checking for TODO comments..."
cd ..
TODO_COUNT=$(grep -r "TODO\|FIXME\|HACK" --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" . | wc -l)
if [ $TODO_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ No TODO comments found${NC}"
else
    echo -e "${YELLOW}📌 Found $TODO_COUNT TODO/FIXME/HACK comments${NC}"
    grep -r "TODO\|FIXME\|HACK" --exclude-dir=node_modules --exclude-dir=.git --exclude="*.md" . | head -5
    if [ $TODO_COUNT -gt 5 ]; then
        echo "... and $(($TODO_COUNT - 5)) more"
    fi
fi

# Security check
echo -e "\n🔒 Running security audit..."
echo "Backend:"
cd backend && npm audit --production
cd ..
echo -e "\nFrontend:"
cd frontend && npm audit --production
cd ..

# Summary
echo -e "\n${YELLOW}Summary${NC}"
echo "========"
if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
else
    echo -e "${RED}❌ Some checks failed. Please fix the issues above.${NC}"
fi

# Offer to fix automatically
if [ $OVERALL_STATUS -ne 0 ]; then
    echo -e "\n${YELLOW}Would you like to automatically fix formatting issues? (y/n)${NC}"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Running automatic fixes..."
        cd backend && npm run lint && npm run format
        cd ../frontend && npm run lint -- --fix
        echo -e "${GREEN}✅ Automatic fixes applied. Please review the changes.${NC}"
    fi
fi

exit $OVERALL_STATUS