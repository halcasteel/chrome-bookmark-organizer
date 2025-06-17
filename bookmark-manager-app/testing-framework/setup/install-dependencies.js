#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');

console.log('🚀 Installing Testing Framework Dependencies\n');

// Check if we're in the right directory
if (!fs.existsSync(path.join(rootDir, 'testing-framework'))) {
  console.error('❌ Error: Not in the bookmark-manager-app directory');
  process.exit(1);
}

const dependencies = {
  testing: [
    '@playwright/test@^1.41.0',
    'vitest@^1.2.2',
    '@testing-library/react@^14.1.2',
    '@testing-library/jest-dom@^6.2.0',
    '@testing-library/user-event@^14.5.2',
    'jest@^29.7.0',
    'supertest@^6.3.4',
    'nyc@^15.1.0',
    'c8@^9.0.0'
  ],
  mocking: [
    'msw@^2.1.2',
    'sinon@^17.0.1',
    'nock@^13.4.0'
  ],
  utilities: [
    '@faker-js/faker@^8.3.1',
    'chai@^5.0.0',
    'chai-http@^4.4.0',
    'dotenv@^16.3.1'
  ],
  database: [
    'pg@^8.11.3',
    'knex@^3.1.0',
    '@databases/pg@^5.5.0'
  ],
  reporting: [
    '@playwright/reporter@^1.41.0',
    'jest-html-reporter@^3.10.2',
    'mochawesome@^7.1.3'
  ]
};

console.log('📦 Installing dependencies by category...\n');

for (const [category, packages] of Object.entries(dependencies)) {
  console.log(`Installing ${category} packages...`);
  
  try {
    const packageList = packages.join(' ');
    execSync(`npm install --save-dev ${packageList}`, {
      cwd: rootDir,
      stdio: 'inherit'
    });
    console.log(`✅ ${category} packages installed\n`);
  } catch (error) {
    console.error(`❌ Failed to install ${category} packages:`, error.message);
    process.exit(1);
  }
}

// Install Playwright browsers
console.log('🌐 Installing Playwright browsers...');
try {
  execSync('npx playwright install', {
    cwd: rootDir,
    stdio: 'inherit'
  });
  console.log('✅ Playwright browsers installed\n');
} catch (error) {
  console.error('❌ Failed to install Playwright browsers:', error.message);
  process.exit(1);
}

// Create necessary directories
const directories = [
  'testing-framework/coverage',
  'testing-framework/reports',
  'testing-framework/screenshots',
  'testing-framework/videos',
  'testing-framework/logs',
  'testing-framework/temp',
  'testing-framework/data/fixtures',
  'testing-framework/data/seeds',
  'testing-framework/mocks/handlers'
];

console.log('📁 Creating directory structure...');
directories.forEach(dir => {
  const fullPath = path.join(rootDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ Created ${dir}`);
  }
});

// Create .gitignore for test artifacts
const gitignoreContent = `# Test artifacts
coverage/
reports/
screenshots/
videos/
logs/
temp/
*.log
*.tmp
.nyc_output/
test-results/
playwright-report/
`;

fs.writeFileSync(
  path.join(rootDir, 'testing-framework', '.gitignore'),
  gitignoreContent
);

console.log('\n✅ Testing framework dependencies installed successfully!');
console.log('\n📋 Next steps:');
console.log('1. Run: node testing-framework/setup/verify-setup.js');
console.log('2. Run: node testing-framework/setup/create-test-env.js');
console.log('3. Start testing: npm test');