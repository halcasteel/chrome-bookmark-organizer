import React, { ReactElement } from 'react'
import { NavLink as RouterLink, useLocation } from 'react-router-dom'
import {
  Box,
  Flex,
  Text,
  VStack,
  Link,
  Icon,
  IconButton,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useColorModeValue,
  Divider,
  BoxProps,
} from '@chakra-ui/react'
import {
  FiHome,
  FiBookmark,
  FiSearch,
  FiUpload,
  FiFolderPlus,
  FiSettings,
  FiTag,
  FiX,
} from 'react-icons/fi'
import { IconType } from 'react-icons'

interface NavItemProps {
  icon?: IconType
  children: React.ReactNode
  to: string
  onClick?: () => void
}

const NavItem: React.FC<NavItemProps> = ({ icon, children, to, onClick }) => {
  const location = useLocation()
  const isActive = location.pathname === to
  const activeBg = useColorModeValue('brand.50', 'brand.900')
  const activeColor = useColorModeValue('brand.700', 'brand.200')
  const hoverBg = useColorModeValue('gray.100', 'gray.700')

  return (
    <Link
      as={RouterLink}
      to={to}
      onClick={onClick}
      style={{ textDecoration: 'none' }}
      _focus={{ boxShadow: 'none' }}
    >
      <Flex
        align="center"
        p="3"
        mx="2"
        borderRadius="lg"
        role="group"
        cursor="pointer"
        bg={isActive ? activeBg : 'transparent'}
        color={isActive ? activeColor : 'inherit'}
        _hover={{
          bg: isActive ? activeBg : hoverBg,
        }}
      >
        {icon && (
          <Icon
            mr="4"
            fontSize="20"
            as={icon}
          />
        )}
        <Text fontSize="sm" fontWeight={isActive ? '600' : '500'}>
          {children}
        </Text>
      </Flex>
    </Link>
  )
}

interface SidebarContentProps {
  onClose: () => void
}

const SidebarContent: React.FC<SidebarContentProps> = ({ onClose }) => {
  const bg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  interface NavItemData {
    name: string
    icon: IconType
    path: string
  }

  const navItems: NavItemData[] = [
    { name: 'Dashboard', icon: FiHome, path: '/dashboard' },
    { name: 'Bookmarks', icon: FiBookmark, path: '/bookmarks' },
    { name: 'Search', icon: FiSearch, path: '/search' },
    { name: 'Import', icon: FiUpload, path: '/import' },
    { name: 'Collections', icon: FiFolderPlus, path: '/collections' },
    { name: 'Tags', icon: FiTag, path: '/tags' },
  ]

  return (
    <Box
      bg={bg}
      borderRight="1px"
      borderRightColor={borderColor}
      w="280px"
      h="100vh"
      position="fixed"
      top="0"
      left="0"
      overflowY="auto"
      zIndex={10}
    >
      <Flex h="20" alignItems="center" px="8" justifyContent="space-between">
        <Text fontSize="2xl" fontWeight="bold" color="brand.600">
          Bookmarks
        </Text>
        <IconButton
          aria-label="Close menu"
          icon={<FiX />}
          size="sm"
          variant="ghost"
          onClick={onClose}
        />
      </Flex>
      
      <VStack spacing={1} align="stretch">
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            to={item.path}
            onClick={onClose}
          >
            {item.name}
          </NavItem>
        ))}
      </VStack>
      
      <Divider my={4} />
      
      <NavItem icon={FiSettings} to="/settings" onClick={onClose}>
        Settings
      </NavItem>
    </Box>
  )
}

interface SidebarProps extends BoxProps {
  isOpen: boolean
  onClose: () => void
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, ...rest }) => {
  if (!isOpen) return null

  return (
    <>
      {/* Overlay for mobile */}
      <Box
        display={{ base: 'block', lg: 'none' }}
        position="fixed"
        top="0"
        left="0"
        right="0"
        bottom="0"
        bg="blackAlpha.600"
        zIndex={9}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <Box {...rest}>
        <SidebarContent onClose={onClose} />
      </Box>
    </>
  )
}

export default Sidebar