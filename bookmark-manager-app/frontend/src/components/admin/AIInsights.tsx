import React, { useState, useEffect } from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Badge,
  Button,
  useColorModeValue,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  List,
  ListItem,
  ListIcon,
  Progress,
  IconButton,
  Tooltip,
  useToast,
  Grid,
  GridItem,
} from '@chakra-ui/react'
import {
  FiAlertCircle,
  FiTrendingUp,
  FiSearch,
  FiZap,
  FiCheckCircle,
  FiAlertTriangle,
  FiRefreshCw,
  FiPlay,
  FiInfo,
} from 'react-icons/fi'
import api from '../../services/api'
import logger from '../../services/logger'

interface AIInsightsProps {
  timeRange: string
}

interface Insight {
  id: string
  created_at: string
  period_start: string
  period_end: string
  analysis_type: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  description: string
  affected_services: string[]
  recommendations: {
    immediate?: string[]
    preventive?: string[]
  }
  confidence_score: number
  metadata?: any
  status: 'new' | 'acknowledged' | 'resolved'
}

const AIInsights: React.FC<AIInsightsProps> = ({ timeRange }) => {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [lastAnalysis, setLastAnalysis] = useState<Date | null>(null)
  const toast = useToast()

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    fetchInsights()
  }, [timeRange])

  const fetchInsights = async () => {
    try {
      logger.debug('Fetching AI insights', { timeRange })
      const response = await api.get(`/admin/ai-insights?timeRange=${timeRange}`)
      setInsights(response.data.insights)
      setLastAnalysis(response.data.lastAnalysis ? new Date(response.data.lastAnalysis) : null)
      logger.info('AI insights fetched', { count: response.data.insights.length })
    } catch (error) {
      logger.error('Failed to fetch AI insights', error)
    } finally {
      setLoading(false)
    }
  }

  const triggerAnalysis = async () => {
    setAnalyzing(true)
    try {
      logger.info('Triggering AI analysis', { timeRange })
      const response = await api.post('/admin/ai-insights/analyze', { timeRange })
      
      toast({
        title: 'Analysis Started',
        description: `Found ${response.data.insights.length} new insights`,
        status: 'success',
        duration: 3000,
      })

      await fetchInsights()
    } catch (error) {
      logger.error('Failed to trigger analysis', error)
      toast({
        title: 'Analysis Failed',
        description: 'Could not start log analysis',
        status: 'error',
        duration: 3000,
      })
    } finally {
      setAnalyzing(false)
    }
  }

  const acknowledgeInsight = async (insightId: string) => {
    try {
      await api.patch(`/admin/ai-insights/${insightId}/acknowledge`)
      setInsights(prev => prev.map(i => 
        i.id === insightId ? { ...i, status: 'acknowledged' } : i
      ))
      logger.info('Insight acknowledged', { insightId })
    } catch (error) {
      logger.error('Failed to acknowledge insight', error)
    }
  }

  const resolveInsight = async (insightId: string) => {
    try {
      await api.patch(`/admin/ai-insights/${insightId}/resolve`)
      setInsights(prev => prev.map(i => 
        i.id === insightId ? { ...i, status: 'resolved' } : i
      ))
      logger.info('Insight resolved', { insightId })
    } catch (error) {
      logger.error('Failed to resolve insight', error)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'red'
      case 'warning':
        return 'orange'
      case 'info':
        return 'blue'
      default:
        return 'gray'
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'anomaly':
        return FiAlertCircle
      case 'pattern':
        return FiTrendingUp
      case 'root_cause':
        return FiSearch
      default:
        return FiZap
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Spinner size="xl" />
      </Box>
    )
  }

  const activeInsights = insights.filter(i => i.status !== 'resolved')
  const criticalInsights = activeInsights.filter(i => i.severity === 'critical')
  const warningInsights = activeInsights.filter(i => i.severity === 'warning')

  return (
    <VStack spacing={6} align="stretch">
      {/* Header with Actions */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <HStack justify="space-between" mb={4}>
          <VStack align="start" spacing={1}>
            <Heading size="md">AI Insights</Heading>
            {lastAnalysis && (
              <Text fontSize="sm" color="gray.600">
                Last analysis: {lastAnalysis.toLocaleString()}
              </Text>
            )}
          </VStack>
          <Button
            leftIcon={<FiPlay />}
            colorScheme="blue"
            onClick={triggerAnalysis}
            isLoading={analyzing}
            loadingText="Analyzing..."
          >
            Run Analysis
          </Button>
        </HStack>

        {/* Summary Stats */}
        <HStack spacing={4}>
          <Box p={3} borderRadius="md" bg="red.50" border="1px" borderColor="red.200">
            <HStack>
              <Box as={FiAlertTriangle} color="red.500" />
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="bold">Critical</Text>
                <Text fontSize="lg" fontWeight="bold" color="red.600">
                  {criticalInsights.length}
                </Text>
              </VStack>
            </HStack>
          </Box>

          <Box p={3} borderRadius="md" bg="orange.50" border="1px" borderColor="orange.200">
            <HStack>
              <Box as={FiAlertCircle} color="orange.500" />
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="bold">Warnings</Text>
                <Text fontSize="lg" fontWeight="bold" color="orange.600">
                  {warningInsights.length}
                </Text>
              </VStack>
            </HStack>
          </Box>

          <Box p={3} borderRadius="md" bg="green.50" border="1px" borderColor="green.200">
            <HStack>
              <Box as={FiCheckCircle} color="green.500" />
              <VStack align="start" spacing={0}>
                <Text fontSize="sm" fontWeight="bold">Resolved</Text>
                <Text fontSize="lg" fontWeight="bold" color="green.600">
                  {insights.filter(i => i.status === 'resolved').length}
                </Text>
              </VStack>
            </HStack>
          </Box>
        </HStack>
      </Box>

      {/* No Insights Alert */}
      {insights.length === 0 && (
        <Alert status="info">
          <AlertIcon />
          <AlertTitle>No insights available</AlertTitle>
          <AlertDescription>
            Run an analysis to generate AI-powered insights from your logs.
          </AlertDescription>
        </Alert>
      )}

      {/* Critical Insights First */}
      {criticalInsights.length > 0 && (
        <Box
          bg={bgColor}
          p={6}
          borderRadius="md"
          border="2px"
          borderColor="red.400"
        >
          <Heading size="sm" mb={4} color="red.600">
            Critical Issues Requiring Immediate Attention
          </Heading>
          <VStack align="stretch" spacing={4}>
            {criticalInsights.map(insight => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onAcknowledge={acknowledgeInsight}
                onResolve={resolveInsight}
              />
            ))}
          </VStack>
        </Box>
      )}

      {/* Other Insights */}
      {activeInsights.filter(i => i.severity !== 'critical').length > 0 && (
        <Box
          bg={bgColor}
          p={6}
          borderRadius="md"
          border="1px"
          borderColor={borderColor}
        >
          <Heading size="sm" mb={4}>Active Insights</Heading>
          <Accordion allowMultiple>
            {activeInsights
              .filter(i => i.severity !== 'critical')
              .map(insight => (
                <AccordionItem key={insight.id}>
                  <h2>
                    <AccordionButton>
                      <Box flex="1" textAlign="left">
                        <HStack spacing={3}>
                          <Box as={getTypeIcon(insight.analysis_type)} />
                          <Text fontWeight="medium">{insight.title}</Text>
                          <Badge colorScheme={getSeverityColor(insight.severity)}>
                            {insight.severity}
                          </Badge>
                          {insight.status === 'acknowledged' && (
                            <Badge colorScheme="purple">Acknowledged</Badge>
                          )}
                        </HStack>
                      </Box>
                      <AccordionIcon />
                    </AccordionButton>
                  </h2>
                  <AccordionPanel pb={4}>
                    <InsightDetails
                      insight={insight}
                      onAcknowledge={acknowledgeInsight}
                      onResolve={resolveInsight}
                    />
                  </AccordionPanel>
                </AccordionItem>
              ))}
          </Accordion>
        </Box>
      )}
    </VStack>
  )
}

interface InsightCardProps {
  insight: Insight
  onAcknowledge: (id: string) => void
  onResolve: (id: string) => void
}

const InsightCard: React.FC<InsightCardProps> = ({ insight, onAcknowledge, onResolve }) => {
  const borderColor = useColorModeValue('red.200', 'red.700')
  
  return (
    <Box
      p={4}
      borderRadius="md"
      border="1px"
      borderColor={borderColor}
      bg={useColorModeValue('red.50', 'red.900')}
    >
      <InsightDetails
        insight={insight}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
      />
    </Box>
  )
}

interface InsightDetailsProps {
  insight: Insight
  onAcknowledge: (id: string) => void
  onResolve: (id: string) => void
}

const InsightDetails: React.FC<InsightDetailsProps> = ({ insight, onAcknowledge, onResolve }) => {
  return (
    <VStack align="stretch" spacing={3}>
      <Text>{insight.description}</Text>
      
      {/* Confidence Score */}
      <Box>
        <HStack justify="space-between" mb={1}>
          <Text fontSize="sm">Confidence</Text>
          <Text fontSize="sm">{(insight.confidence_score * 100).toFixed(0)}%</Text>
        </HStack>
        <Progress
          value={insight.confidence_score * 100}
          size="sm"
          colorScheme={insight.confidence_score > 0.8 ? 'green' : 'orange'}
        />
      </Box>

      {/* Affected Services */}
      <Box>
        <Text fontSize="sm" fontWeight="bold" mb={1}>Affected Services:</Text>
        <HStack wrap="wrap">
          {insight.affected_services.map(service => (
            <Badge key={service} variant="outline">
              {service}
            </Badge>
          ))}
        </HStack>
      </Box>

      {/* Recommendations */}
      {(insight.recommendations.immediate || insight.recommendations.preventive) && (
        <Box>
          <Text fontSize="sm" fontWeight="bold" mb={2}>Recommendations:</Text>
          
          {insight.recommendations.immediate && (
            <Box mb={2}>
              <Text fontSize="xs" fontWeight="medium" mb={1}>Immediate Actions:</Text>
              <List spacing={1}>
                {insight.recommendations.immediate.map((rec, idx) => (
                  <ListItem key={idx} fontSize="sm">
                    <ListIcon as={FiAlertTriangle} color="orange.500" />
                    {rec}
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {insight.recommendations.preventive && (
            <Box>
              <Text fontSize="xs" fontWeight="medium" mb={1}>Preventive Measures:</Text>
              <List spacing={1}>
                {insight.recommendations.preventive.map((rec, idx) => (
                  <ListItem key={idx} fontSize="sm">
                    <ListIcon as={FiInfo} color="blue.500" />
                    {rec}
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Box>
      )}

      {/* Metadata */}
      {insight.metadata && Object.keys(insight.metadata).length > 0 && (
        <Box>
          <Text fontSize="sm" fontWeight="bold" mb={1}>Additional Details:</Text>
          <Box
            p={2}
            borderRadius="md"
            bg={useColorModeValue('gray.100', 'gray.700')}
            fontSize="xs"
            fontFamily="mono"
          >
            <pre>{JSON.stringify(insight.metadata, null, 2)}</pre>
          </Box>
        </Box>
      )}

      {/* Actions */}
      <HStack>
        {insight.status === 'new' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAcknowledge(insight.id)}
          >
            Acknowledge
          </Button>
        )}
        {insight.status !== 'resolved' && (
          <Button
            size="sm"
            colorScheme="green"
            onClick={() => onResolve(insight.id)}
          >
            Mark Resolved
          </Button>
        )}
      </HStack>
    </VStack>
  )
}

export default AIInsights