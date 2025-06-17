import React, { useState, useEffect } from 'react'
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Badge,
  Button,
  IconButton,
  Switch,
  useColorModeValue,
  Spinner,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  Grid,
  GridItem,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react'
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiBell,
  FiBellOff,
  FiMail,
  FiLink,
  FiAlertTriangle,
  FiX,
} from 'react-icons/fi'
import api from '../../services/api'
import logger from '../../services/logger'

const AlertsManager: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState([])
  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  useEffect(() => {
    // Simulate loading
    setTimeout(() => setLoading(false), 1000)
  }, [])

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Spinner size="xl" />
      </Box>
    )
  }

  return (
    <VStack spacing={6} align="stretch">
      <HStack justify="space-between">
        <Heading size="md">Alert Management</Heading>
        <Button leftIcon={<FiPlus />} colorScheme="blue">
          Create Alert Rule
        </Button>
      </HStack>
      
      <Box
        bg={bgColor}
        borderRadius="md"
        border="1px"
        borderColor={borderColor}
        overflow="hidden"
      >
        <Tabs>
          <TabList>
            <Tab>Active Rules</Tab>
            <Tab>Recommendations</Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <Alert status="info">
                <AlertIcon />
                <AlertTitle>No alert rules configured</AlertTitle>
                <AlertDescription>
                  Create your first alert rule to start monitoring your system.
                </AlertDescription>
              </Alert>
            </TabPanel>
            <TabPanel>
              <Alert status="info">
                <AlertIcon />
                <AlertTitle>AI Recommendations</AlertTitle>
                <AlertDescription>
                  AI-powered alert recommendations will appear here based on your log patterns.
                </AlertDescription>
              </Alert>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </VStack>
  )
}

export default AlertsManager