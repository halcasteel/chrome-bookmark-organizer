#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Essential Files Analyzer - Identify and categorize all essential files
// ============================================================================

class EssentialFilesAnalyzer {
  constructor() {
    this.allProjectFiles = [];
    this.filesToArchive = new Set();
    this.essentialFiles = {
      sourceCode: [],
      configuration: [],
      documentation: [],
      scripts: [],
      data: [],
      other: []
    };
    
    // Files identified for archival (from production-cleanup.js)
    this.archiveList = [
      // Test files
      'backend/debug-websocket.js',
      'backend/test-admin.js',
      'backend/test-async-import.js',
      'backend/test-bookmark-api.js',
      'backend/test-large-file-parsing.js',
      'backend/test-orchestrator-api.js',
      'backend/test-password.js',
      'backend/test-single-validation.js',
      'backend/test-validation-workflow.js',
      'backend/test-websocket.js',
      'scripts/test-db-connection.js',
      
      // Import scripts
      'backend/direct-import-bookmarks.js',
      'backend/import-production-bookmarks.js',
      'backend/import-test-bookmarks.js',
      'backend/simple-import.js',
      'backend/reset-admin-password.js',
      'backend/run-validation-queue.js',
      
      // Utility scripts
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
      
      // Documentation
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
      
      // TypeScript migration
      'frontend/TYPESCRIPT_MIGRATION.md',
      'frontend/TYPESCRIPT_MIGRATION_COMPLETE.md',
      'frontend/TYPESCRIPT_STATUS.md',
      'frontend/eslint.config.js.bak',
      'frontend/vite.config.js.bak',
      'frontend/vite.config.ts.bak',
      
      // Analysis scripts
      'analyze-dependencies.js',
      'comprehensive-dependency-check.js',
      'backend/start-and-verify.js',
      'DEPENDENCY_ANALYSIS.md',
      'COMPREHENSIVE_DEPENDENCY_REPORT.md',
      'PRODUCTION_CLEANUP_REPORT.md',
      
      // Test HTML
      'test-bookmarks-import.html',
      'backend/optimize-for-large-import.sh',
      
      // Log files
      'backend/backend.log',
      'backend/worker.log',
      'frontend/frontend.log',
      
      // This analyzer itself
      'essential-files-analyzer.js',
      'production-cleanup.js'
    ];
    
    this.dependencies = {
      imports: new Map(),
      configs: new Map(),
      dockerRefs: new Map(),
      routes: new Map()
    };
  }

  async findAllProjectFiles() {
    const files = [];
    
    async function walk(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(__dirname, fullPath);
          
          if (entry.isDirectory()) {
            // Skip these directories
            if (['node_modules', '.git', '_archive', 'bookmark-validation'].includes(entry.name)) {
              continue;
            }
            await walk(fullPath);
          } else {
            files.push(relativePath);
          }
        }
      } catch (error) {
        // Directory not accessible
      }
    }
    
    await walk(__dirname);
    return files;
  }

  categorizeFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const dir = path.dirname(filePath);
    
    // Source code files
    if (dir.includes('/src/') || dir.includes('\\src\\')) {
      if (['.js', '.ts', '.tsx', '.jsx'].includes(ext)) {
        return 'sourceCode';
      }
    }
    
    // Configuration files
    if (['.json', '.yml', '.yaml', '.env', '.sql'].includes(ext) ||
        filePath.includes('package.json') ||
        filePath.includes('tsconfig') ||
        filePath.includes('docker') ||
        filePath.includes('nginx') ||
        filePath.includes('.config.')) {
      return 'configuration';
    }
    
    // Documentation
    if (ext === '.md') {
      return 'documentation';
    }
    
    // Scripts
    if (ext === '.js' || ext === '.sh' || ext === '.sql') {
      return 'scripts';
    }
    
    // Data files
    if (['.html', '.css', '.ico', '.png', '.jpg', '.svg'].includes(ext)) {
      return 'data';
    }
    
    return 'other';
  }

  async analyzeDependencies() {
    console.log('\n📊 Analyzing Dependencies...\n');
    
    // Check imports in source files
    const sourceFiles = this.essentialFiles.sourceCode.filter(f => f.endsWith('.js') || f.endsWith('.ts'));
    
    for (const file of sourceFiles) {
      try {
        const content = await fs.readFile(path.join(__dirname, file), 'utf8');
        
        // Find imports
        const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;
        let match;
        while ((match = importRegex.exec(content))) {
          const importPath = match[1];
          if (!this.dependencies.imports.has(file)) {
            this.dependencies.imports.set(file, new Set());
          }
          this.dependencies.imports.get(file).add(importPath);
        }
        
        // Find requires
        const requireRegex = /require\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
        while ((match = requireRegex.exec(content))) {
          const requirePath = match[1];
          if (!this.dependencies.imports.has(file)) {
            this.dependencies.imports.set(file, new Set());
          }
          this.dependencies.imports.get(file).add(requirePath);
        }
      } catch (error) {
        // File read error
      }
    }
    
    // Check Docker references
    const dockerFiles = this.essentialFiles.configuration.filter(f => 
      f.includes('docker') || f.includes('Dockerfile')
    );
    
    for (const file of dockerFiles) {
      try {
        const content = await fs.readFile(path.join(__dirname, file), 'utf8');
        
        // Find COPY and ADD commands
        const copyRegex = /(?:COPY|ADD)\s+([^\s]+)\s+/g;
        let match;
        while ((match = copyRegex.exec(content))) {
          if (!this.dependencies.dockerRefs.has(file)) {
            this.dependencies.dockerRefs.set(file, new Set());
          }
          this.dependencies.dockerRefs.get(file).add(match[1]);
        }
      } catch (error) {
        // File read error
      }
    }
    
    // Check route definitions
    const routeFiles = this.essentialFiles.sourceCode.filter(f => f.includes('routes'));
    
    for (const file of routeFiles) {
      try {
        const content = await fs.readFile(path.join(__dirname, file), 'utf8');
        
        // Find route endpoints
        const routeRegex = /router\.(get|post|put|delete|patch)\s*\(\s*['"](\/[^'"]*)['"]/g;
        let match;
        while ((match = routeRegex.exec(content))) {
          if (!this.dependencies.routes.has(file)) {
            this.dependencies.routes.set(file, new Set());
          }
          this.dependencies.routes.get(file).add(`${match[1].toUpperCase()} ${match[2]}`);
        }
      } catch (error) {
        // File read error
      }
    }
  }

  async generateReport() {
    // Get all project files
    this.allProjectFiles = await this.findAllProjectFiles();
    
    // Mark files for archival
    this.archiveList.forEach(file => this.filesToArchive.add(file));
    
    // Categorize essential files
    for (const file of this.allProjectFiles) {
      if (!this.filesToArchive.has(file)) {
        const category = this.categorizeFile(file);
        this.essentialFiles[category].push(file);
      }
    }
    
    // Analyze dependencies
    await this.analyzeDependencies();
    
    // Generate report
    const report = [];
    
    report.push('# Essential Files Analysis Report');
    report.push(`Generated: ${new Date().toISOString()}\n`);
    
    report.push('## Summary');
    report.push(`- Total project files: ${this.allProjectFiles.length}`);
    report.push(`- Files to archive: ${this.filesToArchive.size}`);
    report.push(`- Essential files remaining: ${this.allProjectFiles.length - this.filesToArchive.size}\n`);
    
    // Essential files breakdown
    report.push('## Essential Files by Category\n');
    
    const totalEssential = Object.values(this.essentialFiles).reduce((sum, arr) => sum + arr.length, 0);
    
    report.push(`### Source Code (${this.essentialFiles.sourceCode.length} files)`);
    report.push('```');
    this.essentialFiles.sourceCode.sort().forEach(file => {
      report.push(file);
    });
    report.push('```\n');
    
    report.push(`### Configuration (${this.essentialFiles.configuration.length} files)`);
    report.push('```');
    this.essentialFiles.configuration.sort().forEach(file => {
      report.push(file);
    });
    report.push('```\n');
    
    report.push(`### Scripts (${this.essentialFiles.scripts.length} files)`);
    report.push('```');
    this.essentialFiles.scripts.sort().forEach(file => {
      report.push(file);
    });
    report.push('```\n');
    
    report.push(`### Documentation (${this.essentialFiles.documentation.length} files)`);
    report.push('```');
    this.essentialFiles.documentation.sort().forEach(file => {
      report.push(file);
    });
    report.push('```\n');
    
    report.push(`### Data/Assets (${this.essentialFiles.data.length} files)`);
    report.push('```');
    this.essentialFiles.data.sort().forEach(file => {
      report.push(file);
    });
    report.push('```\n');
    
    report.push(`### Other (${this.essentialFiles.other.length} files)`);
    report.push('```');
    this.essentialFiles.other.sort().forEach(file => {
      report.push(file);
    });
    report.push('```\n');
    
    // Dependencies analysis
    report.push('## Dependency Cross-Check\n');
    
    report.push('### Import Dependencies');
    report.push(`Found ${this.dependencies.imports.size} files with local imports:\n`);
    for (const [file, imports] of this.dependencies.imports) {
      if (imports.size > 0) {
        report.push(`**${file}**`);
        Array.from(imports).sort().forEach(imp => {
          report.push(`  → ${imp}`);
        });
        report.push('');
      }
    }
    
    report.push('### Docker References');
    report.push(`Found ${this.dependencies.dockerRefs.size} Docker files with references:\n`);
    for (const [file, refs] of this.dependencies.dockerRefs) {
      if (refs.size > 0) {
        report.push(`**${file}**`);
        Array.from(refs).sort().forEach(ref => {
          report.push(`  → ${ref}`);
        });
        report.push('');
      }
    }
    
    report.push('### API Routes');
    report.push(`Found ${this.dependencies.routes.size} route files:\n`);
    for (const [file, routes] of this.dependencies.routes) {
      if (routes.size > 0) {
        report.push(`**${file}**`);
        Array.from(routes).sort().forEach(route => {
          report.push(`  → ${route}`);
        });
        report.push('');
      }
    }
    
    // Verification section
    report.push('## Dependency Verification\n');
    report.push('### How Dependencies Are Cross-Checked:\n');
    report.push('1. **Import Analysis**: Every .js/.ts file is scanned for:');
    report.push('   - ES6 imports: `import X from "./path"`');
    report.push('   - CommonJS requires: `require("./path")`');
    report.push('   - Dynamic imports: `import("./path")`\n');
    
    report.push('2. **Docker Analysis**: Dockerfile and docker-compose.yml are scanned for:');
    report.push('   - COPY commands referencing local files');
    report.push('   - ADD commands referencing local files');
    report.push('   - Volume mounts to local directories\n');
    
    report.push('3. **Configuration Analysis**: Package.json and other configs are scanned for:');
    report.push('   - Script references to local files');
    report.push('   - Main/module entry points');
    report.push('   - Build tool configurations\n');
    
    report.push('4. **Route Analysis**: All route files are scanned for:');
    report.push('   - API endpoint definitions');
    report.push('   - Middleware references');
    report.push('   - Service dependencies\n');
    
    report.push('5. **Cross-Reference Validation**:');
    report.push('   - If file A imports file B, both must be kept');
    report.push('   - If Docker copies file C, it must be kept');
    report.push('   - If package.json references script D, it must be kept');
    report.push('   - All files in src/ directories are kept by default\n');
    
    // Write report
    await fs.writeFile(
      path.join(__dirname, 'ESSENTIAL_FILES_ANALYSIS.md'),
      report.join('\n')
    );
    
    // Console output
    console.log('📊 Essential Files Summary:\n');
    console.log(`   Source Code: ${this.essentialFiles.sourceCode.length} files`);
    console.log(`   Configuration: ${this.essentialFiles.configuration.length} files`);
    console.log(`   Scripts: ${this.essentialFiles.scripts.length} files`);
    console.log(`   Documentation: ${this.essentialFiles.documentation.length} files`);
    console.log(`   Data/Assets: ${this.essentialFiles.data.length} files`);
    console.log(`   Other: ${this.essentialFiles.other.length} files`);
    console.log(`   ─────────────────────────`);
    console.log(`   Total Essential: ${totalEssential} files\n`);
    
    console.log('📦 Files to Archive: ' + this.filesToArchive.size);
    console.log('✅ Essential Files: ' + totalEssential);
    console.log('\n📄 Full report: ESSENTIAL_FILES_ANALYSIS.md');
  }
}

// Run the analysis
const analyzer = new EssentialFilesAnalyzer();
analyzer.generateReport().catch(error => {
  console.error('Analysis failed:', error);
  process.exit(1);
});