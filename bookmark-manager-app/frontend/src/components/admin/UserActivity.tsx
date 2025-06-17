import React, { useState, useEffect } from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Badge,
  Avatar,
  useColorModeValue,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Grid,
  GridItem,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Select,
  FormControl,
  FormLabel,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from '@chakra-ui/react'
import {
  FiUser,
  FiLogIn,
  FiBookmark,
  FiSearch,
  FiUpload,
  FiActivity,
  FiTrendingUp,
} from 'react-icons/fi'
import { formatDistanceToNow } from 'date-fns'
import api from '../../services/api'
import logger from '../../services/logger'

interface UserActivityProps {
  timeRange: string
}

const UserActivity: React.FC<UserActivityProps> = ({ timeRange }) => {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        logger.debug('Fetching user activity', { timeRange })
        const response = await api.get(`/admin/users/activity?timeRange=${timeRange}`)
        setData(response.data)
        logger.info('User activity fetched successfully')
      } catch (error) {
        logger.error('Failed to fetch user activity', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [timeRange])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Spinner size="xl" />
      </Box>
    )
  }

  if (!data) {
    return (
      <Alert status="info">
        <AlertIcon />
        <AlertTitle>No user activity data</AlertTitle>
        <AlertDescription>
          User activity tracking will be available once users start using the system.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <VStack spacing={6} align="stretch">
      <HStack justify="space-between">
        <Heading size="md">User Activity</Heading>
        <FormControl maxW="200px">
          <FormLabel fontSize="sm">Time Range</FormLabel>
          <Select value={timeRange} size="sm">
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </Select>
        </FormControl>
      </HStack>

      {/* Summary Stats */}
      <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4}>
        <GridItem>
          <Box
            bg={bgColor}
            p={4}
            borderRadius="md"
            border="1px"
            borderColor={borderColor}
          >
            <Stat>
              <StatLabel>Total Users</StatLabel>
              <StatNumber>{data?.activitySummary?.totalUsers || 0}</StatNumber>
              <StatHelpText>Registered users</StatHelpText>
            </Stat>
          </Box>
        </GridItem>
        <GridItem>
          <Box
            bg={bgColor}
            p={4}
            borderRadius="md"
            border="1px"
            borderColor={borderColor}
          >
            <Stat>
              <StatLabel>Active Today</StatLabel>
              <StatNumber>{data?.activitySummary?.activeToday || 0}</StatNumber>
              <StatHelpText>Users active today</StatHelpText>
            </Stat>
          </Box>
        </GridItem>
        <GridItem>
          <Box
            bg={bgColor}
            p={4}
            borderRadius="md"
            border="1px"
            borderColor={borderColor}
          >
            <Stat>
              <StatLabel>Total Actions</StatLabel>
              <StatNumber>{data?.activitySummary?.totalActions || 0}</StatNumber>
              <StatHelpText>In selected period</StatHelpText>
            </Stat>
          </Box>
        </GridItem>
      </Grid>

      {/* Recent Activities */}
      <Box
        bg={bgColor}
        p={6}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
      >
        <Heading size="sm" mb={4}>Recent Activities</Heading>
        {data?.recentActivities?.length > 0 ? (
          <VStack align="stretch" spacing={3}>
            {data.recentActivities.slice(0, 10).map((activity: any, index: number) => (
              <HStack key={index} spacing={3}>
                <Avatar size="sm">
                  <Box as={FiUser} />
                </Avatar>
                <VStack align="start" spacing={0} flex={1}>
                  <HStack>
                    <Text fontWeight="medium">{activity.username}</Text>
                    <Badge colorScheme="blue" size="sm">
                      {activity.action}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="gray.600">
                    {activity.details}
                  </Text>
                </VStack>
                <Text fontSize="xs" color="gray.500">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : (
          <Text color="gray.500">No recent activity</Text>
        )}
      </Box>

      {/* User Stats Table */}
      <Box
        bg={bgColor}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
        overflow="hidden"
      >
        <Heading size="sm" p={4} pb={0}>User Statistics</Heading>
        <TableContainer>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th>Username</Th>
                <Th isNumeric>Logins</Th>
                <Th isNumeric>Bookmarks</Th>
                <Th isNumeric>Searches</Th>
                <Th>Last Login</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data?.userStats?.length > 0 ? (
                data.userStats.map((stat: any, index: number) => (
                  <Tr key={index}>
                    <Td>
                      <HStack>
                        <Avatar size="xs">
                          <Box as={FiUser} />
                        </Avatar>
                        <Text>{stat.username}</Text>
                      </HStack>
                    </Td>
                    <Td isNumeric>{stat.loginCount}</Td>
                    <Td isNumeric>{stat.bookmarkCount}</Td>
                    <Td isNumeric>{stat.searchCount}</Td>
                    <Td>{stat.lastLogin ? formatDistanceToNow(new Date(stat.lastLogin), { addSuffix: true }) : 'Never'}</Td>
                  </Tr>
                ))
              ) : (
                <Tr>
                  <Td colSpan={5} textAlign="center">
                    <Text color="gray.500">No user data available</Text>
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>
    </VStack>
  )
}

export default UserActivity