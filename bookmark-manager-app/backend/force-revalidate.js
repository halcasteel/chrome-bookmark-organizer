import db from './src/config/database.js';

async function forceRevalidate() {
  try {
    const result = await db.query(`
      UPDATE bookmarks 
      SET last_checked = NULL
      WHERE url LIKE '%az1.ai%'
      RETURNING id, url
    `);
    
    console.log('Updated bookmark:', result.rows[0]);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

forceRevalidate();