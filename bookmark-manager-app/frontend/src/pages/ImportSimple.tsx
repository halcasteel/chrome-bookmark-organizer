import React from 'react'
import { Box, Heading, Text } from '@chakra-ui/react'

const ImportSimple: React.FC = () => {
  return (
    <Box maxW="4xl" mx="auto">
      <Heading size="lg" mb={6}>Import Bookmarks - Test Page</Heading>
      <Text>If you can see this, the routing is working!</Text>
    </Box>
  )
}

export default ImportSimple