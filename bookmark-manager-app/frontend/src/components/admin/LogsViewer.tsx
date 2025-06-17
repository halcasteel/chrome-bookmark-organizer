import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  VStack,
  HStack,
  Input,
  Select,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Text,
  useColorModeValue,
  IconButton,
  InputGroup,
  InputLeftElement,
  Collapse,
  Code,
  Spinner,
  useToast,
} from '@chakra-ui/react'
import {
  FiSearch,
  FiRefreshCw,
  FiChevronDown,
  FiChevronRight,
  FiFilter,
  FiDownload,
} from 'react-icons/fi'
import api from '../../services/api'
import logger from '../../services/logger'

interface Log {
  id: string
  timestamp: string
  level: string
  service: string
  source: string
  message: string
  metadata: any
  error_message?: string
  error_stack?: string
  user_id?: string
  request_id?: string
  duration_ms?: number
  status_code?: number
}

interface LogsViewerProps {
  timeRange: string
}

const LogsViewer: React.FC<LogsViewerProps> = ({ timeRange }) => {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    level: '',
    service: '',
    search: '',
  })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [autoRefresh, setAutoRefresh] = useState(false)
  const refreshInterval = useRef<NodeJS.Timeout | null>(null)
  const toast = useToast()

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    logger.info('LogsViewer mounted', { timeRange })
    fetchLogs()

    if (autoRefresh) {
      refreshInterval.current = setInterval(fetchLogs, 5000)
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current)
      }
    }
  }, [timeRange, filters, autoRefresh])

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams({
        limit: '200',
        ...(filters.level && { level: filters.level }),
        ...(filters.service && { service: filters.service }),
        ...(filters.search && { search: filters.search }),
      })

      const response = await api.get(`/admin/logs?${params}`)
      setLogs(response.data)
      logger.debug('Logs fetched', { count: response.data.length })
    } catch (error) {
      logger.error('Failed to fetch logs', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch logs',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const exportLogs = async () => {
    try {
      const response = await api.get(`/admin/logs/export?timeRange=${timeRange}&format=json`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `logs-${timeRange}-${Date.now()}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      
      logger.info('Logs exported', { timeRange })
    } catch (error) {
      logger.error('Failed to export logs', error)
      toast({
        title: 'Export Failed',
        description: 'Could not export logs',
        status: 'error',
        duration: 3000,
      })
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'red'
      case 'warn':
        return 'orange'
      case 'info':
        return 'blue'
      case 'debug':
        return 'gray'
      default:
        return 'gray'
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Spinner size="xl" />
      </Box>
    )
  }

  return (
    <VStack spacing={4} align="stretch">
      {/* Filters */}
      <Box
        bg={bgColor}
        p={4}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <HStack spacing={4}>
          <InputGroup maxW="300px">
            <InputLeftElement pointerEvents="none">
              <FiSearch />
            </InputLeftElement>
            <Input
              placeholder="Search logs..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </InputGroup>

          <Select
            placeholder="All levels"
            value={filters.level}
            onChange={(e) => setFilters({ ...filters, level: e.target.value })}
            maxW="150px"
          >
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </Select>

          <Select
            placeholder="All services"
            value={filters.service}
            onChange={(e) => setFilters({ ...filters, service: e.target.value })}
            maxW="200px"
          >
            {[...new Set(logs.map(l => l.service))].sort().map(service => (
              <option key={service} value={service}>{service}</option>
            ))}
          </Select>

          <Button
            leftIcon={<FiRefreshCw />}
            onClick={fetchLogs}
            isLoading={loading}
          >
            Refresh
          </Button>

          <Button
            variant={autoRefresh ? 'solid' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto Refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>

          <IconButton
            icon={<FiDownload />}
            aria-label="Export logs"
            onClick={exportLogs}
          />
        </HStack>
      </Box>

      {/* Logs Table */}
      <Box
        bg={bgColor}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
        overflowX="auto"
      >
        <Table variant="simple" size="sm">
          <Thead>
            <Tr>
              <Th width="20px"></Th>
              <Th>Timestamp</Th>
              <Th>Level</Th>
              <Th>Service</Th>
              <Th>Message</Th>
              <Th>Duration</Th>
              <Th>Status</Th>
            </Tr>
          </Thead>
          <Tbody>
            {logs.map((log) => (
              <React.Fragment key={log.id}>
                <Tr
                  _hover={{ bg: useColorModeValue('gray.50', 'gray.700') }}
                  cursor="pointer"
                  onClick={() => toggleRowExpansion(log.id)}
                >
                  <Td>
                    <IconButton
                      icon={expandedRows.has(log.id) ? <FiChevronDown /> : <FiChevronRight />}
                      aria-label="Expand"
                      size="xs"
                      variant="ghost"
                    />
                  </Td>
                  <Td>
                    <Text fontSize="xs" fontFamily="mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </Text>
                  </Td>
                  <Td>
                    <Badge colorScheme={getLevelColor(log.level)} size="sm">
                      {log.level.toUpperCase()}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant="outline" size="sm">
                      {log.service}
                    </Badge>
                  </Td>
                  <Td maxW="400px">
                    <Text fontSize="sm" isTruncated>
                      {log.message}
                    </Text>
                  </Td>
                  <Td>
                    {log.duration_ms && (
                      <Text fontSize="xs">{log.duration_ms}ms</Text>
                    )}
                  </Td>
                  <Td>
                    {log.status_code && (
                      <Badge
                        colorScheme={log.status_code >= 400 ? 'red' : 'green'}
                        size="sm"
                      >
                        {log.status_code}
                      </Badge>
                    )}
                  </Td>
                </Tr>
                <Tr>
                  <Td colSpan={7} p={0}>
                    <Collapse in={expandedRows.has(log.id)} animateOpacity>
                      <Box p={4} bg={useColorModeValue('gray.50', 'gray.900')}>
                        <VStack align="stretch" spacing={2}>
                          {log.source && (
                            <HStack>
                              <Text fontWeight="bold" fontSize="sm">Source:</Text>
                              <Text fontSize="sm">{log.source}</Text>
                            </HStack>
                          )}
                          {log.error_message && (
                            <Box>
                              <Text fontWeight="bold" fontSize="sm" color="red.500">
                                Error:
                              </Text>
                              <Text fontSize="sm" color="red.400">
                                {log.error_message}
                              </Text>
                            </Box>
                          )}
                          {log.error_stack && (
                            <Box>
                              <Text fontWeight="bold" fontSize="sm">Stack Trace:</Text>
                              <Code
                                display="block"
                                whiteSpace="pre"
                                fontSize="xs"
                                p={2}
                                borderRadius="md"
                              >
                                {log.error_stack}
                              </Code>
                            </Box>
                          )}
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <Box>
                              <Text fontWeight="bold" fontSize="sm">Metadata:</Text>
                              <Code
                                display="block"
                                whiteSpace="pre"
                                fontSize="xs"
                                p={2}
                                borderRadius="md"
                              >
                                {JSON.stringify(log.metadata, null, 2)}
                              </Code>
                            </Box>
                          )}
                          {log.user_id && (
                            <HStack>
                              <Text fontWeight="bold" fontSize="sm">User ID:</Text>
                              <Text fontSize="sm" fontFamily="mono">{log.user_id}</Text>
                            </HStack>
                          )}
                          {log.request_id && (
                            <HStack>
                              <Text fontWeight="bold" fontSize="sm">Request ID:</Text>
                              <Text fontSize="sm" fontFamily="mono">{log.request_id}</Text>
                            </HStack>
                          )}
                        </VStack>
                      </Box>
                    </Collapse>
                  </Td>
                </Tr>
              </React.Fragment>
            ))}
          </Tbody>
        </Table>
      </Box>
    </VStack>
  )
}

export default LogsViewer