import fs from 'fs';
import path from 'path';

class TestSpecificationGenerator {
  constructor() {
    this.testSpecs = [];
    this.testIdCounter = {
      AUTH: 0,
      DASH: 0,
      BOOK: 0,
      SRCH: 0,
      IMPT: 0,
      COLL: 0,
      TAGS: 0,
      SETT: 0,
      ADMN: 0,
      LOGV: 0,
      REG: 0
    };
  }

  generateAllSpecs() {
    // Authentication Page Tests
    this.generateAuthTests();
    
    // Registration Page Tests
    this.generateRegistrationTests();
    
    // Dashboard Tests
    this.generateDashboardTests();
    
    // Bookmarks Tests
    this.generateBookmarksTests();
    
    // Search Tests
    this.generateSearchTests();
    
    // Import Tests
    this.generateImportTests();
    
    // Collections Tests
    this.generateCollectionsTests();
    
    // Tags Tests
    this.generateTagsTests();
    
    // Settings Tests
    this.generateSettingsTests();
    
    // Admin Dashboard Tests
    this.generateAdminTests();
    
    // Log Viewer Tests
    this.generateLogViewerTests();
    
    // Cross-functional Tests
    this.generateCrossFunctionalTests();
    
    // Performance Tests
    this.generatePerformanceTests();
    
    // Security Tests
    this.generateSecurityTests();
    
    // Accessibility Tests
    this.generateAccessibilityTests();
    
    return this.testSpecs;
  }

  generateTestId(page, feature) {
    this.testIdCounter[page]++;
    return `${page}-${feature}-${String(this.testIdCounter[page]).padStart(3, '0')}`;
  }

  addTestSpec(spec) {
    this.testSpecs.push({
      ...spec,
      createdAt: new Date().toISOString(),
      version: '1.0'
    });
  }

  generateAuthTests() {
    // Login Form Tests
    this.addTestSpec({
      id: this.generateTestId('AUTH', 'FORM'),
      type: 'positive',
      category: 'functional',
      page: 'Login',
      feature: 'Login Form',
      description: 'Login with valid credentials',
      preconditions: ['User account exists in database'],
      steps: [
        'Navigate to /login',
        'Enter valid email: admin@az1.ai',
        'Enter valid password: changeme123',
        'Click Sign In button'
      ],
      expectedResult: 'User is redirected to dashboard',
      testData: {
        email: 'admin@az1.ai',
        password: 'changeme123'
      },
      apiEndpoints: ['/api/auth/login'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['smoke', 'authentication']
    });

    this.addTestSpec({
      id: this.generateTestId('AUTH', 'FORM'),
      type: 'negative',
      category: 'functional',
      page: 'Login',
      feature: 'Login Form',
      description: 'Login with invalid password',
      preconditions: ['User account exists'],
      steps: [
        'Navigate to /login',
        'Enter valid email',
        'Enter invalid password',
        'Click Sign In button'
      ],
      expectedResult: 'Error message: Invalid email or password',
      testData: {
        email: 'admin@az1.ai',
        password: 'wrongpassword'
      },
      apiEndpoints: ['/api/auth/login'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['authentication', 'negative']
    });

    // 2FA Tests
    this.addTestSpec({
      id: this.generateTestId('AUTH', '2FA'),
      type: 'positive',
      category: 'functional',
      page: 'Login',
      feature: '2FA Verification',
      description: 'Complete 2FA verification',
      preconditions: ['User has 2FA enabled', 'Valid TOTP token available'],
      steps: [
        'Complete login with email/password',
        'Enter 6-digit TOTP code',
        'Click Verify button'
      ],
      expectedResult: 'User is authenticated and redirected to dashboard',
      testData: {
        totpCode: '123456'
      },
      apiEndpoints: ['/api/auth/verify-2fa'],
      priority: 'P0',
      automationStatus: 'manual',
      tags: ['security', '2fa']
    });

    // Input Validation Tests
    this.addTestSpec({
      id: this.generateTestId('AUTH', 'INPT'),
      type: 'negative',
      category: 'validation',
      page: 'Login',
      feature: 'Email Input',
      description: 'Invalid email format validation',
      preconditions: [],
      steps: [
        'Navigate to /login',
        'Enter invalid email format: notanemail',
        'Tab out of field'
      ],
      expectedResult: 'Email validation error shown',
      testData: {
        invalidEmails: ['notanemail', 'user@', '@domain.com', 'user@domain']
      },
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['validation', 'input']
    });
  }

  generateRegistrationTests() {
    this.addTestSpec({
      id: this.generateTestId('REG', 'FORM'),
      type: 'positive',
      category: 'functional',
      page: 'Register',
      feature: 'Registration Form',
      description: 'Register new user account',
      preconditions: ['Email not already registered'],
      steps: [
        'Navigate to /register',
        'Enter name: Test User',
        'Enter email: newuser@test.com',
        'Enter password: ValidPass123!',
        'Confirm password: ValidPass123!',
        'Click Create Account'
      ],
      expectedResult: '2FA setup modal appears',
      testData: {
        name: 'Test User',
        email: 'newuser@test.com',
        password: 'ValidPass123!'
      },
      apiEndpoints: ['/api/auth/register'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['registration', 'smoke']
    });

    this.addTestSpec({
      id: this.generateTestId('REG', 'VALD'),
      type: 'negative',
      category: 'validation',
      page: 'Register',
      feature: 'Password Validation',
      description: 'Password mismatch validation',
      preconditions: [],
      steps: [
        'Fill registration form',
        'Enter password: Pass123!',
        'Enter different confirm password: Pass456!',
        'Attempt to submit'
      ],
      expectedResult: 'Password mismatch error shown',
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['validation', 'registration']
    });

    this.addTestSpec({
      id: this.generateTestId('REG', '2FA'),
      type: 'positive',
      category: 'functional',
      page: 'Register',
      feature: '2FA Setup',
      description: 'Complete 2FA setup during registration',
      preconditions: ['Registration form submitted successfully'],
      steps: [
        'Scan QR code with authenticator app',
        'Enter 6-digit code from app',
        'Click Complete Setup'
      ],
      expectedResult: 'User redirected to login page',
      apiEndpoints: ['/api/auth/enable-2fa'],
      priority: 'P0',
      automationStatus: 'manual',
      tags: ['security', '2fa', 'registration']
    });
  }

  generateDashboardTests() {
    this.addTestSpec({
      id: this.generateTestId('DASH', 'VIEW'),
      type: 'positive',
      category: 'functional',
      page: 'Dashboard',
      feature: 'Dashboard Display',
      description: 'View dashboard statistics',
      preconditions: ['User logged in', 'User has bookmarks'],
      steps: [
        'Navigate to /dashboard',
        'Verify statistics load',
        'Check bookmark count',
        'Check collection count'
      ],
      expectedResult: 'All statistics displayed correctly',
      apiEndpoints: ['/api/stats/dashboard'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['dashboard', 'smoke']
    });

    this.addTestSpec({
      id: this.generateTestId('DASH', 'ADMN'),
      type: 'positive',
      category: 'functional',
      page: 'Dashboard',
      feature: 'Admin System Status',
      description: 'View system status as admin',
      preconditions: ['Admin user logged in'],
      steps: [
        'Navigate to dashboard',
        'Click System Status tab',
        'Verify agent statuses',
        'Check workflow metrics'
      ],
      expectedResult: 'System status displayed with live updates',
      apiEndpoints: ['/api/orchestrator/dashboard'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['admin', 'dashboard']
    });

    this.addTestSpec({
      id: this.generateTestId('DASH', 'WSKT'),
      type: 'positive',
      category: 'functional',
      page: 'Dashboard',
      feature: 'WebSocket Updates',
      description: 'Receive real-time orchestrator updates',
      preconditions: ['Admin user', 'WebSocket connected'],
      steps: [
        'View System Status tab',
        'Trigger background job',
        'Monitor status updates'
      ],
      expectedResult: 'Status updates in real-time',
      priority: 'P2',
      automationStatus: 'manual',
      tags: ['websocket', 'real-time']
    });
  }

  generateBookmarksTests() {
    // CRUD Operations
    this.addTestSpec({
      id: this.generateTestId('BOOK', 'FORM'),
      type: 'positive',
      category: 'functional',
      page: 'Bookmarks',
      feature: 'Add Bookmark',
      description: 'Add new bookmark with all fields',
      preconditions: ['User logged in'],
      steps: [
        'Navigate to /bookmarks',
        'Click Add Bookmark button',
        'Fill URL: https://example.com',
        'Fill Title: Example Site',
        'Fill Description: Test bookmark',
        'Add Tags: test, example',
        'Click Save'
      ],
      expectedResult: 'Bookmark created and displayed in list',
      testData: {
        url: 'https://example.com',
        title: 'Example Site',
        description: 'Test bookmark',
        tags: ['test', 'example']
      },
      apiEndpoints: ['/api/bookmarks'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['crud', 'bookmark', 'smoke']
    });

    this.addTestSpec({
      id: this.generateTestId('BOOK', 'VALD'),
      type: 'negative',
      category: 'validation',
      page: 'Bookmarks',
      feature: 'URL Validation',
      description: 'Invalid URL format rejection',
      preconditions: ['Add bookmark modal open'],
      steps: [
        'Enter invalid URL: not-a-url',
        'Attempt to save'
      ],
      expectedResult: 'URL validation error shown',
      testData: {
        invalidUrls: ['not-a-url', 'http://', 'ftp://invalid']
      },
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['validation', 'negative']
    });

    this.addTestSpec({
      id: this.generateTestId('BOOK', 'SRCH'),
      type: 'positive',
      category: 'functional',
      page: 'Bookmarks',
      feature: 'Search',
      description: 'Search bookmarks by title',
      preconditions: ['Multiple bookmarks exist'],
      steps: [
        'Enter search term in search box',
        'Press Enter or wait for debounce',
        'View filtered results'
      ],
      expectedResult: 'Only matching bookmarks displayed',
      apiEndpoints: ['/api/bookmarks?search=term'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['search', 'filter']
    });

    this.addTestSpec({
      id: this.generateTestId('BOOK', 'DEL'),
      type: 'positive',
      category: 'functional',
      page: 'Bookmarks',
      feature: 'Delete Bookmark',
      description: 'Delete single bookmark',
      preconditions: ['Bookmark exists'],
      steps: [
        'Click menu button on bookmark',
        'Click Delete option',
        'Confirm deletion'
      ],
      expectedResult: 'Bookmark removed from list',
      apiEndpoints: ['/api/bookmarks/:id'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['crud', 'delete']
    });

    this.addTestSpec({
      id: this.generateTestId('BOOK', 'PAGE'),
      type: 'positive',
      category: 'functional',
      page: 'Bookmarks',
      feature: 'Pagination',
      description: 'Navigate through bookmark pages',
      preconditions: ['More than 20 bookmarks exist'],
      steps: [
        'View first page',
        'Click Next button',
        'Click Previous button'
      ],
      expectedResult: 'Correct bookmarks shown for each page',
      apiEndpoints: ['/api/bookmarks?page=2'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['pagination', 'navigation']
    });
  }

  generateSearchTests() {
    this.addTestSpec({
      id: this.generateTestId('SRCH', 'SEM'),
      type: 'positive',
      category: 'functional',
      page: 'Search',
      feature: 'Semantic Search',
      description: 'Perform semantic search',
      preconditions: ['Bookmarks with embeddings exist'],
      steps: [
        'Navigate to /search',
        'Select Semantic search type',
        'Enter query: machine learning tutorials',
        'Click Search'
      ],
      expectedResult: 'Relevant results based on meaning',
      apiEndpoints: ['/api/search/semantic'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['search', 'ai', 'semantic']
    });

    this.addTestSpec({
      id: this.generateTestId('SRCH', 'FULL'),
      type: 'positive',
      category: 'functional',
      page: 'Search',
      feature: 'Full Text Search',
      description: 'Perform full text search',
      preconditions: ['Bookmarks exist'],
      steps: [
        'Select Full Text search type',
        'Enter exact terms',
        'Click Search'
      ],
      expectedResult: 'Results containing exact terms',
      apiEndpoints: ['/api/search/fulltext'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['search', 'fulltext']
    });

    this.addTestSpec({
      id: this.generateTestId('SRCH', 'SAVE'),
      type: 'positive',
      category: 'functional',
      page: 'Search',
      feature: 'Save from Search',
      description: 'Save bookmark from search results',
      preconditions: ['Search results displayed'],
      steps: [
        'Click save button on result',
        'Verify toast notification',
        'Navigate to bookmarks',
        'Verify bookmark saved'
      ],
      expectedResult: 'Bookmark saved to user collection',
      apiEndpoints: ['/api/bookmarks'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['search', 'save']
    });
  }

  generateImportTests() {
    this.addTestSpec({
      id: this.generateTestId('IMPT', 'UPLD'),
      type: 'positive',
      category: 'functional',
      page: 'Import',
      feature: 'File Upload',
      description: 'Upload bookmark HTML file',
      preconditions: ['Valid HTML bookmark file'],
      steps: [
        'Navigate to /import',
        'Drag and drop HTML file',
        'View upload progress',
        'Check completion status'
      ],
      expectedResult: 'File uploaded and processed successfully',
      testData: {
        file: 'bookmarks.html',
        size: '1MB',
        bookmarkCount: 100
      },
      apiEndpoints: ['/api/import'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['import', 'upload', 'smoke']
    });

    this.addTestSpec({
      id: this.generateTestId('IMPT', 'VALD'),
      type: 'negative',
      category: 'validation',
      page: 'Import',
      feature: 'File Validation',
      description: 'Reject non-HTML file',
      preconditions: [],
      steps: [
        'Attempt to upload PDF file',
        'View error message'
      ],
      expectedResult: 'Error: Only HTML files accepted',
      testData: {
        invalidFiles: ['document.pdf', 'image.jpg', 'data.json']
      },
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['validation', 'import']
    });

    this.addTestSpec({
      id: this.generateTestId('IMPT', 'PROG'),
      type: 'positive',
      category: 'functional',
      page: 'Import',
      feature: 'Progress Tracking',
      description: 'Track import progress',
      preconditions: ['Large file uploaded'],
      steps: [
        'Upload file with 1000+ bookmarks',
        'Monitor progress bar',
        'Check phase updates',
        'Verify completion'
      ],
      expectedResult: 'Progress updates in real-time',
      priority: 'P1',
      automationStatus: 'manual',
      tags: ['import', 'progress', 'websocket']
    });

    this.addTestSpec({
      id: this.generateTestId('IMPT', 'HIST'),
      type: 'positive',
      category: 'functional',
      page: 'Import',
      feature: 'Import History',
      description: 'View import history',
      preconditions: ['Previous imports exist'],
      steps: [
        'View import history section',
        'Check file names',
        'Check import dates',
        'Check bookmark counts'
      ],
      expectedResult: 'Complete import history displayed',
      apiEndpoints: ['/api/import/history'],
      priority: 'P2',
      automationStatus: 'automated',
      tags: ['import', 'history']
    });
  }

  generateCollectionsTests() {
    this.addTestSpec({
      id: this.generateTestId('COLL', 'CRUD'),
      type: 'positive',
      category: 'functional',
      page: 'Collections',
      feature: 'Create Collection',
      description: 'Create new collection',
      preconditions: ['User logged in'],
      steps: [
        'Navigate to /collections',
        'Click New Collection',
        'Enter name: My Collection',
        'Enter description',
        'Select privacy: Private',
        'Click Create'
      ],
      expectedResult: 'Collection created and displayed',
      apiEndpoints: ['/api/collections'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['collections', 'crud']
    });

    this.addTestSpec({
      id: this.generateTestId('COLL', 'SHAR'),
      type: 'positive',
      category: 'functional',
      page: 'Collections',
      feature: 'Share Collection',
      description: 'Generate and copy share link',
      preconditions: ['Collection exists'],
      steps: [
        'Click menu on collection',
        'Select Generate Share Link',
        'Copy share link',
        'Test link in new browser'
      ],
      expectedResult: 'Public share link works',
      apiEndpoints: ['/api/collections/:id/share'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['collections', 'sharing']
    });

    this.addTestSpec({
      id: this.generateTestId('COLL', 'BOOK'),
      type: 'positive',
      category: 'functional',
      page: 'Collections',
      feature: 'View Collection Bookmarks',
      description: 'Filter bookmarks by collection',
      preconditions: ['Collection with bookmarks exists'],
      steps: [
        'Click View Bookmarks on collection',
        'Verify URL changes to /bookmarks?collection=id',
        'Verify only collection bookmarks shown'
      ],
      expectedResult: 'Bookmarks filtered by collection',
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['collections', 'filter']
    });
  }

  generateTagsTests() {
    this.addTestSpec({
      id: this.generateTestId('TAGS', 'CRUD'),
      type: 'positive',
      category: 'functional',
      page: 'Tags',
      feature: 'Create Tag',
      description: 'Create new tag with color',
      preconditions: ['User logged in'],
      steps: [
        'Navigate to /tags',
        'Click New Tag',
        'Enter name: important',
        'Select color: red',
        'Click Create'
      ],
      expectedResult: 'Tag created with selected color',
      apiEndpoints: ['/api/tags'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['tags', 'crud']
    });

    this.addTestSpec({
      id: this.generateTestId('TAGS', 'COLR'),
      type: 'positive',
      category: 'functional',
      page: 'Tags',
      feature: 'Color Picker',
      description: 'Select custom color for tag',
      preconditions: ['Create tag modal open'],
      steps: [
        'Click color picker',
        'Select custom color',
        'Enter hex value',
        'Verify preview'
      ],
      expectedResult: 'Custom color applied to tag',
      priority: 'P2',
      automationStatus: 'automated',
      tags: ['tags', 'ui']
    });

    this.addTestSpec({
      id: this.generateTestId('TAGS', 'FLTR'),
      type: 'positive',
      category: 'functional',
      page: 'Tags',
      feature: 'Filter by Tag',
      description: 'View bookmarks with specific tag',
      preconditions: ['Tags with bookmarks exist'],
      steps: [
        'Click on tag chip',
        'Verify navigation to /bookmarks?tag=tagname',
        'Verify filtered bookmarks'
      ],
      expectedResult: 'Only tagged bookmarks shown',
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['tags', 'filter', 'navigation']
    });
  }

  generateSettingsTests() {
    this.addTestSpec({
      id: this.generateTestId('SETT', 'GENL'),
      type: 'positive',
      category: 'functional',
      page: 'Settings',
      feature: 'General Settings',
      description: 'Toggle dark mode',
      preconditions: ['User logged in'],
      steps: [
        'Navigate to /settings',
        'Toggle dark mode switch',
        'Verify theme changes',
        'Refresh page',
        'Verify preference persisted'
      ],
      expectedResult: 'Dark mode enabled and persisted',
      priority: 'P2',
      automationStatus: 'automated',
      tags: ['settings', 'ui', 'preferences']
    });

    this.addTestSpec({
      id: this.generateTestId('SETT', '2FA'),
      type: 'positive',
      category: 'security',
      page: 'Settings',
      feature: 'Security Settings',
      description: 'Enable 2FA',
      preconditions: ['2FA not enabled'],
      steps: [
        'Go to Security tab',
        'Click Enable 2FA',
        'Scan QR code',
        'Enter verification code',
        'Click Verify'
      ],
      expectedResult: '2FA enabled successfully',
      apiEndpoints: ['/api/auth/enable-2fa'],
      priority: 'P0',
      automationStatus: 'manual',
      tags: ['security', '2fa', 'settings']
    });

    this.addTestSpec({
      id: this.generateTestId('SETT', 'RCVR'),
      type: 'positive',
      category: 'security',
      page: 'Settings',
      feature: 'Recovery Codes',
      description: 'Generate recovery codes',
      preconditions: ['2FA enabled'],
      steps: [
        'Click Generate Recovery Codes',
        'View codes in modal',
        'Copy or download codes',
        'Confirm saved'
      ],
      expectedResult: 'Recovery codes generated and displayed',
      apiEndpoints: ['/api/auth/recovery-codes'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['security', 'recovery', '2fa']
    });

    this.addTestSpec({
      id: this.generateTestId('SETT', 'EXPT'),
      type: 'positive',
      category: 'functional',
      page: 'Settings',
      feature: 'Data Export',
      description: 'Export user data',
      preconditions: ['User has bookmarks'],
      steps: [
        'Go to Data & Storage tab',
        'Click Export Data',
        'Select format (JSON/HTML)',
        'Download file',
        'Verify file contents'
      ],
      expectedResult: 'Data exported in selected format',
      apiEndpoints: ['/api/export'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['export', 'data', 'settings']
    });
  }

  generateAdminTests() {
    this.addTestSpec({
      id: this.generateTestId('ADMN', 'AUTH'),
      type: 'negative',
      category: 'security',
      page: 'AdminDashboard',
      feature: 'Access Control',
      description: 'Non-admin access denied',
      preconditions: ['Regular user logged in'],
      steps: [
        'Navigate to /admin',
        'View access denied message'
      ],
      expectedResult: 'Access denied alert shown',
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['security', 'admin', 'authorization']
    });

    this.addTestSpec({
      id: this.generateTestId('ADMN', 'HLTH'),
      type: 'positive',
      category: 'functional',
      page: 'AdminDashboard',
      feature: 'System Health',
      description: 'View system health metrics',
      preconditions: ['Admin user logged in'],
      steps: [
        'Navigate to /admin',
        'View System Health tab',
        'Check service statuses',
        'Verify auto-refresh'
      ],
      expectedResult: 'All health metrics displayed',
      apiEndpoints: ['/api/admin/health'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['admin', 'monitoring', 'health']
    });

    this.addTestSpec({
      id: this.generateTestId('ADMN', 'LOGS'),
      type: 'positive',
      category: 'functional',
      page: 'AdminDashboard',
      feature: 'Logs Viewer',
      description: 'View and filter logs',
      preconditions: ['Admin user', 'Logs exist'],
      steps: [
        'Click Logs Viewer tab',
        'Filter by error level',
        'Search for specific term',
        'Expand log details'
      ],
      expectedResult: 'Filtered logs displayed',
      apiEndpoints: ['/api/admin/logs'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['admin', 'logs', 'monitoring']
    });

    this.addTestSpec({
      id: this.generateTestId('ADMN', 'ANLY'),
      type: 'positive',
      category: 'functional',
      page: 'AdminDashboard',
      feature: 'Log Analytics',
      description: 'View analytics charts',
      preconditions: ['Admin user', 'Historical data exists'],
      steps: [
        'Click Log Analytics tab',
        'View time series chart',
        'Check service breakdown',
        'Analyze error patterns'
      ],
      expectedResult: 'Charts render with data',
      apiEndpoints: ['/api/admin/analytics'],
      priority: 'P2',
      automationStatus: 'automated',
      tags: ['admin', 'analytics', 'charts']
    });
  }

  generateLogViewerTests() {
    this.addTestSpec({
      id: this.generateTestId('LOGV', 'STRM'),
      type: 'positive',
      category: 'functional',
      page: 'LogViewer',
      feature: 'Log Streaming',
      description: 'Stream logs in real-time',
      preconditions: ['Admin user', 'Application generating logs'],
      steps: [
        'Navigate to /logs',
        'Click Start Streaming',
        'Perform actions in app',
        'View logs appear in real-time'
      ],
      expectedResult: 'New logs appear automatically',
      apiEndpoints: ['/api/logs/stream'],
      priority: 'P1',
      automationStatus: 'manual',
      tags: ['logs', 'streaming', 'real-time']
    });

    this.addTestSpec({
      id: this.generateTestId('LOGV', 'FLTR'),
      type: 'positive',
      category: 'functional',
      page: 'LogViewer',
      feature: 'Log Filtering',
      description: 'Filter logs by multiple criteria',
      preconditions: ['Logs of various types exist'],
      steps: [
        'Select error level',
        'Select specific service',
        'Enter search term',
        'Select line count'
      ],
      expectedResult: 'Only matching logs shown',
      apiEndpoints: ['/api/logs/recent'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['logs', 'filter', 'search']
    });

    this.addTestSpec({
      id: this.generateTestId('LOGV', 'DWNL'),
      type: 'positive',
      category: 'functional',
      page: 'LogViewer',
      feature: 'Log Download',
      description: 'Download log files',
      preconditions: ['Admin user'],
      steps: [
        'Click download button for log type',
        'Save file',
        'Open and verify contents'
      ],
      expectedResult: 'Log file downloaded successfully',
      apiEndpoints: ['/api/logs/download/:filename'],
      priority: 'P2',
      automationStatus: 'automated',
      tags: ['logs', 'download', 'export']
    });
  }

  generateCrossFunctionalTests() {
    this.addTestSpec({
      id: this.generateTestId('E2E', 'USER'),
      type: 'positive',
      category: 'e2e',
      page: 'Multiple',
      feature: 'Complete User Journey',
      description: 'New user complete workflow',
      preconditions: ['Clean test environment'],
      steps: [
        'Register new account',
        'Setup 2FA',
        'Login with 2FA',
        'Add bookmarks manually',
        'Import bookmarks from file',
        'Create collections',
        'Add tags',
        'Search bookmarks',
        'Share collection',
        'Export data'
      ],
      expectedResult: 'All features work end-to-end',
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['e2e', 'smoke', 'user-journey']
    });

    this.addTestSpec({
      id: this.generateTestId('INT', 'SESS'),
      type: 'positive',
      category: 'integration',
      page: 'Multiple',
      feature: 'Session Management',
      description: 'Multiple tab session handling',
      preconditions: ['User logged in'],
      steps: [
        'Open app in multiple tabs',
        'Logout from one tab',
        'Check other tabs redirect to login',
        'Login again',
        'Verify all tabs authenticated'
      ],
      expectedResult: 'Session synchronized across tabs',
      priority: 'P1',
      automationStatus: 'manual',
      tags: ['session', 'integration', 'auth']
    });
  }

  generatePerformanceTests() {
    this.addTestSpec({
      id: this.generateTestId('PERF', 'LOAD'),
      type: 'performance',
      category: 'performance',
      page: 'Dashboard',
      feature: 'Page Load Time',
      description: 'Dashboard load performance',
      preconditions: ['1000+ bookmarks exist'],
      steps: [
        'Clear browser cache',
        'Navigate to dashboard',
        'Measure time to interactive',
        'Measure API response times'
      ],
      expectedResult: 'Load time < 3 seconds',
      metrics: {
        target: '3s',
        measurement: 'Time to Interactive'
      },
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['performance', 'load-time']
    });

    this.addTestSpec({
      id: this.generateTestId('PERF', 'SRCH'),
      type: 'performance',
      category: 'performance',
      page: 'Search',
      feature: 'Search Performance',
      description: 'Search response time with large dataset',
      preconditions: ['10000+ bookmarks in database'],
      steps: [
        'Enter search query',
        'Measure API response time',
        'Measure render time'
      ],
      expectedResult: 'Search completes < 1 second',
      metrics: {
        target: '1s',
        measurement: 'API Response + Render'
      },
      apiEndpoints: ['/api/search/semantic'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['performance', 'search', 'api']
    });

    this.addTestSpec({
      id: this.generateTestId('PERF', 'CONC'),
      type: 'performance',
      category: 'performance',
      page: 'API',
      feature: 'Concurrent Users',
      description: 'Handle multiple concurrent users',
      preconditions: ['Test environment'],
      steps: [
        'Simulate 100 concurrent users',
        'Each user performs CRUD operations',
        'Monitor response times',
        'Check error rates'
      ],
      expectedResult: 'All requests succeed, avg response < 2s',
      metrics: {
        users: 100,
        targetResponseTime: '2s',
        targetErrorRate: '< 1%'
      },
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['performance', 'load-test', 'api']
    });
  }

  generateSecurityTests() {
    this.addTestSpec({
      id: this.generateTestId('SEC', 'XSS'),
      type: 'security',
      category: 'security',
      page: 'Bookmarks',
      feature: 'XSS Prevention',
      description: 'Prevent XSS in bookmark fields',
      preconditions: [],
      steps: [
        'Add bookmark with XSS payload in title',
        'Add bookmark with script in description',
        'View bookmarks',
        'Check no script execution'
      ],
      expectedResult: 'Scripts sanitized, not executed',
      testData: {
        xssPayloads: [
          '<script>alert("XSS")</script>',
          '<img src=x onerror=alert("XSS")>',
          'javascript:alert("XSS")'
        ]
      },
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['security', 'xss', 'validation']
    });

    this.addTestSpec({
      id: this.generateTestId('SEC', 'SQLI'),
      type: 'security',
      category: 'security',
      page: 'Login',
      feature: 'SQL Injection Prevention',
      description: 'Prevent SQL injection in login',
      preconditions: [],
      steps: [
        'Enter SQL injection in email field',
        'Enter SQL injection in password',
        'Submit form',
        'Verify no SQL execution'
      ],
      expectedResult: 'Login fails safely',
      testData: {
        sqlPayloads: [
          "admin' OR '1'='1",
          "'; DROP TABLE users; --",
          "1' UNION SELECT * FROM users--"
        ]
      },
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['security', 'sql-injection', 'authentication']
    });

    this.addTestSpec({
      id: this.generateTestId('SEC', 'RATE'),
      type: 'security',
      category: 'security',
      page: 'API',
      feature: 'Rate Limiting',
      description: 'API rate limiting enforcement',
      preconditions: [],
      steps: [
        'Make 100 requests in 1 minute',
        'Verify rate limit response',
        'Wait for reset',
        'Verify access restored'
      ],
      expectedResult: 'Rate limit enforced at 100 req/min',
      apiEndpoints: ['All endpoints'],
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['security', 'rate-limit', 'api']
    });
  }

  generateAccessibilityTests() {
    this.addTestSpec({
      id: this.generateTestId('A11Y', 'KEYB'),
      type: 'accessibility',
      category: 'accessibility',
      page: 'All',
      feature: 'Keyboard Navigation',
      description: 'Navigate using keyboard only',
      preconditions: [],
      steps: [
        'Use Tab to navigate all elements',
        'Use Enter to activate buttons',
        'Use Arrow keys in menus',
        'Use Escape to close modals'
      ],
      expectedResult: 'All interactive elements accessible',
      wcagCriteria: ['2.1.1', '2.1.2'],
      priority: 'P0',
      automationStatus: 'automated',
      tags: ['accessibility', 'keyboard', 'wcag']
    });

    this.addTestSpec({
      id: this.generateTestId('A11Y', 'SCRN'),
      type: 'accessibility',
      category: 'accessibility',
      page: 'All',
      feature: 'Screen Reader',
      description: 'Screen reader compatibility',
      preconditions: ['Screen reader enabled'],
      steps: [
        'Navigate with screen reader',
        'Verify all content announced',
        'Check form labels',
        'Verify error messages',
        'Check landmark regions'
      ],
      expectedResult: 'All content properly announced',
      wcagCriteria: ['1.3.1', '4.1.2'],
      priority: 'P0',
      automationStatus: 'manual',
      tags: ['accessibility', 'screen-reader', 'wcag']
    });

    this.addTestSpec({
      id: this.generateTestId('A11Y', 'CNTR'),
      type: 'accessibility',
      category: 'accessibility',
      page: 'All',
      feature: 'Color Contrast',
      description: 'Verify color contrast ratios',
      preconditions: [],
      steps: [
        'Check text contrast ratios',
        'Check button contrast',
        'Check in light mode',
        'Check in dark mode'
      ],
      expectedResult: 'All text meets WCAG AA standards',
      wcagCriteria: ['1.4.3', '1.4.6'],
      metrics: {
        normalText: '4.5:1',
        largeText: '3:1'
      },
      priority: 'P1',
      automationStatus: 'automated',
      tags: ['accessibility', 'contrast', 'wcag']
    });
  }

  generateTestFiles() {
    const testsByPage = {};
    
    // Group tests by page
    this.testSpecs.forEach(spec => {
      const page = spec.page || 'Common';
      if (!testsByPage[page]) {
        testsByPage[page] = [];
      }
      testsByPage[page].push(spec);
    });

    // Generate test files
    const testFiles = [];
    
    Object.entries(testsByPage).forEach(([page, tests]) => {
      const fileName = `${page.toLowerCase().replace(/\s+/g, '-')}.spec.ts`;
      const content = this.generateTestFileContent(page, tests);
      
      testFiles.push({
        path: `tests/e2e/generated/${fileName}`,
        content
      });
    });

    return testFiles;
  }

  generateTestFileContent(page, tests) {
    return `import { test, expect } from '@playwright/test';
import { ${page}Page } from '../pages/${page}Page';
import { testData } from '../fixtures/test-data';

test.describe('${page} Tests', () => {
${tests.map(spec => `
  test('${spec.id}: ${spec.description}', async ({ page }) => {
    // Test ID: ${spec.id}
    // Priority: ${spec.priority}
    // Category: ${spec.category}
    // Tags: ${spec.tags.join(', ')}
    
    // Preconditions
    ${spec.preconditions.map(p => `// - ${p}`).join('\n    ')}
    
    // Test Steps
    ${spec.steps.map((step, i) => `// ${i + 1}. ${step}`).join('\n    ')}
    
    // Expected Result: ${spec.expectedResult}
    
    // TODO: Implement test
    test.skip('Not implemented');
  });
`).join('\n')}
});`;
  }

  exportToCSV() {
    const headers = [
      'Test ID',
      'Type',
      'Category',
      'Page',
      'Feature',
      'Description',
      'Priority',
      'Preconditions',
      'Steps',
      'Expected Result',
      'Test Data',
      'API Endpoints',
      'Automation Status',
      'Tags',
      'WCAG Criteria',
      'Metrics',
      'Created At',
      'Version'
    ];

    const rows = this.testSpecs.map(spec => [
      spec.id,
      spec.type,
      spec.category,
      spec.page,
      spec.feature,
      spec.description,
      spec.priority,
      (spec.preconditions || []).join('; '),
      (spec.steps || []).join('; '),
      spec.expectedResult,
      spec.testData ? JSON.stringify(spec.testData) : '',
      (spec.apiEndpoints || []).join('; '),
      spec.automationStatus,
      (spec.tags || []).join(', '),
      (spec.wcagCriteria || []).join(', '),
      spec.metrics ? JSON.stringify(spec.metrics) : '',
      spec.createdAt,
      spec.version
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }

  generateSummaryReport() {
    const summary = {
      totalTests: this.testSpecs.length,
      byType: {},
      byCategory: {},
      byPriority: {},
      byPage: {},
      byAutomationStatus: {},
      coverage: {
        pages: new Set(this.testSpecs.map(s => s.page)).size,
        features: new Set(this.testSpecs.map(s => s.feature)).size,
        apiEndpoints: new Set(this.testSpecs.flatMap(s => s.apiEndpoints || [])).size
      }
    };

    this.testSpecs.forEach(spec => {
      // Count by type
      summary.byType[spec.type] = (summary.byType[spec.type] || 0) + 1;
      
      // Count by category
      summary.byCategory[spec.category] = (summary.byCategory[spec.category] || 0) + 1;
      
      // Count by priority
      summary.byPriority[spec.priority] = (summary.byPriority[spec.priority] || 0) + 1;
      
      // Count by page
      summary.byPage[spec.page] = (summary.byPage[spec.page] || 0) + 1;
      
      // Count by automation status
      summary.byAutomationStatus[spec.automationStatus] = 
        (summary.byAutomationStatus[spec.automationStatus] || 0) + 1;
    });

    return summary;
  }
}

// Generate all test specifications
const generator = new TestSpecificationGenerator();
const allSpecs = generator.generateAllSpecs();
const testFiles = generator.generateTestFiles();
const csvExport = generator.exportToCSV();
const summary = generator.generateSummaryReport();

// Export results
export {
  allSpecs,
  testFiles,
  csvExport,
  summary
};

// Save to files
fs.writeFileSync('tests/generated/test-specifications.json', JSON.stringify(allSpecs, null, 2));
fs.writeFileSync('tests/generated/test-specifications.csv', csvExport);
fs.writeFileSync('tests/generated/test-summary.json', JSON.stringify(summary, null, 2));

// Create test files
testFiles.forEach(file => {
  const dir = path.dirname(file.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file.path, file.content);
});

console.log(`Generated ${allSpecs.length} test specifications`);
console.log(`Created ${testFiles.length} test files`);
console.log('Summary:', summary);