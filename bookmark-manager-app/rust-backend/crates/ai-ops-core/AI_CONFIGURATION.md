# AI Provider Configuration Guide

## 🤖 Supported AI Providers

AI-Ops Core supports multiple AI providers for flexibility and redundancy:

### 1. **OpenAI (GPT-4, GPT-3.5)**
- Best for: Complex reasoning, code generation, detailed analysis
- Models: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`
- Pricing: Pay-per-token
- Rate limits: Varies by tier

### 2. **Anthropic (Claude)**
- Best for: Safety-focused analysis, detailed explanations
- Models: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`
- Pricing: Pay-per-token
- Rate limits: Varies by tier

### 3. **Local Models (Ollama)**
- Best for: Privacy, offline operation, cost control
- Models: `llama2`, `mistral`, `codellama`, etc.
- Pricing: Free (self-hosted)
- Performance: Depends on hardware

## 📝 Configuration in .env

All AI configuration is done through environment variables with the `BOOKMARKS_` prefix:

```bash
# Choose your AI provider
BOOKMARKS_AI_PROVIDER=openai          # Options: openai, anthropic, local

# Provider-specific API keys
BOOKMARKS_OPENAI_API_KEY=sk-...       # Your OpenAI API key
BOOKMARKS_ANTHROPIC_API_KEY=sk-ant-... # Your Anthropic API key

# Model selection (provider-specific)
BOOKMARKS_AI_MODEL=gpt-4              # Model to use

# AI behavior tuning
BOOKMARKS_AI_TEMPERATURE=0.2          # 0.0-1.0 (lower = more focused)
BOOKMARKS_AI_MAX_TOKENS=2000          # Max response length

# Optional: Fallback provider
BOOKMARKS_AI_FALLBACK_PROVIDER=local  # Fallback if primary fails
BOOKMARKS_AI_FALLBACK_MODEL=llama2    # Fallback model
```

## 🔧 Provider-Specific Settings

### OpenAI Configuration
```bash
# Required
BOOKMARKS_OPENAI_API_KEY=sk-proj-...

# Optional
BOOKMARKS_OPENAI_ORG_ID=org-...       # Organization ID
BOOKMARKS_OPENAI_BASE_URL=https://api.openai.com/v1  # Custom endpoint
BOOKMARKS_OPENAI_TIMEOUT=30           # Request timeout in seconds

# Model options
BOOKMARKS_AI_MODEL=gpt-4              # Most capable
BOOKMARKS_AI_MODEL=gpt-4-turbo       # Faster, cheaper
BOOKMARKS_AI_MODEL=gpt-3.5-turbo     # Budget option
```

### Anthropic Configuration
```bash
# Required
BOOKMARKS_ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional
BOOKMARKS_ANTHROPIC_BASE_URL=https://api.anthropic.com  # Custom endpoint
BOOKMARKS_ANTHROPIC_TIMEOUT=30        # Request timeout
BOOKMARKS_ANTHROPIC_VERSION=2023-06-01 # API version

# Model options
BOOKMARKS_AI_MODEL=claude-3-opus      # Most capable
BOOKMARKS_AI_MODEL=claude-3-sonnet    # Balanced
BOOKMARKS_AI_MODEL=claude-3-haiku     # Fast and cheap
```

### Local Model Configuration
```bash
# Required
BOOKMARKS_LOCAL_ENDPOINT=http://localhost:11434  # Ollama endpoint

# Optional
BOOKMARKS_LOCAL_MODEL=llama2          # Model name
BOOKMARKS_LOCAL_CONTEXT_SIZE=4096     # Context window
BOOKMARKS_LOCAL_GPU_LAYERS=35         # GPU acceleration
```

## 🎯 Use Case Recommendations

### For Production Environments
```bash
# Primary: High-quality analysis
BOOKMARKS_AI_PROVIDER=openai
BOOKMARKS_AI_MODEL=gpt-4
BOOKMARKS_AI_TEMPERATURE=0.1  # Very deterministic

# Fallback: Cost-effective backup
BOOKMARKS_AI_FALLBACK_PROVIDER=openai
BOOKMARKS_AI_FALLBACK_MODEL=gpt-3.5-turbo
```

### For Development/Testing
```bash
# Use cheaper, faster models
BOOKMARKS_AI_PROVIDER=openai
BOOKMARKS_AI_MODEL=gpt-3.5-turbo
BOOKMARKS_AI_TEMPERATURE=0.3
BOOKMARKS_AI_MAX_TOKENS=1000
```

### For Privacy-Sensitive Deployments
```bash
# Everything stays local
BOOKMARKS_AI_PROVIDER=local
BOOKMARKS_LOCAL_ENDPOINT=http://localhost:11434
BOOKMARKS_AI_MODEL=llama2
```

### For High-Availability
```bash
# Multi-provider setup
BOOKMARKS_AI_PROVIDER=openai
BOOKMARKS_AI_MODEL=gpt-4
BOOKMARKS_AI_FALLBACK_PROVIDER=anthropic
BOOKMARKS_AI_FALLBACK_MODEL=claude-3-sonnet
```

## 📊 Cost Optimization

### Token Usage by Task

| Task | Avg Input Tokens | Avg Output Tokens | Recommended Model |
|------|-----------------|-------------------|-------------------|
| Log Analysis | 500-1000 | 200-400 | gpt-3.5-turbo |
| Root Cause Analysis | 1000-2000 | 500-1000 | gpt-4 |
| Solution Generation | 800-1500 | 400-800 | gpt-4 |
| Pattern Learning | 300-600 | 100-300 | gpt-3.5-turbo |

### Cost Reduction Strategies

1. **Use Temperature Wisely**
   ```bash
   # Lower temperature = fewer retries needed
   BOOKMARKS_AI_TEMPERATURE=0.1
   ```

2. **Limit Max Tokens**
   ```bash
   # Only request what you need
   BOOKMARKS_AI_MAX_TOKENS=500  # For simple analysis
   BOOKMARKS_AI_MAX_TOKENS=2000 # For complex solutions
   ```

3. **Cache Responses**
   ```bash
   # Enable response caching
   BOOKMARKS_AI_CACHE_ENABLED=true
   BOOKMARKS_AI_CACHE_TTL=3600  # 1 hour
   ```

4. **Use Appropriate Models**
   ```bash
   # Don't use GPT-4 for simple tasks
   BOOKMARKS_AI_SIMPLE_TASKS_MODEL=gpt-3.5-turbo
   BOOKMARKS_AI_COMPLEX_TASKS_MODEL=gpt-4
   ```

## 🔍 Monitoring AI Usage

### Metrics Tracked
- Token usage per agent
- API call frequency
- Error rates by provider
- Response times
- Cost per operation

### Example Prometheus Queries
```promql
# Total tokens used
sum(ai_ops_tokens_used_total) by (provider, model)

# Average response time
avg(ai_ops_ai_request_duration_seconds) by (provider)

# Error rate
rate(ai_ops_ai_requests_failed_total[5m])
```

## 🚨 Troubleshooting

### Common Issues

1. **Rate Limiting**
   ```bash
   # Symptoms: 429 errors
   # Solution: Add retry logic
   BOOKMARKS_AI_RETRY_ATTEMPTS=3
   BOOKMARKS_AI_RETRY_DELAY=5000  # ms
   ```

2. **Timeout Errors**
   ```bash
   # Increase timeout for complex analysis
   BOOKMARKS_AI_TIMEOUT=60  # seconds
   ```

3. **Invalid API Key**
   ```bash
   # Test your key
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $BOOKMARKS_OPENAI_API_KEY"
   ```

4. **Model Not Available**
   ```bash
   # Fallback to available model
   BOOKMARKS_AI_MODEL=gpt-3.5-turbo  # More widely available
   ```

## 🔐 Security Best Practices

1. **Never commit API keys**
   ```bash
   # Use environment variables
   echo "BOOKMARKS_OPENAI_API_KEY=sk-..." >> .env
   echo ".env" >> .gitignore
   ```

2. **Rotate keys regularly**
   ```bash
   # Set key expiration reminder
   BOOKMARKS_AI_KEY_ROTATION_DAYS=90
   ```

3. **Use separate keys for environments**
   ```bash
   # Production
   BOOKMARKS_OPENAI_API_KEY_PROD=sk-prod-...
   
   # Development
   BOOKMARKS_OPENAI_API_KEY_DEV=sk-dev-...
   ```

4. **Monitor for anomalies**
   ```bash
   # Alert on unusual usage
   BOOKMARKS_AI_USAGE_ALERT_THRESHOLD=1000  # tokens/hour
   ```

## 📈 Performance Tuning

### Response Time Optimization
```bash
# Parallel processing
BOOKMARKS_AI_PARALLEL_REQUESTS=3      # Max concurrent AI calls

# Streaming responses
BOOKMARKS_AI_STREAM_ENABLED=true      # Get partial results faster

# Request batching
BOOKMARKS_AI_BATCH_SIZE=5             # Group similar requests
BOOKMARKS_AI_BATCH_TIMEOUT=1000       # ms to wait for batch
```

### Quality vs Speed Trade-offs
```bash
# High quality, slower
BOOKMARKS_AI_QUALITY_MODE=high
BOOKMARKS_AI_MODEL=gpt-4
BOOKMARKS_AI_TEMPERATURE=0.1

# Fast, good enough
BOOKMARKS_AI_QUALITY_MODE=balanced
BOOKMARKS_AI_MODEL=gpt-3.5-turbo
BOOKMARKS_AI_TEMPERATURE=0.3

# Speed priority
BOOKMARKS_AI_QUALITY_MODE=fast
BOOKMARKS_AI_MODEL=gpt-3.5-turbo
BOOKMARKS_AI_TEMPERATURE=0.5
BOOKMARKS_AI_MAX_TOKENS=500
```