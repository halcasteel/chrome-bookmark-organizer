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
  useToast,
  Flex,
  Badge,
  Icon,
  useColorModeValue,
  SimpleGrid,
  Wrap,
  WrapItem,
  Tag as ChakraTag,
  TagLabel,
  TagCloseButton,
  Stat,
  StatLabel,
  StatNumber,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  PopoverCloseButton,
} from '@chakra-ui/react'
import { FiTag, FiPlus, FiEdit2, FiTrash2 } from 'react-icons/fi'
// import { HexColorPicker } from 'react-colorful'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { tagService } from '../services/api'
import type { Tag } from '../types'

interface TagFormData {
  name: string
  color: string
}

const Tags: React.FC = () => {
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [selectedColor, setSelectedColor] = useState('#4299E1')
  const { isOpen, onOpen, onClose } = useDisclosure()
  const toast = useToast()
  const queryClient = useQueryClient()
  const cardBg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.600')
  
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<TagFormData>()

  const { data: tags, isLoading } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const response = await tagService.getAll()
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: Omit<Tag, 'id' | 'user_id' | 'created_at'>) => tagService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast({
        title: 'Tag created',
        status: 'success',
        duration: 3000,
      })
      onClose()
      reset()
      setSelectedColor('#4299E1')
    },
    onError: () => {
      toast({
        title: 'Failed to create tag',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<Tag, 'id' | 'user_id' | 'created_at'>> }) =>
      tagService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast({
        title: 'Tag updated',
        status: 'success',
        duration: 3000,
      })
      onClose()
      reset()
      setEditingTag(null)
      setSelectedColor('#4299E1')
    },
    onError: () => {
      toast({
        title: 'Failed to update tag',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: tagService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast({
        title: 'Tag deleted',
        status: 'success',
        duration: 3000,
      })
    },
    onError: () => {
      toast({
        title: 'Failed to delete tag',
        status: 'error',
        duration: 3000,
      })
    },
  })

  const handleOpenModal = (tag?: Tag) => {
    if (tag) {
      setEditingTag(tag)
      setValue('name', tag.name)
      setValue('color', tag.color)
      setSelectedColor(tag.color)
    } else {
      setEditingTag(null)
      reset()
      setSelectedColor('#4299E1')
    }
    onOpen()
  }

  const onSubmit = (data: TagFormData) => {
    const tagData = { ...data, color: selectedColor }
    if (editingTag) {
      updateMutation.mutate({ id: editingTag.id, data: tagData })
    } else {
      createMutation.mutate(tagData)
    }
  }

  const getContrastColor = (hexColor: string): string => {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    
    return luminance > 0.5 ? '#000000' : '#FFFFFF'
  }

  return (
    <Box maxW="7xl" mx="auto">
      <Flex justify="space-between" align="center" mb={6}>
        <Heading size="lg">Tags</Heading>
        <Button
          leftIcon={<FiPlus />}
          colorScheme="brand"
          onClick={() => handleOpenModal()}
        >
          New Tag
        </Button>
      </Flex>

      {isLoading ? (
        <Text>Loading tags...</Text>
      ) : !tags || tags.length === 0 ? (
        <Card bg={cardBg}>
          <CardBody>
            <VStack py={8}>
              <Icon as={FiTag} boxSize={12} color="gray.400" />
              <Text fontSize="lg" color="gray.500">No tags yet</Text>
              <Text fontSize="sm" color="gray.400">Create tags to organize your bookmarks</Text>
              <Button
                mt={4}
                leftIcon={<FiPlus />}
                colorScheme="brand"
                variant="outline"
                onClick={() => handleOpenModal()}
              >
                Create Tag
              </Button>
            </VStack>
          </CardBody>
        </Card>
      ) : (
        <VStack spacing={6} align="stretch">
          <Card bg={cardBg}>
            <CardBody>
              <Text fontSize="sm" color="gray.600" mb={4}>
                Click on a tag to view bookmarks, or use the menu to edit
              </Text>
              <Wrap spacing={3}>
                {tags.map((tag) => (
                  <WrapItem key={tag.id}>
                    <ChakraTag
                      size="lg"
                      bg={tag.color}
                      color={getContrastColor(tag.color)}
                      borderRadius="full"
                      px={4}
                      py={2}
                      cursor="pointer"
                      _hover={{ opacity: 0.8 }}
                      onClick={() => window.location.href = `/bookmarks?tag=${tag.name}`}
                    >
                      <TagLabel>{tag.name}</TagLabel>
                      <HStack spacing={1} ml={2}>
                        <IconButton
                          icon={<FiEdit2 />}
                          size="xs"
                          variant="ghost"
                          aria-label="Edit tag"
                          color={getContrastColor(tag.color)}
                          _hover={{ bg: 'whiteAlpha.300' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenModal(tag)
                          }}
                        />
                        <IconButton
                          icon={<FiTrash2 />}
                          size="xs"
                          variant="ghost"
                          aria-label="Delete tag"
                          color={getContrastColor(tag.color)}
                          _hover={{ bg: 'whiteAlpha.300' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`Are you sure you want to delete the tag "${tag.name}"?`)) {
                              deleteMutation.mutate(tag.id)
                            }
                          }}
                        />
                      </HStack>
                    </ChakraTag>
                  </WrapItem>
                ))}
              </Wrap>
            </CardBody>
          </Card>

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
            <Card bg={cardBg}>
              <CardBody>
                <Stat>
                  <StatLabel>Total Tags</StatLabel>
                  <StatNumber>{tags.length}</StatNumber>
                </Stat>
              </CardBody>
            </Card>
            
            <Card bg={cardBg}>
              <CardBody>
                <Stat>
                  <StatLabel>Most Used</StatLabel>
                  <StatNumber fontSize="lg">
                    {tags.length > 0 ? tags[0].name : 'N/A'}
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>
            
            <Card bg={cardBg}>
              <CardBody>
                <Stat>
                  <StatLabel>Recent</StatLabel>
                  <StatNumber fontSize="lg">
                    {tags.length > 0 ? tags[tags.length - 1].name : 'N/A'}
                  </StatNumber>
                </Stat>
              </CardBody>
            </Card>
          </SimpleGrid>
        </VStack>
      )}

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <ModalHeader>
              {editingTag ? 'Edit Tag' : 'Create New Tag'}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <VStack spacing={4}>
                <FormControl isRequired isInvalid={!!errors.name}>
                  <FormLabel>Name</FormLabel>
                  <Input
                    {...register('name', { 
                      required: 'Name is required',
                      pattern: {
                        value: /^[a-zA-Z0-9-_]+$/,
                        message: 'Only letters, numbers, hyphens, and underscores allowed'
                      }
                    })}
                    placeholder="my-tag"
                  />
                  {errors.name && (
                    <Text fontSize="sm" color="red.500">{errors.name.message}</Text>
                  )}
                </FormControl>

                <FormControl>
                  <FormLabel>Color</FormLabel>
                  <VStack align="stretch" spacing={3}>
                    <Popover>
                      <PopoverTrigger>
                        <Button
                          w="full"
                          h={12}
                          bg={selectedColor}
                          _hover={{ opacity: 0.8 }}
                          color={getContrastColor(selectedColor)}
                        >
                          {selectedColor}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent w="auto">
                        <PopoverArrow />
                        <PopoverCloseButton />
                        <PopoverBody>
                          <Input
                            value={selectedColor}
                            onChange={(e) => setSelectedColor(e.target.value)}
                            placeholder="#4299E1"
                          />
                        </PopoverBody>
                      </PopoverContent>
                    </Popover>
                    
                    <Wrap spacing={2}>
                      {['#E53E3E', '#ED8936', '#ECC94B', '#48BB78', '#38B2AC', '#4299E1', '#667EEA', '#9F7AEA', '#ED64A6'].map((color) => (
                        <WrapItem key={color}>
                          <Box
                            as="button"
                            type="button"
                            w={8}
                            h={8}
                            bg={color}
                            borderRadius="md"
                            border={selectedColor === color ? '2px solid' : 'none'}
                            borderColor={borderColor}
                            onClick={() => setSelectedColor(color)}
                            _hover={{ opacity: 0.8 }}
                          />
                        </WrapItem>
                      ))}
                    </Wrap>
                  </VStack>
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
                {editingTag ? 'Update' : 'Create'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Box>
  )
}

export default Tags