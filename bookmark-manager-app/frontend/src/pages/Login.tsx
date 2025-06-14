import React, { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
  PinInput,
  PinInputField,
  HStack,
  Container,
  IconButton,
} from '@chakra-ui/react'
import { FiMail, FiLock, FiShield } from 'react-icons/fi'
import { useAuth } from '@/contexts/AuthContext'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [showTwoFactor, setShowTwoFactor] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const bg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError('')

    // Validate email domain
    if (!email.endsWith('@az1.ai')) {
      setError('Only @az1.ai email addresses are allowed')
      return
    }

    setLoading(true)

    try {
      const result = await login(
        email,
        password,
        showTwoFactor ? twoFactorCode : undefined
      )

      if (result.success) {
        navigate('/dashboard')
      } else {
        if (result.requires2FA) {
          setShowTwoFactor(true)
          setError('Please enter your 2FA code')
        } else if (result.requires2FASetup) {
          navigate('/setup-2fa', { state: { email, password } })
        } else {
          setError(result.error || 'Login failed')
        }
      }
    } catch (err) {
      setError('An error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  const handleTwoFactorSubmit = async (): Promise<void> => {
    if (twoFactorCode.length !== 6) {
      setError('Please enter a valid 6-digit code')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await login(email, password, twoFactorCode)
      
      if (result.success) {
        navigate('/dashboard')
      } else {
        setError(result.error || 'Invalid 2FA code')
        setTwoFactorCode('')
      }
    } catch (err) {
      setError('An error occurred during 2FA verification')
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
              Welcome to Bookmarks
            </Heading>
            <Text color="gray.600">
              Sign in with your @az1.ai account
            </Text>
          </Box>

          {error && (
            <Alert status="error" borderRadius="md">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {!showTwoFactor ? (
            <form onSubmit={handleSubmit} style={{ width: '100%' }}>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Email</FormLabel>
                  <InputGroup>
                    <InputLeftElement pointerEvents="none">
                      <Icon as={FiMail} color="gray.400" />
                    </InputLeftElement>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@az1.ai"
                      autoComplete="email"
                    />
                  </InputGroup>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Password</FormLabel>
                  <InputGroup>
                    <InputLeftElement pointerEvents="none">
                      <Icon as={FiLock} color="gray.400" />
                    </InputLeftElement>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                    />
                  </InputGroup>
                </FormControl>

                <Button
                  type="submit"
                  colorScheme="brand"
                  width="full"
                  size="lg"
                  isLoading={loading}
                  loadingText="Signing in..."
                >
                  Sign In
                </Button>
              </VStack>
            </form>
          ) : (
            <VStack spacing={6} width="full">
              <Icon as={FiShield} boxSize={12} color="brand.500" />
              <Text textAlign="center">
                Enter your 6-digit authentication code
              </Text>
              
              <HStack>
                <PinInput
                  value={twoFactorCode}
                  onChange={setTwoFactorCode}
                  onComplete={handleTwoFactorSubmit}
                  otp
                  size="lg"
                  autoFocus
                >
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                </PinInput>
              </HStack>

              <Button
                colorScheme="brand"
                width="full"
                size="lg"
                onClick={handleTwoFactorSubmit}
                isLoading={loading}
                loadingText="Verifying..."
              >
                Verify
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowTwoFactor(false)
                  setTwoFactorCode('')
                  setError('')
                }}
              >
                Back to login
              </Button>
            </VStack>
          )}

          <Text fontSize="sm" color="gray.600">
            Don't have an account?{' '}
            <Link to="/register" style={{ color: 'var(--chakra-colors-brand-500)' }}>
              Register
            </Link>
          </Text>

          <Alert status="info" borderRadius="md">
            <AlertIcon />
            <Box>
              <Text fontSize="sm" fontWeight="medium">
                Security Notice
              </Text>
              <Text fontSize="xs">
                This service requires @az1.ai email and 2FA authentication
              </Text>
            </Box>
          </Alert>
        </VStack>
      </Box>
    </Container>
  )
}

export default Login