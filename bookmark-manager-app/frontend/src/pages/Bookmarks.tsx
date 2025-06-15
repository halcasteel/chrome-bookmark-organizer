import React, { useState } from 'react'
import {
  Box,
  Heading,
  VStack,
  HStack,
  Text,
  Link,
  Tag,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Spinner,
  Flex,
  IconButton,
  useToast,
  Card,
  CardBody,
  Spacer,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Textarea,
  useDisclosure,
} from '@chakra-ui/react'
import { FiSearch, FiEdit, FiTrash2, FiMoreVertical, FiExternalLink, FiBookmark } from 'react-icons/fi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { bookmarkService } from '../services/api'
import type { Bookmark } from '../types'

const Bookmarks: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const toast = useToast()
  const queryClient = useQueryClient()
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const { isOpen, onOpen, onClose } = useDisclosure()
  
  // Form state for new bookmark
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    description: '',
    tags: ''
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['bookmarks', searchQuery],
    queryFn: async () => {
      const params = searchQuery ? { search: searchQuery } : {}
      const response = await api.get('/bookmarks', { params })
      return response.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/bookmarks/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      toast({
        title: 'Bookmark deleted',
        status: 'success',
        duration: 3000,
      })
    },
    onError: () => {
      toast({
        title: 'Error deleting bookmark',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Bookmark>) => {
      const response = await bookmarkService.create(data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      toast({
        title: 'Bookmark created',
        description: 'Your bookmark has been added and will be validated soon.',
        status: 'success',
        duration: 5000,
      })
      onClose()
      resetForm()
    },
    onError: (error: any) => {
      toast({
        title: 'Error creating bookmark',
        description: error.response?.data?.error || 'Failed to create bookmark',
        status: 'error',
        duration: 5000,
      })
    },
  })

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this bookmark?')) {
      deleteMutation.mutate(id)
    }
  }

  const resetForm = () => {
    setFormData({
      url: '',
      title: '',
      description: '',
      tags: ''
    })
    setFormErrors({})
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    if (!formData.url.trim()) {
      errors.url = 'URL is required'
    } else if (!formData.url.match(/^https?:\/\/.+/)) {
      errors.url = 'Please enter a valid URL starting with http:// or https://'
    }
    
    if (!formData.title.trim()) {
      errors.title = 'Title is required'
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = () => {
    if (!validateForm()) return
    
    const bookmarkData: Partial<Bookmark> = {
      url: formData.url.trim(),
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      tags: formData.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
    }
    
    createMutation.mutate(bookmarkData)
  }

  if (isLoading) {
    return (
      <Flex justify="center" align="center" minH="400px">
        <Spinner size="xl" color="brand.500" />
      </Flex>
    )
  }

  if (error) {
    return (
      <Box>
        <Text color="red.500">Error loading bookmarks</Text>
      </Box>
    )
  }

  const bookmarks = data?.bookmarks || []

  return (
    <Box>
      <Flex mb={6} gap={4} align="center">
        <Heading size="lg">Bookmarks</Heading>
        <Spacer />
        <Button colorScheme="brand" leftIcon={<FiBookmark />} onClick={onOpen}>
          Add Bookmark
        </Button>
      </Flex>

      <InputGroup mb={6}>
        <InputLeftElement pointerEvents="none">
          <FiSearch color="gray.300" />
        </InputLeftElement>
        <Input
          placeholder="Search bookmarks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </InputGroup>

      {bookmarks.length === 0 ? (
        <Card bg={cardBg}>
          <CardBody>
            <Text textAlign="center" color="gray.500">
              {searchQuery ? 'No bookmarks found matching your search.' : 'No bookmarks yet. Add your first bookmark!'}
            </Text>
          </CardBody>
        </Card>
      ) : (
        <VStack spacing={4} align="stretch">
          {bookmarks.map((bookmark: Bookmark) => (
            <Card
              key={bookmark.id}
              bg={cardBg}
              borderWidth="1px"
              borderColor={borderColor}
              _hover={{ borderColor: 'brand.500' }}
              transition="border-color 0.2s"
            >
              <CardBody>
                <Flex gap={4}>
                  <Box flex="1">
                    <HStack mb={2}>
                      <Link
                        href={bookmark.url}
                        isExternal
                        fontSize="lg"
                        fontWeight="medium"
                        color="brand.600"
                        _hover={{ textDecoration: 'underline' }}
                      >
                        {bookmark.title}
                        <IconButton
                          aria-label="Open link"
                          icon={<FiExternalLink />}
                          size="xs"
                          variant="ghost"
                          ml={1}
                        />
                      </Link>
                    </HStack>
                    
                    {bookmark.description && (
                      <Text mb={2} color="gray.600">{bookmark.description}</Text>
                    )}
                    
                    <HStack spacing={2} flexWrap="wrap">
                      {bookmark.tags?.map((tag) => (
                        <Tag key={tag} size="sm" colorScheme="blue">
                          {tag}
                        </Tag>
                      ))}
                    </HStack>
                    
                    <Text fontSize="sm" color="gray.500" mt={2}>
                      Added {new Date(bookmark.created_at).toLocaleDateString()}
                    </Text>
                  </Box>
                  
                  <Menu>
                    <MenuButton
                      as={IconButton}
                      icon={<FiMoreVertical />}
                      variant="ghost"
                      size="sm"
                    />
                    <MenuList>
                      <MenuItem icon={<FiEdit />}>Edit</MenuItem>
                      <MenuItem
                        icon={<FiTrash2 />}
                        onClick={() => handleDelete(bookmark.id)}
                        color="red.500"
                      >
                        Delete
                      </MenuItem>
                    </MenuList>
                  </Menu>
                </Flex>
              </CardBody>
            </Card>
          ))}
        </VStack>
      )}

      {data?.pagination && data.pagination.pages > 1 && (
        <HStack justify="center" mt={6}>
          <Button
            size="sm"
            isDisabled={data.pagination.page === 1}
          >
            Previous
          </Button>
          <Text>
            Page {data.pagination.page} of {data.pagination.pages}
          </Text>
          <Button
            size="sm"
            isDisabled={data.pagination.page === data.pagination.pages}
          >
            Next
          </Button>
        </HStack>
      )}

      {/* Add Bookmark Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add New Bookmark</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isInvalid={!!formErrors.url}>
                <FormLabel>URL</FormLabel>
                <Input
                  placeholder="https://example.com"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
                <FormErrorMessage>{formErrors.url}</FormErrorMessage>
              </FormControl>

              <FormControl isInvalid={!!formErrors.title}>
                <FormLabel>Title</FormLabel>
                <Input
                  placeholder="Bookmark title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
                <FormErrorMessage>{formErrors.title}</FormErrorMessage>
              </FormControl>

              <FormControl>
                <FormLabel>Description (optional)</FormLabel>
                <Textarea
                  placeholder="Brief description of the bookmark"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Tags (optional)</FormLabel>
                <Input
                  placeholder="tag1, tag2, tag3"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                />
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Separate tags with commas
                </Text>
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="brand"
              onClick={handleSubmit}
              isLoading={createMutation.isPending}
            >
              Add Bookmark
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default Bookmarks