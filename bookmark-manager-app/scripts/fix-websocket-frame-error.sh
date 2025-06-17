#!/bin/bash

# Fix WebSocket Frame Error Script
# This script addresses the "Invalid frame header" error in Socket.IO connections

echo "🔧 Fixing WebSocket Frame Error..."
echo "================================"

# Check if services are running
if ! pgrep -f "node.*start-services.js" > /dev/null; then
    echo "❌ Services are not running. Please start them first with:"
    echo "   node start-services.js"
    exit 1
fi

echo "✅ Services are running"

# Test current WebSocket connection
echo ""
echo "📡 Testing WebSocket connection..."
curl -s http://localhost:3001/socket.io/?EIO=4&transport=polling > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Socket.IO endpoint is accessible"
else
    echo "❌ Socket.IO endpoint is not accessible"
fi

# Check for port conflicts
echo ""
echo "🔍 Checking for port conflicts..."
lsof -i :3001 | grep LISTEN
lsof -i :5173 | grep LISTEN

# Restart frontend to apply proxy changes
echo ""
echo "🔄 The Vite configuration has been updated to properly proxy WebSocket connections."
echo "   Please restart the frontend development server for changes to take effect."
echo ""
echo "📝 Summary of changes made:"
echo "   1. Added WebSocket proxy configuration to vite.config.js"
echo "   2. Updated SocketContext to connect through Vite proxy"
echo "   3. Enhanced WebSocket server configuration for better compatibility"
echo ""
echo "🚀 Next steps:"
echo "   1. Stop the services (Ctrl+C in the terminal running start-services.js)"
echo "   2. Start them again with: node start-services.js"
echo "   3. Check the browser console - the frame error should be resolved"
echo ""
echo "💡 If the issue persists, check:"
echo "   - Browser extensions that might interfere (ad blockers, privacy tools)"
echo "   - Corporate proxy or firewall settings"
echo "   - Try a different browser or incognito mode"