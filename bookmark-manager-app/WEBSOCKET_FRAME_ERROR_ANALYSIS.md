# WebSocket "Invalid Frame Header" Error Analysis and Solution

## Update: June 16, 2025 - Vite Proxy Configuration Fix

### Latest Fix Applied
The primary issue was that Vite's development server proxy was not configured to handle WebSocket connections. The fix involved:

1. **Updated `frontend/vite.config.js`** to add WebSocket proxy:
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:3001',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://localhost:3001',
    changeOrigin: true,
    ws: true,  // Enable WebSocket proxying
  }
}
```

2. **Updated `frontend/src/contexts/SocketContext.tsx`** to connect through proxy:
```javascript
// Now connects to window.location.origin instead of direct port
const socketUrl = window.location.origin
```

3. **Enhanced server configuration** with additional compatibility options.

## Problem Summary
The WebSocket connection fails with "Invalid frame header" error when trying to establish a connection between the frontend (React app on port 5173) and backend (Node.js on port 3001).

## Root Causes Identified

### 1. **Transport Protocol Mismatch**
- The client was trying to connect directly with WebSocket transport
- The server might not be ready to accept WebSocket connections immediately
- Solution: Start with polling transport, then upgrade to WebSocket

### 2. **Engine.IO Version Compatibility**
- Socket.IO v4.8.1 uses Engine.IO v6
- Some clients might still be using Engine.IO v3 protocol
- Solution: Add `allowEIO3: true` to server configuration

### 3. **Missing WebSocket-specific Headers**
- CORS headers weren't properly set for WebSocket upgrade requests
- Solution: Add explicit header handling for WebSocket connections

### 4. **Proxy/Nginx Configuration**
- If using Nginx as reverse proxy, it needs specific WebSocket configuration
- Solution: Add dedicated `/socket.io/` location block with proper headers

## Fixes Applied

### Backend Changes (websocketService.js)

```javascript
this.io = new Server(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'authorization']
  },
  transports: ['polling', 'websocket'], // Start with polling
  allowEIO3: true, // Allow Engine.IO v3 clients
  pingTimeout: 60000,
  pingInterval: 25000,
  path: '/socket.io/', // Explicit path
  serveClient: false, // Don't serve client files
  cookie: false // Disable cookies to prevent conflicts
});
```

### Frontend Changes (SocketContext.tsx)

```javascript
const newSocket = io(socketUrl, {
  auth: { token },
  transports: ['polling', 'websocket'], // Start with polling
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
  path: '/socket.io/', // Explicit path
  forceNew: true, // Force new connection
  timeout: 20000, // Connection timeout
  autoConnect: true,
  query: {
    clientVersion: '4.8.1',
    timestamp: Date.now().toString()
  }
});
```

### Nginx Configuration (if used)

```nginx
location /socket.io/ {
    proxy_pass http://backend:3001/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # WebSocket specific settings
    proxy_buffering off;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    keepalive_timeout 86400;
    
    # Ensure proper headers for WebSocket
    proxy_set_header Origin "";
    
    # Allow larger frames
    proxy_max_temp_file_size 0;
}
```

## Testing the Fix

1. **Apply the fixes:**
   ```bash
   ./fix-websocket-frame-error.sh
   ```

2. **Restart services:**
   ```bash
   node start-services.js
   ```

3. **Test connection from browser console:**
   ```javascript
   // Run in browser console
   debugWebSocket()
   ```

4. **Check logs:**
   ```bash
   tail -f backend/logs/unified.log | grep -i websocket
   ```

## Verification Steps

1. **Check browser console for:**
   - "WebSocket connected successfully!"
   - Transport upgrade from "polling" to "websocket"
   - No "Invalid frame header" errors

2. **Check backend logs for:**
   - "WebSocket client connected"
   - Successful auth messages
   - Transport information

3. **Test functionality:**
   - Import a bookmark file
   - Check if progress updates appear
   - Verify real-time updates work

## Additional Debugging

If issues persist:

1. **Check for interfering proxies:**
   ```bash
   curl -i -N \
     -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" \
     -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
     http://localhost:3001/socket.io/
   ```

2. **Test direct WebSocket connection:**
   ```bash
   node backend/tests/test-websocket-client.js <your-jwt-token>
   ```

3. **Check firewall rules:**
   - Ensure port 3001 allows WebSocket connections
   - Check if any security software is blocking upgrades

## Common Error Messages and Solutions

- **"Invalid frame header"**: Protocol mismatch, fixed by transport order
- **"Authentication required"**: Token not being sent, check auth configuration
- **"CORS error"**: Origins not properly configured, check CORS settings
- **"Connection timeout"**: Network issues or server not responding

## Prevention

1. Always test WebSocket connections after deployment
2. Monitor WebSocket health in production
3. Use proper error handling and reconnection logic
4. Keep Socket.IO versions synchronized between client and server