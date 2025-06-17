#!/usr/bin/env node

import { chromium } from 'playwright';

async function testLogin() {
  console.log('🧪 Testing Bookmark Manager Login...\n');
  
  let browser;
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      slowMo: 100
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });
    
    const page = await context.newPage();
    
    // Log console messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`❌ Browser console error: ${msg.text()}`);
      }
    });
    
    // Navigate to login page
    console.log('1️⃣  Navigating to login page...');
    await page.goto('http://localhost:5173/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/login-page.png' });
    console.log('   📸 Screenshot saved to /tmp/login-page.png');
    
    // Check if we're on the login page
    const url = page.url();
    console.log(`   📍 Current URL: ${url}`);
    
    // Check for login form using placeholder text
    const emailInput = await page.locator('input[placeholder*="@az1.ai"]').count();
    const passwordInput = await page.locator('input[placeholder="Enter your password"]').count();
    
    if (emailInput === 0 || passwordInput === 0) {
      throw new Error('Login form not found on page');
    }
    
    console.log('   ✅ Login form found\n');
    
    // Fill in credentials
    console.log('2️⃣  Entering credentials...');
    await page.fill('input[placeholder*="@az1.ai"]', 'admin@az1.ai');
    await page.fill('input[placeholder="Enter your password"]', 'changeme123');
    console.log('   ✅ Credentials entered\n');
    
    // Click login button
    console.log('3️⃣  Clicking login button...');
    await page.click('button:has-text("Sign In")');
    
    // Wait for response
    console.log('4️⃣  Waiting for login response...');
    
    // Wait for either navigation or error message
    await Promise.race([
      page.waitForURL('**/dashboard', { timeout: 10000 }),
      page.waitForURL('**/verify-2fa', { timeout: 10000 }),
      page.waitForSelector('[role="alert"]', { timeout: 10000 })
    ]).catch(err => {
      console.log('   ⏱️  Timeout waiting for navigation or error');
    });
    
    // Check final state
    const finalUrl = page.url();
    console.log(`   📍 Final URL: ${finalUrl}`);
    
    // Take final screenshot
    await page.screenshot({ path: '/tmp/login-result.png' });
    console.log('   📸 Result screenshot saved to /tmp/login-result.png');
    
    // Check for error messages
    const errorAlert = await page.locator('[role="alert"]').count();
    if (errorAlert > 0) {
      const errorText = await page.locator('[role="alert"]').textContent();
      console.log(`   ❌ Error message: ${errorText}`);
    }
    
    // Determine result
    if (finalUrl.includes('/dashboard')) {
      console.log('\n✅ SUCCESS: Logged in successfully!');
      return true;
    } else if (finalUrl.includes('/verify-2fa')) {
      console.log('\n✅ SUCCESS: Redirected to 2FA verification!');
      return true;
    } else {
      console.log('\n❌ FAILED: Login was not successful');
      
      // Get network logs
      console.log('\n📡 Checking network requests...');
      page.on('response', response => {
        if (response.url().includes('/api/auth/login')) {
          console.log(`   Login API response: ${response.status()} ${response.statusText()}`);
        }
      });
      
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
testLogin().then(success => {
  process.exit(success ? 0 : 1);
});