/**
 * Test Database Query Script
 * ===========================
 * Purpose: Test database connectivity and query execution to debug login crash
 * Created: 2025-06-15
 * Usage: node tests/test-db-query.js
 * 
 * This script tests:
 * 1. Basic database connectivity
 * 2. User query that's failing during login
 * 3. Query logging functionality
 */

import { query } from '../src/db/index.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../..', '.env') });

async function testQuery() {
  try {
    console.log('=== Database Query Test ===');
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    
    // Test 1: Simple connectivity test
    console.log('\n1. Testing basic connectivity...');
    const simpleResult = await query('SELECT NOW() as current_time');
    console.log('✓ Connected. Current time:', simpleResult.rows[0].current_time);
    
    // Test 2: User query that's failing during login
    console.log('\n2. Testing user query...');
    const userResult = await query(
      `SELECT id, email, name, role, password_hash, two_factor_enabled, 
              two_factor_secret, two_factor_verified 
       FROM users WHERE email = $1`,
      ['admin@az1.ai']
    );
    console.log('✓ User query succeeded. Found users:', userResult.rows.length);
    if (userResult.rows.length > 0) {
      console.log('User details:', {
        id: userResult.rows[0].id,
        email: userResult.rows[0].email,
        name: userResult.rows[0].name,
        role: userResult.rows[0].role,
        has_password: !!userResult.rows[0].password_hash,
        two_factor_enabled: userResult.rows[0].two_factor_enabled
      });
    }
    
    console.log('\n✅ All tests passed');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Query error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testQuery();