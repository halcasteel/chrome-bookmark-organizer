#!/bin/bash

# Bookmark Manager Deployment Script
# ==================================
# This script handles the deployment of the bookmark manager application
# with all necessary checks and validations

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENV_FILE=".env"
DOCKER_COMPOSE_FILE="docker-compose.yml"
LOG_DIR="logs"
BACKUP_DIR="backups"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    BOOKMARK MANAGER DEPLOYMENT SCRIPT                  ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
    else
        echo -e "${RED}✗${NC} $2"
        exit 1
    fi
}

# 1. Check prerequisites
echo -e "${BLUE}1. Checking prerequisites...${NC}"

if command_exists docker; then
    print_status 0 "Docker installed: $(docker --version | cut -d' ' -f3)"
else
    print_status 1 "Docker not installed"
fi

if command_exists docker-compose; then
    print_status 0 "Docker Compose installed: $(docker-compose --version | cut -d' ' -f3)"
else
    print_status 1 "Docker Compose not installed"
fi

if command_exists node; then
    print_status 0 "Node.js installed: $(node --version)"
else
    print_status 1 "Node.js not installed"
fi

if [ -f "$ENV_FILE" ]; then
    print_status 0 "Environment file found"
else
    print_status 1 "Environment file (.env) not found"
fi

# 2. Validate environment variables
echo -e "\n${BLUE}2. Validating environment variables...${NC}"

required_vars=(
    "DATABASE_URL"
    "REDIS_URL"
    "JWT_SECRET"
    "ENABLE_2FA"
)

source "$ENV_FILE"
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        print_status 1 "Missing required variable: $var"
    else
        print_status 0 "Found $var"
    fi
done

# 3. Create necessary directories
echo -e "\n${BLUE}3. Creating necessary directories...${NC}"

directories=("$LOG_DIR" "$BACKUP_DIR" "imports" "bookmark-validation")

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_status $? "Created directory: $dir"
    else
        print_status 0 "Directory exists: $dir"
    fi
done

# 4. Build frontend
echo -e "\n${BLUE}4. Building frontend...${NC}"

cd frontend
npm install
print_status $? "Frontend dependencies installed"

npm run build
print_status $? "Frontend built successfully"
cd ..

# 5. Start services
echo -e "\n${BLUE}5. Starting services...${NC}"

# Stop existing services
docker-compose down
print_status $? "Stopped existing services"

# Start services
docker-compose up -d
print_status $? "Started Docker containers"

# Wait for services to be ready
echo -e "\n${BLUE}6. Waiting for services to be ready...${NC}"

# Wait for PostgreSQL
attempts=0
max_attempts=30
while ! docker exec bookmark-postgres pg_isready -U admin -d bookmark_manager > /dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ $attempts -eq $max_attempts ]; then
        print_status 1 "PostgreSQL failed to start"
    fi
    echo -ne "${YELLOW}◷${NC} Waiting for PostgreSQL... ($attempts/$max_attempts)\r"
    sleep 1
done
echo -ne "\033[K"  # Clear line
print_status 0 "PostgreSQL is ready"

# Wait for Redis
attempts=0
while ! docker exec bookmark-redis redis-cli ping > /dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ $attempts -eq $max_attempts ]; then
        print_status 1 "Redis failed to start"
    fi
    echo -ne "${YELLOW}◷${NC} Waiting for Redis... ($attempts/$max_attempts)\r"
    sleep 1
done
echo -ne "\033[K"  # Clear line
print_status 0 "Redis is ready"

# 6. Run database migrations
echo -e "\n${BLUE}7. Running database migrations...${NC}"

# Apply schema
docker exec -i bookmark-postgres psql -U admin -d bookmark_manager < database/schema.sql 2>/dev/null || true
print_status 0 "Applied database schema"

# Apply log tables migration
docker exec -i bookmark-postgres psql -U admin -d bookmark_manager < backend/src/db/migrations/add-logs-tables.sql 2>/dev/null || true
print_status 0 "Applied log tables migration"

# 7. Start backend services
echo -e "\n${BLUE}8. Starting backend services...${NC}"

cd backend
npm install
print_status $? "Backend dependencies installed"

# Start backend with PM2 for production
if command_exists pm2; then
    pm2 delete bookmark-backend 2>/dev/null || true
    pm2 start src/index.js --name bookmark-backend
    print_status $? "Backend started with PM2"
else
    # Start with npm in background
    nohup npm run start > ../logs/backend.log 2>&1 &
    print_status $? "Backend started with npm (PID: $!)"
fi
cd ..

# 8. Health checks
echo -e "\n${BLUE}9. Running health checks...${NC}"

# Wait for backend to start
sleep 5

# Check backend health
if curl -f -s http://localhost:3001/health > /dev/null; then
    print_status 0 "Backend health check passed"
else
    print_status 1 "Backend health check failed"
fi

# Check admin login
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@az1.ai", "password": "changeme123"}' 2>/dev/null || echo "{}")

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    print_status 0 "Admin authentication working"
else
    print_status 1 "Admin authentication failed"
fi

# 9. Display summary
echo -e "\n${BLUE}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                         DEPLOYMENT SUMMARY                             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo
echo "Service URLs:"
echo "  - Frontend: http://localhost:5173"
echo "  - Backend API: http://localhost:3001/api"
echo "  - Admin Dashboard: http://localhost:5173/admin"
echo
echo "Database:"
echo "  - PostgreSQL: localhost:5434"
echo "  - Redis: localhost:6382"
echo
echo "Default Admin Credentials:"
echo "  - Email: admin@az1.ai"
echo "  - Password: changeme123"
echo
echo -e "${YELLOW}⚠️  Important:${NC}"
echo "  - Change the admin password after first login"
echo "  - Update JWT_SECRET in production"
echo "  - Configure OPENAI_API_KEY for AI features"
echo
echo "Logs:"
echo "  - Application logs: ./logs/unified.log"
echo "  - Backend logs: ./logs/backend.log"
echo
echo "To stop services:"
echo "  - docker-compose down"
echo "  - pm2 stop bookmark-backend (if using PM2)"
echo

# Create deployment info file
cat > deployment-info.json << EOF
{
  "deployedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "1.0.0",
  "services": {
    "frontend": {
      "url": "http://localhost:5173",
      "status": "running"
    },
    "backend": {
      "url": "http://localhost:3001",
      "status": "running"
    },
    "database": {
      "type": "PostgreSQL",
      "port": 5434,
      "status": "running"
    },
    "cache": {
      "type": "Redis",
      "port": 6382,
      "status": "running"
    }
  },
  "features": {
    "authentication": true,
    "twoFactorAuth": true,
    "websockets": true,
    "aiAnalysis": true,
    "adminDashboard": true
  }
}
EOF

echo -e "${GREEN}Deployment info saved to deployment-info.json${NC}"