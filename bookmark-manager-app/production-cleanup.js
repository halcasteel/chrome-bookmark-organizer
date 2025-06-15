#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Production Cleanup Script - Archive non-essential files for production
// ============================================================================

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

class ProductionCleanup {
  constructor() {
    this.archiveDir = path.join(__dirname, '_archive');
    this.dryRun = true;
    this.stats = {
      files: 0,
      directories: 0,
      size: 0,
      errors: 0
    };
    
    // Define what to archive
    this.archivePatterns = {
      // Test and debug files
      testFiles: {
        patterns: [
          /^test-.*\.js$/,
          /^debug-.*\.js$/,
          /\.test\.(js|ts)$/,
          /\.spec\.(js|ts)$/,
        ],
        description: 'Test and debug scripts'
      },
      
      // Backend test scripts (not in src)
      backendTests: {
        files: [
          'backend/test-admin.js',
          'backend/test-async-import.js',
          'backend/test-bookmark-api.js',
          'backend/test-large-file-parsing.js',
          'backend/test-orchestrator-api.js',
          'backend/test-password.js',
          'backend/test-single-validation.js',
          'backend/test-validation-workflow.js',
          'backend/test-websocket.js',
          'backend/debug-websocket.js',
        ],
        description: 'Backend test files'
      },
      
      // Import scripts (keep only essential ones)
      importScripts: {
        files: [
          'backend/direct-import-bookmarks.js',
          'backend/import-production-bookmarks.js',
          'backend/import-test-bookmarks.js',
          'backend/simple-import.js',
          'backend/reset-admin-password.js',
          'backend/run-validation-queue.js',
        ],
        description: 'One-time import and utility scripts'
      },
      
      // Old scripts in backend/src/scripts
      utilityScripts: {
        files: [
          'backend/src/scripts/addAsyncColumns.js',
          'backend/src/scripts/checkAdminSimple.js',
          'backend/src/scripts/checkAdminUsers.js',
          'backend/src/scripts/checkUserSecret.js',
          'backend/src/scripts/clearRateLimit.js',
          'backend/src/scripts/debugOrchestrator.js',
          'backend/src/scripts/debugTOTP.js',
          'backend/src/scripts/findAdminPassword.js',
          'backend/src/scripts/fixRateLimit.js',
          'backend/src/scripts/generateCorrectTOTP.js',
          'backend/src/scripts/processLargeBookmarkFile.js',
          'backend/src/scripts/queueUnvalidatedBookmarks.js',
          'backend/src/scripts/resetAdminPassword.js',
          'backend/src/scripts/retryFailedJobs.js',
          'backend/src/scripts/test2FAVerification.js',
          'backend/src/scripts/testLargeFileImport.js',
          'backend/src/scripts/testWebSocketClient.js',
        ],
        description: 'Utility and debug scripts'
      },
      
      // Documentation (keep only essential)
      documentation: {
        files: [
          '2FA_REACTIVATION_CHECKLIST.md',
          'AGENT_WORKFLOWS_COMPLETE.md',
          'BOOKMARK_PROCESSING.md',
          'CHECKPOINT.md',
          'DEBUGGING_METHODOLOGY.md',
          'DEPENDENCY_UPDATES.md',
          'IMPORT_WORKFLOW_ARCHITECTURE.md',
          'IMPROVED_WORKFLOW_DESIGN.md',
          'LOGGING_STANDARDS.md',
          'ORCHESTRATOR_COMPLETE.md',
          'REDIS_WORKFLOW_ARCHITECTURE.md',
          'REMAINING_UI_IMPLEMENTATION.md',
          'SECURITY_ISSUES.md',
          'TESTING_CHECKLIST.md',
          'TESTING_LOG.md',
          'TODO-LIST-with-CHECKBOXES.md',
          'UI_IMPLEMENTATION_CHECKLIST.md',
          'VALIDATION_WORKFLOW.md',
          'WEBSOCKET_DEBUGGING_GUIDE.md',
          'WORKFLOW_ARCHITECTURE.md',
          'WORKFLOW_HANDOFFS.md',
          'WORKFLOW_SUMMARY.md',
          'WORKFLOW_VISUAL_DIAGRAM.md',
          'git-push-instructions.md',
        ],
        description: 'Development documentation'
      },
      
      // TypeScript migration files
      typescriptMigration: {
        files: [
          'frontend/TYPESCRIPT_MIGRATION.md',
          'frontend/TYPESCRIPT_MIGRATION_COMPLETE.md',
          'frontend/TYPESCRIPT_STATUS.md',
          'frontend/eslint.config.js.bak',
          'frontend/vite.config.js.bak',
          'frontend/vite.config.ts.bak',
        ],
        description: 'TypeScript migration artifacts'
      },
      
      // Analysis and dependency check scripts
      analysisScripts: {
        files: [
          'analyze-dependencies.js',
          'comprehensive-dependency-check.js',
          'backend/start-and-verify.js',
          'DEPENDENCY_ANALYSIS.md',
          'COMPREHENSIVE_DEPENDENCY_REPORT.md',
        ],
        description: 'Analysis and dependency scripts'
      },
      
      // Bookmark validation data (keep only summaries)
      bookmarkValidation: {
        directories: [
          'bookmark-validation/invalid',
          'bookmark-validation/failed',
          'bookmark-validation/pending',
          'bookmark-validation/processed',
          'bookmark-validation/valid',
        ],
        keepFiles: [
          'bookmark-validation/summary.json',
          'bookmark-validation/processing-report.json',
        ],
        description: 'Bookmark validation data'
      },
      
      // Test HTML files
      testHtml: {
        files: [
          'test-bookmarks-import.html',
          'backend/optimize-for-large-import.sh',
        ],
        description: 'Test HTML and scripts'
      },
      
      // Log files (if any exist)
      logFiles: {
        patterns: [
          /\.log$/,
          /\.log\.\d+$/,
        ],
        exclude: ['logs/'], // Keep logs directory structure
        description: 'Old log files'
      }
    };
    
    // Files to definitely keep (never archive)
    this.essentialFiles = new Set([
      // Core configuration
      'package.json',
      'package-lock.json',
      '.env',
      '.env.example',
      '.env.production',
      '.gitignore',
      'docker-compose.yml',
      'cloudbuild.yaml',
      'deploy.sh',
      
      // Documentation
      'README.md',
      'SDD.md',
      'TDD.md',
      'DEPLOYMENT_GUIDE.md',
      'UNIFIED_LOGGING_GUIDE.md',
      
      // Scripts
      'start-services.js',
      'restart-clean.sh',
      'scripts/', // Keep all deployment scripts
      
      // Directories
      'backend/src/',
      'frontend/src/',
      'database/',
      'docker/',
      'docs/',
      
      // Production data
      'logs/', // Keep logs directory
    ]);
  }

  log(level, message, detail = '') {
    const icons = {
      info: '📋',
      success: '✅',
      warning: '⚠️ ',
      error: '❌',
      file: '📄',
      folder: '📁',
      archive: '📦',
    };
    
    const colors = {
      info: COLORS.blue,
      success: COLORS.green,
      warning: COLORS.yellow,
      error: COLORS.red,
    };
    
    console.log(`${icons[level] || ''} ${colors[level] || ''}${message}${COLORS.reset} ${COLORS.dim}${detail}${COLORS.reset}`);
  }

  async promptUser() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      console.log(`\n${COLORS.cyan}========================================${COLORS.reset}`);
      console.log(`${COLORS.cyan}  Production Cleanup Script${COLORS.reset}`);
      console.log(`${COLORS.cyan}========================================${COLORS.reset}\n`);
      
      console.log('This script will archive non-essential files to prepare for production deployment.\n');
      console.log(`Archive directory: ${COLORS.yellow}${this.archiveDir}${COLORS.reset}\n`);
      
      rl.question(`Run in ${COLORS.yellow}DRY RUN${COLORS.reset} mode first? (recommended) [Y/n]: `, (answer) => {
        this.dryRun = answer.toLowerCase() !== 'n';
        rl.close();
        resolve();
      });
    });
  }

  async ensureArchiveDir() {
    if (!this.dryRun) {
      await fs.mkdir(this.archiveDir, { recursive: true });
      
      // Create category subdirectories
      const categories = [
        'test-files',
        'import-scripts',
        'utility-scripts',
        'documentation',
        'typescript-migration',
        'analysis',
        'bookmark-validation',
        'logs',
      ];
      
      for (const category of categories) {
        await fs.mkdir(path.join(this.archiveDir, category), { recursive: true });
      }
    }
  }

  async getFileSize(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  async archiveFile(sourcePath, category, relativePath) {
    const targetPath = path.join(this.archiveDir, category, relativePath);
    
    if (this.dryRun) {
      const size = await this.getFileSize(sourcePath);
      this.stats.size += size;
      this.stats.files++;
      this.log('file', `Would archive: ${relativePath}`, `(${this.formatSize(size)})`);
    } else {
      try {
        // Ensure target directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        
        // Move the file
        await fs.rename(sourcePath, targetPath);
        
        this.stats.files++;
        this.log('success', `Archived: ${relativePath}`);
      } catch (error) {
        this.stats.errors++;
        this.log('error', `Failed to archive ${relativePath}:`, error.message);
      }
    }
  }

  async archiveDirectory(dirPath, category, relativePath) {
    if (this.dryRun) {
      this.stats.directories++;
      this.log('folder', `Would archive directory: ${relativePath}`);
    } else {
      try {
        const targetPath = path.join(this.archiveDir, category, relativePath);
        
        // Ensure parent directory exists
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        
        // Move the directory
        await fs.rename(dirPath, targetPath);
        
        this.stats.directories++;
        this.log('success', `Archived directory: ${relativePath}`);
      } catch (error) {
        this.stats.errors++;
        this.log('error', `Failed to archive directory ${relativePath}:`, error.message);
      }
    }
  }

  async processArchivePatterns() {
    // Process each category
    for (const [category, config] of Object.entries(this.archivePatterns)) {
      this.log('info', `\nProcessing ${config.description}...`);
      
      // Process specific files
      if (config.files) {
        for (const file of config.files) {
          const fullPath = path.join(__dirname, file);
          try {
            await fs.access(fullPath);
            await this.archiveFile(fullPath, category, file);
          } catch {
            // File doesn't exist, skip
          }
        }
      }
      
      // Process directories
      if (config.directories) {
        for (const dir of config.directories) {
          const fullPath = path.join(__dirname, dir);
          try {
            await fs.access(fullPath);
            
            // Keep summary files if specified
            if (config.keepFiles && !this.dryRun) {
              for (const keepFile of config.keepFiles) {
                const keepPath = path.join(__dirname, keepFile);
                try {
                  // Copy keep files to temp location
                  const tempPath = keepPath + '.keep';
                  await fs.copyFile(keepPath, tempPath);
                } catch {
                  // Keep file doesn't exist
                }
              }
            }
            
            await this.archiveDirectory(fullPath, category, dir);
            
            // Restore keep files
            if (config.keepFiles && !this.dryRun) {
              // Recreate directory
              await fs.mkdir(path.dirname(fullPath), { recursive: true });
              
              for (const keepFile of config.keepFiles) {
                const keepPath = path.join(__dirname, keepFile);
                const tempPath = keepPath + '.keep';
                try {
                  await fs.rename(tempPath, keepPath);
                  this.log('info', `Kept: ${keepFile}`);
                } catch {
                  // Keep file doesn't exist
                }
              }
            }
          } catch {
            // Directory doesn't exist, skip
          }
        }
      }
      
      // Process patterns
      if (config.patterns) {
        const allFiles = await this.findFilesByPatterns(config.patterns, config.exclude);
        for (const file of allFiles) {
          await this.archiveFile(file, category, path.relative(__dirname, file));
        }
      }
    }
  }

  async findFilesByPatterns(patterns, exclude = []) {
    const files = [];
    
    async function walk(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(__dirname, fullPath);
          
          // Skip excluded paths
          if (exclude.some(ex => relativePath.startsWith(ex))) {
            continue;
          }
          
          // Skip certain directories
          if (entry.isDirectory()) {
            if (['node_modules', '.git', '_archive'].includes(entry.name)) {
              continue;
            }
            await walk(fullPath);
          } else {
            // Check if file matches any pattern
            if (patterns.some(pattern => pattern.test(entry.name))) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Directory not accessible
      }
    }
    
    await walk(__dirname);
    return files;
  }

  async generateReport() {
    const reportPath = path.join(__dirname, 'PRODUCTION_CLEANUP_REPORT.md');
    const report = [];
    
    report.push('# Production Cleanup Report');
    report.push(`Generated: ${new Date().toISOString()}`);
    report.push(`Mode: ${this.dryRun ? 'DRY RUN' : 'ACTUAL'}\n`);
    
    report.push('## Summary');
    report.push(`- Files ${this.dryRun ? 'to archive' : 'archived'}: ${this.stats.files}`);
    report.push(`- Directories ${this.dryRun ? 'to archive' : 'archived'}: ${this.stats.directories}`);
    report.push(`- Total size: ${this.formatSize(this.stats.size)}`);
    report.push(`- Errors: ${this.stats.errors}\n`);
    
    report.push('## Archive Structure');
    report.push('```');
    report.push('_archive/');
    report.push('├── test-files/          # Test and debug scripts');
    report.push('├── import-scripts/      # One-time import utilities');
    report.push('├── utility-scripts/     # Debug and utility scripts');
    report.push('├── documentation/       # Development docs');
    report.push('├── typescript-migration/# TS migration artifacts');
    report.push('├── analysis/           # Dependency analysis');
    report.push('├── bookmark-validation/ # Validation data');
    report.push('└── logs/               # Old log files');
    report.push('```\n');
    
    report.push('## Next Steps');
    if (this.dryRun) {
      report.push('1. Review this report');
      report.push('2. Run again without dry-run mode to perform actual cleanup');
      report.push('3. Verify the application still works correctly');
      report.push('4. Commit the cleaned structure to git');
    } else {
      report.push('1. Verify the application works correctly');
      report.push('2. The _archive directory is in .gitignore (do not commit)');
      report.push('3. Commit the cleaned structure');
      report.push('4. Keep _archive locally for reference if needed');
    }
    
    await fs.writeFile(reportPath, report.join('\n'));
    
    this.log('success', `\nReport generated: ${reportPath}`);
  }

  async run() {
    await this.promptUser();
    
    console.log(`\n${COLORS.cyan}Running in ${this.dryRun ? 'DRY RUN' : 'ACTUAL'} mode...${COLORS.reset}\n`);
    
    // Create archive directory
    await this.ensureArchiveDir();
    
    // Add _archive to .gitignore if not present
    if (!this.dryRun) {
      try {
        const gitignorePath = path.join(__dirname, '.gitignore');
        const gitignore = await fs.readFile(gitignorePath, 'utf8');
        
        if (!gitignore.includes('_archive')) {
          await fs.appendFile(gitignorePath, '\n# Archived files\n_archive/\n');
          this.log('success', 'Added _archive/ to .gitignore');
        }
      } catch (error) {
        this.log('error', 'Failed to update .gitignore:', error.message);
      }
    }
    
    // Process all patterns
    await this.processArchivePatterns();
    
    // Generate report
    await this.generateReport();
    
    // Show summary
    console.log(`\n${COLORS.cyan}========================================${COLORS.reset}`);
    console.log(`${COLORS.cyan}  Cleanup ${this.dryRun ? 'Preview' : 'Complete'}${COLORS.reset}`);
    console.log(`${COLORS.cyan}========================================${COLORS.reset}\n`);
    
    console.log(`📊 ${this.dryRun ? 'Would archive' : 'Archived'}:`);
    console.log(`   - ${COLORS.yellow}${this.stats.files}${COLORS.reset} files`);
    console.log(`   - ${COLORS.yellow}${this.stats.directories}${COLORS.reset} directories`);
    console.log(`   - ${COLORS.yellow}${this.formatSize(this.stats.size)}${COLORS.reset} total size`);
    
    if (this.stats.errors > 0) {
      console.log(`   - ${COLORS.red}${this.stats.errors}${COLORS.reset} errors`);
    }
    
    if (this.dryRun) {
      console.log(`\n${COLORS.yellow}This was a DRY RUN. No files were moved.${COLORS.reset}`);
      console.log(`Run without dry-run mode to perform actual cleanup.`);
    } else {
      console.log(`\n${COLORS.green}✅ Production cleanup complete!${COLORS.reset}`);
      console.log(`Archived files are in: ${COLORS.cyan}${this.archiveDir}${COLORS.reset}`);
    }
  }
}

// Run the cleanup
const cleaner = new ProductionCleanup();
cleaner.run().catch(error => {
  console.error(`${COLORS.red}Cleanup failed:${COLORS.reset}`, error);
  process.exit(1);
});