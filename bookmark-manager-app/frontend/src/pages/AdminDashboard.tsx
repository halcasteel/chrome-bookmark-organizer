import React, { useState } from 'react'
import {
  Box,
  Container,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Heading,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  useColorModeValue,
} from '@chakra-ui/react'
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiCpu,
  FiBell,
  FiUsers,
} from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import SystemHealth from '../components/admin/SystemHealth'
import LogsViewer from '../components/admin/LogsViewer'
import LogAnalytics from '../components/admin/LogAnalytics'
import AIInsights from '../components/admin/AIInsights'
import AlertsManager from '../components/admin/AlertsManager'
import UserActivity from '../components/admin/UserActivity'
import logger from '../services/logger'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [timeRange, setTimeRange] = useState('24h')
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  // Check if user is admin
  if (user?.role !== 'admin') {
    logger.warn('Non-admin user attempted to access admin dashboard', { 
      userId: user?.id,
      userRole: user?.role 
    })
    return (
      <Container maxW="6xl" py={8}>
        <Alert status="error">
          <AlertIcon />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to access the admin dashboard.
          </AlertDescription>
        </Alert>
      </Container>
    )
  }

  return (
    <Container maxW="8xl" py={4}>
      <Heading size="lg" mb={6}>
        Admin Dashboard
      </Heading>

      <Box
        bg={bgColor}
        borderRadius="lg"
        border="1px"
        borderColor={borderColor}
        overflow="hidden"
      >
        <Tabs variant="enclosed" colorScheme="brand">
          <TabList>
            <Tab>
              <Box as={FiCpu} mr={2} />
              System Health
            </Tab>
            <Tab>
              <Box as={FiActivity} mr={2} />
              Logs Viewer
            </Tab>
            <Tab>
              <Box as={FiBarChart2} mr={2} />
              Log Analytics
            </Tab>
            <Tab>
              <Box as={FiAlertTriangle} mr={2} />
              AI Insights
            </Tab>
            <Tab>
              <Box as={FiBell} mr={2} />
              Alerts
            </Tab>
            <Tab>
              <Box as={FiUsers} mr={2} />
              User Activity
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel p={6}>
              <SystemHealth timeRange={timeRange} />
            </TabPanel>
            <TabPanel p={6}>
              <LogsViewer timeRange={timeRange} />
            </TabPanel>
            <TabPanel p={6}>
              <LogAnalytics timeRange={timeRange} />
            </TabPanel>
            <TabPanel p={6}>
              <AIInsights timeRange={timeRange} />
            </TabPanel>
            <TabPanel p={6}>
              <AlertsManager />
            </TabPanel>
            <TabPanel p={6}>
              <UserActivity timeRange={timeRange} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Container>
  )
}