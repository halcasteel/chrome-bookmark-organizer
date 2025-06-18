import db from './src/db/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  try {
    console.log('Running migration 006_a2a_task_progress.sql...');
    
    const migrationPath = path.join(__dirname, 'src/db/migrations/006_a2a_task_progress.sql');
    const sql = await fs.readFile(migrationPath, 'utf-8');
    
    await db.query(sql);
    
    console.log('Migration completed successfully!');
    
    // Verify the table was created
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'a2a_task_progress'
    `);
    
    if (result.rows.length > 0) {
      console.log('✓ a2a_task_progress table created');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();