/**
 * Test Environment Loading Script
 * ================================
 * Purpose: Debug environment variable loading issues causing database connection failures
 * Created: 2025-06-15
 * Usage: node tests/test-env-loading.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const envPath = join(__dirname, '../..', '.env');
console.log('Loading .env from:', envPath);
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env:', result.error);
} else {
  console.log('✓ .env loaded successfully');
}

console.log('\nEnvironment variables:');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('POSTGRES_USER:', process.env.POSTGRES_USER);
console.log('POSTGRES_PASSWORD:', process.env.POSTGRES_PASSWORD);
console.log('POSTGRES_HOST:', process.env.POSTGRES_HOST);
console.log('POSTGRES_PORT:', process.env.POSTGRES_PORT);
console.log('POSTGRES_DB:', process.env.POSTGRES_DB);

// Test direct connection
console.log('\nTesting direct PostgreSQL connection...');
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('❌ Connection failed:', err.message);
  } else {
    console.log('✅ Connected successfully. Current time:', result.rows[0].now);
  }
  pool.end();
});