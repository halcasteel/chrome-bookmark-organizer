import React, { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  Heading,
  Text,
  Alert,
  AlertIcon,
  useColorModeValue,
  InputGroup,
  InputLeftElement,
  Icon,
  Container,
  Image,
  FormHelperText,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  PinInput,
  PinInputField,
  HStack,
  Code,
  AlertDescription,
} from '@chakra-ui/react'
import { FiMail, FiLock, FiUser, FiShield } from 'react-icons/fi'
import api, { authService } from '@/services/api'
import type { TwoFactorSetup } from '@/types'

interface FormData {
  email: string
  password: string
  confirmPassword: string
  name: string
}

const Register: React.FC = () => {
  const navigate = useNavigate()
  const toast = useToast()
  const { isOpen, onOpen, onClose } = useDisclosure()
  
  const [formData, setFormData] = useState<FormData>({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  })
  const [twoFactorData, setTwoFactorData] = useState<TwoFactorSetup & { verificationCode: string }>({
    secret: '',
    qrCode: '',
    verificationCode: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const bg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError('')

    // Validate email domain
    if (!formData.email.endsWith('@az1.ai')) {
      setError('Only @az1.ai email addresses are allowed')
      return
    }

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    // Validate password strength
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setLoading(true)

    try {
      const response = await authService.register(
        formData.email,
        formData.password,
        formData.name
      )

      setTwoFactorData({
        secret: response.data.twoFactorSetup.secret,
        qrCode: response.data.twoFactorSetup.qrCode,
        verificationCode: '',
      })

      onOpen() // Open 2FA setup modal
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const handleEnable2FA = async (): Promise<void> => {
    if (twoFactorData.verificationCode.length !== 6) {
      toast({
        title: 'Invalid code',
        description: 'Please enter a valid 6-digit code',
        status: 'error',
      })
      return
    }

    setLoading(true)

    try {
      await authService.enable2FA(
        formData.email,
        formData.password,
        twoFactorData.verificationCode
      )

      toast({
        title: 'Registration complete!',
        description: '2FA has been enabled. You can now sign in.',
        status: 'success',
        duration: 5000,
      })

      navigate('/login')
    } catch (err: any) {
      toast({
        title: 'Failed to enable 2FA',
        description: err.response?.data?.error || 'Please try again',
        status: 'error',
      })
      setTwoFactorData({ ...twoFactorData, verificationCode: '' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container maxW="md" py={12}>
      <Box
        bg={bg}
        p={8}
        borderRadius="lg"
        borderWidth={1}
        borderColor={borderColor}
        shadow="lg"
      >
        <VStack spacing={6}>
          <Box textAlign="center">
            <Heading size="xl" mb={2}>
              Create Account
            </Heading>
            <Text color="gray.600">
              Register with your @az1.ai email address
            </Text>
          </Box>

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <Icon as={FiUser} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </InputGroup>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Email</FormLabel>
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <Icon as={FiMail} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@az1.ai"
                    autoComplete="email"
                  />
                </InputGroup>
                <FormHelperText>Must be an @az1.ai email address</FormHelperText>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Password</FormLabel>
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <Icon as={FiLock} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                  />
                </InputGroup>
                <FormHelperText>Minimum 8 characters</FormHelperText>
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Confirm Password</FormLabel>
                <InputGroup>
                  <InputLeftElement pointerEvents="none">
                    <Icon as={FiLock} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                  />
                </InputGroup>
              </FormControl>

              <Button
                type="submit"
                colorScheme="brand"
                width="full"
                size="lg"
                isLoading={loading}
                loadingText="Creating account..."
              >
                Create Account
              </Button>
            </VStack>
          </form>

          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <Text fontSize="sm" fontWeight="medium">
                Security Requirements
              </Text>
              <Text fontSize="xs">
                • @az1.ai email address required
                <br />
                • Two-factor authentication (2FA) mandatory
              </Text>
            </Box>
          </Alert>
        </VStack>
      </Box>

      {/* 2FA Setup Modal */}
      <Modal isOpen={isOpen} onClose={() => {}} closeOnOverlayClick={false} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Icon as={FiShield} />
              <Text>Set Up Two-Factor Authentication</Text>
            </HStack>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={6}>
              <Text>
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </Text>
              
              <Box p={4} bg="white" borderRadius="md">
                <Image src={twoFactorData.qrCode} alt="2FA QR Code" />
              </Box>
              
              <Box>
                <Text fontSize="sm" mb={2}>
                  Or enter this secret manually:
                </Text>
                <Code p={2} fontSize="xs">
                  {twoFactorData.secret}
                </Code>
              </Box>
              
              <Box width="full">
                <Text mb={2}>Enter the 6-digit code from your app:</Text>
                <HStack justify="center">
                  <PinInput
                    value={twoFactorData.verificationCode}
                    onChange={(value) => 
                      setTwoFactorData({ ...twoFactorData, verificationCode: value })
                    }
                    otp
                    size="lg"
                  >
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                    <PinInputField />
                  </PinInput>
                </HStack>
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="brand"
              onClick={handleEnable2FA}
              isLoading={loading}
              loadingText="Verifying..."
              isDisabled={twoFactorData.verificationCode.length !== 6}
            >
              Complete Setup
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  )
}

export default Register