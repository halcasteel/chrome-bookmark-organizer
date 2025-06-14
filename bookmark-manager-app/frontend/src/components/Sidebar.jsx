import React from 'react'
import { NavLink as RouterLink } from 'react-router-dom'
import {
  Box,
  Flex,
  Text,
  VStack,
  Link,
  Icon,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useColorModeValue,
  Divider,
} from '@chakra-ui/react'
import {
  FiHome,
  FiBookmark,
  FiSearch,
  FiUpload,
  FiFolderPlus,
  FiSettings,
  FiTag,
} from 'react-icons/fi'

const NavItem = ({ icon, children, to, onClick }) => {
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
      {({ isActive }) => (
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
      )}
    </Link>
  )
}

const SidebarContent = ({ onClose }) => {
  const bg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const navItems = [
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
      w="full"
      h="full"
      pos="fixed"
    >
      <Flex h="20" alignItems="center" mx="8" justifyContent="space-between">
        <Text fontSize="2xl" fontWeight="bold" color="brand.600">
          Bookmarks
        </Text>
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

const Sidebar = ({ isOpen, onClose, ...rest }) => {
  const isDrawer = rest.display?.base === 'none'

  if (isDrawer) {
    return (
      <>
        <Box {...rest}>
          <SidebarContent onClose={() => {}} />
        </Box>
        <Drawer
          autoFocus={false}
          isOpen={isOpen}
          placement="left"
          onClose={onClose}
          returnFocusOnClose={false}
          onOverlayClick={onClose}
          size="full"
        >
          <DrawerOverlay />
          <DrawerContent>
            <DrawerCloseButton />
            <SidebarContent onClose={onClose} />
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <Box {...rest}>
      <SidebarContent onClose={onClose} />
    </Box>
  )
}

export default Sidebar