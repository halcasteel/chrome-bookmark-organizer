import db from '../backend/src/db/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Setup test database with A2A tables
 */
export async function setupTestDatabase() {
  try {
    // Check if a2a_tasks table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'a2a_tasks'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Creating A2A tables...');
      
      // Read migration SQL
      const migrationPath = join(__dirname, '../backend/src/db/migrations/003_add_a2a_tables_fixed.sql');
      const migrationSQL = readFileSync(migrationPath, 'utf8');
      
      // Execute migration
      await db.query(migrationSQL);
      
      console.log('A2A tables created successfully');
    }
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupTestDatabase()
    .then(() => {
      console.log('Test database setup complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test database setup failed:', error);
      process.exit(1);
    });
}