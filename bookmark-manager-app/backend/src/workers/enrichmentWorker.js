import Queue from 'bull';
import { logInfo, logError } from '../utils/logger.js';
import db from '../config/database.js';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

const enrichmentQueue = new Queue('bookmark-enrichment', {
  redis: {
    port: 6379,
    host: 'localhost',
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Process enrichment jobs
enrichmentQueue.process('enrich', async (job) => {
  const { bookmarkId, userId, url, title } = job.data;
  
  logInfo('Starting bookmark enrichment', { bookmarkId, url });
  
  try {
    // First, try to fetch page content for better categorization
    let pageContent = '';
    try {
      const response = await fetch(url, { timeout: 10000 });
      const html = await response.text();
      // Extract text content (simple version)
      pageContent = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 2000); // Limit to 2000 chars
    } catch (err) {
      logWarn('Failed to fetch page content', { url, error: err.message });
    }

    // Call OpenAI for categorization and tag generation
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a bookmark categorization assistant. Analyze the given URL, title, and content to:
1. Suggest a category (e.g., Technology, Business, Education, Entertainment, etc.)
2. Suggest a subcategory (more specific classification)
3. Generate 3-5 relevant tags
4. Create a brief description (max 150 chars)
5. Extract key topics for semantic search

Respond in JSON format only.`
        },
        {
          role: "user",
          content: `URL: ${url}\nTitle: ${title}\nContent preview: ${pageContent.substring(0, 500)}`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const enrichmentData = JSON.parse(completion.choices[0].message.content);
    
    // Generate embedding for semantic search
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: `${title} ${enrichmentData.description || ''} ${enrichmentData.tags?.join(' ') || ''}`,
    });
    
    const embedding = embeddingResponse.data[0].embedding;

    // Start transaction to update bookmark and metadata
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Update bookmark description
      if (enrichmentData.description) {
        await client.query(
          'UPDATE bookmarks SET description = $1 WHERE id = $2',
          [enrichmentData.description, bookmarkId]
        );
      }
      
      // Update metadata
      await client.query(
        `UPDATE bookmark_metadata 
         SET category = $1, subcategory = $2, keywords = $3, 
             semantic_summary = $4, embedding = $5, updated_at = $6
         WHERE bookmark_id = $7`,
        [
          enrichmentData.category,
          enrichmentData.subcategory,
          enrichmentData.keywords || enrichmentData.tags,
          enrichmentData.description,
          `[${embedding.join(',')}]`,
          new Date(),
          bookmarkId
        ]
      );
      
      // Add tags
      if (enrichmentData.tags && Array.isArray(enrichmentData.tags)) {
        for (const tagName of enrichmentData.tags) {
          // Check if tag exists
          let tagResult = await client.query(
            'SELECT id FROM tags WHERE user_id = $1 AND name = $2',
            [userId, tagName.toLowerCase()]
          );
          
          let tagId;
          if (tagResult.rows.length === 0) {
            // Create new tag
            const newTag = await client.query(
              'INSERT INTO tags (id, user_id, name, color, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
              [uuidv4(), userId, tagName.toLowerCase(), '#' + Math.floor(Math.random()*16777215).toString(16), new Date()]
            );
            tagId = newTag.rows[0].id;
          } else {
            tagId = tagResult.rows[0].id;
          }
          
          // Link tag to bookmark
          await client.query(
            'INSERT INTO bookmark_tags (bookmark_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [bookmarkId, tagId]
          );
        }
      }
      
      // Mark as enriched
      await client.query(
        'UPDATE bookmarks SET enriched = true WHERE id = $1',
        [bookmarkId]
      );
      
      await client.query('COMMIT');
      
      logInfo('Bookmark enrichment completed', { 
        bookmarkId,
        category: enrichmentData.category,
        tags: enrichmentData.tags
      });
      
      return { 
        bookmarkId, 
        enriched: true, 
        data: enrichmentData 
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    logError(error, { context: 'EnrichmentWorker', bookmarkId });
    throw error;
  }
});

// Handle completed jobs
enrichmentQueue.on('completed', (job, result) => {
  logInfo('Enrichment job completed', { 
    jobId: job.id, 
    bookmarkId: result.bookmarkId 
  });
});

// Handle failed jobs
enrichmentQueue.on('failed', (job, err) => {
  logError(err, { 
    context: 'Enrichment job failed', 
    jobId: job.id,
    bookmarkId: job.data.bookmarkId 
  });
});

export default enrichmentQueue;