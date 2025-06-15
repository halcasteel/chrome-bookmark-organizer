import React, { useState, useCallback, useEffect } from 'react'
import {
  Box,
  Heading,
  Card,
  CardBody,
  VStack,
  Text,
  Button,
  Progress,
  Alert,
  AlertIcon,
  AlertDescription,
  Icon,
  Flex,
  useColorModeValue,
  List,
  ListItem,
  Badge,
  HStack,
  Stat,
  StatLabel,
  StatNumber,
  StatGroup,
  Divider,
  CircularProgress,
  CircularProgressLabel,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react'
import { FiUploadCloud, FiFile, FiCheck, FiX, FiActivity, FiBookmark, FiClock, FiCheckCircle } from 'react-icons/fi'
import { useDropzone, FileWithPath } from 'react-dropzone'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { importService } from '../services/api'
import { formatDistanceToNow } from 'date-fns'
import { useSocket } from '../contexts/SocketContext'
// Types defined inline to avoid circular imports
interface ImportHistory {
  id: string
  user_id: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_bookmarks?: number
  new_bookmarks?: number
  updated_bookmarks?: number
  failed_bookmarks?: number
  error_message?: string
  started_at: string
  completed_at?: string
}

interface ImportResult {
  total: number
  new: number
  updated: number
  failed: number
  duplicates: number
}

const Import: React.FC = () => {
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const cardBg = useColorModeValue('white', 'gray.800')
  const dropzoneBg = useColorModeValue('gray.50', 'gray.700')
  const borderColor = useColorModeValue('gray.300', 'gray.600')

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await importService.upload(file, (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          setUploadProgress(progress)
        }
      })
      return response.data
    },
    onSuccess: (data) => {
      setImportResult(data)
      refetchHistory()
    },
    onError: () => {
      setUploadProgress(0)
    },
  })

  const { data: importHistory, refetch: refetchHistory, isLoading: isLoadingHistory } = useQuery<ImportHistory[]>({
    queryKey: ['import-history'],
    queryFn: () => importService.getHistory(),
    retry: false,
  })

  const onDrop = useCallback((acceptedFiles: FileWithPath[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setImportResult(null)
      uploadMutation.mutate(file)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/html': ['.html', '.htm'],
    },
    maxFiles: 1,
    multiple: false,
  })

  const getStatusColor = (status: ImportHistory['status']): string => {
    switch (status) {
      case 'completed':
        return 'green'
      case 'processing':
        return 'blue'
      case 'failed':
        return 'red'
      default:
        return 'gray'
    }
  }

  return (
    <Box maxW="4xl" mx="auto">
      <Heading size="lg" mb={6}>Import Bookmarks</Heading>
      
      <Card bg={cardBg} mb={6}>
        <CardBody>
          <Box
            {...getRootProps()}
            p={8}
            borderWidth={2}
            borderStyle="dashed"
            borderColor={isDragActive ? 'brand.500' : borderColor}
            borderRadius="lg"
            bg={isDragActive ? useColorModeValue('brand.50', 'brand.900') : dropzoneBg}
            cursor="pointer"
            transition="all 0.2s"
            _hover={{
              borderColor: 'brand.500',
              bg: useColorModeValue('brand.50', 'brand.900'),
            }}
          >
            <input {...getInputProps()} />
            <VStack spacing={4}>
              <Icon
                as={FiUploadCloud}
                boxSize={12}
                color={isDragActive ? 'brand.500' : 'gray.400'}
              />
              <Text textAlign="center">
                {isDragActive
                  ? 'Drop your bookmarks file here'
                  : 'Drag & drop your Chrome bookmarks HTML file here, or click to select'}
              </Text>
              <Text fontSize="sm" color="gray.500">
                Supports Chrome bookmark exports (.html files)
              </Text>
            </VStack>
          </Box>

          {uploadMutation.isPending && (
            <Box mt={4}>
              <Text fontSize="sm" mb={2}>Uploading...</Text>
              <Progress value={uploadProgress} colorScheme="brand" />
            </Box>
          )}

          {uploadMutation.isError && (
            <Alert status="error" mt={4}>
              <AlertIcon />
              <AlertDescription>
                Failed to upload file. Please try again.
              </AlertDescription>
            </Alert>
          )}

          {importResult && (
            <Alert status="success" mt={4}>
              <AlertIcon />
              <Box>
                <AlertDescription>
                  Import completed successfully!
                </AlertDescription>
                <VStack align="start" mt={2} spacing={1}>
                  <Text fontSize="sm">Total bookmarks: {importResult.total}</Text>
                  <Text fontSize="sm">New bookmarks: {importResult.new}</Text>
                  <Text fontSize="sm">Updated: {importResult.updated}</Text>
                  {importResult.failed > 0 && (
                    <Text fontSize="sm" color="red.500">
                      Failed: {importResult.failed}
                    </Text>
                  )}
                </VStack>
              </Box>
            </Alert>
          )}
        </CardBody>
      </Card>

      {/* Import Progress Modal */}
      <Modal isOpen={isProgressOpen} onClose={() => {}} closeOnOverlayClick={false} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Import Progress</ModalHeader>
          {activeImport?.phase === 'completed' && <ModalCloseButton />}
          <ModalBody pb={6}>
            {activeImport && (
              <VStack spacing={4} align="stretch">
                <HStack>
                  <Icon 
                    as={getPhaseIcon(activeImport.phase)} 
                    color={`${getPhaseColor(activeImport.phase)}.500`}
                    boxSize={6}
                  />
                  <Text fontSize="lg" fontWeight="medium">
                    {getPhaseText(activeImport.phase)}
                  </Text>
                </HStack>

                <Progress 
                  value={activeImport.percentComplete} 
                  colorScheme={getPhaseColor(activeImport.phase)}
                  size="lg"
                  hasStripe
                  isAnimated={activeImport.phase !== 'completed'}
                />

                <StatGroup>
                  {activeImport.chunksTotal && (
                    <Stat>
                      <StatLabel>Chunks</StatLabel>
                      <StatNumber fontSize="lg">
                        {activeImport.chunksProcessed || 0} / {activeImport.chunksTotal}
                      </StatNumber>
                    </Stat>
                  )}
                  {activeImport.bookmarksImported !== undefined && (
                    <Stat>
                      <StatLabel>Bookmarks Imported</StatLabel>
                      <StatNumber fontSize="lg">{activeImport.bookmarksImported}</StatNumber>
                    </Stat>
                  )}
                  <Stat>
                    <StatLabel>Progress</StatLabel>
                    <StatNumber fontSize="lg">{activeImport.percentComplete}%</StatNumber>
                  </Stat>
                </StatGroup>

                {activeImport.phase === 'importing' && activeImport.currentChunk && (
                  <Alert status="info" size="sm">
                    <AlertIcon />
                    <Text fontSize="sm">Processing chunk {activeImport.currentChunk}...</Text>
                  </Alert>
                )}

                {activeImport.phase === 'validating' && (
                  <Alert status="info">
                    <AlertIcon />
                    <Box>
                      <Text>Bookmarks have been imported successfully!</Text>
                      <Text fontSize="sm" mt={1}>
                        They are now being queued for validation in the background.
                      </Text>
                    </Box>
                  </Alert>
                )}

                {activeImport.errors && activeImport.errors.length > 0 && (
                  <Alert status="warning">
                    <AlertIcon />
                    <Box>
                      <Text>Some errors occurred during import:</Text>
                      <List fontSize="sm" mt={1}>
                        {activeImport.errors.slice(0, 3).map((error, idx) => (
                          <ListItem key={idx}>{error}</ListItem>
                        ))}
                      </List>
                    </Box>
                  </Alert>
                )}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      <Card bg={cardBg}>
        <CardBody>
          <Heading size="md" mb={4}>Import History</Heading>
          
          {isLoadingHistory ? (
            <Text color="gray.500">Loading history...</Text>
          ) : !importHistory || importHistory.length === 0 ? (
            <Text color="gray.500">No imports yet</Text>
          ) : (
            <List spacing={3}>
              {importHistory.map((item) => (
                <ListItem key={item.id}>
                  <Card variant="outline">
                    <CardBody>
                      <Flex justify="space-between" align="start">
                        <Box>
                          <HStack mb={2}>
                            <Icon as={FiFile} />
                            <Text fontWeight="medium">{item.filename}</Text>
                            <Badge colorScheme={getStatusColor(item.status)}>
                              {item.status}
                            </Badge>
                          </HStack>
                          
                          <HStack spacing={4} fontSize="sm" color="gray.600">
                            {item.total_bookmarks !== undefined && (
                              <Text>Total: {item.total_bookmarks}</Text>
                            )}
                            {item.new_bookmarks !== undefined && (
                              <Text>New: {item.new_bookmarks}</Text>
                            )}
                            {item.updated_bookmarks !== undefined && (
                              <Text>Updated: {item.updated_bookmarks}</Text>
                            )}
                            {item.failed_bookmarks !== undefined && item.failed_bookmarks > 0 && (
                              <Text color="red.500">Failed: {item.failed_bookmarks}</Text>
                            )}
                          </HStack>
                        </Box>
                        
                        <Text fontSize="sm" color="gray.500">
                          {formatDistanceToNow(new Date(item.started_at), { addSuffix: true })}
                        </Text>
                      </Flex>
                      
                      {item.error_message && (
                        <Alert status="error" mt={2} size="sm">
                          <AlertIcon />
                          <AlertDescription>{item.error_message}</AlertDescription>
                        </Alert>
                      )}
                    </CardBody>
                  </Card>
                </ListItem>
              ))}
            </List>
          )}
        </CardBody>
      </Card>
    </Box>
  )
}

export default Import