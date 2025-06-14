import React from 'react'
import { Outlet } from 'react-router-dom'
import {
  Box,
  Flex,
  useColorModeValue,
  useDisclosure,
  useBreakpointValue,
} from '@chakra-ui/react'
import Sidebar from './Sidebar'
import Header from './Header'

const Layout = () => {
  const { isOpen, onOpen, onClose } = useDisclosure()
  const isMobile = useBreakpointValue({ base: true, lg: false })
  const sidebarWidth = { base: 'full', lg: '280px' }
  const mainMarginLeft = { base: 0, lg: '280px' }

  return (
    <Box minH="100vh" bg={useColorModeValue('gray.50', 'gray.900')}>
      <Sidebar
        isOpen={isMobile ? isOpen : true}
        onClose={onClose}
        display={{ base: 'none', lg: 'block' }}
        w={sidebarWidth}
      />
      
      <Box ml={mainMarginLeft} transition="margin-left 0.2s">
        <Header onMenuClick={onOpen} showMenuButton={isMobile} />
        
        <Box as="main" p={{ base: 4, md: 6, lg: 8 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

export default Layout