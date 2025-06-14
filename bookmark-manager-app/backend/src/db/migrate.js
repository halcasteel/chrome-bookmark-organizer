import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();

    // Read schema file
    const schemaPath = path.join(__dirname, '../../../database/schema.sql');
    console.log('Reading schema from:', schemaPath);
    const schema = await fs.readFile(schemaPath, 'utf8');

    console.log('Applying database schema...');
    await client.query(schema);

    // Verify pgvector is installed
    const result = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
    if (result.rows.length > 0) {
      console.log('✅ pgvector extension is installed');
    } else {
      console.log('❌ pgvector extension is NOT installed');
      console.log('Please ensure pgvector is enabled in your PostgreSQL instance');
    }

    // Check tables
    const tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log('\nCreated tables:');
    tables.rows.forEach(row => console.log(`  - ${row.tablename}`));

    console.log('\n✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migration
migrate();