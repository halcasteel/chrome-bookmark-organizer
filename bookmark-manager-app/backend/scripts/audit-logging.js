#!/usr/bin/env node

/**
 * Logging Audit Script
 * ====================
 * Purpose: Identify files that need logging improvements
 * Usage: node scripts/audit-logging.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_ROOT = path.join(__dirname, '..');
const IGNORE_DIRS = ['node_modules', 'logs', 'uploads', 'tests', '_archive'];
const IGNORE_FILES = ['unifiedLogger.js', 'logger.js', 'audit-logging.js'];

const results = {
  filesUsingConsole: [],
  filesWithoutUnifiedLogger: [],
  filesWithTryCatchNoLogging: [],
  routeFiles: [],
  serviceFiles: [],
  totalFiles: 0
};

function shouldIgnore(filePath) {
  return IGNORE_DIRS.some(dir => filePath.includes(dir)) ||
         IGNORE_FILES.some(file => filePath.endsWith(file));
}

function analyzeFile(filePath) {
  if (shouldIgnore(filePath)) return;
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(BACKEND_ROOT, filePath);
  
  results.totalFiles++;
  
  // Check for console usage
  if (content.match(/console\.(log|error|warn|debug)/)) {
    results.filesUsingConsole.push(relativePath);
  }
  
  // Check for unifiedLogger import
  if (!content.includes('unifiedLogger') && !content.includes('unified-logger')) {
    if (relativePath.includes('/routes/')) {
      results.routeFiles.push(relativePath);
    } else if (relativePath.includes('/services/')) {
      results.serviceFiles.push(relativePath);
    } else {
      results.filesWithoutUnifiedLogger.push(relativePath);
    }
  }
  
  // Check for try-catch without logging
  const tryCatchRegex = /try\s*{[\s\S]*?}\s*catch\s*\([^)]*\)\s*{([^}]*)}/g;
  let match;
  while ((match = tryCatchRegex.exec(content)) !== null) {
    const catchBlock = match[1];
    if (!catchBlock.includes('logger') && !catchBlock.includes('log')) {
      if (!results.filesWithTryCatchNoLogging.includes(relativePath)) {
        results.filesWithTryCatchNoLogging.push(relativePath);
      }
    }
  }
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !shouldIgnore(filePath)) {
      walkDirectory(filePath);
    } else if (stat.isFile() && filePath.endsWith('.js')) {
      analyzeFile(filePath);
    }
  });
}

console.log('Auditing logging implementation...\n');

// Start the audit
walkDirectory(path.join(BACKEND_ROOT, 'src'));

// Print results
console.log('=== LOGGING AUDIT RESULTS ===\n');

console.log(`Total JavaScript files analyzed: ${results.totalFiles}\n`);

console.log(`Files using console.* (${results.filesUsingConsole.length}):`);
if (results.filesUsingConsole.length > 0) {
  results.filesUsingConsole.forEach(file => console.log(`  - ${file}`));
} else {
  console.log('  ✅ None found!');
}

console.log(`\nRoute files without unifiedLogger (${results.routeFiles.length}):`);
if (results.routeFiles.length > 0) {
  results.routeFiles.forEach(file => console.log(`  - ${file}`));
} else {
  console.log('  ✅ All route files have logging!');
}

console.log(`\nService files without unifiedLogger (${results.serviceFiles.length}):`);
if (results.serviceFiles.length > 0) {
  results.serviceFiles.forEach(file => console.log(`  - ${file}`));
} else {
  console.log('  ✅ All service files have logging!');
}

console.log(`\nOther files without unifiedLogger (${results.filesWithoutUnifiedLogger.length}):`);
if (results.filesWithoutUnifiedLogger.length > 0) {
  results.filesWithoutUnifiedLogger.forEach(file => console.log(`  - ${file}`));
} else {
  console.log('  ✅ All files have logging!');
}

console.log(`\nFiles with try-catch blocks missing logging (${results.filesWithTryCatchNoLogging.length}):`);
if (results.filesWithTryCatchNoLogging.length > 0) {
  results.filesWithTryCatchNoLogging.forEach(file => console.log(`  - ${file}`));
} else {
  console.log('  ✅ All error handlers have logging!');
}

const totalIssues = results.filesUsingConsole.length + 
                   results.routeFiles.length + 
                   results.serviceFiles.length + 
                   results.filesWithoutUnifiedLogger.length;

console.log(`\n=== SUMMARY ===`);
console.log(`Total issues found: ${totalIssues}`);
console.log(`Files needing updates: ${new Set([
  ...results.filesUsingConsole,
  ...results.routeFiles,
  ...results.serviceFiles,
  ...results.filesWithoutUnifiedLogger
]).size}`);

if (totalIssues === 0) {
  console.log('\n✅ Excellent! All files follow logging standards!');
} else {
  console.log('\n❌ Some files need logging improvements.');
  console.log('Run "npm run fix-logging" to automatically update some issues.');
}