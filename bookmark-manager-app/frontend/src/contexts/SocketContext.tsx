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
    if (!token) return

    const socketUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001'
    console.log('Connecting to WebSocket at:', socketUrl)
    console.log('With token:', token?.substring(0, 20) + '...')
    
    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'], // Allow both transports
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    newSocket.on('connect', () => {
      console.log('WebSocket connected')
      setConnected(true)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason)
      setConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message)
      console.error('Error type:', error.type)
      console.error('Full error:', error)
      
      // Check if it's an auth error
      if (error.message.includes('Authentication') || error.message.includes('token')) {
        console.error('Authentication issue detected. Token:', token?.substring(0, 20) + '...')
        toast({
          title: 'WebSocket Connection Failed',
          description: 'Authentication error. Please try logging in again.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
      }
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
      newSocket.disconnect()
    }
  }, [token])

  const subscribeToImport = (importId: string) => {
    if (socket) {
      socket.emit('subscribe:import', importId)
    }
  }

  const unsubscribeFromImport = (importId: string) => {
    if (socket) {
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