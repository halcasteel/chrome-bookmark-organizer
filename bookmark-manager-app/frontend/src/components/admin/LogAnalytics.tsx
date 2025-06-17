import React, { useState, useEffect } from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Select,
  useColorModeValue,
  Spinner,
  Alert,
  AlertIcon,
  Grid,
  GridItem,
  Text,
  Badge,
} from '@chakra-ui/react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import api from '../../services/api'
import logger from '../../services/logger'

interface LogAnalyticsProps {
  timeRange: string
}

interface Analytics {
  timeSeries: Array<{
    time: string
    total: number
    errors: number
    warnings: number
    info: number
    debug: number
  }>
  serviceBreakdown: Array<{
    service: string
    count: number
    errors: number
    avg_duration: number
  }>
  errorPatterns: Array<{
    error_type: string
    count: number
    affected_services: number
    last_occurrence: string
  }>
}

const LogAnalytics: React.FC<LogAnalyticsProps> = ({ timeRange }) => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState('hour')

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  // Chart colors
  const COLORS = {
    total: '#3182CE',
    error: '#E53E3E',
    warning: '#D69E2E',
    info: '#3182CE',
    debug: '#718096',
  }

  const PIE_COLORS = ['#3182CE', '#E53E3E', '#D69E2E', '#38A169', '#805AD5', '#D69E2E']

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange, groupBy])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      logger.debug('Fetching log analytics', { timeRange, groupBy })
      
      const response = await api.get(`/admin/analytics?timeRange=${timeRange}&groupBy=${groupBy}`)
      setAnalytics(response.data)
      
      logger.info('Analytics fetched successfully')
    } catch (error) {
      logger.error('Failed to fetch analytics', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (time: string) => {
    const date = new Date(time)
    if (groupBy === 'hour') {
      return date.toLocaleString('en-US', { hour: 'numeric', hour12: true })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Spinner size="xl" />
      </Box>
    )
  }

  if (!analytics) {
    return (
      <Alert status="error">
        <AlertIcon />
        No analytics data available
      </Alert>
    )
  }

  return (
    <VStack spacing={6} align="stretch">
      {/* Controls */}
      <HStack justify="space-between">
        <Heading size="md">Log Analytics</Heading>
        <Select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value)}
          maxW="200px"
        >
          <option value="hour">Group by Hour</option>
          <option value="day">Group by Day</option>
        </Select>
      </HStack>

      {/* Time Series Chart */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <Heading size="sm" mb={4}>Log Volume Over Time</Heading>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={analytics.timeSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              tickFormatter={formatTime}
              interval="preserveStartEnd"
            />
            <YAxis />
            <Tooltip 
              labelFormatter={(value) => new Date(value).toLocaleString()}
              contentStyle={{ backgroundColor: bgColor }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="total" 
              stroke={COLORS.total} 
              name="Total"
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="errors" 
              stroke={COLORS.error} 
              name="Errors"
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="warnings" 
              stroke={COLORS.warning} 
              name="Warnings"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <Grid templateColumns="repeat(2, 1fr)" gap={6}>
        {/* Service Breakdown */}
        <GridItem>
          <Box
            bg={bgColor}
            p={6}
            borderRadius="md"
            border="1px"
            borderColor={borderColor}
            height="400px"
          >
            <Heading size="sm" mb={4}>Logs by Service</Heading>
            <ResponsiveContainer width="100%" height="90%">
              <PieChart>
                <Pie
                  data={analytics.serviceBreakdown.slice(0, 6)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ service, percent }) => `${service} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="service"
                >
                  {analytics.serviceBreakdown.slice(0, 6).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </GridItem>

        {/* Error Distribution */}
        <GridItem>
          <Box
            bg={bgColor}
            p={6}
            borderRadius="md"
            border="1px"
            borderColor={borderColor}
            height="400px"
          >
            <Heading size="sm" mb={4}>Service Error Rates</Heading>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={analytics.serviceBreakdown.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="service" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="errors" fill={COLORS.error} name="Errors" />
                <Bar dataKey="count" fill={COLORS.info} name="Total" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </GridItem>
      </Grid>

      {/* Error Patterns */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <Heading size="sm" mb={4}>Common Error Patterns</Heading>
        <VStack align="stretch" spacing={3}>
          {analytics.errorPatterns.map((pattern, index) => (
            <Box
              key={index}
              p={4}
              borderRadius="md"
              border="1px"
              borderColor={borderColor}
            >
              <HStack justify="space-between" mb={2}>
                <Text fontWeight="bold">{pattern.error_type}</Text>
                <Badge colorScheme="red" fontSize="md">
                  {pattern.count} occurrences
                </Badge>
              </HStack>
              <HStack justify="space-between">
                <Text fontSize="sm" color="gray.600">
                  Affected services: {pattern.affected_services}
                </Text>
                <Text fontSize="sm" color="gray.600">
                  Last seen: {new Date(pattern.last_occurrence).toLocaleString()}
                </Text>
              </HStack>
            </Box>
          ))}
        </VStack>
      </Box>

      {/* Performance Metrics */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <Heading size="sm" mb={4}>Average Response Times by Service</Heading>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart 
            data={analytics.serviceBreakdown
              .filter(s => s.avg_duration > 0)
              .sort((a, b) => b.avg_duration - a.avg_duration)
              .slice(0, 10)
            }
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="service" angle={-45} textAnchor="end" height={80} />
            <YAxis label={{ value: 'Duration (ms)', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(value: number) => `${value.toFixed(0)}ms`} />
            <Bar dataKey="avg_duration" fill="#38A169" name="Avg Duration" />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </VStack>
  )
}

export default LogAnalytics