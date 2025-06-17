import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  GridItem,
  VStack,
  HStack,
  Text,
  Badge,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  useColorModeValue,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Heading,
} from '@chakra-ui/react'
import { FiDatabase, FiServer, FiHardDrive, FiActivity } from 'react-icons/fi'
import api from '../../services/api'
import logger from '../../services/logger'

interface SystemHealthProps {
  timeRange: string
}

interface HealthStatus {
  database: {
    ok: boolean
    time?: string
    error?: string
  }
  redis: {
    ok: boolean
    error?: string
  }
  logIngestion: {
    ok: boolean
    recentLogs: number
    errorRate: number
  }
  services: {
    backend: {
      ok: boolean
      uptime: number
    }
    workers: {
      ok: boolean
    }
  }
}

const SystemHealth: React.FC<SystemHealthProps> = ({ timeRange }) => {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    fetchHealthStatus()
    const interval = setInterval(fetchHealthStatus, 30000) // Refresh every 30s
    
    return () => clearInterval(interval)
  }, [timeRange])

  const fetchHealthStatus = async () => {
    try {
      logger.debug('Fetching system health')
      const response = await api.get('/admin/health')
      setHealth(response.data)
      setError(null)
    } catch (err) {
      logger.error('Failed to fetch health status', err)
      setError('Failed to fetch system health')
    } finally {
      setLoading(false)
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const getServiceStatus = (service: any) => {
    if (!service || !service.ok) return { color: 'red', text: 'Down' }
    return { color: 'green', text: 'Operational' }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Spinner size="xl" />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        <AlertTitle>Error!</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!health) return null

  return (
    <VStack spacing={6} align="stretch">
      {/* Overall Status */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <HStack justify="space-between" mb={4}>
          <Heading size="md">System Status</Heading>
          <Badge
            colorScheme={
              health.database.ok && health.redis.ok && health.services.backend.ok
                ? 'green'
                : 'red'
            }
            fontSize="md"
            p={2}
          >
            {health.database.ok && health.redis.ok && health.services.backend.ok
              ? 'All Systems Operational'
              : 'System Issues Detected'}
          </Badge>
        </HStack>

        <Grid templateColumns="repeat(4, 1fr)" gap={4}>
          {/* Database */}
          <GridItem>
            <Box
              p={4}
              borderRadius="md"
              border="1px"
              borderColor={borderColor}
              bg={health.database.ok ? 'green.50' : 'red.50'}
            >
              <HStack mb={2}>
                <FiDatabase />
                <Text fontWeight="bold">Database</Text>
              </HStack>
              <Badge colorScheme={health.database.ok ? 'green' : 'red'}>
                {health.database.ok ? 'Connected' : 'Disconnected'}
              </Badge>
              {health.database.error && (
                <Text fontSize="xs" color="red.600" mt={1}>
                  {health.database.error}
                </Text>
              )}
            </Box>
          </GridItem>

          {/* Redis */}
          <GridItem>
            <Box
              p={4}
              borderRadius="md"
              border="1px"
              borderColor={borderColor}
              bg={health.redis.ok ? 'green.50' : 'red.50'}
            >
              <HStack mb={2}>
                <FiServer />
                <Text fontWeight="bold">Redis</Text>
              </HStack>
              <Badge colorScheme={health.redis.ok ? 'green' : 'red'}>
                {health.redis.ok ? 'Connected' : 'Disconnected'}
              </Badge>
              {health.redis.error && (
                <Text fontSize="xs" color="red.600" mt={1}>
                  {health.redis.error}
                </Text>
              )}
            </Box>
          </GridItem>

          {/* Backend */}
          <GridItem>
            <Box
              p={4}
              borderRadius="md"
              border="1px"
              borderColor={borderColor}
              bg={health.services.backend.ok ? 'green.50' : 'red.50'}
            >
              <HStack mb={2}>
                <FiServer />
                <Text fontWeight="bold">Backend</Text>
              </HStack>
              <Badge colorScheme={health.services.backend.ok ? 'green' : 'red'}>
                {health.services.backend.ok ? 'Running' : 'Down'}
              </Badge>
              {health.services.backend.ok && (
                <Text fontSize="xs" mt={1}>
                  Uptime: {formatUptime(health.services.backend.uptime)}
                </Text>
              )}
            </Box>
          </GridItem>

          {/* Workers */}
          <GridItem>
            <Box
              p={4}
              borderRadius="md"
              border="1px"
              borderColor={borderColor}
              bg={health.services.workers.ok ? 'green.50' : 'red.50'}
            >
              <HStack mb={2}>
                <FiActivity />
                <Text fontWeight="bold">Workers</Text>
              </HStack>
              <Badge colorScheme={health.services.workers.ok ? 'green' : 'red'}>
                {health.services.workers.ok ? 'Active' : 'Inactive'}
              </Badge>
            </Box>
          </GridItem>
        </Grid>
      </Box>

      {/* Log Ingestion Stats */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <Heading size="md" mb={4}>Log Ingestion</Heading>
        
        <Grid templateColumns="repeat(2, 1fr)" gap={6}>
          <GridItem>
            <Stat>
              <StatLabel>Recent Logs (1h)</StatLabel>
              <StatNumber>{health.logIngestion.recentLogs.toLocaleString()}</StatNumber>
              <StatHelpText>
                <StatArrow type={health.logIngestion.recentLogs > 0 ? 'increase' : 'decrease'} />
                {health.logIngestion.recentLogs > 0 ? 'Active' : 'No activity'}
              </StatHelpText>
            </Stat>
          </GridItem>

          <GridItem>
            <Stat>
              <StatLabel>Error Rate</StatLabel>
              <StatNumber>{health.logIngestion.errorRate.toFixed(2)}%</StatNumber>
              <StatHelpText>
                <Badge
                  colorScheme={
                    health.logIngestion.errorRate > 10
                      ? 'red'
                      : health.logIngestion.errorRate > 5
                      ? 'orange'
                      : 'green'
                  }
                >
                  {health.logIngestion.errorRate > 10
                    ? 'High'
                    : health.logIngestion.errorRate > 5
                    ? 'Medium'
                    : 'Low'}
                </Badge>
              </StatHelpText>
            </Stat>
          </GridItem>
        </Grid>

        <Box mt={4}>
          <Text fontSize="sm" mb={2}>Error Rate Threshold</Text>
          <Progress
            value={health.logIngestion.errorRate}
            max={20}
            colorScheme={
              health.logIngestion.errorRate > 10
                ? 'red'
                : health.logIngestion.errorRate > 5
                ? 'orange'
                : 'green'
            }
            hasStripe
            isAnimated
          />
          <HStack justify="space-between" mt={1}>
            <Text fontSize="xs">0%</Text>
            <Text fontSize="xs">5%</Text>
            <Text fontSize="xs">10%</Text>
            <Text fontSize="xs">20%</Text>
          </HStack>
        </Box>
      </Box>

      {/* System Resources (placeholder for future) */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <Heading size="md" mb={4}>System Resources</Heading>
        
        <Grid templateColumns="repeat(3, 1fr)" gap={6}>
          <GridItem>
            <VStack align="stretch">
              <HStack justify="space-between">
                <Text fontSize="sm">CPU Usage</Text>
                <Text fontSize="sm" fontWeight="bold">--</Text>
              </HStack>
              <Progress value={0} size="sm" />
            </VStack>
          </GridItem>

          <GridItem>
            <VStack align="stretch">
              <HStack justify="space-between">
                <Text fontSize="sm">Memory Usage</Text>
                <Text fontSize="sm" fontWeight="bold">--</Text>
              </HStack>
              <Progress value={0} size="sm" />
            </VStack>
          </GridItem>

          <GridItem>
            <VStack align="stretch">
              <HStack justify="space-between">
                <Text fontSize="sm">Disk Usage</Text>
                <Text fontSize="sm" fontWeight="bold">--</Text>
              </HStack>
              <Progress value={0} size="sm" />
            </VStack>
          </GridItem>
        </Grid>

        <Text fontSize="xs" color="gray.500" mt={4}>
          Note: System resource monitoring will be available in a future update
        </Text>
      </Box>
    </VStack>
  )
}

export default SystemHealth