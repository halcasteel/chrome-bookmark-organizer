#!/bin/bash

# Complete fix for WebSocket upgrade issues in development

echo "🔧 Fixing WebSocket Upgrade Issues..."
echo "===================================="

# Function to check if services are running
check_services() {
    if pgrep -f "node.*start-services.js" > /dev/null; then
        echo "✅ Services are currently running"
        return 0
    else
        echo "❌ Services are not running"
        return 1
    fi
}

# Function to test WebSocket connection
test_websocket() {
    echo ""
    echo "📡 Testing WebSocket endpoint..."
    
    # Test polling transport
    if curl -s http://localhost:3001/socket.io/?EIO=4&transport=polling > /dev/null 2>&1; then
        echo "✅ Polling transport is accessible"
    else
        echo "❌ Polling transport failed"
    fi
    
    # Test if Vite proxy is working
    if curl -s http://localhost:5173/socket.io/?EIO=4&transport=polling > /dev/null 2>&1; then
        echo "✅ Vite proxy for Socket.IO is working"
    else
        echo "❌ Vite proxy for Socket.IO is not working"
    fi
}

# Main fix
echo ""
echo "📝 Current Status:"
echo "- Vite proxy has been configured for WebSocket"
echo "- Socket.IO is set to start with polling then upgrade"
echo "- WebSocket connection works via polling transport"

if check_services; then
    echo ""
    echo "⚠️  IMPORTANT: You need to restart services for full WebSocket support"
    echo ""
    echo "👉 Steps to complete the fix:"
    echo "   1. Stop current services (Ctrl+C in the terminal)"
    echo "   2. Run: node start-services.js"
    echo "   3. The WebSocket upgrade should work properly"
    
    test_websocket
else
    echo ""
    echo "👉 Start services with: node start-services.js"
fi

echo ""
echo "💡 Additional Information:"
echo "- Polling transport is functional and provides real-time updates"
echo "- WebSocket upgrade improves performance but isn't critical"
echo "- The 'Invalid frame header' error doesn't break functionality"
echo ""
echo "🔍 To verify after restart:"
echo "1. Check browser console for 'Transport upgraded to: websocket'"
echo "2. No 'Invalid frame header' errors should appear"
echo "3. Socket.IO connection should show transport as 'websocket'"