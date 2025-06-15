import React from 'react'
import {
  Flex,
  IconButton,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  useColorModeValue,
  useColorMode,
  Text,
  Avatar,
  Box,
  Button,
} from '@chakra-ui/react'
import {
  FiMenu,
  FiMoon,
  FiSun,
  FiChevronDown,
  FiUser,
  FiLogOut,
} from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

interface HeaderProps {
  onMenuClick: () => void
  showMenuButton: boolean
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, showMenuButton }) => {
  const { colorMode, toggleColorMode } = useColorMode()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  
  const bg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')

  const handleLogout = (): void => {
    logout()
    navigate('/login')
  }

  return (
    <Flex
      px={{ base: 4, md: 6, lg: 8 }}
      height="20"
      alignItems="center"
      bg={bg}
      borderBottomWidth="1px"
      borderBottomColor={borderColor}
      justifyContent={showMenuButton ? 'space-between' : 'flex-end'}
    >
      {showMenuButton && (
        <IconButton
          onClick={onMenuClick}
          variant="outline"
          aria-label="open menu"
          icon={<FiMenu />}
        />
      )}

      <HStack spacing={{ base: '2', md: '6' }}>
        <IconButton
          size="lg"
          variant="ghost"
          aria-label="toggle color mode"
          onClick={toggleColorMode}
          icon={colorMode === 'light' ? <FiMoon /> : <FiSun />}
        />
        
        <Menu>
          <MenuButton
            as={Button}
            variant="ghost"
            rightIcon={<FiChevronDown />}
            leftIcon={<Avatar size="sm" name={user?.name || user?.email} />}
          >
            <Box display={{ base: 'none', md: 'block' }}>
              <Text fontSize="sm" fontWeight="medium">
                {user?.name || 'User'}
              </Text>
              <Text fontSize="xs" color="gray.600">
                {user?.email}
              </Text>
            </Box>
          </MenuButton>
          <MenuList>
            <MenuItem icon={<FiUser />} onClick={() => navigate('/settings')}>
              Profile
            </MenuItem>
            <MenuDivider />
            <MenuItem icon={<FiLogOut />} onClick={handleLogout}>
              Sign out
            </MenuItem>
          </MenuList>
        </Menu>
      </HStack>
    </Flex>
  )
}

export default Header