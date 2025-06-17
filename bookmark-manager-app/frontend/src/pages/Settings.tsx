import React, { useState } from 'react'
import {
  Box,
  Heading,
  VStack,
  HStack,
  Text,
  Card,
  CardBody,
  Button,
  Switch,
  FormControl,
  FormLabel,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useColorMode,
  useColorModeValue,
  Icon,
  Divider,
  Stat,
  StatLabel,
  StatNumber,
  SimpleGrid,
  Alert,
  AlertIcon,
  AlertDescription,
  Code,
  Link,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Input,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react'
import { FiMoon, FiSun, FiShield, FiDatabase, FiInfo, FiDownload, FiTrash2, FiKey, FiCopy, FiCheck, FiEye, FiEyeOff } from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useMutation, useQuery } from '@tanstack/react-query'
import { authService } from '../services/api'
// import QRCode from 'qrcode.react'

const Settings: React.FC = () => {
  const { user } = useAuth()
  const toast = useToast()
  const { colorMode, toggleColorMode } = useColorMode()
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.600')
  const [show2FASecret, setShow2FASecret] = useState(false)
  const [copied, setCopied] = useState(false)
  const { isOpen: is2FAModalOpen, onOpen: on2FAModalOpen, onClose: on2FAModalClose } = useDisclosure()
  const { isOpen: isRecoveryModalOpen, onOpen: onRecoveryModalOpen, onClose: onRecoveryModalClose } = useDisclosure()
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])

  // Mock data for demonstration
  const storageUsed = 45.2 // MB
  const storageLimit = 100 // MB
  const bookmarksCount = 1234
  const collectionsCount = 12
  const tagsCount = 45

  const generate2FAMutation = useMutation({
    mutationFn: async () => {
      // This would normally call the backend to generate 2FA setup
      return {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCode: `otpauth://totp/BookmarkManager:${user?.email}?secret=JBSWY3DPEHPK3PXP&issuer=BookmarkManager`
      }
    },
    onSuccess: (data) => {
      on2FAModalOpen()
    },
  })

  const enable2FAMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!user?.email) throw new Error('No user email')
      return authService.enable2FA(user.email, 'current_password', code)
    },
    onSuccess: () => {
      toast({
        title: '2FA enabled successfully',
        status: 'success',
        duration: 3000,
      })
      on2FAModalClose()
    },
    onError: () => {
      toast({
        title: 'Failed to enable 2FA',
        description: 'Please check your code and try again',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const generateRecoveryCodesMutation = useMutation({
    mutationFn: authService.generateRecoveryCodes,
    onSuccess: (data) => {
      setRecoveryCodes(data.data.recoveryCodes)
      onRecoveryModalOpen()
    },
    onError: () => {
      toast({
        title: 'Failed to generate recovery codes',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const handleCopySecret = () => {
    navigator.clipboard.writeText('JBSWY3DPEHPK3PXP')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({
      title: 'Secret copied to clipboard',
      status: 'success',
      duration: 2000,
    })
  }

  const handleExportData = async () => {
    toast({
      title: 'Export started',
      description: 'Your data export will be ready shortly',
      status: 'info',
      duration: 3000,
    })
    // Implement actual export logic
  }

  const handleDeleteAccount = async () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      toast({
        title: 'Account deletion requested',
        description: 'You will receive an email to confirm this action',
        status: 'warning',
        duration: 5000,
      })
      // Implement actual deletion logic
    }
  }

  return (
    <Box maxW="7xl" mx="auto">
      <Heading size="lg" mb={6}>Settings</Heading>

      <Tabs variant="enclosed">
        <TabList>
          <Tab>General</Tab>
          <Tab>Security</Tab>
          <Tab>Data & Storage</Tab>
          <Tab>About</Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0}>
            <VStack spacing={6} align="stretch">
              <Card bg={cardBg}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <Text fontSize="lg" fontWeight="medium">Appearance</Text>
                    
                    <FormControl display="flex" alignItems="center" justifyContent="space-between">
                      <HStack spacing={3}>
                        <Icon as={colorMode === 'dark' ? FiMoon : FiSun} />
                        <FormLabel htmlFor="dark-mode" mb="0">
                          Dark mode
                        </FormLabel>
                      </HStack>
                      <Switch
                        id="dark-mode"
                        isChecked={colorMode === 'dark'}
                        onChange={toggleColorMode}
                      />
                    </FormControl>
                  </VStack>
                </CardBody>
              </Card>

              <Card bg={cardBg}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <Text fontSize="lg" fontWeight="medium">Notifications</Text>
                    
                    <FormControl display="flex" alignItems="center" justifyContent="space-between">
                      <FormLabel htmlFor="email-notifications" mb="0">
                        Email notifications
                      </FormLabel>
                      <Switch id="email-notifications" defaultChecked />
                    </FormControl>
                    
                    <FormControl display="flex" alignItems="center" justifyContent="space-between">
                      <FormLabel htmlFor="weekly-digest" mb="0">
                        Weekly digest
                      </FormLabel>
                      <Switch id="weekly-digest" />
                    </FormControl>
                  </VStack>
                </CardBody>
              </Card>
            </VStack>
          </TabPanel>

          <TabPanel px={0}>
            <VStack spacing={6} align="stretch">
              <Card bg={cardBg}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <HStack justify="space-between">
                      <HStack spacing={3}>
                        <Icon as={FiShield} color="green.500" />
                        <Text fontSize="lg" fontWeight="medium">Two-Factor Authentication</Text>
                      </HStack>
                      {user?.two_factor_enabled ? (
                        <Badge colorScheme="green">Enabled</Badge>
                      ) : (
                        <Badge colorScheme="gray">Disabled</Badge>
                      )}
                    </HStack>
                    
                    <Text fontSize="sm" color="gray.600">
                      Add an extra layer of security to your account
                    </Text>
                    
                    {!user?.two_factor_enabled ? (
                      <Button
                        colorScheme="green"
                        onClick={() => generate2FAMutation.mutate()}
                        isLoading={generate2FAMutation.isPending}
                      >
                        Enable 2FA
                      </Button>
                    ) : (
                      <VStack align="stretch" spacing={3}>
                        <Button variant="outline" onClick={() => generateRecoveryCodesMutation.mutate()}>
                          Generate Recovery Codes
                        </Button>
                        <Button variant="outline" colorScheme="red">
                          Disable 2FA
                        </Button>
                      </VStack>
                    )}
                  </VStack>
                </CardBody>
              </Card>

              <Card bg={cardBg}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <Text fontSize="lg" fontWeight="medium">Login Sessions</Text>
                    <Text fontSize="sm" color="gray.600">
                      Manage your active sessions
                    </Text>
                    <Button variant="outline" colorScheme="red">
                      Sign out all other sessions
                    </Button>
                  </VStack>
                </CardBody>
              </Card>
            </VStack>
          </TabPanel>

          <TabPanel px={0}>
            <VStack spacing={6} align="stretch">
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                <Card bg={cardBg}>
                  <CardBody>
                    <Stat>
                      <StatLabel>Storage Used</StatLabel>
                      <StatNumber>{storageUsed} MB</StatNumber>
                      <Text fontSize="sm" color="gray.600">
                        of {storageLimit} MB
                      </Text>
                    </Stat>
                  </CardBody>
                </Card>
                
                <Card bg={cardBg}>
                  <CardBody>
                    <Stat>
                      <StatLabel>Total Bookmarks</StatLabel>
                      <StatNumber>{bookmarksCount}</StatNumber>
                    </Stat>
                  </CardBody>
                </Card>
                
                <Card bg={cardBg}>
                  <CardBody>
                    <Stat>
                      <StatLabel>Collections</StatLabel>
                      <StatNumber>{collectionsCount}</StatNumber>
                    </Stat>
                  </CardBody>
                </Card>
              </SimpleGrid>

              <Card bg={cardBg}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <Text fontSize="lg" fontWeight="medium">Data Export</Text>
                    <Text fontSize="sm" color="gray.600">
                      Download all your bookmarks and data
                    </Text>
                    <Button leftIcon={<FiDownload />} onClick={handleExportData}>
                      Export Data
                    </Button>
                  </VStack>
                </CardBody>
              </Card>

              <Card bg={cardBg} borderColor="red.200" borderWidth={2}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <Text fontSize="lg" fontWeight="medium" color="red.500">
                      Danger Zone
                    </Text>
                    <Text fontSize="sm" color="gray.600">
                      Once you delete your account, there is no going back
                    </Text>
                    <Button
                      leftIcon={<FiTrash2 />}
                      colorScheme="red"
                      variant="outline"
                      onClick={handleDeleteAccount}
                    >
                      Delete Account
                    </Button>
                  </VStack>
                </CardBody>
              </Card>
            </VStack>
          </TabPanel>

          <TabPanel px={0}>
            <VStack spacing={6} align="stretch">
              <Card bg={cardBg}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <HStack spacing={3}>
                      <Icon as={FiInfo} />
                      <Text fontSize="lg" fontWeight="medium">About</Text>
                    </HStack>
                    
                    <VStack align="stretch" spacing={2}>
                      <HStack justify="space-between">
                        <Text>Version</Text>
                        <Code>1.0.0</Code>
                      </HStack>
                      <HStack justify="space-between">
                        <Text>API Version</Text>
                        <Code>v1</Code>
                      </HStack>
                      <HStack justify="space-between">
                        <Text>User ID</Text>
                        <Code fontSize="xs">{user?.id}</Code>
                      </HStack>
                    </VStack>
                  </VStack>
                </CardBody>
              </Card>

              <Card bg={cardBg}>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <Text fontSize="lg" fontWeight="medium">Resources</Text>
                    <VStack align="stretch" spacing={2}>
                      <Link href={import.meta.env.VITE_GITHUB_REPO_URL || "https://github.com/halcasteel/chrome-bookmark-organizer"} isExternal color="brand.500">
                        GitHub Repository
                      </Link>
                      <Link href="/docs" color="brand.500">
                        Documentation
                      </Link>
                      <Link href="/privacy" color="brand.500">
                        Privacy Policy
                      </Link>
                      <Link href="/terms" color="brand.500">
                        Terms of Service
                      </Link>
                    </VStack>
                  </VStack>
                </CardBody>
              </Card>
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* 2FA Setup Modal */}
      <Modal isOpen={is2FAModalOpen} onClose={on2FAModalClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Enable Two-Factor Authentication</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Text>Scan this QR code with your authenticator app:</Text>
              <Box p={4} bg="white" borderRadius="md">
                <Box w="200px" h="200px" bg="gray.200" display="flex" alignItems="center" justifyContent="center">
                  <Text color="gray.600">QR Code Placeholder</Text>
                </Box>
              </Box>
              
              <Text fontSize="sm">Or enter this secret manually:</Text>
              <InputGroup size="sm">
                <Input
                  value="JBSWY3DPEHPK3PXP"
                  type={show2FASecret ? 'text' : 'password'}
                  readOnly
                  fontFamily="mono"
                />
                <InputRightElement width="4.5rem">
                  <Button
                    h="1.75rem"
                    size="sm"
                    onClick={() => setShow2FASecret(!show2FASecret)}
                  >
                    {show2FASecret ? <FiEyeOff /> : <FiEye />}
                  </Button>
                </InputRightElement>
              </InputGroup>
              
              <Button
                size="sm"
                leftIcon={copied ? <FiCheck /> : <FiCopy />}
                onClick={handleCopySecret}
                variant="outline"
              >
                {copied ? 'Copied!' : 'Copy Secret'}
              </Button>
              
              <Divider />
              
              <FormControl>
                <FormLabel>Enter verification code</FormLabel>
                <Input
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={on2FAModalClose}>
              Cancel
            </Button>
            <Button
              colorScheme="green"
              onClick={() => enable2FAMutation.mutate(twoFactorCode)}
              isLoading={enable2FAMutation.isPending}
              isDisabled={twoFactorCode.length !== 6}
            >
              Verify & Enable
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Recovery Codes Modal */}
      <Modal isOpen={isRecoveryModalOpen} onClose={onRecoveryModalClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Recovery Codes</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="warning" mb={4}>
              <AlertIcon />
              <AlertDescription>
                Save these codes in a secure place. Each code can only be used once.
              </AlertDescription>
            </Alert>
            
            <VStack spacing={2} align="stretch">
              {recoveryCodes.map((code, index) => (
                <Code key={index} p={2} fontSize="md">
                  {code}
                </Code>
              ))}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              leftIcon={<FiDownload />}
              onClick={() => {
                const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'bookmark-manager-recovery-codes.txt'
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              Download Codes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default Settings