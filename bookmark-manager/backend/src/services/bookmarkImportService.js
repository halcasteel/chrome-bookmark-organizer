import { load } from 'cheerio';
import { query, transaction } from '../config/database.js';
import { EmbeddingService } from './embeddingService.js';
import { v4 as uuidv4 } from 'uuid';

export class BookmarkImportService {
  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  // Parse Chrome bookmarks HTML file
  parseBookmarksHtml(htmlContent) {
    const $ = load(htmlContent);
    const bookmarks = [];
    const folders = [];

    // Function to recursively parse bookmark structure
    const parseNode = (element, parentPath = []) => {
      const $element = $(element);
      
      if (element.name === 'dt') {
        const $a = $element.find('> a').first();
        const $h3 = $element.find('> h3').first();
        
        if ($a.length > 0) {
          // It's a bookmark
          const bookmark = {
            url: $a.attr('href'),
            title: $a.text().trim(),
            dateAdded: $a.attr('add_date'),
            icon: $a.attr('icon'),
            chromeId: $a.attr('id'),
            tags: [...parentPath], // Use folder path as tags
          };
          
          // Check for description in next sibling DD element
          const $dd = $element.next('dd');
          if ($dd.length > 0) {
            bookmark.description = $dd.text().trim();
          }
          
          bookmarks.push(bookmark);
        } else if ($h3.length > 0) {
          // It's a folder
          const folderName = $h3.text().trim();
          const newPath = [...parentPath, folderName];
          folders.push(folderName);
          
          // Parse nested list
          const $dl = $element.find('> dl').first();
          if ($dl.length > 0) {
            $dl.children('dt').each((_, child) => {
              parseNode(child, newPath);
            });
          }
        }
      }
    };

    // Start parsing from root
    $('dl').first().children('dt').each((_, element) => {
      parseNode(element);
    });

    return { bookmarks, folders: [...new Set(folders)] };
  }

  // Import bookmarks for a user
  async importBookmarks(userId, htmlContent, filename = null) {
    const importId = uuidv4();
    
    try {
      // Create import history record
      await query(
        `INSERT INTO import_history (id, user_id, filename, status) 
         VALUES ($1, $2, $3, 'processing')`,
        [importId, userId, filename]
      );

      // Parse bookmarks
      const { bookmarks, folders } = this.parseBookmarksHtml(htmlContent);
      
      let imported = 0;
      let updated = 0;
      let failed = 0;

      // Create tags from folders
      const tagMap = new Map();
      for (const folder of folders) {
        const result = await query(
          `INSERT INTO tags (user_id, name) 
           VALUES ($1, $2) 
           ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id, name`,
          [userId, folder]
        );
        tagMap.set(folder, result.rows[0].id);
      }

      // Import bookmarks in batches
      const batchSize = 50;
      for (let i = 0; i < bookmarks.length; i += batchSize) {
        const batch = bookmarks.slice(i, i + batchSize);
        
        await transaction(async (client) => {
          for (const bookmark of batch) {
            try {
              // Check if bookmark exists
              const existingResult = await client.query(
                'SELECT id FROM bookmarks WHERE user_id = $1 AND url = $2',
                [userId, bookmark.url]
              );

              let bookmarkId;
              
              if (existingResult.rows.length > 0) {
                // Update existing bookmark
                bookmarkId = existingResult.rows[0].id;
                await client.query(
                  `UPDATE bookmarks 
                   SET title = $1, description = $2, chrome_date_added = $3, 
                       chrome_id = $4, imported_at = CURRENT_TIMESTAMP
                   WHERE id = $5`,
                  [
                    bookmark.title,
                    bookmark.description,
                    bookmark.dateAdded,
                    bookmark.chromeId,
                    bookmarkId
                  ]
                );
                updated++;
              } else {
                // Insert new bookmark
                const insertResult = await client.query(
                  `INSERT INTO bookmarks 
                   (user_id, url, title, description, favicon_url, chrome_date_added, chrome_id, imported_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                   RETURNING id`,
                  [
                    userId,
                    bookmark.url,
                    bookmark.title,
                    bookmark.description,
                    bookmark.icon,
                    bookmark.dateAdded,
                    bookmark.chromeId
                  ]
                );
                bookmarkId = insertResult.rows[0].id;
                imported++;
              }

              // Add tags
              for (const tagName of bookmark.tags) {
                const tagId = tagMap.get(tagName);
                if (tagId) {
                  await client.query(
                    `INSERT INTO bookmark_tags (bookmark_id, tag_id) 
                     VALUES ($1, $2) 
                     ON CONFLICT DO NOTHING`,
                    [bookmarkId, tagId]
                  );
                }
              }
            } catch (error) {
              console.error('Error importing bookmark:', error);
              failed++;
            }
          }
        });
      }

      // Update import history
      await query(
        `UPDATE import_history 
         SET status = 'completed', bookmarks_imported = $1, bookmarks_updated = $2, 
             bookmarks_failed = $3, completed_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [imported, updated, failed, importId]
      );

      // Schedule embedding generation
      setTimeout(() => {
        this.embeddingService.batchUpdateEmbeddings(userId).catch(console.error);
      }, 1000);

      return {
        importId,
        imported,
        updated,
        failed,
        total: bookmarks.length
      };
    } catch (error) {
      // Update import history with error
      await query(
        `UPDATE import_history 
         SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [error.message, importId]
      );
      
      throw error;
    }
  }

  // Get import history for a user
  async getImportHistory(userId, limit = 10) {
    const result = await query(
      `SELECT * FROM import_history 
       WHERE user_id = $1 
       ORDER BY started_at DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  }
}