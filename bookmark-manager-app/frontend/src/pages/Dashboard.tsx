import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  Heading,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Card,
  CardBody,
  Icon,
  Flex,
  Text,
  useColorModeValue,
  Spinner,
  SimpleGrid,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Progress,
  VStack,
  HStack,
  Button,
  CircularProgress,
  CircularProgressLabel,
  Divider,
} from '@chakra-ui/react'
import { 
  FiBookmark, 
  FiFolder, 
  FiTag, 
  FiUpload,
  FiCpu,
  FiActivity,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiPause,
  FiPlay,
} from 'react-icons/fi'
import { IconType } from 'react-icons'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSocket } from '../contexts/SocketContext'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { DashboardStats } from '../types'

interface StatCardData {
  title: string
  value: number
  icon: IconType
  color: string
  change?: number
}

interface OrchestratorData {
  health: {
    agents: Record<string, {
      type: string
      waiting: number
      active: number
      completed: number
      failed: number
      delayed: number
      paused: number
      healthy: boolean
      lastUpdated: number
    }>
    workflows: {
      active: number
      details: Array<{
        id: string
        type: string
        status: string
        progress: {
          percentage: number
          completedSteps: number
          totalSteps: number
        }
        duration: number
      }>
    }
    timestamp: number
  }
  queueStats: Record<string, {
    counts: {
      waiting: number
      active: number
      completed: number
      failed: number
      delayed: number
      paused: number
    }
    workers: number
    isPaused: boolean
  }>
  activeWorkflows: Array<{
    id: string
    type: string
    status: string
    progress: {
      percentage: number
      completedSteps: number
      totalSteps: number
    }
    startTime: number
    bookmarkCount: number
  }>
}

const Dashboard: React.FC = () => {
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const { user } = useAuth()
  const { socket, connected } = useSocket()
  const queryClient = useQueryClient()
  const [orchestratorHealth, setOrchestratorHealth] = useState<any>(null)
  
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get<DashboardStats>('/stats/dashboard')
      return response.data
    },
  })

  const { data: orchestratorData } = useQuery<OrchestratorData>({
    queryKey: ['orchestrator-dashboard'],
    queryFn: async () => {
      const response = await api.get<OrchestratorData>('/orchestrator/dashboard')
      return response.data
    },
    refetchInterval: 30000, // Refresh every 30 seconds to avoid rate limiting
    enabled: user?.role === 'admin',
  })

  // Subscribe to orchestrator health updates
  useEffect(() => {
    if (socket && connected && user?.role === 'admin') {
      socket.on('orchestrator:health', (health) => {
        setOrchestratorHealth(health)
        queryClient.invalidateQueries({ queryKey: ['orchestrator-dashboard'] })
      })

      // Subscribe to orchestrator updates
      socket.emit('subscribe:orchestrator')

      return () => {
        socket.off('orchestrator:health')
      }
    }
  }, [socket, connected, user])

  const pauseAgentMutation = useMutation({
    mutationFn: async (agentType: string) => {
      await api.post(`/orchestrator/agent/${agentType}/pause`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-dashboard'] })
    },
  })

  const resumeAgentMutation = useMutation({
    mutationFn: async (agentType: string) => {
      await api.post(`/orchestrator/agent/${agentType}/resume`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-dashboard'] })
    },
  })

  const statCards: StatCardData[] = [
    {
      title: 'Total Bookmarks',
      value: stats?.totalBookmarks || 0,
      icon: FiBookmark,
      color: 'brand.500',
      change: stats?.bookmarkChange,
    },
    {
      title: 'Collections',
      value: stats?.totalCollections || 0,
      icon: FiFolder,
      color: 'green.500',
    },
    {
      title: 'Tags',
      value: stats?.totalTags || 0,
      icon: FiTag,
      color: 'purple.500',
    },
    {
      title: 'Recent Imports',
      value: stats?.recentImports || 0,
      icon: FiUpload,
      color: 'orange.500',
    },
  ]

  const getAgentStatusColor = (agent: any) => {
    if (!agent.healthy) return 'red'
    if (agent.active > 0) return 'green'
    if (agent.waiting > 0) return 'yellow'
    return 'gray'
  }

  const getAgentIcon = (agentType: string) => {
    const icons: Record<string, IconType> = {
      validation: FiCheckCircle,
      enrichment: FiCpu,
      categorization: FiTag,
      embedding: FiActivity,
      screenshot: FiFolder,
    }
    return icons[agentType] || FiCpu
  }

  if (isLoading) {
    return (
      <Flex justify="center" align="center" minH="400px">
        <Spinner size="xl" color="brand.500" />
      </Flex>
    )
  }

  return (
    <Box>
      <Heading size="lg" mb={6}>Dashboard</Heading>
      
      <Tabs variant="enclosed" colorScheme="brand">
        <TabList>
          <Tab>Overview</Tab>
          {user?.role === 'admin' && <Tab>System Status</Tab>}
        </TabList>

        <TabPanels>
          <TabPanel>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} mb={8}>
              {statCards.map((stat, index) => (
                <Card key={index} bg={cardBg}>
                  <CardBody>
                    <Flex justify="space-between" align="start">
                      <Stat>
                        <StatLabel>{stat.title}</StatLabel>
                        <StatNumber>{stat.value.toLocaleString()}</StatNumber>
                        {stat.change !== undefined && (
                          <StatHelpText>
                            <StatArrow type={stat.change >= 0 ? 'increase' : 'decrease'} />
                            {Math.abs(stat.change)}%
                          </StatHelpText>
                        )}
                      </Stat>
                      <Icon as={stat.icon} w={8} h={8} color={stat.color} />
                    </Flex>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>

            <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={6}>
              <Card bg={cardBg}>
                <CardBody>
                  <Heading size="md" mb={4}>Bookmarks by Domain</Heading>
                  {stats?.domainStats && stats.domainStats.length > 0 && (
                    <Box h="300px" w="100%" minH="300px">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.domainStats.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="domain" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#2196f3" />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                  {(!stats?.domainStats || stats.domainStats.length === 0) && (
                    <Box h="300px" display="flex" alignItems="center" justifyContent="center">
                      <Text color="gray.500">No domain statistics available</Text>
                    </Box>
                  )}
                </CardBody>
              </Card>

              <Card bg={cardBg}>
                <CardBody>
                  <Heading size="md" mb={4}>Recent Activity</Heading>
                  <Box maxH="300px" overflowY="auto">
                    {stats?.recentActivity?.map((activity, index) => (
                      <Box key={index} py={2} borderBottomWidth={1}>
                        <Text fontSize="sm" fontWeight="medium">
                          {activity.action}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {new Date(activity.timestamp).toLocaleString()}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                </CardBody>
              </Card>
            </Grid>
          </TabPanel>

          {user?.role === 'admin' && (
            <TabPanel>
              <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={6}>
                {/* Autonomous Agents Status */}
                <Card bg={cardBg}>
                  <CardBody>
                    <Heading size="md" mb={4}>Autonomous Agents</Heading>
                    <VStack spacing={4} align="stretch">
                      {orchestratorData && Object.entries(orchestratorData.queueStats).map(([agentType, stats]) => (
                        <Box key={agentType} p={3} borderWidth={1} borderRadius="md" borderColor={borderColor}>
                          <HStack justify="space-between" mb={2}>
                            <HStack>
                              <Icon as={getAgentIcon(agentType)} color={`${getAgentStatusColor(orchestratorData.health.agents[agentType])}.500`} />
                              <Text fontWeight="medium" textTransform="capitalize">{agentType}</Text>
                              {stats.isPaused && <Badge colorScheme="yellow">Paused</Badge>}
                            </HStack>
                            <Button
                              size="xs"
                              onClick={() => stats.isPaused ? resumeAgentMutation.mutate(agentType) : pauseAgentMutation.mutate(agentType)}
                              leftIcon={<Icon as={stats.isPaused ? FiPlay : FiPause} />}
                            >
                              {stats.isPaused ? 'Resume' : 'Pause'}
                            </Button>
                          </HStack>
                          <HStack spacing={4} fontSize="sm">
                            <Text>Active: <Badge colorScheme="green">{stats.counts.active}</Badge></Text>
                            <Text>Waiting: <Badge colorScheme="yellow">{stats.counts.waiting}</Badge></Text>
                            <Text>Failed: <Badge colorScheme="red">{stats.counts.failed}</Badge></Text>
                            <Text>Workers: <Badge>{stats.workers}</Badge></Text>
                          </HStack>
                          <Progress 
                            value={stats.counts.completed} 
                            max={stats.counts.completed + stats.counts.waiting + stats.counts.active} 
                            size="xs" 
                            mt={2} 
                            colorScheme="green"
                          />
                        </Box>
                      ))}
                    </VStack>
                  </CardBody>
                </Card>

                {/* Active Workflows */}
                <Card bg={cardBg}>
                  <CardBody>
                    <Heading size="md" mb={4}>Active Workflows</Heading>
                    {orchestratorData?.activeWorkflows.length === 0 ? (
                      <Text color="gray.500">No active workflows</Text>
                    ) : (
                      <VStack spacing={4} align="stretch">
                        {orchestratorData?.activeWorkflows.map((workflow) => (
                          <Box key={workflow.id} p={3} borderWidth={1} borderRadius="md" borderColor={borderColor}>
                            <HStack justify="space-between" mb={2}>
                              <VStack align="start" spacing={0}>
                                <Text fontWeight="medium">{workflow.type} Workflow</Text>
                                <Text fontSize="xs" color="gray.500">
                                  {workflow.bookmarkCount} bookmarks
                                </Text>
                              </VStack>
                              <CircularProgress value={workflow.progress.percentage} size="40px" color="brand.500">
                                <CircularProgressLabel fontSize="xs">
                                  {workflow.progress.percentage}%
                                </CircularProgressLabel>
                              </CircularProgress>
                            </HStack>
                            <Text fontSize="xs" color="gray.500">
                              Duration: {Math.round((Date.now() - workflow.startTime) / 1000)}s
                            </Text>
                          </Box>
                        ))}
                      </VStack>
                    )}
                  </CardBody>
                </Card>
              </Grid>

              {/* System Health Summary */}
              <Card bg={cardBg} mt={6}>
                <CardBody>
                  <Heading size="md" mb={4}>System Health</Heading>
                  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                    <Stat>
                      <StatLabel>WebSocket</StatLabel>
                      <StatNumber>
                        <Badge colorScheme={connected ? 'green' : 'red'}>
                          {connected ? 'Connected' : 'Disconnected'}
                        </Badge>
                      </StatNumber>
                    </Stat>
                    <Stat>
                      <StatLabel>Active Workflows</StatLabel>
                      <StatNumber>{orchestratorData?.health.workflows.active || 0}</StatNumber>
                    </Stat>
                    <Stat>
                      <StatLabel>Total Agents</StatLabel>
                      <StatNumber>{Object.keys(orchestratorData?.health.agents || {}).length}</StatNumber>
                    </Stat>
                    <Stat>
                      <StatLabel>Last Update</StatLabel>
                      <StatNumber fontSize="sm">
                        {orchestratorHealth ? new Date(orchestratorHealth.timestamp).toLocaleTimeString() : 'N/A'}
                      </StatNumber>
                    </Stat>
                  </SimpleGrid>
                </CardBody>
              </Card>
            </TabPanel>
          )}
        </TabPanels>
      </Tabs>
    </Box>
  )
}

export default Dashboard