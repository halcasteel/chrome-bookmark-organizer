import React, { useState } from 'react'
import {
  Box,
  Heading,
  Button,
  VStack,
  HStack,
  Text,
  Card,
  CardBody,
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Switch,
  useToast,
  Flex,
  Badge,
  Icon,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorModeValue,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tooltip,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react'
import { FiPlus, FiEdit2, FiTrash2, FiMoreVertical, FiFolder, FiShare2, FiCopy, FiLock, FiUnlock } from 'react-icons/fi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { collectionService } from '../services/api'
import type { Collection } from '../types'

interface CollectionFormData {
  name: string
  description: string
  is_public: boolean
}

const Collections: React.FC = () => {
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null)
  const { isOpen, onOpen, onClose } = useDisclosure()
  const toast = useToast()
  const queryClient = useQueryClient()
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.600')
  
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CollectionFormData>()

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionService.getAll()
      return response.data.collections || response.data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: collectionService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast({
        title: 'Collection created',
        status: 'success',
        duration: 3000,
      })
      onClose()
      reset()
    },
    onError: () => {
      toast({
        title: 'Failed to create collection',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Collection> }) =>
      collectionService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast({
        title: 'Collection updated',
        status: 'success',
        duration: 3000,
      })
      onClose()
      reset()
      setEditingCollection(null)
    },
    onError: () => {
      toast({
        title: 'Failed to update collection',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: collectionService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast({
        title: 'Collection deleted',
        status: 'success',
        duration: 3000,
      })
    },
    onError: () => {
      toast({
        title: 'Failed to delete collection',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const shareMutation = useMutation({
    mutationFn: collectionService.share,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast({
        title: 'Share link generated',
        status: 'success',
        duration: 3000,
      })
    },
  })

  const unshareMutation = useMutation({
    mutationFn: collectionService.unshare,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      toast({
        title: 'Share link removed',
        status: 'success',
        duration: 3000,
      })
    },
  })

  const handleOpenModal = (collection?: Collection) => {
    if (collection) {
      setEditingCollection(collection)
      setValue('name', collection.name)
      setValue('description', collection.description || '')
      setValue('is_public', collection.is_public)
    } else {
      setEditingCollection(null)
      reset()
    }
    onOpen()
  }

  const onSubmit = (data: CollectionFormData) => {
    if (editingCollection) {
      updateMutation.mutate({ id: editingCollection.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleCopyShareLink = (shareToken: string) => {
    const shareUrl = `${window.location.origin}/shared/${shareToken}`
    navigator.clipboard.writeText(shareUrl)
    toast({
      title: 'Share link copied',
      description: 'The share link has been copied to your clipboard',
      status: 'success',
      duration: 3000,
    })
  }

  return (
    <Box maxW="7xl" mx="auto">
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg">Collections</Heading>
        <Button
          leftIcon={<FiPlus />}
          colorScheme="brand"
          onClick={() => handleOpenModal()}
        >
          New Collection
        </Button>
      </Flex>

      {isLoading ? (
        <Text>Loading collections...</Text>
      ) : !collections || collections.length === 0 ? (
        <Card bg={cardBg}>
          <CardBody>
            <VStack py={8}>
              <Icon as={FiFolder} boxSize={12} color="gray.400" />
              <Text fontSize="lg" color="gray.500">No collections yet</Text>
              <Text fontSize="sm" color="gray.400">Create your first collection to organize your bookmarks</Text>
              <Button
                mt={4}
                leftIcon={<FiPlus />}
                colorScheme="brand"
                variant="outline"
                onClick={() => handleOpenModal()}
              >
                Create Collection
              </Button>
            </VStack>
          </CardBody>
        </Card>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
          {collections.map((collection) => (
            <Card
              key={collection.id}
              bg={cardBg}
              borderWidth={1}
              borderColor={borderColor}
              _hover={{ shadow: 'md' }}
              transition="all 0.2s"
            >
              <CardBody>
                <Flex justify="space-between" align="start" mb={4}>
                  <VStack align="start" flex="1" spacing={1}>
                    <HStack>
                      <Icon as={FiFolder} color="brand.500" />
                      <Text fontSize="lg" fontWeight="medium">{collection.name}</Text>
                    </HStack>
                    {collection.description && (
                      <Text fontSize="sm" color="gray.600" noOfLines={2}>
                        {collection.description}
                      </Text>
                    )}
                  </VStack>
                  
                  <Menu>
                    <MenuButton
                      as={IconButton}
                      icon={<FiMoreVertical />}
                      variant="ghost"
                      size="sm"
                      aria-label="Collection options"
                    />
                    <MenuList>
                      <MenuItem icon={<FiEdit2 />} onClick={() => handleOpenModal(collection)}>
                        Edit
                      </MenuItem>
                      {collection.is_public && !collection.share_token && (
                        <MenuItem
                          icon={<FiShare2 />}
                          onClick={() => shareMutation.mutate(collection.id)}
                        >
                          Generate Share Link
                        </MenuItem>
                      )}
                      {collection.share_token && (
                        <>
                          <MenuItem
                            icon={<FiCopy />}
                            onClick={() => handleCopyShareLink(collection.share_token!)}
                          >
                            Copy Share Link
                          </MenuItem>
                          <MenuItem
                            icon={<FiLock />}
                            onClick={() => unshareMutation.mutate(collection.id)}
                          >
                            Remove Share Link
                          </MenuItem>
                        </>
                      )}
                      <MenuItem
                        icon={<FiTrash2 />}
                        color="red.500"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this collection?')) {
                            deleteMutation.mutate(collection.id)
                          }
                        }}
                      >
                        Delete
                      </MenuItem>
                    </MenuList>
                  </Menu>
                </Flex>

                <VStack align="stretch" spacing={3}>
                  <Stat size="sm">
                    <StatLabel>Bookmarks</StatLabel>
                    <StatNumber>{collection.bookmark_count || 0}</StatNumber>
                  </Stat>

                  <HStack spacing={2}>
                    {collection.is_public ? (
                      <Badge colorScheme="green" variant="subtle">
                        <Icon as={FiUnlock} mr={1} />
                        Public
                      </Badge>
                    ) : (
                      <Badge colorScheme="gray" variant="subtle">
                        <Icon as={FiLock} mr={1} />
                        Private
                      </Badge>
                    )}
                    {collection.share_token && (
                      <Badge colorScheme="blue" variant="subtle">
                        <Icon as={FiShare2} mr={1} />
                        Shared
                      </Badge>
                    )}
                  </HStack>

                  <Button
                    size="sm"
                    variant="outline"
                    as="a"
                    href={`/bookmarks?collection=${collection.id}`}
                    w="full"
                  >
                    View Bookmarks
                  </Button>
                </VStack>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <ModalHeader>
              {editingCollection ? 'Edit Collection' : 'Create New Collection'}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4}>
                <FormControl isRequired isInvalid={!!errors.name}>
                  <FormLabel>Name</FormLabel>
                  <Input
                    {...register('name', { required: 'Name is required' })}
                    placeholder="My Collection"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Description</FormLabel>
                  <Textarea
                    {...register('description')}
                    placeholder="Optional description..."
                    rows={3}
                  />
                </FormControl>

                <FormControl display="flex" alignItems="center">
                  <FormLabel htmlFor="is_public" mb="0">
                    Make this collection public
                  </FormLabel>
                  <Switch
                    id="is_public"
                    {...register('is_public')}
                  />
                </FormControl>
              </VStack>
            </ModalBody>

            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                colorScheme="brand"
                isLoading={createMutation.isPending || updateMutation.isPending}
              >
                {editingCollection ? 'Update' : 'Create'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default Collections