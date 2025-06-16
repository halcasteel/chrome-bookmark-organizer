import OpenAI from 'openai';
import unifiedLogger from './unifiedLogger.js';

class OpenAIService {
  constructor() {
    this.client = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    }) : null;
    
    this.categories = [
      'Technology', 'Development', 'AI/ML', 'Cloud/DevOps', 'Security',
      'Business', 'Finance', 'Education', 'Science', 'Health',
      'News', 'Entertainment', 'Social Media', 'Shopping', 'Travel',
      'Food', 'Sports', 'Arts', 'Reference', 'Government',
      'Tools/Utilities', 'Personal', 'Other'
    ];

    unifiedLogger.info('OpenAIService initialized', {
      service: 'openaiService',
      source: 'constructor',
      configured: !!this.client,
      categoriesCount: this.categories.length
    });
  }

  /**
   * Categorize a bookmark using OpenAI
   */
  async categorizeBookmark(bookmarkData) {
    const startTime = Date.now();
    
    if (!this.client) {
      unifiedLogger.warn('OpenAI client not initialized - API key missing', {
        service: 'openaiService',
        source: 'categorizeBookmark'
      });
      return {};
    }

    unifiedLogger.debug('Categorizing bookmark', {
      service: 'openaiService',
      source: 'categorizeBookmark',
      url: bookmarkData.url,
      hasTitle: !!bookmarkData.title,
      hasDescription: !!bookmarkData.description
    });

    try {
      const prompt = `
        Analyze this bookmark and provide categorization:
        
        URL: ${bookmarkData.url}
        Title: ${bookmarkData.title}
        Description: ${bookmarkData.description}
        Content preview: ${bookmarkData.content}
        
        Provide the following in JSON format:
        1. category: Main category from this list: ${this.categories.join(', ')}
        2. subcategory: More specific subcategory (if applicable)
        3. tags: Array of 3-5 relevant tags
        4. summary: A concise 1-2 sentence summary of what this bookmark is about
        5. priority: "high", "medium", or "low" based on likely usefulness
        
        Response format:
        {
          "category": "string",
          "subcategory": "string or null",
          "tags": ["tag1", "tag2", "tag3"],
          "summary": "string",
          "priority": "string"
        }
      `;

      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a bookmark categorization assistant. Analyze bookmarks and provide accurate categorization in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      // Validate response
      if (!result.category || !this.categories.includes(result.category)) {
        result.category = 'Other';
      }
      
      if (!Array.isArray(result.tags)) {
        result.tags = [];
      }
      
      if (!['high', 'medium', 'low'].includes(result.priority)) {
        result.priority = 'medium';
      }

      unifiedLogger.info('Bookmark categorized successfully', {
        service: 'openaiService',
        source: 'categorizeBookmark',
        url: bookmarkData.url,
        category: result.category,
        subcategory: result.subcategory,
        tagsCount: result.tags.length,
        priority: result.priority,
        duration: Date.now() - startTime
      });

      return result;

    } catch (error) {
      unifiedLogger.error('OpenAI categorization error', {
        service: 'openaiService',
        source: 'categorizeBookmark',
        error: error.message,
        stack: error.stack,
        url: bookmarkData.url
      });
      
      // Fallback categorization based on URL/title patterns
      return this.fallbackCategorization(bookmarkData);
    }
  }

  /**
   * Fallback categorization using patterns
   */
  fallbackCategorization(bookmarkData) {
    const startTime = Date.now();
    unifiedLogger.debug('Using fallback categorization', {
      service: 'openaiService',
      source: 'fallbackCategorization',
      url: bookmarkData.url
    });

    const url = bookmarkData.url.toLowerCase();
    const title = (bookmarkData.title || '').toLowerCase();
    const combined = `${url} ${title}`;

    // Pattern matching for categories
    const patterns = {
      'Technology': /tech|computer|software|hardware|gadget/i,
      'Development': /github|gitlab|stackoverflow|npm|developer|programming|code/i,
      'AI/ML': /artificial intelligence|machine learning|deep learning|neural|ai|ml|openai|anthropic/i,
      'Cloud/DevOps': /aws|azure|gcp|docker|kubernetes|devops|cloud/i,
      'Security': /security|encryption|vpn|firewall|antivirus|cyber/i,
      'Business': /business|company|startup|entrepreneur|corporate/i,
      'Finance': /finance|money|invest|stock|crypto|bank|trading/i,
      'Education': /edu|learn|course|tutorial|university|school|academy/i,
      'Science': /science|research|study|journal|nature|physics|biology/i,
      'Health': /health|medical|doctor|hospital|fitness|wellness/i,
      'News': /news|bbc|cnn|reuters|times|post|guardian/i,
      'Entertainment': /movie|music|game|video|youtube|netflix|spotify/i,
      'Social Media': /facebook|twitter|instagram|linkedin|reddit|social/i,
      'Shopping': /shop|store|buy|amazon|ebay|walmart|ecommerce/i,
      'Travel': /travel|trip|hotel|flight|booking|tourism/i,
      'Food': /food|recipe|restaurant|cooking|cuisine/i,
      'Sports': /sport|football|basketball|soccer|tennis|golf/i,
      'Arts': /art|design|photo|gallery|museum|creative/i,
      'Reference': /wikipedia|dictionary|encyclopedia|reference|wiki/i,
      'Government': /\.gov|government|federal|state|city|public/i,
      'Tools/Utilities': /tool|utility|calculator|converter|generator/i
    };

    let category = 'Other';
    let matchedPattern = null;

    for (const [cat, pattern] of Object.entries(patterns)) {
      if (pattern.test(combined)) {
        category = cat;
        matchedPattern = pattern.source;
        break;
      }
    }

    // Extract potential tags from title
    const words = title.split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['the', 'and', 'for', 'with', 'from'].includes(word))
      .slice(0, 5);

    unifiedLogger.info('Fallback categorization completed', {
      service: 'openaiService',
      source: 'fallbackCategorization',
      url: bookmarkData.url,
      category,
      pattern: matchedPattern,
      tagsCount: words.length,
      duration: Date.now() - startTime
    });

    return {
      category,
      subcategory: null,
      tags: words,
      summary: `${bookmarkData.title} - ${bookmarkData.description || 'No description available'}`.substring(0, 200),
      priority: 'medium'
    };
  }

  /**
   * Generate embeddings for a bookmark
   */
  async generateEmbedding(text) {
    const startTime = Date.now();

    if (!this.client) {
      unifiedLogger.debug('OpenAI client not available for embedding', {
        service: 'openaiService',
        source: 'generateEmbedding'
      });
      return null;
    }

    unifiedLogger.debug('Generating embedding', {
      service: 'openaiService',
      source: 'generateEmbedding',
      textLength: text.length
    });

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000) // Limit input length
      });

      unifiedLogger.debug('Embedding generated successfully', {
        service: 'openaiService',
        source: 'generateEmbedding',
        duration: Date.now() - startTime
      });

      return response.data[0].embedding;

    } catch (error) {
      unifiedLogger.error('Embedding generation error', {
        service: 'openaiService',
        source: 'generateEmbedding',
        error: error.message,
        stack: error.stack,
        textLength: text.length
      });
      return null;
    }
  }

  /**
   * Check if OpenAI is configured
   */
  isConfigured() {
    return !!this.client;
  }
}

export default new OpenAIService();