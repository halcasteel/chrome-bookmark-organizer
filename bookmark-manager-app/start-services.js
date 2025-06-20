#!/usr/bin/env node

// ⚠️ DEPRECATED: This script is deprecated in favor of ./scripts/services-manager.sh
// Please use: ./scripts/services-manager.sh start
// This file is kept for backward compatibility only

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import pg from 'pg';
import Redis from 'ioredis';
import { io } from 'socket.io-client';
import { createWriteStream } from 'fs';
// Removed import of unifiedLogger from deprecated Node.js backend

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);
const { Client } = pg;

// ============================================================================
// Enhanced Logger with Real-time Feedback
// ============================================================================

class Logger {
  constructor() {
    this.startTime = Date.now();
    this.logStreams = {};
  }

  colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
  };

  timestamp() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return `[${new Date().toISOString().substring(11, 19)} +${elapsed}s]`;
  }

  async initLogFile(name, filePath) {
    // No longer creating separate log files - everything goes to unified.log
    unifiedLogger.info(`Starting ${name} service`, {
      service: 'startup',
      source: 'init',
      serviceName: name
    });
  }

  log(level, message, details = null) {
    // Map our custom levels to Winston levels
    const levelMap = {
      success: 'info',
      debug: 'debug',
      info: 'info',
      warn: 'warn',
      error: 'error'
    };

    const winstonLevel = levelMap[level] || 'info';
    
    // Create context object for unified logger
    const context = {
      service: 'startup',
      source: 'start-services',
      details: details
    };

    // Use unified logger
    unifiedLogger.log(winstonLevel, message, context);
  }

  section(title) {
    const line = '═'.repeat(70);
    console.log(`\n${this.colors.cyan}${line}${this.colors.reset}`);
    console.log(`${this.colors.cyan}║ ${this.colors.bright}${title.padEnd(66)}${this.colors.cyan} ║${this.colors.reset}`);
    console.log(`${this.colors.cyan}${line}${this.colors.reset}\n`);
  }

  progress(message, current = null, total = null) {
    if (current !== null && total !== null) {
      const percentage = Math.round((current / total) * 100);
      const barLength = 30;
      const filled = Math.round((current / total) * barLength);
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
      process.stdout.write(`\r  ${bar} ${percentage}% - ${message}          `);
      if (current === total) console.log('');
    } else {
      process.stdout.write(`\r  ⏳ ${message}...          `);
    }
  }

  streamLog(name, type, data) {
    const message = data.toString().trim();
    if (!message) return;

    // Log to unified logger based on content and type
    const context = {
      service: name.toLowerCase(),
      source: 'process-output',
      stream: type
    };

    if (type === 'stderr') {
      if (message.toLowerCase().includes('error')) {
        unifiedLogger.error(message, null, context);
      } else if (message.toLowerCase().includes('warn')) {
        unifiedLogger.warn(message, context);
      } else {
        unifiedLogger.debug(message, context);
      }
    } else {
      // stdout - look for important messages
      if (message.includes('Server running') || message.includes('listening')) {
        unifiedLogger.info(`Server is running`, { ...context, message });
      } else if (message.includes('Connected to')) {
        unifiedLogger.info(message, context);
      } else if (message.includes('ready in') || message.includes('Local:')) {
        unifiedLogger.info(`Ready - ${message}`, context);
      } else {
        unifiedLogger.debug(message, context);
      }
    }
  }
}

const log = new Logger();

// ============================================================================
// Configuration with Environment Variables
// ============================================================================

const config = {
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5434'),
    database: process.env.POSTGRES_DB || 'bookmark_manager',
    user: process.env.POSTGRES_USER || 'admin',
    password: process.env.POSTGRES_PASSWORD || 'admin',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6382'),
  },
  backend: {
    host: 'localhost',
    port: parseInt(process.env.BACKEND_PORT || '3001'),
    healthCheck: '/health',
  },
  frontend: {
    host: 'localhost',
    port: parseInt(process.env.FRONTEND_PORT || '5173'),
  },
  logDir: path.join(__dirname, 'logs'),
  features: {
    aiEnabled: process.env.OPENAI_API_KEY ? true : false,
    categorizationEnabled: process.env.OPENAI_CATEGORIZATION_ENABLED === 'true',
    validationEnabled: process.env.ENABLE_URL_VALIDATION !== 'false',
    embeddingsEnabled: process.env.ENABLE_EMBEDDINGS !== 'false',
  }
};

// ============================================================================
// Service Health Checkers
// ============================================================================

async function checkPortAvailable(port, service) {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} | grep LISTEN || true`);
    return stdout.trim().length === 0;
  } catch {
    return true;
  }
}

async function waitForPort(port, service, timeout = 30000) {
  const startTime = Date.now();
  const checkInterval = 1000;
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;
    log.progress(`Waiting for ${service} on port ${port}`, attempts, Math.ceil(timeout / checkInterval));
    
    const available = await checkPortAvailable(port, service);
    if (!available) {
      log.log('success', `${service} is now listening on port ${port}`);
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  log.log('error', `${service} failed to start on port ${port} after ${timeout}ms`);
  return false;
}

// ============================================================================
// Docker Container Management
// ============================================================================

async function manageDockerContainer(containerName, image, portMapping, envVars = [], extraArgs = '') {
  // Check if container exists
  try {
    const { stdout: psOutput } = await execAsync(`docker ps -a --format "{{.Names}}:{{.Status}}" | grep "^${containerName}:" || true`);
    
    if (psOutput) {
      const status = psOutput.split(':')[1];
      if (status.includes('Up')) {
        log.log('info', `Container ${containerName} is already running`);
        return true;
      } else {
        log.log('info', `Starting existing container ${containerName}...`);
        await execAsync(`docker start ${containerName}`);
        return true;
      }
    }
    
    // Container doesn't exist, create it
    log.log('info', `Creating new container ${containerName}...`);
    const envFlags = envVars.map(e => `-e ${e}`).join(' ');
    const command = `docker run -d --name ${containerName} -p ${portMapping} ${envFlags} ${image} ${extraArgs}`;
    
    log.log('debug', `Docker command: ${command}`);
    await execAsync(command);
    log.log('success', `Container ${containerName} created successfully`);
    return true;
    
  } catch (error) {
    log.log('error', `Failed to manage container ${containerName}`, error.message);
    return false;
  }
}

// ============================================================================
// Service Starters
// ============================================================================

async function startPostgres() {
  log.section('PostgreSQL Database');
  
  // Check if already running
  const portInUse = !(await checkPortAvailable(config.postgres.port, 'PostgreSQL'));
  
  if (portInUse) {
    log.log('info', `PostgreSQL already running on port ${config.postgres.port}`);
  } else {
    const success = await manageDockerContainer(
      'bookmark-postgres',
      'pgvector/pgvector:pg16',
      `${config.postgres.port}:5432`,
      [
        `POSTGRES_DB=${config.postgres.database}`,
        `POSTGRES_USER=${config.postgres.user}`,
        `POSTGRES_PASSWORD=${config.postgres.password}`
      ]
    );
    
    if (!success) return false;
    
    // Wait for PostgreSQL to be ready
    log.log('info', 'Waiting for PostgreSQL to accept connections...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Verify connection
  const client = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
  });
  
  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    log.log('success', 'PostgreSQL connection verified', result.rows[0].version);
    
    // Check pgvector
    const vectorCheck = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
    if (vectorCheck.rows.length === 0) {
      log.log('info', 'Installing pgvector extension...');
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      log.log('success', 'pgvector extension installed');
    } else {
      log.log('success', 'pgvector extension already installed');
    }
    
    await client.end();
    return true;
  } catch (error) {
    log.log('error', 'PostgreSQL verification failed', error.message);
    return false;
  }
}

async function startRedis() {
  log.section('Redis Cache');
  
  // Check if already running
  const portInUse = !(await checkPortAvailable(config.redis.port, 'Redis'));
  
  if (portInUse) {
    log.log('info', `Redis already running on port ${config.redis.port}`);
  } else {
    const success = await manageDockerContainer(
      'bookmark-redis',
      'redis:7-alpine',
      `${config.redis.port}:6379`,
      [],
      '--maxmemory 512mb --maxmemory-policy allkeys-lru'
    );
    
    if (!success) return false;
    
    // Wait for Redis to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Verify connection
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    retryStrategy: () => null,
    lazyConnect: true,
  });
  
  try {
    await client.connect();
    await client.ping();
    const info = await client.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    log.log('success', `Redis connection verified (v${version})`);
    client.disconnect();
    return true;
  } catch (error) {
    log.log('error', 'Redis verification failed', error.message);
    return false;
  }
}

async function applyDatabaseSchema() {
  log.section('Database Schema');
  
  const schemaPath = path.join(__dirname, '../../database/schema.sql');
  const schemaExists = await fs.access(schemaPath).then(() => true).catch(() => false);
  
  if (!schemaExists) {
    log.log('warn', 'No schema.sql file found, checking existing schema...');
    
    const client = new Client({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
    });
    
    try {
      await client.connect();
      const result = await client.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      
      const tableCount = parseInt(result.rows[0].count);
      await client.end();
      
      if (tableCount > 0) {
        log.log('success', `Database has ${tableCount} existing tables`);
        return true;
      } else {
        log.log('error', 'No schema file and no existing tables');
        return false;
      }
    } catch (error) {
      log.log('error', 'Failed to check database schema', error.message);
      return false;
    }
  }
  
  // Apply schema
  const client = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
  });
  
  try {
    await client.connect();
    const schema = await fs.readFile(schemaPath, 'utf8');
    
    // Split and execute statements
    const statements = schema.split(';').filter(s => s.trim());
    let applied = 0, skipped = 0;
    
    for (let i = 0; i < statements.length; i++) {
      log.progress(`Applying migrations`, i + 1, statements.length);
      try {
        await client.query(statements[i]);
        applied++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          skipped++;
        } else {
          throw error;
        }
      }
    }
    
    await client.end();
    log.log('success', `Schema migration complete: ${applied} applied, ${skipped} skipped`);
    return true;
  } catch (error) {
    log.log('error', 'Schema migration failed', error.message);
    return false;
  }
}

async function startBackend() {
  log.section('Backend API Server');
  
  if (!(await checkPortAvailable(config.backend.port, 'Backend'))) {
    log.log('warn', `Backend already running on port ${config.backend.port}`);
    return true;
  }
  
  const backendPath = path.join(__dirname, 'backend');
  await log.initLogFile('backend', path.join(config.logDir, 'backend.log'));
  
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: config.backend.port,
    DATABASE_URL: `postgresql://${config.postgres.user}:${config.postgres.password}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`,
    REDIS_URL: `redis://${config.redis.host}:${config.redis.port}`,
    FRONTEND_URL: `http://${config.frontend.host}:${config.frontend.port}`,
    CORS_ORIGIN: `http://${config.frontend.host}:${config.frontend.port},http://localhost:80`,
  };
  
  log.log('info', 'Starting backend server...');
  log.log('debug', 'Backend configuration:', [
    `Port: ${config.backend.port}`,
    `Database: ${env.DATABASE_URL}`,
    `Redis: ${env.REDIS_URL}`,
    `Frontend: ${env.FRONTEND_URL}`,
    `AI Features: ${config.features.aiEnabled ? 'Enabled' : 'Disabled'}`,
  ].join('\n'));
  
  const backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: backendPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  backendProcess.stdout.on('data', data => log.streamLog('backend', 'stdout', data));
  backendProcess.stderr.on('data', data => log.streamLog('backend', 'stderr', data));
  
  backendProcess.on('error', error => {
    log.log('error', 'Failed to start backend process', error.message);
  });
  
  // Wait for backend to be ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    log.progress('Checking backend health', i + 1, 30);
    
    try {
      const response = await axios.get(`http://${config.backend.host}:${config.backend.port}${config.backend.healthCheck}`, {
        timeout: 2000
      });
      
      if (response.status === 200) {
        log.log('success', 'Backend is healthy and ready');
        ready = true;
        break;
      }
    } catch (error) {
      // Continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return ready;
}

async function startFrontend() {
  log.section('Frontend Development Server');
  
  if (!(await checkPortAvailable(config.frontend.port, 'Frontend'))) {
    log.log('warn', `Frontend already running on port ${config.frontend.port}`);
    return true;
  }
  
  const frontendPath = path.join(__dirname, 'frontend');
  await log.initLogFile('frontend', path.join(config.logDir, 'frontend.log'));
  
  const env = {
    ...process.env,
    VITE_API_URL: `http://${config.backend.host}:${config.backend.port}/api`,
    VITE_WS_URL: `http://${config.backend.host}:${config.backend.port}`,
  };
  
  log.log('info', 'Starting frontend development server...');
  
  const frontendProcess = spawn('npm', ['run', 'dev'], {
    cwd: frontendPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  frontendProcess.stdout.on('data', data => log.streamLog('frontend', 'stdout', data));
  frontendProcess.stderr.on('data', data => log.streamLog('frontend', 'stderr', data));
  
  frontendProcess.on('error', error => {
    log.log('error', 'Failed to start frontend process', error.message);
  });
  
  // Give Vite time to start
  await new Promise(resolve => setTimeout(resolve, 5000));
  return true;
}

async function startWorkers() {
  log.section('Background Workers');
  
  const workersPath = path.join(__dirname, 'backend');
  await log.initLogFile('workers', path.join(config.logDir, 'workers.log'));
  
  // Load .env file to get all environment variables including OPENAI_API_KEY
  const dotenv = await import('dotenv');
  const envConfig = dotenv.config({ path: path.join(__dirname, '.env') });
  
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: `postgresql://${config.postgres.user}:${config.postgres.password}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`,
    REDIS_URL: `redis://${config.redis.host}:${config.redis.port}`,
    // Explicitly pass the OpenAI key from the root .env file
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_CATEGORIZATION_ENABLED: process.env.OPENAI_CATEGORIZATION_ENABLED || 'true',
  };
  
  log.log('info', 'Starting background workers for import processing...');
  log.log('debug', `OpenAI API Key configured: ${env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
  
  const workersProcess = spawn('node', ['src/workers/index.js'], {
    cwd: workersPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  workersProcess.stdout.on('data', data => log.streamLog('workers', 'stdout', data));
  workersProcess.stderr.on('data', data => log.streamLog('workers', 'stderr', data));
  
  workersProcess.on('error', error => {
    log.log('error', 'Failed to start workers process', error.message);
  });
  
  // Give workers time to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Check if workers started successfully
  try {
    // Workers don't have an HTTP endpoint, so we just check if the process is running
    if (workersProcess.pid) {
      log.log('success', 'Background workers started successfully');
      log.log('info', 'Workers are processing: validation, enrichment, categorization');
      return true;
    } else {
      log.log('error', 'Workers process failed to start');
      return false;
    }
  } catch (error) {
    log.log('error', 'Failed to verify workers status', error.message);
    return false;
  }
}

async function verifyServices() {
  log.section('Service Verification');
  
  // API Endpoints
  log.log('info', 'Testing API endpoints...');
  const baseUrl = `http://${config.backend.host}:${config.backend.port}`;
  
  const endpoints = [
    { name: 'Health Check', method: 'GET', path: '/health', expectedStatus: 200 },
    { name: 'Auth Status', method: 'GET', path: '/api/auth/status', expectedStatus: 200 },
    { name: 'Bookmarks API', method: 'GET', path: '/api/bookmarks', expectedStatus: 401 },
    { name: 'Validation API', method: 'GET', path: '/api/validation/status', expectedStatus: 401 },
  ];
  
  let passed = 0;
  for (const endpoint of endpoints) {
    try {
      const response = await axios({
        method: endpoint.method,
        url: `${baseUrl}${endpoint.path}`,
        validateStatus: () => true,
      });
      
      const success = response.status === endpoint.expectedStatus;
      if (success) {
        log.log('success', `✓ ${endpoint.name}: ${response.status}`);
        passed++;
      } else {
        log.log('error', `✗ ${endpoint.name}: ${response.status} (expected ${endpoint.expectedStatus})`);
      }
    } catch (error) {
      log.log('error', `✗ ${endpoint.name}: ${error.message}`);
    }
  }
  
  // WebSocket - First get a valid JWT token for authentication
  log.log('info', 'Testing WebSocket connection...');
  let wsTest = false;
  
  try {
    // First, authenticate to get a token
    const authResponse = await fetch(`http://${config.backend.host}:${config.backend.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@az1.ai',
        password: 'changeme123'
      })
    });
    
    if (authResponse.ok) {
      const { token } = await authResponse.json();
      
      // Now test WebSocket with valid token
      wsTest = await new Promise((resolve) => {
        const socket = io(`http://${config.backend.host}:${config.backend.port}`, {
          auth: { token }, // Provide authentication token
          transports: ['websocket', 'polling'], // Allow both transports like frontend
          timeout: 8000,
        });
        
        const timeout = setTimeout(() => {
          socket.disconnect();
          log.log('error', '✗ WebSocket: Connection timeout');
          resolve(false);
        }, 8000);
        
        socket.on('connect', () => {
          clearTimeout(timeout);
          log.log('success', '✓ WebSocket: Connected with authentication');
          socket.disconnect();
          resolve(true);
        });
        
        socket.on('connect_error', (error) => {
          clearTimeout(timeout);
          log.log('error', `✗ WebSocket connect_error: ${error.message} (type: ${error.type})`);
          log.log('error', `✗ WebSocket error details: ${JSON.stringify({
            description: error.description,
            context: error.context,
            name: error.name,
            stack: error.stack?.substring(0, 200)
          })}`);
          socket.disconnect();
          resolve(false);
        });
        
        socket.on('connection_confirmed', (data) => {
          log.log('success', `✓ WebSocket: Connection confirmed for user ${data.userId}`);
        });
      });
    } else {
      log.log('error', '✗ WebSocket: Failed to authenticate for WebSocket test');
      wsTest = false;
    }
  } catch (error) {
    log.log('error', `✗ WebSocket catch error: ${error.message}`);
    log.log('error', `✗ WebSocket catch stack: ${error.stack?.substring(0, 300)}`);
    wsTest = false;
  }
  
  if (wsTest) passed++;
  
  log.log(
    passed === endpoints.length + 1 ? 'success' : 'warn',
    `Verification complete: ${passed}/${endpoints.length + 1} tests passed`
  );
  
  return passed === endpoints.length + 1;
}

async function showStatus() {
  log.section('System Status');
  
  console.log('\n📍 Service URLs:');
  console.log(`   Frontend:    http://localhost:${config.frontend.port}`);
  console.log(`   Backend API: http://localhost:${config.backend.port}/api`);
  console.log(`   Health:      http://localhost:${config.backend.port}/health`);
  
  console.log('\n🔌 Service Ports:');
  console.log(`   PostgreSQL:  ${config.postgres.port}`);
  console.log(`   Redis:       ${config.redis.port}`);
  console.log(`   Backend:     ${config.backend.port}`);
  console.log(`   Frontend:    ${config.frontend.port}`);
  console.log(`   Workers:     Running (validation, enrichment, categorization)`);
  
  console.log('\n🤖 AI Features:');
  console.log(`   OpenAI API:        ${config.features.aiEnabled ? '✓ Configured' : '✗ Not configured'}`);
  console.log(`   Categorization:    ${config.features.categorizationEnabled ? '✓ Enabled' : '✗ Disabled'}`);
  console.log(`   URL Validation:    ${config.features.validationEnabled ? '✓ Enabled' : '✗ Disabled'}`);
  console.log(`   Embeddings:        ${config.features.embeddingsEnabled && config.features.aiEnabled ? '✓ Enabled' : '✗ Disabled'}`);
  
  console.log('\n📁 Log Files:');
  console.log(`   Backend:  ${path.join(config.logDir, 'backend.log')}`);
  console.log(`   Frontend: ${path.join(config.logDir, 'frontend.log')}`);
  
  console.log('\n💡 Tips:');
  console.log('   - Press Ctrl+C to stop all services');
  console.log('   - Check log files for detailed output');
  console.log('   - Set OPENAI_API_KEY in .env to enable AI features');
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.clear();
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                     BOOKMARK MANAGER STARTUP SCRIPT                    ║
║                          Enhanced Version 2.0                          ║
╚═══════════════════════════════════════════════════════════════════════╝
`);

  // Ensure log directory
  await fs.mkdir(config.logDir, { recursive: true });
  await log.initLogFile('main', path.join(config.logDir, 'startup.log'));
  
  log.log('info', 'Starting Bookmark Manager services...');
  log.log('info', `Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Check Docker
  log.section('Docker Check');
  try {
    const { stdout } = await execAsync('docker --version');
    log.log('success', `Docker installed: ${stdout.trim()}`);
    
    await execAsync('docker ps');
    log.log('success', 'Docker daemon is running');
  } catch (error) {
    log.log('error', 'Docker is not available', error.message);
    process.exit(1);
  }
  
  // Service startup sequence
  const steps = [
    { name: 'PostgreSQL', fn: startPostgres, critical: true },
    { name: 'Redis', fn: startRedis, critical: true },
    { name: 'Database Schema', fn: applyDatabaseSchema, critical: true },
    { name: 'Backend Server', fn: startBackend, critical: true },
    { name: 'Background Workers', fn: startWorkers, critical: true },
    { name: 'Frontend Server', fn: startFrontend, critical: false },
    { name: 'Service Verification', fn: verifyServices, critical: false },
  ];
  
  const results = [];
  
  for (const step of steps) {
    const startTime = Date.now();
    
    try {
      const success = await step.fn();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      
      results.push({ 
        name: step.name, 
        success, 
        duration: `${duration}s`,
        error: null,
        critical: step.critical 
      });
      
      if (!success && step.critical) {
        log.log('error', `Critical failure in ${step.name}, aborting startup`);
        break;
      }
      
      // Stabilization delay
      if (success && step.critical) {
        log.log('info', 'Waiting for service stabilization...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      log.log('error', `Unexpected error in ${step.name}`, error.message);
      results.push({ 
        name: step.name, 
        success: false, 
        duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        error: error.message,
        critical: step.critical 
      });
      
      if (step.critical) break;
    }
  }
  
  // Summary
  log.section('Startup Summary');
  
  console.table(results.map(r => ({
    Service: r.name,
    Status: r.success ? '✓ Success' : '✗ Failed',
    Duration: r.duration,
    Error: r.error || '-'
  })));
  
  const successCount = results.filter(r => r.success).length;
  const criticalFailures = results.filter(r => !r.success && r.critical);
  const totalDuration = ((Date.now() - log.startTime) / 1000).toFixed(1);
  
  if (successCount === results.length) {
    log.log('success', `All services started successfully in ${totalDuration}s! 🎉`);
    await showStatus();
  } else if (criticalFailures.length === 0) {
    log.log('warn', `Startup completed with warnings: ${successCount}/${results.length} services started`);
    log.log('info', 'Non-critical services failed but core services are running');
    await showStatus();
    // Don't exit - let services continue running
  } else {
    log.log('error', `Critical failure: ${criticalFailures.length} critical services failed`);
    log.log('info', 'Check the log files for detailed error information');
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  log.log('error', 'Fatal error', error.stack);
  process.exit(1);
});