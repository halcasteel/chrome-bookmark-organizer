#!/bin/bash

echo "🚀 Starting Bookmark Manager Local Development"
echo "============================================="

# Check if database is running
if ! docker ps | grep -q bookmark-postgres; then
    echo "❌ Database is not running. Starting it now..."
    ./scripts/setup-local-db.sh
    
    if [ $? -ne 0 ]; then
        echo "Failed to start database. Exiting."
        exit 1
    fi
else
    echo "✅ Database is already running"
fi

# Check database connection
echo ""
echo "Checking database connection..."
docker exec bookmark-postgres pg_isready -U admin -d bookmark_manager

if [ $? -eq 0 ]; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Install dependencies if needed
echo ""
echo "Checking dependencies..."
if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
    echo "Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

# Create imports directory
mkdir -p imports/archive

# Start the application
echo ""
echo "Starting application..."
echo "============================================="
echo "Frontend: http://localhost:5173"
echo "Backend API: http://localhost:3001/api"
echo "Database: postgresql://admin:admin@localhost:5434/bookmark_manager"
echo "============================================="
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start both frontend and backend
npm run dev