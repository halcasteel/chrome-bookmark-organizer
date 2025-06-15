import OpenAI from 'openai';
import logger from '../utils/logger.js';

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
  }

  /**
   * Categorize a bookmark using OpenAI
   */
  async categorizeBookmark(bookmarkData) {
    if (!this.client) {
      logger.warn('OpenAI client not initialized - API key missing');
      return {};
    }

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

      logger.info('Bookmark categorized successfully', {
        url: bookmarkData.url,
        category: result.category
      });

      return result;

    } catch (error) {
      logger.error('OpenAI categorization error', {
        error: error.message,
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

    logger.info('Using fallback categorization', {
      url: bookmarkData.url,
      category,
      pattern: matchedPattern
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
    if (!this.client) {
      return null;
    }

    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000) // Limit input length
      });

      return response.data[0].embedding;

    } catch (error) {
      logger.error('Embedding generation error', { error: error.message });
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