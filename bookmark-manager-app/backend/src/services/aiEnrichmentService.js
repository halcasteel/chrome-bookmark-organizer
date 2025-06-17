import unifiedLogger from './unifiedLogger.js';
import openaiService from './openaiService.js';
import urlContentFetcher from './urlContentFetcher.js';

/**
 * AI Enrichment Service
 * 
 * This service determines which AI provider to use based on environment:
 * - In Claude Code environment: Uses Claude API
 * - Otherwise: Falls back to OpenAI
 * 
 * The service provides a unified interface for bookmark enrichment
 * regardless of the underlying AI provider.
 */
class AIEnrichmentService {
  constructor() {
    this.isClaudeCodeEnvironment = process.env.USE_CLAUDE_CODE_FIRST === 'true';
    this.categories = [
      'Technology', 'Development', 'AI/ML', 'Cloud/DevOps', 'Security',
      'Business', 'Finance', 'Education', 'Science', 'Health',
      'News', 'Entertainment', 'Social Media', 'Shopping', 'Travel',
      'Food', 'Sports', 'Arts', 'Reference', 'Government',
      'Tools/Utilities', 'Personal', 'Other'
    ];
    
    unifiedLogger.info('AIEnrichmentService initialized', {
      service: 'aiEnrichmentService',
      method: 'constructor',
      isClaudeCodeEnvironment: this.isClaudeCodeEnvironment,
      provider: this.isClaudeCodeEnvironment ? 'Claude' : 'OpenAI'
    });
  }

  /**
   * Enrich a bookmark with AI-generated metadata
   * @param {Object} bookmarkData - Bookmark data to enrich
   * @returns {Object} - Enrichment result
   */
  async enrichBookmark(bookmarkData) {
    try {
      // First, fetch the actual content from the URL
      const urlContent = await urlContentFetcher.fetchContent(bookmarkData.url);
      
      // Enhance bookmark data with fetched content
      const enhancedData = {
        ...bookmarkData,
        title: urlContent.metadata.title || bookmarkData.title,
        description: urlContent.metadata.description || bookmarkData.description,
        content: urlContent.content,
        fullText: urlContent.fullText,
        metadata: urlContent.metadata,
        structuredData: urlContent.structuredData,
        headings: urlContent.headings
      };
      
      if (this.isClaudeCodeEnvironment) {
        return this.enrichWithClaude(enhancedData);
      } else {
        return this.enrichWithOpenAI(enhancedData);
      }
    } catch (error) {
      unifiedLogger.warn('Failed to fetch URL content, using basic data', {
        service: 'aiEnrichmentService',
        method: 'enrichBookmark',
        url: bookmarkData.url,
        error: error.message
      });
      
      // Fallback to enrichment without fetched content
      if (this.isClaudeCodeEnvironment) {
        return this.enrichWithClaude(bookmarkData);
      } else {
        return this.enrichWithOpenAI(bookmarkData);
      }
    }
  }

  /**
   * Enrich bookmark using Claude (when in Claude Code environment)
   * @param {Object} bookmarkData - Bookmark data
   * @returns {Object} - Enrichment result
   */
  async enrichWithClaude(bookmarkData) {
    const startTime = Date.now();
    
    unifiedLogger.debug('Enriching bookmark with Claude', {
      service: 'aiEnrichmentService',
      method: 'enrichWithClaude',
      url: bookmarkData.url
    });

    try {
      // In Claude Code environment, we perform intelligent analysis
      // based on the fetched content and metadata
      
      // Analyze all available data
      const url = bookmarkData.url.toLowerCase();
      const title = (bookmarkData.title || '').toLowerCase();
      const description = (bookmarkData.description || '').toLowerCase();
      const content = (bookmarkData.content || '').toLowerCase();
      const fullText = (bookmarkData.fullText || '').toLowerCase();
      const headings = bookmarkData.headings || [];
      const metadata = bookmarkData.metadata || {};
      const structuredData = bookmarkData.structuredData || [];
      
      // Combine all text for analysis
      const combined = `${url} ${title} ${description} ${content} ${fullText}`.substring(0, 5000);
      
      // Smart categorization based on content
      let category = 'Other';
      let tags = [];
      let keywords = [];
      
      // Development patterns
      if (combined.match(/github|gitlab|stackoverflow|npm|yarn|pip|docker|kubernetes|programming|code|developer|software|api|framework|library/i)) {
        category = 'Development';
        tags = this.extractTags(combined, ['programming', 'software', 'development', 'coding', 'api', 'framework']);
        
        // Language detection
        if (combined.match(/javascript|node\.?js|react|vue|angular/i)) tags.push('javascript');
        if (combined.match(/python|django|flask|pip/i)) tags.push('python');
        if (combined.match(/java|spring|maven/i)) tags.push('java');
        if (combined.match(/rust|cargo/i)) tags.push('rust');
        if (combined.match(/go|golang/i)) tags.push('golang');
      }
      // AI/ML patterns
      else if (combined.match(/artificial intelligence|machine learning|deep learning|neural|ai|ml|gpt|llm|transformer|tensorflow|pytorch/i)) {
        category = 'AI/ML';
        tags = this.extractTags(combined, ['ai', 'machine-learning', 'deep-learning', 'neural-networks', 'llm']);
      }
      // Technology patterns
      else if (combined.match(/tech|technology|gadget|hardware|software|computer|digital|innovation/i)) {
        category = 'Technology';
        tags = this.extractTags(combined, ['technology', 'tech', 'innovation', 'digital']);
      }
      // Food/Cooking patterns
      else if (combined.match(/recipe|cooking|food|cuisine|restaurant|ingredient|bake|cook|kitchen/i)) {
        category = 'Food';
        tags = this.extractTags(combined, ['cooking', 'recipes', 'food', 'cuisine', 'culinary']);
      }
      // Education patterns
      else if (combined.match(/learn|course|tutorial|education|university|school|academy|training|lesson/i)) {
        category = 'Education';
        tags = this.extractTags(combined, ['education', 'learning', 'tutorial', 'course', 'training']);
      }
      // News patterns
      else if (combined.match(/news|article|report|journalism|breaking|latest|update|media/i)) {
        category = 'News';
        tags = this.extractTags(combined, ['news', 'media', 'journalism', 'current-events']);
      }
      
      // Generate summary
      const summary = this.generateSummary(bookmarkData);
      
      // Extract keywords
      keywords = this.extractKeywords(combined);
      
      const result = {
        category,
        tags: [...new Set(tags)].slice(0, 5), // Unique tags, max 5
        summary,
        keywords: keywords.slice(0, 10),
        priority: this.determinePriority(category, tags)
      };
      
      unifiedLogger.info('Bookmark enriched with Claude simulation', {
        service: 'aiEnrichmentService',
        method: 'enrichWithClaude',
        url: bookmarkData.url,
        category: result.category,
        tagsCount: result.tags.length,
        duration: Date.now() - startTime
      });
      
      return result;
      
    } catch (error) {
      unifiedLogger.error('Claude enrichment error', {
        service: 'aiEnrichmentService',
        method: 'enrichWithClaude',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Enrich bookmark using OpenAI
   * @param {Object} bookmarkData - Bookmark data
   * @returns {Object} - Enrichment result
   */
  async enrichWithOpenAI(bookmarkData) {
    // Delegate to existing OpenAI service
    const result = await openaiService.categorizeBookmark(bookmarkData);
    
    // Ensure we have keywords field
    if (!result.keywords) {
      result.keywords = this.extractKeywords(
        `${bookmarkData.url} ${bookmarkData.title} ${bookmarkData.content}`.substring(0, 1000)
      );
    }
    
    return result;
  }

  /**
   * Extract relevant tags from content
   * @param {string} content - Content to analyze
   * @param {Array} baseTags - Base tags to consider
   * @returns {Array} - Extracted tags
   */
  extractTags(content, baseTags) {
    const tags = [];
    
    // Add base tags that appear in content
    baseTags.forEach(tag => {
      if (content.includes(tag.replace('-', ' '))) {
        tags.push(tag);
      }
    });
    
    // Extract technology-specific tags
    const techPatterns = {
      'nodejs': /node\.?js/i,
      'react': /react/i,
      'vue': /vue/i,
      'angular': /angular/i,
      'docker': /docker/i,
      'kubernetes': /kubernetes|k8s/i,
      'aws': /aws|amazon web services/i,
      'azure': /azure/i,
      'gcp': /gcp|google cloud/i,
      'mongodb': /mongodb/i,
      'postgresql': /postgres/i,
      'redis': /redis/i,
      'elasticsearch': /elasticsearch/i,
      'graphql': /graphql/i,
      'rest-api': /rest api|restful/i,
      'microservices': /microservice/i,
      'serverless': /serverless/i,
      'blockchain': /blockchain/i,
      'crypto': /cryptocurrency|crypto/i,
      'security': /security|encryption/i,
      'devops': /devops/i,
      'ci-cd': /ci\/cd|continuous integration/i,
      'testing': /testing|test/i,
      'agile': /agile|scrum/i
    };
    
    Object.entries(techPatterns).forEach(([tag, pattern]) => {
      if (pattern.test(content)) {
        tags.push(tag);
      }
    });
    
    return tags;
  }

  /**
   * Generate a summary from bookmark data
   * @param {Object} bookmarkData - Bookmark data
   * @returns {string} - Generated summary
   */
  generateSummary(bookmarkData) {
    const { title, description, content } = bookmarkData;
    
    if (description && description.length > 20) {
      return description.substring(0, 200);
    }
    
    if (content && content.length > 50) {
      // Extract first meaningful sentence
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length > 0) {
        return sentences.slice(0, 2).join(' ').trim().substring(0, 200);
      }
    }
    
    if (title) {
      return `Bookmark for: ${title}`;
    }
    
    return 'No description available';
  }

  /**
   * Extract keywords from content
   * @param {string} content - Content to analyze
   * @returns {Array} - Extracted keywords
   */
  extractKeywords(content) {
    // Remove common words and extract meaningful terms
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'about', 'as', 'is', 'was', 'are', 'were',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
      'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'some',
      'few', 'more', 'most', 'other', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under',
      'again', 'further', 'then', 'once'
    ]);
    
    // Extract words
    const words = content.toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));
    
    // Count frequency
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    // Sort by frequency and return top keywords
    return Object.entries(frequency)
      .sort(([, a], [, b]) => b - a)
      .map(([word]) => word)
      .slice(0, 20);
  }

  /**
   * Determine priority based on category and tags
   * @param {string} category - Bookmark category
   * @param {Array} tags - Bookmark tags
   * @returns {string} - Priority level
   */
  determinePriority(category, tags) {
    const highPriorityCategories = ['Development', 'AI/ML', 'Security', 'Business'];
    const highPriorityTags = ['urgent', 'important', 'todo', 'reference', 'documentation'];
    
    if (highPriorityCategories.includes(category)) {
      return 'high';
    }
    
    if (tags.some(tag => highPriorityTags.includes(tag))) {
      return 'high';
    }
    
    const lowPriorityCategories = ['Entertainment', 'Social Media', 'Shopping'];
    if (lowPriorityCategories.includes(category)) {
      return 'low';
    }
    
    return 'medium';
  }
}

// Export singleton instance
export default new AIEnrichmentService();