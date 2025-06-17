import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Card,
  CardHeader,
  CardBody,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  useToast,
  Spinner,
  Progress,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Grid,
  GridItem,
  IconButton,
  Tooltip,
  Code,
  Textarea,
  FormControl,
  FormLabel,
  Input,
  Select
} from '@chakra-ui/react';
import { 
  FaPlay, 
  FaStop, 
  FaEye, 
  FaDownload, 
  FaRobot, 
  FaPlus,
  FaHistory,
  FaChartLine,
  FaBug,
  FaCheckCircle,
  FaTimesCircle,
  FaClock
} from 'react-icons/fa';
import api from '../services/api';
import logger from '../services/logger';

interface TestSuite {
  id: string;
  name: string;
  description: string;
  category: string;
  test_case_count: number;
  last_execution: string | null;
  created_at: string;
}

interface TestRun {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  total_tests: number;
  passed: number;
  failed: number;
  created_by: string;
}

interface ActiveTestRun {
  run_id: string;
  suite_name: string;
  started_by: string;
  started_at: string;
  status: 'running';
}

interface TestWebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

const TestManagement: React.FC = () => {
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [activeRuns, setActiveRuns] = useState<ActiveTestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [selectedSuite, setSelectedSuite] = useState<TestSuite | null>(null);
  const [realtimeMessages, setRealtimeMessages] = useState<TestWebSocketMessage[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  
  const { isOpen: isExecuteOpen, onOpen: onExecuteOpen, onClose: onExecuteClose } = useDisclosure();
  const { isOpen: isGenerateOpen, onOpen: onGenerateOpen, onClose: onGenerateClose } = useDisclosure();
  const { isOpen: isDetailsOpen, onOpen: onDetailsOpen, onClose: onDetailsClose } = useDisclosure();
  
  const toast = useToast();

  useEffect(() => {
    loadTestSuites();
    loadTestRuns();
    initializeWebSocket();
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const initializeWebSocket = () => {
    try {
      const websocket = new WebSocket('ws://localhost:3004/test-websocket');
      
      websocket.onopen = () => {
        logger.info('Test Management WebSocket connected');
        setWs(websocket);
      };
      
      websocket.onmessage = (event) => {
        const message: TestWebSocketMessage = JSON.parse(event.data);
        setRealtimeMessages(prev => [message, ...prev.slice(0, 49)]); // Keep last 50 messages
        
        // Handle specific message types
        switch (message.type) {
          case 'test-run-started':
            toast({
              title: 'Test Run Started',
              description: `${message.data.suite} execution started by ${message.data.startedBy}`,
              status: 'info',
              duration: 5000
            });
            loadTestRuns(); // Refresh runs
            break;
            
          case 'test-run-completed':
            toast({
              title: 'Test Run Completed',
              description: `Test run ${message.data.runId} completed successfully`,
              status: 'success',
              duration: 5000
            });
            loadTestRuns();
            break;
            
          case 'test-run-failed':
            toast({
              title: 'Test Run Failed',
              description: `Test run ${message.data.runId} failed: ${message.data.error}`,
              status: 'error',
              duration: 10000
            });
            loadTestRuns();
            break;
        }
      };
      
      websocket.onerror = (error) => {
        logger.error('Test Management WebSocket error', { error });
      };
      
      websocket.onclose = () => {
        logger.info('Test Management WebSocket disconnected');
        setWs(null);
        // Attempt reconnection after 5 seconds
        setTimeout(initializeWebSocket, 5000);
      };
    } catch (error) {
      logger.error('Failed to initialize Test Management WebSocket', { error });
    }
  };

  const loadTestSuites = async () => {
    try {
      const response = await api.get('/test-management/suites');
      setTestSuites(response.data.data);
    } catch (error) {
      logger.error('Failed to load test suites', { error });
      toast({
        title: 'Error',
        description: 'Failed to load test suites',
        status: 'error',
        duration: 5000
      });
    }
  };

  const loadTestRuns = async () => {
    try {
      const response = await api.get('/test-management/runs');
      setTestRuns(response.data.data.completed);
      setActiveRuns(response.data.data.active);
      setLoading(false);
    } catch (error) {
      logger.error('Failed to load test runs', { error });
      setLoading(false);
    }
  };

  const executeTestSuite = async (suiteId: string, environment = 'development') => {
    try {
      setExecuting(true);
      const response = await api.post('/test-management/execute', {
        suiteId,
        environment,
        parameters: {
          baseUrl: 'http://localhost:5173'
        }
      });
      
      toast({
        title: 'Test Execution Started',
        description: `${response.data.testCaseCount} test cases queued for execution`,
        status: 'success',
        duration: 5000
      });
      
      onExecuteClose();
      loadTestRuns();
    } catch (error) {
      logger.error('Failed to execute test suite', { error });
      toast({
        title: 'Execution Failed',
        description: 'Failed to start test execution',
        status: 'error',
        duration: 5000
      });
    } finally {
      setExecuting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colorMap = {
      running: 'blue',
      completed: 'green',
      failed: 'red',
      passed: 'green'
    };
    
    return (
      <Badge colorScheme={colorMap[status] || 'gray'} size="sm">
        {status.toUpperCase()}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const calculatePassRate = (passed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((passed / total) * 100);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <Spinner size="xl" />
        <Text ml={4}>Loading test management...</Text>
      </Box>
    );
  }

  return (
    <Box p={6}>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between">
          <Heading size="lg">Test Management Control Panel</Heading>
          <HStack>
            <Button leftIcon={<FaRobot />} colorScheme="purple" onClick={onGenerateOpen}>
              AI Generate Tests
            </Button>
            <Button leftIcon={<FaPlus />} colorScheme="blue">
              Create Suite
            </Button>
          </HStack>
        </HStack>

        {/* Real-time Status */}
        {ws && (
          <Alert status="success">
            <AlertIcon />
            <Box>
              <AlertTitle>Live Monitoring Active</AlertTitle>
              <AlertDescription>
                Real-time test execution updates enabled
              </AlertDescription>
            </Box>
          </Alert>
        )}

        {/* Active Test Runs */}
        {activeRuns.length > 0 && (
          <Card>
            <CardHeader>
              <Heading size="md">Active Test Runs</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4}>
                {activeRuns.map((run) => (
                  <Box key={run.run_id} p={4} borderWidth={1} borderRadius="md" w="full">
                    <HStack justify="space-between">
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold">{run.suite_name}</Text>
                        <Text fontSize="sm" color="gray.600">
                          Started by {run.started_by} at {formatDate(run.started_at)}
                        </Text>
                      </VStack>
                      <HStack>
                        <Spinner size="sm" />
                        <Badge colorScheme="blue">RUNNING</Badge>
                      </HStack>
                    </HStack>
                    <Progress size="sm" isIndeterminate mt={2} />
                  </Box>
                ))}
              </VStack>
            </CardBody>
          </Card>
        )}

        <Tabs>
          <TabList>
            <Tab>Test Suites</Tab>
            <Tab>Execution History</Tab>
            <Tab>Real-time Monitor</Tab>
            <Tab>Analytics</Tab>
          </TabList>

          <TabPanels>
            {/* Test Suites Panel */}
            <TabPanel>
              <Card>
                <CardHeader>
                  <Heading size="md">Test Suites</Heading>
                </CardHeader>
                <CardBody>
                  <Table variant="simple">
                    <Thead>
                      <Tr>
                        <Th>Name</Th>
                        <Th>Category</Th>
                        <Th>Test Cases</Th>
                        <Th>Last Execution</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {testSuites.map((suite) => (
                        <Tr key={suite.id}>
                          <Td>
                            <VStack align="start" spacing={1}>
                              <Text fontWeight="bold">{suite.name}</Text>
                              <Text fontSize="sm" color="gray.600">
                                {suite.description}
                              </Text>
                            </VStack>
                          </Td>
                          <Td>
                            <Badge colorScheme="gray">{suite.category}</Badge>
                          </Td>
                          <Td>{suite.test_case_count}</Td>
                          <Td>
                            {suite.last_execution 
                              ? formatDate(suite.last_execution)
                              : 'Never'
                            }
                          </Td>
                          <Td>
                            <HStack>
                              <Tooltip label="Execute Test Suite">
                                <IconButton
                                  aria-label="Execute"
                                  icon={<FaPlay />}
                                  size="sm"
                                  colorScheme="green"
                                  onClick={() => {
                                    setSelectedSuite(suite);
                                    onExecuteOpen();
                                  }}
                                />
                              </Tooltip>
                              <Tooltip label="View Details">
                                <IconButton
                                  aria-label="View"
                                  icon={<FaEye />}
                                  size="sm"
                                  colorScheme="blue"
                                  onClick={() => {
                                    setSelectedSuite(suite);
                                    onDetailsOpen();
                                  }}
                                />
                              </Tooltip>
                            </HStack>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </TabPanel>

            {/* Execution History Panel */}
            <TabPanel>
              <Card>
                <CardHeader>
                  <Heading size="md">Test Execution History</Heading>
                </CardHeader>
                <CardBody>
                  <Table variant="simple">
                    <Thead>
                      <Tr>
                        <Th>Run ID</Th>
                        <Th>Started</Th>
                        <Th>Duration</Th>
                        <Th>Status</Th>
                        <Th>Results</Th>
                        <Th>Pass Rate</Th>
                        <Th>Executed By</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {testRuns.map((run) => (
                        <Tr key={run.run_id}>
                          <Td>
                            <Code fontSize="sm">{run.run_id.slice(-8)}</Code>
                          </Td>
                          <Td>{formatDate(run.started_at)}</Td>
                          <Td>
                            {run.completed_at 
                              ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                              : '-'
                            }
                          </Td>
                          <Td>{getStatusBadge(run.status)}</Td>
                          <Td>
                            <HStack>
                              <Badge colorScheme="green">{run.passed || 0}</Badge>
                              <Badge colorScheme="red">{run.failed || 0}</Badge>
                              <Text fontSize="sm">/ {run.total_tests || 0}</Text>
                            </HStack>
                          </Td>
                          <Td>
                            <Text fontWeight="bold" color={calculatePassRate(run.passed, run.total_tests) >= 80 ? 'green.500' : 'red.500'}>
                              {calculatePassRate(run.passed, run.total_tests)}%
                            </Text>
                          </Td>
                          <Td>{run.created_by}</Td>
                          <Td>
                            <HStack>
                              <Tooltip label="View Report">
                                <IconButton
                                  aria-label="View Report"
                                  icon={<FaEye />}
                                  size="sm"
                                  colorScheme="blue"
                                />
                              </Tooltip>
                              <Tooltip label="Download Artifacts">
                                <IconButton
                                  aria-label="Download"
                                  icon={<FaDownload />}
                                  size="sm"
                                  colorScheme="gray"
                                />
                              </Tooltip>
                            </HStack>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </TabPanel>

            {/* Real-time Monitor Panel */}
            <TabPanel>
              <Card>
                <CardHeader>
                  <Heading size="md">Real-time Test Execution Monitor</Heading>
                </CardHeader>
                <CardBody>
                  <VStack align="stretch" spacing={3} maxH="500px" overflowY="auto">
                    {realtimeMessages.length === 0 ? (
                      <Text color="gray.500" textAlign="center">
                        No real-time messages yet. Start a test execution to see live updates.
                      </Text>
                    ) : (
                      realtimeMessages.map((message, index) => (
                        <Box key={index} p={3} borderWidth={1} borderRadius="md">
                          <HStack justify="space-between" mb={2}>
                            <Badge colorScheme="blue">{message.type.replace(/-/g, ' ').toUpperCase()}</Badge>
                            <Text fontSize="sm" color="gray.500">
                              {formatDate(message.timestamp)}
                            </Text>
                          </HStack>
                          <Code p={2} borderRadius="md" display="block" whiteSpace="pre-wrap">
                            {JSON.stringify(message.data, null, 2)}
                          </Code>
                        </Box>
                      ))
                    )}
                  </VStack>
                </CardBody>
              </Card>
            </TabPanel>

            {/* Analytics Panel */}
            <TabPanel>
              <Grid templateColumns="repeat(4, 1fr)" gap={4}>
                <GridItem>
                  <Stat>
                    <StatLabel>Total Test Suites</StatLabel>
                    <StatNumber>{testSuites.length}</StatNumber>
                    <StatHelpText>Active test suites</StatHelpText>
                  </Stat>
                </GridItem>
                <GridItem>
                  <Stat>
                    <StatLabel>Total Executions</StatLabel>
                    <StatNumber>{testRuns.length}</StatNumber>
                    <StatHelpText>All time executions</StatHelpText>
                  </Stat>
                </GridItem>
                <GridItem>
                  <Stat>
                    <StatLabel>Average Pass Rate</StatLabel>
                    <StatNumber>
                      {testRuns.length > 0 
                        ? Math.round(testRuns.reduce((acc, run) => acc + calculatePassRate(run.passed, run.total_tests), 0) / testRuns.length)
                        : 0
                      }%
                    </StatNumber>
                    <StatHelpText>Across all runs</StatHelpText>
                  </Stat>
                </GridItem>
                <GridItem>
                  <Stat>
                    <StatLabel>Active Runs</StatLabel>
                    <StatNumber>{activeRuns.length}</StatNumber>
                    <StatHelpText>Currently executing</StatHelpText>
                  </Stat>
                </GridItem>
              </Grid>
            </TabPanel>
          </TabPanels>
        </Tabs>

        {/* Execute Test Suite Modal */}
        <Modal isOpen={isExecuteOpen} onClose={onExecuteClose}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Execute Test Suite</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              {selectedSuite && (
                <VStack spacing={4} align="stretch">
                  <Box>
                    <Text fontWeight="bold">{selectedSuite.name}</Text>
                    <Text fontSize="sm" color="gray.600">{selectedSuite.description}</Text>
                    <Text fontSize="sm" mt={2}>
                      <Badge>{selectedSuite.test_case_count}</Badge> test cases will be executed
                    </Text>
                  </Box>
                  
                  <FormControl>
                    <FormLabel>Environment</FormLabel>
                    <Select defaultValue="development">
                      <option value="development">Development</option>
                      <option value="staging">Staging</option>
                      <option value="debug">Debug (Visible Browser)</option>
                    </Select>
                  </FormControl>
                  
                  <HStack justify="flex-end">
                    <Button onClick={onExecuteClose}>Cancel</Button>
                    <Button 
                      colorScheme="green" 
                      leftIcon={<FaPlay />}
                      isLoading={executing}
                      onClick={() => executeTestSuite(selectedSuite.id)}
                    >
                      Execute Tests
                    </Button>
                  </HStack>
                </VStack>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>

        {/* AI Generate Tests Modal */}
        <Modal isOpen={isGenerateOpen} onClose={onGenerateClose} size="xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>AI-Driven Test Generation</ModalHeader>
            <ModalCloseButton />
            <ModalBody pb={6}>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FormLabel>Requirements Description</FormLabel>
                  <Textarea 
                    placeholder="Describe what you want to test (e.g., 'Test user authentication flow with email and password')"
                    rows={4}
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Target URL</FormLabel>
                  <Input placeholder="http://localhost:5173" />
                </FormControl>
                
                <FormControl>
                  <FormLabel>User Stories (one per line)</FormLabel>
                  <Textarea 
                    placeholder="As a user, I want to log in with my email and password
As a user, I want to see an error message if my credentials are invalid
As a user, I want to be redirected to the dashboard after successful login"
                    rows={6}
                  />
                </FormControl>
                
                <FormControl>
                  <FormLabel>Test Category</FormLabel>
                  <Select placeholder="Select category">
                    <option value="authentication">Authentication</option>
                    <option value="navigation">Navigation</option>
                    <option value="forms">Forms</option>
                    <option value="api">API Integration</option>
                    <option value="ui">User Interface</option>
                  </Select>
                </FormControl>
                
                <HStack justify="flex-end">
                  <Button onClick={onGenerateClose}>Cancel</Button>
                  <Button colorScheme="purple" leftIcon={<FaRobot />}>
                    Generate Tests with AI
                  </Button>
                </HStack>
              </VStack>
            </ModalBody>
          </ModalContent>
        </Modal>
      </VStack>
    </Box>
  );
};

export default TestManagement;