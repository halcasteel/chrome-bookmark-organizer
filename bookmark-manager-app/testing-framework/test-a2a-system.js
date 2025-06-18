#!/usr/bin/env node

import { chromium } from 'playwright';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import unifiedLogger from '../backend/src/services/unifiedLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test A2A System End-to-End
 * 
 * This test verifies:
 * 1. All A2A agents are registered
 * 2. A2A Task Manager is working
 * 3. Import workflow functions properly
 * 4. All agents process tasks in sequence
 * 5. Frontend displays progress correctly
 */
class A2ASystemTest {
  constructor() {
    this.db = null;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.testUser = null;
    this.testResults = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  async initialize() {
    console.log('\n🧪 A2A System Test Starting...\n');
    
    // Connect to database
    this.db = new pg.Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5434,
      database: process.env.DB_NAME || 'bookmark_manager',
      user: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD || 'admin'
    });
    
    await this.db.connect();
    console.log('✓ Connected to database');

    // Launch browser
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      slowMo: parseInt(process.env.SLOW_MO || '0')
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true
    });
    
    this.page = await this.context.newPage();
    console.log('✓ Browser launched');

    // Set up console logging
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`  Browser console error: ${msg.text()}`);
      }
    });
  }

  async runAllTests() {
    try {
      await this.initialize();
      
      // Test 1: Check agent registration
      await this.testAgentRegistration();
      
      // Test 2: Create test user
      await this.createTestUser();
      
      // Test 3: Test A2A import via API
      await this.testA2AImportAPI();
      
      // Test 4: Test A2A import via UI
      await this.testA2AImportUI();
      
      // Test 5: Verify all agents processed
      await this.verifyAgentProcessing();
      
      // Test 6: Check bookmarks were created
      await this.verifyBookmarksCreated();
      
      // Test 7: Verify embedding agent worked
      await this.verifyEmbeddings();
      
      // Print results
      this.printResults();
      
    } catch (error) {
      console.error('\n❌ Test suite failed:', error);
      this.testResults.failed.push({
        test: 'Test Suite',
        error: error.message
      });
    } finally {
      await this.cleanup();
    }
  }

  async testAgentRegistration() {
    console.log('\n📋 Test 1: Agent Registration');
    
    try {
      // Check if all agents are registered in the database
      const result = await this.db.query(
        `SELECT agent_type, status, version 
         FROM a2a_agent_capabilities 
         WHERE status = 'active'
         ORDER BY agent_type`
      );
      
      const expectedAgents = ['categorization', 'embedding', 'enrichment', 'import', 'validation'];
      const registeredAgents = result.rows.map(r => r.agent_type);
      
      console.log('  Found agents:', registeredAgents);
      
      // Check all expected agents are registered
      const missingAgents = expectedAgents.filter(a => !registeredAgents.includes(a));
      
      if (missingAgents.length === 0) {
        this.testResults.passed.push('All A2A agents are registered');
        console.log('  ✅ All expected agents are registered');
      } else {
        this.testResults.failed.push({
          test: 'Agent Registration',
          error: `Missing agents: ${missingAgents.join(', ')}`
        });
        console.log('  ❌ Missing agents:', missingAgents);
      }
      
    } catch (error) {
      this.testResults.failed.push({
        test: 'Agent Registration',
        error: error.message
      });
      console.error('  ❌ Failed:', error.message);
    }
  }

  async createTestUser() {
    console.log('\n📋 Test 2: Create Test User');
    
    try {
      const email = `test-a2a-${Date.now()}@az1.ai`;
      const result = await this.db.query(
        `INSERT INTO users (id, email, password_hash, name, role, two_factor_enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email`,
        [
          uuidv4(),
          email,
          '$2b$10$K8ZpdrjOg6RmF8PRbBFPn.XSAvukONBeMmF/GRPtwKrnIgI3aZt8y', // 'changeme123'
          'A2A Test User',
          'user',
          false
        ]
      );
      
      this.testUser = result.rows[0];
      this.testResults.passed.push('Test user created');
      console.log(`  ✅ Created test user: ${this.testUser.email}`);
      
    } catch (error) {
      this.testResults.failed.push({
        test: 'Create Test User',
        error: error.message
      });
      console.error('  ❌ Failed:', error.message);
    }
  }

  async testA2AImportAPI() {
    console.log('\n📋 Test 3: A2A Import via API');
    
    if (!this.testUser) {
      console.log('  ⚠️  Skipping - no test user');
      return;
    }
    
    try {
      // Login first
      await this.page.goto('http://localhost:5173/login');
      await this.page.fill('input[name="email"]', this.testUser.email);
      await this.page.fill('input[name="password"]', 'changeme123');
      await this.page.click('button[type="submit"]');
      await this.page.waitForURL('**/dashboard', { timeout: 5000 });
      
      // Get auth token from localStorage
      const token = await this.page.evaluate(() => localStorage.getItem('token'));
      
      // Create a small bookmark file
      const bookmarkHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Test Bookmarks</H3>
    <DL><p>
        <DT><A HREF="https://www.az1.ai" ADD_DATE="1234567890">AZ1 AI</A>
        <DT><A HREF="https://github.com/anthropics/claude-code" ADD_DATE="1234567891">Claude Code</A>
        <DT><A HREF="https://docs.anthropic.com" ADD_DATE="1234567892">Anthropic Docs</A>
    </DL><p>
</DL><p>`;
      
      // Make API request to create A2A import task
      const response = await fetch('http://localhost:3001/api/import/a2a/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: (() => {
          const formData = new FormData();
          const blob = new Blob([bookmarkHtml], { type: 'text/html' });
          formData.append('file', blob, 'test-bookmarks.html');
          return formData;
        })()
      });
      
      if (response.ok) {
        const data = await response.json();
        this.testTaskId = data.taskId;
        this.testResults.passed.push('A2A import task created via API');
        console.log(`  ✅ Created A2A task: ${data.taskId}`);
        
        // Wait for task to complete
        await this.waitForTaskCompletion(data.taskId);
        
      } else {
        const error = await response.text();
        throw new Error(`API request failed: ${error}`);
      }
      
    } catch (error) {
      this.testResults.failed.push({
        test: 'A2A Import API',
        error: error.message
      });
      console.error('  ❌ Failed:', error.message);
    }
  }

  async testA2AImportUI() {
    console.log('\n📋 Test 4: A2A Import via UI');
    
    if (!this.testUser) {
      console.log('  ⚠️  Skipping - no test user');
      return;
    }
    
    try {
      // Navigate to A2A import page
      await this.page.goto('http://localhost:5173/import-a2a');
      await this.page.waitForLoadState('networkidle');
      
      // Check if page loaded
      const heading = await this.page.textContent('h2');
      if (heading && heading.includes('Import Bookmarks (A2A)')) {
        this.testResults.passed.push('A2A import page loaded');
        console.log('  ✅ A2A import page loaded');
      } else {
        throw new Error('A2A import page did not load properly');
      }
      
      // Check for upload dropzone
      const dropzone = await this.page.$('text=Drag and drop your bookmarks file');
      if (dropzone) {
        this.testResults.passed.push('Upload dropzone found');
        console.log('  ✅ Upload dropzone found');
      } else {
        this.testResults.warnings.push('Upload dropzone not found');
        console.log('  ⚠️  Upload dropzone not found');
      }
      
    } catch (error) {
      this.testResults.failed.push({
        test: 'A2A Import UI',
        error: error.message
      });
      console.error('  ❌ Failed:', error.message);
    }
  }

  async waitForTaskCompletion(taskId) {
    console.log(`  ⏳ Waiting for task ${taskId} to complete...`);
    
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max
    
    while (attempts < maxAttempts) {
      const result = await this.db.query(
        'SELECT status, current_agent, current_step, total_steps FROM a2a_tasks WHERE id = $1',
        [taskId]
      );
      
      if (result.rows.length > 0) {
        const task = result.rows[0];
        
        if (task.status === 'completed') {
          console.log('  ✅ Task completed successfully');
          return true;
        } else if (task.status === 'failed') {
          throw new Error('Task failed');
        } else {
          console.log(`    Status: ${task.status}, Agent: ${task.current_agent}, Step: ${task.current_step}/${task.total_steps}`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    throw new Error('Task did not complete within timeout');
  }

  async verifyAgentProcessing() {
    console.log('\n📋 Test 5: Verify Agent Processing');
    
    if (!this.testTaskId) {
      console.log('  ⚠️  Skipping - no test task');
      return;
    }
    
    try {
      // Check artifacts created by each agent
      const result = await this.db.query(
        `SELECT agent_type, type, created 
         FROM a2a_artifacts 
         WHERE task_id = $1 
         ORDER BY created`,
        [this.testTaskId]
      );
      
      const agentTypes = [...new Set(result.rows.map(r => r.agent_type))];
      console.log('  Agents that created artifacts:', agentTypes);
      
      const expectedAgents = ['import', 'validation', 'enrichment', 'categorization', 'embedding'];
      const missingAgents = expectedAgents.filter(a => !agentTypes.includes(a));
      
      if (missingAgents.length === 0) {
        this.testResults.passed.push('All agents processed the task');
        console.log('  ✅ All agents processed the task');
      } else {
        this.testResults.warnings.push(`Some agents did not process: ${missingAgents.join(', ')}`);
        console.log('  ⚠️  Missing agents:', missingAgents);
      }
      
    } catch (error) {
      this.testResults.failed.push({
        test: 'Verify Agent Processing',
        error: error.message
      });
      console.error('  ❌ Failed:', error.message);
    }
  }

  async verifyBookmarksCreated() {
    console.log('\n📋 Test 6: Verify Bookmarks Created');
    
    if (!this.testUser) {
      console.log('  ⚠️  Skipping - no test user');
      return;
    }
    
    try {
      const result = await this.db.query(
        `SELECT id, url, title, enriched, category 
         FROM bookmarks 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [this.testUser.id]
      );
      
      console.log(`  Found ${result.rows.length} bookmarks`);
      
      if (result.rows.length > 0) {
        this.testResults.passed.push(`Created ${result.rows.length} bookmarks`);
        
        // Check enrichment
        const enrichedCount = result.rows.filter(b => b.enriched).length;
        const categorizedCount = result.rows.filter(b => b.category).length;
        
        console.log(`  ✅ Enriched: ${enrichedCount}/${result.rows.length}`);
        console.log(`  ✅ Categorized: ${categorizedCount}/${result.rows.length}`);
        
        if (enrichedCount === result.rows.length) {
          this.testResults.passed.push('All bookmarks enriched');
        } else {
          this.testResults.warnings.push(`Only ${enrichedCount}/${result.rows.length} bookmarks enriched`);
        }
        
      } else {
        this.testResults.failed.push({
          test: 'Bookmarks Created',
          error: 'No bookmarks were created'
        });
      }
      
    } catch (error) {
      this.testResults.failed.push({
        test: 'Verify Bookmarks',
        error: error.message
      });
      console.error('  ❌ Failed:', error.message);
    }
  }

  async verifyEmbeddings() {
    console.log('\n📋 Test 7: Verify Embeddings');
    
    if (!this.testUser) {
      console.log('  ⚠️  Skipping - no test user');
      return;
    }
    
    try {
      const result = await this.db.query(
        `SELECT be.id, be.bookmark_id, be.model, 
                array_length(be.embedding, 1) as dimensions
         FROM bookmark_embeddings be
         JOIN bookmarks b ON be.bookmark_id = b.id
         WHERE b.user_id = $1`,
        [this.testUser.id]
      );
      
      console.log(`  Found ${result.rows.length} embeddings`);
      
      if (result.rows.length > 0) {
        this.testResults.passed.push(`Created ${result.rows.length} embeddings`);
        
        // Check dimensions
        const dimensions = result.rows[0]?.dimensions;
        console.log(`  ✅ Embedding dimensions: ${dimensions}`);
        
        if (dimensions === 1536) {
          this.testResults.passed.push('Embeddings have correct dimensions (1536)');
        } else {
          this.testResults.warnings.push(`Unexpected embedding dimensions: ${dimensions}`);
        }
        
      } else {
        this.testResults.warnings.push('No embeddings were created');
        console.log('  ⚠️  No embeddings found');
      }
      
    } catch (error) {
      this.testResults.failed.push({
        test: 'Verify Embeddings',
        error: error.message
      });
      console.error('  ❌ Failed:', error.message);
    }
  }

  printResults() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('═'.repeat(60));
    
    console.log(`\n✅ Passed: ${this.testResults.passed.length}`);
    this.testResults.passed.forEach(test => {
      console.log(`   • ${test}`);
    });
    
    if (this.testResults.warnings.length > 0) {
      console.log(`\n⚠️  Warnings: ${this.testResults.warnings.length}`);
      this.testResults.warnings.forEach(warning => {
        console.log(`   • ${warning}`);
      });
    }
    
    if (this.testResults.failed.length > 0) {
      console.log(`\n❌ Failed: ${this.testResults.failed.length}`);
      this.testResults.failed.forEach(failure => {
        console.log(`   • ${failure.test}: ${failure.error}`);
      });
    }
    
    const totalTests = this.testResults.passed.length + this.testResults.failed.length;
    const passRate = totalTests > 0 ? 
      Math.round((this.testResults.passed.length / totalTests) * 100) : 0;
    
    console.log('\n' + '═'.repeat(60));
    console.log(`OVERALL: ${passRate}% Pass Rate`);
    console.log('═'.repeat(60) + '\n');
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    // Clean up test data
    if (this.testUser) {
      await this.db.query('DELETE FROM bookmarks WHERE user_id = $1', [this.testUser.id]);
      await this.db.query('DELETE FROM users WHERE id = $1', [this.testUser.id]);
      console.log('  ✓ Test data cleaned up');
    }
    
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    if (this.db) await this.db.end();
    
    console.log('  ✓ Resources cleaned up');
  }
}

// Run the test
const test = new A2ASystemTest();
test.runAllTests();