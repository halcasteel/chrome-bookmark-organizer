import { chromium } from 'playwright';

async function test() {
  console.log('Testing Playwright...');
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Browser launched successfully');
    
    const page = await browser.newPage();
    console.log('Page created successfully');
    
    await page.goto('https://www.az1.ai');
    console.log('Navigation successful');
    
    const title = await page.title();
    console.log('Page title:', title);
    
    await browser.close();
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Error:', error);
  }
}

test();