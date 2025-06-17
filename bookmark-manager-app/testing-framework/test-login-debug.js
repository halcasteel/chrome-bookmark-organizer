#!/usr/bin/env node

import { chromium } from 'playwright';

async function testLoginWithDebug() {
  console.log('🧪 Testing Bookmark Manager Login with Network Debugging...\n');
  
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
    
    // Set up network monitoring
    const loginResponses = [];
    page.on('response', response => {
      if (response.url().includes('/api/auth/login')) {
        loginResponses.push({
          status: response.status(),
          statusText: response.statusText(),
          url: response.url()
        });
      }
    });
    
    // Navigate to login page
    console.log('1️⃣  Navigating to login page...');
    await page.goto('http://localhost:5173/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Take initial screenshot
    const timestamp1 = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ 
      path: `/home/halcasteel/BOOKMARKS/bookmark-manager-app/testing-framework/screenshots/01-login-page-${timestamp1}.png` 
    });
    
    console.log('   ✅ Login page loaded\n');
    
    // Fill in credentials
    console.log('2️⃣  Entering credentials...');
    await page.fill('input[placeholder*="@az1.ai"]', 'admin@az1.ai');
    await page.fill('input[placeholder="Enter your password"]', 'changeme123');
    
    // Take screenshot after filling form
    const timestamp2 = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ 
      path: `/home/halcasteel/BOOKMARKS/bookmark-manager-app/testing-framework/screenshots/02-credentials-entered-${timestamp2}.png` 
    });
    
    console.log('   ✅ Credentials entered\n');
    
    // Click login button and wait for response
    console.log('3️⃣  Clicking login button and monitoring network...');
    
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/auth/login'), { timeout: 10000 }),
      page.click('button:has-text("Sign In")')
    ]);
    
    console.log('\n📡 Login API Response:');
    console.log(`   Status: ${response.status()} ${response.statusText()}`);
    console.log(`   URL: ${response.url()}`);
    
    try {
      const responseBody = await response.json();
      console.log(`   Body: ${JSON.stringify(responseBody, null, 2)}`);
    } catch (e) {
      const responseText = await response.text();
      console.log(`   Body (text): ${responseText}`);
    }
    
    // Wait a moment for any redirects
    await page.waitForTimeout(2000);
    
    // Check final state
    const finalUrl = page.url();
    console.log(`\n📍 Final URL: ${finalUrl}`);
    
    // Take final screenshot
    const timestamp3 = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `/home/halcasteel/BOOKMARKS/bookmark-manager-app/testing-framework/screenshots/03-final-result-${timestamp3}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Final screenshot saved`);
    
    // Check for errors on page
    const errorElements = await page.locator('[role="alert"], .error-message, .toast-error').all();
    if (errorElements.length > 0) {
      console.log('\n❌ Error messages found on page:');
      for (const elem of errorElements) {
        const text = await elem.textContent();
        console.log(`   - ${text}`);
      }
    }
    
    // Check local storage for auth tokens
    const localStorage = await page.evaluate(() => {
      return {
        token: window.localStorage.getItem('token'),
        user: window.localStorage.getItem('user')
      };
    });
    
    console.log('\n🔑 Local Storage:');
    console.log(`   Token: ${localStorage.token ? 'Present' : 'Not found'}`);
    console.log(`   User: ${localStorage.user ? 'Present' : 'Not found'}`);
    
    // Determine result
    if (response.status() === 200 && (finalUrl.includes('/dashboard') || finalUrl.includes('/verify-2fa'))) {
      console.log('\n✅ SUCCESS: Login successful!');
      return true;
    } else {
      console.log('\n❌ FAILED: Login was not successful');
      console.log(`   Response status: ${response.status()}`);
      console.log(`   Current URL: ${finalUrl}`);
      return false;
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('Stack:', error.stack);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the test
testLoginWithDebug().then(success => {
  process.exit(success ? 0 : 1);
});