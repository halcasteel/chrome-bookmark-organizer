#!/bin/bash

echo "🛑 Stopping all Node processes..."
pkill -f "node.*index.js" 2>/dev/null
pkill -f "nodemon" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 2

echo "🔍 Checking for remaining processes..."
ps aux | grep -E "node.*index\.js|nodemon|vite" | grep -v grep

echo ""
echo "🚀 Starting backend..."
cd backend
npm start &
BACKEND_PID=$!
sleep 3

echo ""
echo "🚀 Starting frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!
sleep 3

echo ""
echo "✅ Services started:"
echo "   Backend PID: $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo ""
echo "📡 Testing WebSocket..."
curl -s http://localhost:3001/health | jq

echo ""
echo "🌐 Frontend: http://localhost:5173"
echo "🔌 Backend: http://localhost:3001"