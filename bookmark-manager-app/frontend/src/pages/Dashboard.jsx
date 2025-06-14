import React from 'react'
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
} from '@chakra-ui/react'
import { FiBookmark, FiFolder, FiTag, FiUpload } from 'react-icons/fi'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const Dashboard = () => {
  const cardBg = useColorModeValue('white', 'gray.800')
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const response = await api.get('/stats/dashboard')
      return response.data
    },
  })

  const statCards = [
    {
      title: 'Total Bookmarks',
      value: stats?.totalBookmarks || 0,
      icon: FiBookmark,
      color: 'brand.500',
      change: stats?.bookmarkChange || 0,
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
            {stats?.domainStats && (
              <Box h="300px">
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
    </Box>
  )
}

export default Dashboard