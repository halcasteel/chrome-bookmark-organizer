import React, { createContext, useContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'
import { useToast } from '@chakra-ui/react'

interface ImportProgress {
  importId: string
  total: number
  imported: number
  validated: number
  enriched: number
  failed: number
  validationPercentage: number
  enrichmentPercentage: number
}

interface SocketContextType {
  socket: Socket | null
  connected: boolean
  importProgress: Map<string, ImportProgress>
  subscribeToImport: (importId: string) => void
  unsubscribeFromImport: (importId: string) => void
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  importProgress: new Map(),
  subscribeToImport: () => {},
  unsubscribeFromImport: () => {},
})

export const useSocket = () => useContext(SocketContext)

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth()
  const toast = useToast()
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [importProgress, setImportProgress] = useState<Map<string, ImportProgress>>(new Map())

  useEffect(() => {
    if (!token) {
      console.log('No token available, skipping WebSocket connection')
      return
    }

    // Fix: Connect through the same origin to use Vite proxy
    const socketUrl = window.location.origin
    console.log('Connecting to WebSocket at:', socketUrl)
    console.log('With token:', token?.substring(0, 20) + '...')
    
    // Fix: Improved Socket.IO client configuration
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'], // Fix: Start with polling first
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      path: '/socket.io/', // Fix: Ensure proper path
      forceNew: true, // Fix: Force new connection
      timeout: 20000, // Fix: Add connection timeout
      autoConnect: true,
      // Fix: Add query params for debugging
      query: {
        clientVersion: '4.8.1',
        timestamp: Date.now().toString()
      }
    })

    // Fix: Add more detailed connection monitoring
    newSocket.on('connect', () => {
      console.log('WebSocket connected successfully!')
      console.log('Socket ID:', newSocket.id)
      console.log('Transport:', newSocket.io.engine.transport.name)
      console.log('Protocol:', newSocket.io.engine.protocol)
      setConnected(true)
      
      // Clear any previous error toasts
      toast.closeAll()
    })

    // Fix: Monitor connection confirmation from server
    newSocket.on('connection_confirmed', (data) => {
      console.log('Connection confirmed by server:', data)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason)
      setConnected(false)
      
      // Only show toast for unexpected disconnects
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        return
      }
      
      toast({
        title: 'WebSocket Disconnected',
        description: `Connection lost: ${reason}`,
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
    })

    // Fix: Enhanced error handling
    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', {
        message: error.message,
        type: error.type,
        data: (error as any).data,
        context: (error as any).context
      })
      
      // Fix: Check for frame header error specifically
      if (error.message.includes('Invalid frame header')) {
        console.error('Frame header error detected - this might be due to a proxy or protocol mismatch')
      }
      
      // Check if it's an auth error
      if (error.message.includes('Authentication') || error.message.includes('token')) {
        console.error('Authentication issue detected. Token:', token?.substring(0, 20) + '...')
        toast({
          title: 'WebSocket Authentication Failed',
          description: 'Please try logging in again.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
      }
    })

    // Fix: Monitor transport changes
    newSocket.io.on('upgrade', (transport) => {
      console.log('Transport upgraded to:', transport.name)
    })

    // Fix: Monitor engine errors
    newSocket.io.engine.on('error', (error) => {
      console.error('Engine error:', error)
    })

    // Import progress updates
    newSocket.on('import:progress', (data: ImportProgress) => {
      setImportProgress(prev => {
        const newMap = new Map(prev)
        newMap.set(data.importId, data)
        return newMap
      })
    })

    // Import completed
    newSocket.on('import:completed', (data) => {
      toast({
        title: 'Import completed',
        description: `Successfully imported ${data.imported} bookmarks`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      })
    })

    // Import error
    newSocket.on('import:error', (data) => {
      console.error('Import error:', data)
      toast({
        title: 'Import failed',
        description: data.error?.message || 'An error occurred during import',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    })

    // Bookmark validated
    newSocket.on('bookmark:validated', (data) => {
      console.log('Bookmark validated:', data)
    })

    // Bookmark enriched
    newSocket.on('bookmark:enriched', (data) => {
      console.log('Bookmark enriched:', data)
    })

    // Job progress (for debugging)
    newSocket.on('job:progress', (data) => {
      console.log('Job progress:', data)
    })

    setSocket(newSocket)

    return () => {
      console.log('Cleaning up WebSocket connection')
      newSocket.disconnect()
    }
  }, [token, toast])

  const subscribeToImport = (importId: string) => {
    if (socket && connected) {
      console.log('Subscribing to import:', importId)
      socket.emit('subscribe:import', importId)
    } else {
      console.warn('Cannot subscribe - socket not connected')
    }
  }

  const unsubscribeFromImport = (importId: string) => {
    if (socket && connected) {
      console.log('Unsubscribing from import:', importId)
      socket.emit('unsubscribe:import', importId)
    }
  }

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        importProgress,
        subscribeToImport,
        unsubscribeFromImport,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export default SocketContext