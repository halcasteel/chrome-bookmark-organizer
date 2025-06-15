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

const Layout: React.FC = () => {
  const { isOpen, onOpen, onClose, onToggle } = useDisclosure({ defaultIsOpen: false })
  const isMobile = useBreakpointValue({ base: true, lg: false })
  const sidebarWidth = { base: 'full', lg: '280px' }
  const mainMarginLeft = isOpen && !isMobile ? '280px' : '0'
  const bgColor = useColorModeValue('gray.50', 'gray.900')

  return (
    <Box minH="100vh" bg={bgColor}>
      <Sidebar
        isOpen={isOpen}
        onClose={onClose}
        display={{ base: isOpen ? 'block' : 'none', lg: isOpen ? 'block' : 'none' }}
        w={sidebarWidth}
      />
      
      <Box ml={mainMarginLeft} transition="margin-left 0.3s ease">
        <Header onMenuClick={onToggle} showMenuButton={true} />
        
        <Box as="main" p={{ base: 4, md: 6, lg: 8 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

export default Layout