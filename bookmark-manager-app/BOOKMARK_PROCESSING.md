# Bookmark Processing System

## Overview
The bookmark processing system validates URLs using Puppeteer (headless Chrome), extracts metadata, and classifies bookmarks using OpenAI's GPT model. Each bookmark is processed individually as a JSON file for better async handling and error recovery.

## Architecture

### 1. File Processing Pipeline
```
HTML File → Parse → Individual JSON Files → Validation → Classification → Database
```

### 2. Directory Structure
```
bookmark-validation/
├── pending/      # Newly parsed bookmarks waiting for validation
├── valid/        # Successfully validated bookmarks with metadata
├── invalid/      # Failed validation (dead links, errors)
├── processed/    # Completed bookmarks stored in database
└── failed/       # Processing failures requiring manual review
```

### 3. Components

#### BookmarkValidator (Puppeteer)
- Headless browser validation
- Metadata extraction
- Screenshot capture
- Concurrent processing with rate limiting
- Retry logic for transient failures

#### BookmarkProcessor (LLM Integration)
- OpenAI/Claude classification
- Category and tag assignment
- Quality scoring
- Embedding generation for semantic search

## Usage

### 1. Test Individual URLs
```bash
npm run validate-bookmarks:test
```

### 2. Process Bookmark File
```bash
npm run validate-bookmarks imports/sample-bookmarks.html <user-id>
```

### 3. Process Pending Bookmarks
```bash
node src/scripts/processPending.js <user-id>
```

## Validation Process

### Step 1: URL Validation
Each URL is tested with Puppeteer to:
- Check HTTP status code
- Measure load time
- Capture page screenshot
- Extract metadata

### Step 2: Metadata Extraction
```javascript
{
  title: "Page Title",
  description: "Meta description",
  keywords: ["keyword1", "keyword2"],
  ogImage: "https://example.com/image.jpg",
  favicon: "https://example.com/favicon.ico",
  language: "en",
  author: "Author Name",
  canonical: "https://example.com/canonical-url",
  contentType: "article",
  siteName: "Example Site",
  publishedTime: "2024-01-01T00:00:00Z"
}
```

### Step 3: LLM Classification
The GPT model analyzes metadata to provide:
```javascript
{
  category: "Technology",
  subcategory: "Web Development",
  tags: ["javascript", "frontend", "tutorial"],
  summary: "A comprehensive guide to modern JavaScript development",
  priority: "high",
  contentQuality: 8
}
```

### Step 4: Database Storage
- Bookmark record with URL, title, description
- Metadata record with full validation data
- Tags linked through junction table
- Vector embedding for semantic search

## Configuration

### Environment Variables
```env
# Puppeteer Options
PUPPETEER_HEADLESS=new
PUPPETEER_TIMEOUT=30000
PUPPETEER_MAX_CONCURRENT=5

# OpenAI Configuration
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-3.5-turbo

# Processing Options
BOOKMARK_BATCH_SIZE=10
BOOKMARK_RETRY_ATTEMPTS=2
```

### Validation Options
```javascript
const validator = new BookmarkValidator({
  timeout: 30000,              // Page load timeout
  userAgent: 'Custom/1.0',     // Custom user agent
  headless: 'new',             // Puppeteer headless mode
  maxConcurrent: 5,            // Concurrent validations
  retryAttempts: 2,            // Retry failed validations
  outputDir: './validation'    // Output directory
});
```

## Error Handling

### Validation Failures
- Network timeouts → Retry with exponential backoff
- SSL errors → Log and mark as suspicious
- 404/500 errors → Mark as dead link
- JavaScript errors → Capture and continue

### Classification Failures
- API rate limits → Queue for later processing
- Invalid responses → Use default classification
- Token limits → Truncate content and retry

## Monitoring

### Metrics Tracked
- Total bookmarks processed
- Success/failure rates
- Average processing time
- Category distribution
- Dead link percentage

### Log Levels
- **Error**: Critical failures, API errors
- **Warn**: Dead links, validation failures
- **Info**: Processing progress, summaries
- **Debug**: Detailed validation steps

## Performance Optimization

### 1. Concurrent Processing
- Process up to 5 URLs simultaneously
- Separate browser contexts for isolation
- Automatic resource cleanup

### 2. Caching
- 15-minute cache for repeated URLs
- Reuse browser instances
- Cache LLM classifications

### 3. Resource Management
- Limit screenshot size
- Close pages after processing
- Regular garbage collection

## Troubleshooting

### Common Issues

1. **Puppeteer Won't Start**
   ```bash
   # Install dependencies
   sudo apt-get install -y \
     libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
     libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
     libxdamage1 libxrandr2 libgbm1 libgtk-3-0 libasound2
   ```

2. **Memory Issues**
   - Reduce concurrent validations
   - Enable headless mode
   - Increase Node.js memory limit

3. **Slow Processing**
   - Check network latency
   - Reduce screenshot quality
   - Skip unnecessary metadata

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run validate-bookmarks

# Run with visible browser
PUPPETEER_HEADLESS=false npm run validate-bookmarks
```

## Future Enhancements

1. **Alternative Validators**
   - Playwright support
   - Simple HTTP validation fallback
   - API-based URL checking

2. **Enhanced Classification**
   - Multi-model consensus
   - Custom training data
   - User feedback integration

3. **Batch Operations**
   - Bulk revalidation
   - Category migration
   - Duplicate detection

4. **Integration**
   - Browser extension
   - Mobile app support
   - Third-party bookmark services