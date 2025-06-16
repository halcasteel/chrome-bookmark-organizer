import { io, Socket } from 'socket.io-client'

export const debugWebSocketConnection = (token: string | null) => {
  console.group('🔌 WebSocket Debug Info')
  
  // Check environment variables
  console.log('Environment Variables:')
  console.log('- VITE_API_URL:', import.meta.env.VITE_API_URL)
  console.log('- VITE_WS_URL:', import.meta.env.VITE_WS_URL)
  console.log('- MODE:', import.meta.env.MODE)
  console.log('- DEV:', import.meta.env.DEV)
  
  // Check token
  console.log('\nAuthentication:')
  console.log('- Token exists:', !!token)
  console.log('- Token preview:', token ? token.substring(0, 20) + '...' : 'No token')
  
  // Calculate WebSocket URL
  const socketUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'
  console.log('\nWebSocket URL:', socketUrl)
  
  // Try to connect
  console.log('\nAttempting connection...')
  
  const testSocket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: false,
  })
  
  testSocket.on('connect', () => {
    console.log('✅ Test connection successful!')
    console.log('Socket ID:', testSocket.id)
    testSocket.disconnect()
  })
  
  testSocket.on('connect_error', (error) => {
    console.error('❌ Test connection failed!')
    console.error('Error:', error.message)
    console.error('Type:', error.type)
    console.error('Full error object:', error)
  })
  
  console.groupEnd()
  
  // Cleanup after 3 seconds
  setTimeout(() => {
    testSocket.disconnect()
  }, 3000)
}

// Export a function to be called from browser console
if (typeof window !== 'undefined') {
  (window as any).debugWebSocket = () => {
    const token = localStorage.getItem('token')
    debugWebSocketConnection(token)
  }
}