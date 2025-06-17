import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Progress,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Button,
  useColorModeValue,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Badge,
  useToast,
  Divider,
  Icon,
} from '@chakra-ui/react'
import { 
  CheckCircleIcon, 
  WarningIcon, 
  TimeIcon, 
  AttachmentIcon,
  DownloadIcon 
} from '@chakra-ui/icons'
import { useDropzone } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import a2aImportService, { A2ATask, A2AMessage } from '../services/a2aImportService'

interface ImportResult {
  taskId: string
  importId: string
  bookmarkCount?: number
  validatedCount?: number
  enrichedCount?: number
  categorizedCount?: number
}

const ImportA2A: React.FC = () => {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [activeTask, setActiveTask] = useState<A2ATask | null>(null)
  const [taskMessages, setTaskMessages] = useState<A2AMessage[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [eventSource, setEventSource] = useState<EventSource | null>(null)
  
  const cardBg = useColorModeValue('white', 'gray.800')
  const dropzoneBg = useColorModeValue('gray.50', 'gray.700')
  const borderColor = useColorModeValue('gray.300', 'gray.600')
  const toast = useToast()

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await a2aImportService.upload(file, (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setUploadProgress(progress)
        }
      })
      return response.data
    },
    onSuccess: (data) => {
      setImportResult({
        taskId: data.taskId,
        importId: data.importId,
      })
      // Start monitoring task progress
      monitorTaskProgress(data.taskId)
    },
    onError: (error: any) => {
      setUploadProgress(0)
      toast({
        title: 'Upload failed',
        description: error.response?.data?.error || 'Failed to upload file',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    },
  })

  // Monitor task progress via SSE
  const monitorTaskProgress = useCallback((taskId: string) => {
    // Get token for auth
    const token = localStorage.getItem('token') || ''
    
    // Close existing connection
    if (eventSource) {
      eventSource.close()
    }
    
    // Create new SSE connection
    const es = a2aImportService.subscribeToTaskProgress(taskId, token)
    
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        switch (data.type) {
          case 'status':
            setActiveTask(data.task)
            break
            
          case 'progress':
            setActiveTask(prev => prev ? {
              ...prev,
              progress: data.progress,
              currentAgent: data.currentAgent,
              currentStep: data.currentStep,
            } : null)
            break
            
          case 'message':
            setTaskMessages(prev => [...prev, data])
            break
            
          case 'completed':
            setActiveTask(data.task)
            es.close()
            toast({
              title: 'Import completed',
              description: `Successfully processed ${data.task.metadata?.totalBookmarks || 0} bookmarks`,
              status: 'success',
              duration: 5000,
              isClosable: true,
            })
            break
            
          case 'failed':
            setActiveTask(data.task)
            es.close()
            toast({
              title: 'Import failed',
              description: data.error || 'An error occurred during import',
              status: 'error',
              duration: 5000,
              isClosable: true,
            })
            break
        }
      } catch (error) {
        console.error('Failed to parse SSE data:', error)
      }
    }
    
    es.onerror = (error) => {
      console.error('SSE error:', error)
      es.close()
    }
    
    setEventSource(es)
  }, [eventSource, toast])

  // Poll for task status (fallback if SSE fails)
  useEffect(() => {
    if (!activeTask?.id || activeTask.status === 'completed' || activeTask.status === 'failed') {
      return
    }
    
    const interval = setInterval(async () => {
      try {
        const response = await a2aImportService.getTaskStatus(activeTask.id)
        setActiveTask(response.data)
        
        if (response.data.status === 'completed' || response.data.status === 'failed') {
          clearInterval(interval)
        }
      } catch (error) {
        console.error('Failed to fetch task status:', error)
      }
    }, 2000)
    
    return () => clearInterval(interval)
  }, [activeTask?.id, activeTask?.status])

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [eventSource])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0]
      if (file.type === 'text/html' || file.name.endsWith('.html')) {
        uploadMutation.mutate(file)
      } else {
        toast({
          title: 'Invalid file type',
          description: 'Please upload an HTML bookmark file',
          status: 'error',
          duration: 3000,
          isClosable: true,
        })
      }
    }
  }, [uploadMutation, toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/html': ['.html'],
    },
    maxFiles: 1,
  })

  const getAgentBadgeColor = (agent: string) => {
    switch (agent) {
      case 'import': return 'blue'
      case 'validation': return 'purple'
      case 'enrichment': return 'green'
      case 'categorization': return 'orange'
      default: return 'gray'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircleIcon
      case 'failed': return WarningIcon
      case 'running': return TimeIcon
      default: return AttachmentIcon
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'green'
      case 'failed': return 'red'
      case 'running': return 'blue'
      default: return 'gray'
    }
  }

  return (
    <VStack spacing={6} align="stretch">
      <Box>
        <Heading size="lg" mb={2}>Import Bookmarks (A2A)</Heading>
        <Text color="gray.500">Upload your browser bookmarks using the new Agent-to-Agent system</Text>
      </Box>

      {/* Upload Area */}
      <Card bg={cardBg}>
        <CardBody>
          <Box
            {...getRootProps()}
            p={8}
            borderWidth={2}
            borderStyle="dashed"
            borderColor={isDragActive ? 'blue.400' : borderColor}
            borderRadius="lg"
            bg={isDragActive ? useColorModeValue('blue.50', 'blue.900') : dropzoneBg}
            cursor="pointer"
            transition="all 0.2s"
            _hover={{ borderColor: 'blue.400' }}
          >
            <input {...getInputProps()} />
            <VStack spacing={3}>
              <Icon as={DownloadIcon} w={12} h={12} color="gray.400" />
              <Text fontSize="lg" fontWeight="medium">
                {isDragActive ? 'Drop your bookmarks here' : 'Drag and drop your bookmarks file'}
              </Text>
              <Text fontSize="sm" color="gray.500">
                or click to browse (HTML files only)
              </Text>
            </VStack>
          </Box>

          {uploadMutation.isPending && (
            <Box mt={4}>
              <Text mb={2}>Uploading file...</Text>
              <Progress value={uploadProgress} colorScheme="blue" />
            </Box>
          )}
        </CardBody>
      </Card>

      {/* Active Task Progress */}
      {activeTask && (
        <Card bg={cardBg}>
          <CardHeader>
            <HStack justify="space-between">
              <Heading size="md">Import Progress</Heading>
              <Badge colorScheme={getStatusColor(activeTask.status)}>
                <HStack spacing={1}>
                  <Icon as={getStatusIcon(activeTask.status)} w={4} h={4} />
                  <Text>{activeTask.status}</Text>
                </HStack>
              </Badge>
            </HStack>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              {/* Overall Progress */}
              <Box>
                <HStack justify="space-between" mb={2}>
                  <Text fontWeight="medium">Overall Progress</Text>
                  <Text>{activeTask.progress || 0}%</Text>
                </HStack>
                <Progress 
                  value={activeTask.progress || 0} 
                  colorScheme={activeTask.status === 'failed' ? 'red' : 'green'}
                />
              </Box>

              {/* Current Agent */}
              {activeTask.currentAgent && (
                <HStack>
                  <Text>Current Agent:</Text>
                  <Badge colorScheme={getAgentBadgeColor(activeTask.currentAgent)}>
                    {activeTask.currentAgent}
                  </Badge>
                  <Text color="gray.500">
                    (Step {activeTask.currentStep + 1} of {activeTask.totalSteps})
                  </Text>
                </HStack>
              )}

              {/* Error Message */}
              {activeTask.status === 'failed' && activeTask.error && (
                <Alert status="error">
                  <AlertIcon />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{activeTask.error}</AlertDescription>
                </Alert>
              )}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Task Messages */}
      {taskMessages.length > 0 && (
        <Card bg={cardBg}>
          <CardHeader>
            <Heading size="md">Processing Log</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={2} maxH="300px" overflowY="auto">
              {taskMessages.map((msg, index) => (
                <Box key={index} p={2} bg={useColorModeValue('gray.50', 'gray.700')} borderRadius="md">
                  <HStack justify="space-between">
                    <HStack>
                      <Badge size="sm" colorScheme={getAgentBadgeColor(msg.agentType)}>
                        {msg.agentType}
                      </Badge>
                      <Text fontSize="sm">{msg.content}</Text>
                    </HStack>
                    <Text fontSize="xs" color="gray.500">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </Text>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Success Result */}
      {activeTask?.status === 'completed' && (
        <Alert status="success">
          <AlertIcon />
          <Box>
            <AlertTitle>Import Completed Successfully!</AlertTitle>
            <AlertDescription>
              Your bookmarks have been processed through all agents.
              {activeTask.metadata?.totalBookmarks && (
                <Text mt={2}>
                  Total bookmarks processed: <strong>{activeTask.metadata.totalBookmarks}</strong>
                </Text>
              )}
            </AlertDescription>
          </Box>
        </Alert>
      )}
    </VStack>
  )
}

export default ImportA2A