import React, { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { Box, Spinner, Flex } from '@chakra-ui/react'
import { useAuth } from '../contexts/AuthContext'

interface PrivateRouteProps {
  children: ReactElement
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <Flex height="100vh" alignItems="center" justifyContent="center">
        <Spinner size="xl" color="brand.500" thickness="4px" />
      </Flex>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

export default PrivateRoute