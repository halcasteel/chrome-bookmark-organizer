#!/bin/bash

# Fix WebSocket "Invalid frame header" error
echo "🔧 Fixing WebSocket Invalid Frame Header Error..."

# Backup original files
echo "📦 Creating backups..."
cp backend/src/services/websocketService.js backend/src/services/websocketService.js.backup
cp frontend/src/contexts/SocketContext.tsx frontend/src/contexts/SocketContext.tsx.backup

# Apply backend fix
echo "🔨 Applying backend WebSocket service fix..."
cp backend/src/services/websocketService-fixed.js backend/src/services/websocketService.js

# Apply frontend fix
echo "🔨 Applying frontend Socket context fix..."
cp frontend/src/contexts/SocketContext-fixed.tsx frontend/src/contexts/SocketContext.tsx

# Clean up temporary files
echo "🧹 Cleaning up..."
rm -f backend/src/services/websocketService-fixed.js
rm -f frontend/src/contexts/SocketContext-fixed.tsx
rm -f backend/debug-websocket-frame.js
rm -f backend/test-frame-error.js

echo "✅ WebSocket fixes applied!"
echo ""
echo "The fixes include:"
echo "1. Changed transport order to start with polling then upgrade to WebSocket"
echo "2. Added allowEIO3 flag for Engine.IO version compatibility"
echo "3. Improved error handling for frame header errors"
echo "4. Added explicit path and CORS header configuration"
echo "5. Enhanced client-side connection monitoring"
echo ""
echo "🚀 Please restart the services with: node start-services.js"
echo ""
echo "If issues persist, check:"
echo "- No proxy is interfering with WebSocket upgrade"
echo "- Firewall isn't blocking WebSocket connections"
echo "- Browser console for detailed error messages"