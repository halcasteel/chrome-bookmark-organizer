import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import unifiedLogger from '../services/unifiedLogger.js';

dotenv.config();

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    unifiedLogger.info('Connecting to database...', {
      service: 'script',
      source: 'migrate'
    });
    await client.connect();

    // Read schema file
    const schemaPath = path.join(__dirname, '../../../database/schema.sql');
    unifiedLogger.info('Reading schema from:', {
      service: 'script',
      source: 'migrate',
      schemaPath
    });
    const schema = await fs.readFile(schemaPath, 'utf8');

    unifiedLogger.info('Applying database schema...', {
      service: 'script',
      source: 'migrate'
    });
    await client.query(schema);

    // Verify pgvector is installed
    const result = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
    if (result.rows.length > 0) {
      unifiedLogger.info('✅ pgvector extension is installed', {
        service: 'script',
        source: 'migrate'
      });
    } else {
      unifiedLogger.warn('❌ pgvector extension is NOT installed', {
        service: 'script',
        source: 'migrate'
      });
      unifiedLogger.warn('Please ensure pgvector is enabled in your PostgreSQL instance', {
        service: 'script',
        source: 'migrate'
      });
    }

    // Check tables
    const tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    unifiedLogger.info('Created tables:', {
      service: 'script',
      source: 'migrate',
      tables: tables.rows.map(row => row.tablename)
    });

    unifiedLogger.info('✅ Database migration completed successfully!', {
      service: 'script',
      source: 'migrate'
    });
  } catch (error) {
    unifiedLogger.error('❌ Migration failed:', {
      service: 'script',
      source: 'migrate',
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migration
migrate();