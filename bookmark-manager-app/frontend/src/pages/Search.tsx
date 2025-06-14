import React, { useState, FormEvent } from 'react'
import {
  Box,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  VStack,
  HStack,
  Text,
  Link,
  Card,
  CardBody,
  Flex,
  Icon,
  Badge,
  useColorModeValue,
  RadioGroup,
  Radio,
  Stack,
  Spinner,
  Image,
  Tooltip,
  IconButton,
} from '@chakra-ui/react'
import { FiSearch, FiExternalLink, FiBookmark } from 'react-icons/fi'
import { useMutation } from '@tanstack/react-query'
import { searchService } from '@/services/api'
import { useDebounce } from '@/hooks/useDebounce'
import type { SearchResult } from '@/types'

type SearchType = 'semantic' | 'fulltext'

const Search: React.FC = () => {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('semantic')
  const [results, setResults] = useState<SearchResult[]>([])
  const debouncedQuery = useDebounce(query, 500)
  const cardBg = useColorModeValue('white', 'gray.800')
  const hoverBg = useColorModeValue('gray.50', 'gray.700')

  const searchMutation = useMutation({
    mutationFn: async ({ query, type }: { query: string; type: SearchType }) => {
      if (!query.trim()) return []
      
      if (type === 'semantic') {
        const response = await searchService.semantic(query, { limit: 20 })
        return response.data.results
      } else {
        const response = await searchService.fullText(query, { limit: 20 })
        return response.data.results
      }
    },
    onSuccess: (data) => {
      setResults(data || [])
    },
  })

  React.useEffect(() => {
    if (debouncedQuery) {
      searchMutation.mutate({ query: debouncedQuery, type: searchType })
    } else {
      setResults([])
    }
  }, [debouncedQuery, searchType])

  const handleSearch = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (query.trim()) {
      searchMutation.mutate({ query, type: searchType })
    }
  }

  return (
    <Box maxW="6xl" mx="auto">
      <Heading size="lg" mb={6}>Search Bookmarks</Heading>
      
      <Card bg={cardBg} mb={6}>
        <CardBody>
          <form onSubmit={handleSearch}>
            <VStack spacing={4} align="stretch">
              <InputGroup size="lg">
                <InputLeftElement pointerEvents="none">
                  <Icon as={FiSearch} color="gray.400" />
                </InputLeftElement>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your bookmarks..."
                  autoFocus
                />
              </InputGroup>
              
              <HStack justify="space-between" wrap="wrap">
                <RadioGroup value={searchType} onChange={(value) => setSearchType(value as SearchType)}>
                  <Stack direction="row">
                    <Radio value="semantic">Semantic Search</Radio>
                    <Radio value="fulltext">Full Text</Radio>
                  </Stack>
                </RadioGroup>
                
                <Button
                  type="submit"
                  colorScheme="brand"
                  leftIcon={<FiSearch />}
                  isLoading={searchMutation.isPending}
                >
                  Search
                </Button>
              </HStack>
            </VStack>
          </form>
        </CardBody>
      </Card>

      {searchMutation.isPending && (
        <Flex justify="center" py={8}>
          <Spinner size="lg" color="brand.500" />
        </Flex>
      )}

      {results.length > 0 && (
        <VStack spacing={4} align="stretch">
          <Text fontSize="sm" color="gray.600">
            Found {results.length} results
          </Text>
          
          {results.map((result) => (
            <Card
              key={result.bookmark_id}
              bg={cardBg}
              _hover={{ bg: hoverBg }}
              transition="background 0.2s"
              cursor="pointer"
            >
              <CardBody>
                <Flex justify="space-between" align="start" gap={4}>
                  <Box flex="1">
                    <HStack mb={2}>
                      <Image
                        src={`https://www.google.com/s2/favicons?domain=${result.domain}&sz=32`}
                        alt={result.domain}
                        boxSize="20px"
                        fallbackSrc="/favicon.ico"
                      />
                      <Link
                        href={result.url}
                        isExternal
                        fontSize="lg"
                        fontWeight="medium"
                        color="brand.600"
                        _hover={{ textDecoration: 'underline' }}
                      >
                        {result.title}
                        <Icon as={FiExternalLink} ml={1} boxSize={3} />
                      </Link>
                    </HStack>
                    
                    <Text fontSize="sm" color="gray.600" mb={2}>
                      {result.url}
                    </Text>
                    
                    {result.description && (
                      <Text fontSize="sm" mb={2}>
                        {result.description}
                      </Text>
                    )}
                    
                    {searchType === 'semantic' && result.similarity !== undefined && (
                      <HStack>
                        <Badge colorScheme="green">
                          {(result.similarity * 100).toFixed(1)}% match
                        </Badge>
                      </HStack>
                    )}
                  </Box>
                  
                  <Tooltip label="Save bookmark">
                    <IconButton
                      icon={<FiBookmark />}
                      variant="ghost"
                      aria-label="Save bookmark"
                    />
                  </Tooltip>
                </Flex>
              </CardBody>
            </Card>
          ))}
        </VStack>
      )}

      {query && !searchMutation.isPending && results.length === 0 && (
        <Flex justify="center" align="center" py={12}>
          <VStack>
            <Icon as={FiSearch} boxSize={12} color="gray.400" />
            <Text color="gray.500">No results found for "{query}"</Text>
            <Text fontSize="sm" color="gray.400">
              Try different keywords or search type
            </Text>
          </VStack>
        </Flex>
      )}
    </Box>
  )
}

export default Search