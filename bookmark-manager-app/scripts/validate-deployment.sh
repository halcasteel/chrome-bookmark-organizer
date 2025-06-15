#!/bin/bash

# Deployment validation script
# This script checks that all required configurations are in place for GCP deployment

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔍 Validating deployment configuration..."
echo ""

# Check environment variables
check_env() {
    local var_name=$1
    local var_value="${!var_name}"
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}❌ $var_name is not set${NC}"
        return 1
    else
        echo -e "${GREEN}✅ $var_name is set${NC}"
        return 0
    fi
}

# Check file existence
check_file() {
    local file_path=$1
    
    if [ -f "$file_path" ]; then
        echo -e "${GREEN}✅ $file_path exists${NC}"
        return 0
    else
        echo -e "${RED}❌ $file_path not found${NC}"
        return 1
    fi
}

# Check Docker images can be built
check_docker_build() {
    local context=$1
    local dockerfile=$2
    
    echo -n "🔨 Testing Docker build for $context... "
    if docker build -t test-build-$context -f $dockerfile $context --target production > /dev/null 2>&1; then
        echo -e "${GREEN}OK${NC}"
        docker rmi test-build-$context > /dev/null 2>&1
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

errors=0

echo "1️⃣ Checking environment variables..."
check_env "PROJECT_ID" || ((errors++))
check_env "REGION" || ((errors++))
check_env "DATABASE_PASSWORD" || ((errors++))
check_env "JWT_SECRET" || ((errors++))
echo ""

echo "2️⃣ Checking required files..."
check_file "backend/Dockerfile" || ((errors++))
check_file "frontend/Dockerfile" || ((errors++))
check_file "cloudbuild.yaml" || ((errors++))
check_file "docker-compose.yml" || ((errors++))
echo ""

echo "3️⃣ Checking Docker builds..."
check_docker_build "backend" "backend/Dockerfile" || ((errors++))
check_docker_build "frontend" "frontend/Dockerfile" || ((errors++))
echo ""

echo "4️⃣ Checking port configurations..."
if grep -q "EXPOSE 3001" backend/Dockerfile; then
    echo -e "${GREEN}✅ Backend exposes port 3001${NC}"
else
    echo -e "${RED}❌ Backend doesn't expose port 3001${NC}"
    ((errors++))
fi

if grep -q "EXPOSE 80" frontend/Dockerfile; then
    echo -e "${GREEN}✅ Frontend exposes port 80${NC}"
else
    echo -e "${RED}❌ Frontend doesn't expose port 80${NC}"
    ((errors++))
fi
echo ""

echo "5️⃣ Checking CORS configuration..."
if grep -q "CORS_ORIGIN" backend/src/index.js; then
    echo -e "${GREEN}✅ CORS configuration found in backend${NC}"
else
    echo -e "${YELLOW}⚠️  CORS configuration might need review${NC}"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready for deployment.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run: ./deploy.sh"
    echo "2. Monitor the Cloud Build logs"
    echo "3. Test the deployed application"
else
    echo -e "${RED}❌ Found $errors issue(s). Please fix before deploying.${NC}"
    exit 1
fi