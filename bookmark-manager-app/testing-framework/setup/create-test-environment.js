#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import Redis from 'redis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');

console.log('🚀 Setting up REAL Test Environment\n');

// Test environment configuration
const TEST_CONFIG = {
  database: {
    host: 'localhost',
    port: 5434,
    user: 'postgres',
    password: 'postgres',
    database: 'bookmarks_test'
  },
  redis: {
    host: 'localhost',
    port: 6382,
    db: 1 // Use DB 1 for tests
  },
  api: {
    openai: process.env.OPENAI_API_KEY || 'test-key',
    backendPort: 3001,
    frontendPort: 5173
  }
};

// Create test environment file
const testEnvContent = `# Test Environment Configuration
# This uses REAL services for testing

# Database - Real PostgreSQL
DATABASE_URL=postgresql://${TEST_CONFIG.database.user}:${TEST_CONFIG.database.password}@${TEST_CONFIG.database.host}:${TEST_CONFIG.database.port}/${TEST_CONFIG.database.database}
DB_HOST=${TEST_CONFIG.database.host}
DB_PORT=${TEST_CONFIG.database.port}
DB_USER=${TEST_CONFIG.database.user}
DB_PASSWORD=${TEST_CONFIG.database.password}
DB_NAME=${TEST_CONFIG.database.database}

# Redis - Real Redis Instance
REDIS_URL=redis://${TEST_CONFIG.redis.host}:${TEST_CONFIG.redis.port}/${TEST_CONFIG.redis.db}
REDIS_HOST=${TEST_CONFIG.redis.host}
REDIS_PORT=${TEST_CONFIG.redis.port}
REDIS_DB=${TEST_CONFIG.redis.db}

# API Configuration
BACKEND_PORT=${TEST_CONFIG.api.backendPort}
FRONTEND_PORT=${TEST_CONFIG.api.frontendPort}
API_BASE_URL=http://localhost:${TEST_CONFIG.api.backendPort}

# OpenAI - Real API with test key
OPENAI_API_KEY=${TEST_CONFIG.api.openai}

# Auth Configuration
JWT_SECRET=test-jwt-secret-change-in-production
ENABLE_2FA=true

# Test Flags
NODE_ENV=test
LOG_LEVEL=debug
TEST_MODE=true

# File Storage
UPLOAD_DIR=./testing-framework/temp/uploads
IMPORT_DIR=./testing-framework/temp/imports
`;

// Write test environment file
fs.writeFileSync(path.join(rootDir, '.env.test'), testEnvContent);
console.log('✅ Created .env.test file');

// Create test database setup script
const dbSetupScript = `-- Test Database Setup
-- This creates a REAL database for testing

-- Drop existing test database if exists
DROP DATABASE IF EXISTS ${TEST_CONFIG.database.database};

-- Create fresh test database
CREATE DATABASE ${TEST_CONFIG.database.database};

-- Connect to test database
\\c ${TEST_CONFIG.database.database};

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
`;

fs.writeFileSync(
  path.join(rootDir, 'testing-framework/setup/create-test-db.sql'),
  dbSetupScript
);

// Database setup function
async function setupTestDatabase() {
  console.log('\n📊 Setting up test database...');
  
  const client = new pg.Client({
    host: TEST_CONFIG.database.host,
    port: TEST_CONFIG.database.port,
    user: TEST_CONFIG.database.user,
    password: TEST_CONFIG.database.password,
    database: 'postgres' // Connect to default DB first
  });

  try {
    await client.connect();
    
    // Drop existing test database
    try {
      await client.query(`DROP DATABASE IF EXISTS ${TEST_CONFIG.database.database}`);
      console.log('✅ Dropped existing test database');
    } catch (error) {
      // Ignore error if database doesn't exist
    }

    // Create test database
    await client.query(`CREATE DATABASE ${TEST_CONFIG.database.database}`);
    console.log('✅ Created test database');

    await client.end();

    // Connect to test database and run migrations
    const testClient = new pg.Client({
      ...TEST_CONFIG.database,
      database: TEST_CONFIG.database.database
    });

    await testClient.connect();

    // Enable extensions
    await testClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await testClient.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await testClient.query('CREATE EXTENSION IF NOT EXISTS "vector"');
    console.log('✅ Enabled PostgreSQL extensions');

    // Run migrations
    console.log('🔄 Running migrations...');
    try {
      execSync('npm run migrate:test', {
        cwd: path.join(rootDir, 'backend'),
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'test' }
      });
      console.log('✅ Migrations completed');
    } catch (error) {
      console.warn('⚠️  Migration command not found, will use schema.sql');
      
      // Fallback: Use schema.sql
      const schemaPath = path.join(rootDir, 'database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await testClient.query(schema);
        console.log('✅ Applied schema.sql');
      }
    }

    await testClient.end();
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  }
}

// Redis setup function
async function setupTestRedis() {
  console.log('\n📦 Setting up test Redis...');
  
  const client = Redis.createClient({
    host: TEST_CONFIG.redis.host,
    port: TEST_CONFIG.redis.port
  });

  return new Promise((resolve, reject) => {
    client.on('connect', () => {
      console.log('✅ Connected to Redis');
      
      // Select test database
      client.select(TEST_CONFIG.redis.db, (err) => {
        if (err) {
          console.error('❌ Failed to select Redis DB:', err);
          reject(err);
        } else {
          console.log(`✅ Selected Redis DB ${TEST_CONFIG.redis.db}`);
          
          // Clear any existing data
          client.flushdb((err) => {
            if (err) {
              console.error('❌ Failed to flush Redis:', err);
              reject(err);
            } else {
              console.log('✅ Cleared Redis test DB');
              client.quit();
              resolve();
            }
          });
        }
      });
    });

    client.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
      reject(err);
    });
  });
}

// Service verification
async function verifyServices() {
  console.log('\n🔍 Verifying services...');
  
  // Check PostgreSQL
  try {
    execSync(`pg_isready -h ${TEST_CONFIG.database.host} -p ${TEST_CONFIG.database.port}`, {
      stdio: 'pipe'
    });
    console.log('✅ PostgreSQL is running');
  } catch (error) {
    console.error('❌ PostgreSQL is not running on port', TEST_CONFIG.database.port);
    console.log('   Run: docker-compose up -d postgres');
    process.exit(1);
  }

  // Check Redis
  try {
    execSync(`redis-cli -h ${TEST_CONFIG.redis.host} -p ${TEST_CONFIG.redis.port} ping`, {
      stdio: 'pipe'
    });
    console.log('✅ Redis is running');
  } catch (error) {
    console.error('❌ Redis is not running on port', TEST_CONFIG.redis.port);
    console.log('   Run: docker-compose up -d redis');
    process.exit(1);
  }
}

// Main setup function
async function setupTestEnvironment() {
  try {
    console.log('🔧 Setting up REAL test environment...\n');
    
    // Verify services are running
    await verifyServices();
    
    // Setup database
    await setupTestDatabase();
    
    // Setup Redis
    await setupTestRedis();
    
    // Create necessary directories
    const directories = [
      'testing-framework/temp/uploads',
      'testing-framework/temp/imports',
      'testing-framework/data/synthetic',
      'testing-framework/logs'
    ];

    directories.forEach(dir => {
      const fullPath = path.join(rootDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
    console.log('✅ Created test directories');

    console.log('\n✅ Test environment setup complete!');
    console.log('\n📋 Test Configuration:');
    console.log(`   Database: postgresql://localhost:${TEST_CONFIG.database.port}/${TEST_CONFIG.database.database}`);
    console.log(`   Redis: redis://localhost:${TEST_CONFIG.redis.port}/${TEST_CONFIG.redis.db}`);
    console.log(`   Backend: http://localhost:${TEST_CONFIG.api.backendPort}`);
    console.log(`   Frontend: http://localhost:${TEST_CONFIG.api.frontendPort}`);
    console.log('\n🚀 Ready to run tests with REAL services!');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupTestEnvironment();