import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Comprehensive Test Plan Generator
 * Generates complete test coverage for the entire application
 */
class ComprehensiveTestPlanGenerator {
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.testCounter = 0;
    this.testPlan = {
      name: 'Bookmark Manager Comprehensive Test Plan',
      version: '1.0.0',
      scope: 'Full application testing including all layers, modules, and integrations',
      objectives: [
        'Verify all functional requirements',
        'Validate performance under load',
        'Ensure security compliance',
        'Test accessibility standards',
        'Validate data integrity',
        'Verify error handling'
      ]
    };
  }

  async generateComprehensiveTestPlan() {
    console.log('🚀 Generating Comprehensive Test Plan...\n');
    
    const testSuites = [];
    
    // Frontend Test Suites
    testSuites.push(...this.generateFrontendTestSuites());
    
    // Backend Test Suites
    testSuites.push(...this.generateBackendTestSuites());
    
    // Database Test Suites
    testSuites.push(...this.generateDatabaseTestSuites());
    
    // Integration Test Suites
    testSuites.push(...this.generateIntegrationTestSuites());
    
    // E2E Test Suites
    testSuites.push(...this.generateE2ETestSuites());
    
    // Performance Test Suites
    testSuites.push(...this.generatePerformanceTestSuites());
    
    // Security Test Suites
    testSuites.push(...this.generateSecurityTestSuites());
    
    // Accessibility Test Suites
    testSuites.push(...this.generateAccessibilityTestSuites());
    
    const totalTests = testSuites.reduce((sum, suite) => sum + suite.testCases.length, 0);
    console.log(`\n📊 Generated ${testSuites.length} test suites with ${totalTests} test cases`);
    
    // Save to database if configured
    if (this.dbConfig) {
      await this.saveToDatabase(testSuites);
    }
    
    // Save to JSON file
    this.saveToFile(testSuites);
    
    return {
      testPlan: this.testPlan,
      testSuites,
      summary: {
        totalSuites: testSuites.length,
        totalTests,
        byLayer: this.summarizeByLayer(testSuites),
        byType: this.summarizeByType(testSuites),
        byPriority: this.summarizeByPriority(testSuites)
      }
    };
  }

  generateFrontendTestSuites() {
    const suites = [];
    const pages = [
      'Login', 'Register', 'Dashboard', 'Bookmarks', 'Collections', 
      'Tags', 'Search', 'Import', 'Settings', 'AdminDashboard'
    ];
    
    const components = [
      'Header', 'Sidebar', 'BookmarkCard', 'CollectionList', 'TagCloud',
      'SearchBar', 'ImportModal', 'UserMenu', 'Pagination', 'FilterPanel'
    ];
    
    // Page Tests
    pages.forEach(page => {
      const suite = {
        id: crypto.randomUUID(),
        name: `Frontend - ${page} Page Tests`,
        layer: 'frontend',
        module: page,
        priority: ['Login', 'Dashboard', 'Bookmarks'].includes(page) ? 'critical' : 'high',
        testCases: []
      };
      
      // Component Rendering Tests
      suite.testCases.push(this.createTestCase({
        name: `${page} page renders correctly`,
        type: 'unit',
        category: 'positive',
        steps: [
          `Navigate to ${page} page`,
          'Verify page loads without errors',
          'Check all expected elements are present'
        ]
      }));
      
      // State Management Tests
      suite.testCases.push(this.createTestCase({
        name: `${page} state management works correctly`,
        type: 'unit',
        category: 'positive',
        steps: [
          'Initialize page state',
          'Perform state mutations',
          'Verify state updates correctly'
        ]
      }));
      
      // Form Validation Tests (if applicable)
      if (['Login', 'Register', 'Settings', 'Import'].includes(page)) {
        suite.testCases.push(this.createTestCase({
          name: `${page} form validation - empty fields`,
          type: 'functional',
          category: 'negative',
          steps: [
            'Leave required fields empty',
            'Submit form',
            'Verify validation errors display'
          ]
        }));
        
        suite.testCases.push(this.createTestCase({
          name: `${page} form validation - invalid data`,
          type: 'functional',
          category: 'negative',
          steps: [
            'Enter invalid data formats',
            'Submit form',
            'Verify appropriate error messages'
          ]
        }));
      }
      
      // API Integration Tests
      suite.testCases.push(this.createTestCase({
        name: `${page} API calls succeed`,
        type: 'integration',
        category: 'positive',
        steps: [
          'Trigger API call from page',
          'Verify request is sent correctly',
          'Verify response is handled properly'
        ]
      }));
      
      // Error Handling Tests
      suite.testCases.push(this.createTestCase({
        name: `${page} handles API errors gracefully`,
        type: 'integration',
        category: 'negative',
        steps: [
          'Trigger API call that will fail',
          'Verify error message displays',
          'Verify page remains functional'
        ]
      }));
      
      // Responsive Design Tests
      suite.testCases.push(this.createTestCase({
        name: `${page} responsive design - mobile`,
        type: 'functional',
        category: 'positive',
        steps: [
          'Resize viewport to mobile size',
          'Verify layout adjusts correctly',
          'Verify all functionality remains accessible'
        ]
      }));
      
      suites.push(suite);
    });
    
    // Component Tests
    components.forEach(component => {
      const suite = {
        id: crypto.randomUUID(),
        name: `Frontend - ${component} Component Tests`,
        layer: 'frontend',
        module: component,
        priority: 'medium',
        testCases: []
      };
      
      // Props Tests
      suite.testCases.push(this.createTestCase({
        name: `${component} renders with default props`,
        type: 'unit',
        category: 'positive',
        steps: [
          'Render component with minimal props',
          'Verify component renders without errors',
          'Verify default behavior'
        ]
      }));
      
      // Event Handler Tests
      suite.testCases.push(this.createTestCase({
        name: `${component} event handlers work correctly`,
        type: 'unit',
        category: 'positive',
        steps: [
          'Render component',
          'Trigger user events',
          'Verify handlers are called with correct data'
        ]
      }));
      
      suites.push(suite);
    });
    
    return suites;
  }

  generateBackendTestSuites() {
    const suites = [];
    
    // API Endpoint Tests
    const endpoints = [
      { path: '/auth/login', methods: ['POST'] },
      { path: '/auth/logout', methods: ['POST'] },
      { path: '/auth/verify-2fa', methods: ['POST'] },
      { path: '/bookmarks', methods: ['GET', 'POST'] },
      { path: '/bookmarks/:id', methods: ['GET', 'PUT', 'DELETE'] },
      { path: '/collections', methods: ['GET', 'POST'] },
      { path: '/collections/:id', methods: ['GET', 'PUT', 'DELETE'] },
      { path: '/tags', methods: ['GET', 'POST'] },
      { path: '/search', methods: ['GET', 'POST'] },
      { path: '/import', methods: ['POST'] },
      { path: '/admin/users', methods: ['GET'] },
      { path: '/admin/stats', methods: ['GET'] }
    ];
    
    endpoints.forEach(endpoint => {
      endpoint.methods.forEach(method => {
        const suite = {
          id: crypto.randomUUID(),
          name: `Backend API - ${method} ${endpoint.path}`,
          layer: 'backend',
          module: 'API',
          priority: endpoint.path.includes('auth') ? 'critical' : 'high',
          testCases: []
        };
        
        // Success Case
        suite.testCases.push(this.createTestCase({
          name: `${method} ${endpoint.path} - successful request`,
          type: 'integration',
          category: 'positive',
          steps: [
            'Prepare valid request data',
            `Send ${method} request to ${endpoint.path}`,
            'Verify 2xx response status',
            'Verify response body structure',
            'Verify database changes (if applicable)'
          ]
        }));
        
        // Authentication Tests
        suite.testCases.push(this.createTestCase({
          name: `${method} ${endpoint.path} - unauthorized request`,
          type: 'security',
          category: 'negative',
          steps: [
            'Send request without auth token',
            'Verify 401 response',
            'Verify no data is exposed'
          ]
        }));
        
        // Validation Tests
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          suite.testCases.push(this.createTestCase({
            name: `${method} ${endpoint.path} - invalid data`,
            type: 'functional',
            category: 'negative',
            steps: [
              'Send request with invalid data',
              'Verify 400 response',
              'Verify validation error details'
            ]
          }));
        }
        
        // Rate Limiting Tests
        suite.testCases.push(this.createTestCase({
          name: `${method} ${endpoint.path} - rate limiting`,
          type: 'security',
          category: 'negative',
          steps: [
            'Send multiple requests rapidly',
            'Verify rate limit is enforced',
            'Verify 429 response when limit exceeded'
          ]
        }));
        
        suites.push(suite);
      });
    });
    
    // Service Tests
    const services = [
      'unifiedLogger', 'bookmarkImporter', 'bookmarkValidator',
      'embeddingService', 'openaiService', 'websocketService',
      'asyncProcessor', 'fileWatcher'
    ];
    
    services.forEach(service => {
      const suite = {
        id: crypto.randomUUID(),
        name: `Backend Service - ${service}`,
        layer: 'backend',
        module: 'Services',
        priority: 'high',
        testCases: []
      };
      
      // Initialization Tests
      suite.testCases.push(this.createTestCase({
        name: `${service} initializes correctly`,
        type: 'unit',
        category: 'positive',
        steps: [
          'Initialize service',
          'Verify all dependencies are loaded',
          'Verify service is ready'
        ]
      }));
      
      // Core Functionality Tests
      suite.testCases.push(this.createTestCase({
        name: `${service} core functionality works`,
        type: 'integration',
        category: 'positive',
        steps: [
          'Set up test data',
          'Execute service function',
          'Verify expected output',
          'Verify side effects'
        ]
      }));
      
      // Error Handling Tests
      suite.testCases.push(this.createTestCase({
        name: `${service} handles errors gracefully`,
        type: 'unit',
        category: 'negative',
        steps: [
          'Trigger error condition',
          'Verify error is caught',
          'Verify error is logged',
          'Verify service remains stable'
        ]
      }));
      
      suites.push(suite);
    });
    
    return suites;
  }

  generateDatabaseTestSuites() {
    const suites = [];
    const tables = [
      'users', 'bookmarks', 'bookmark_embeddings', 'tags', 
      'bookmark_tags', 'collections', 'bookmark_collections',
      'import_history', 'bookmark_metadata', 'system_logs'
    ];
    
    tables.forEach(table => {
      const suite = {
        id: crypto.randomUUID(),
        name: `Database - ${table} table`,
        layer: 'database',
        module: table,
        priority: ['users', 'bookmarks'].includes(table) ? 'critical' : 'high',
        testCases: []
      };
      
      // CRUD Operations
      ['INSERT', 'SELECT', 'UPDATE', 'DELETE'].forEach(operation => {
        suite.testCases.push(this.createTestCase({
          name: `${table} - ${operation} operations`,
          type: 'integration',
          category: 'positive',
          steps: [
            `Prepare ${operation} query`,
            'Execute query',
            'Verify operation success',
            'Verify data integrity'
          ]
        }));
      });
      
      // Constraint Tests
      suite.testCases.push(this.createTestCase({
        name: `${table} - constraint validation`,
        type: 'integration',
        category: 'negative',
        steps: [
          'Attempt to violate constraints',
          'Verify constraint error',
          'Verify data remains consistent'
        ]
      }));
      
      // Index Performance Tests
      suite.testCases.push(this.createTestCase({
        name: `${table} - index performance`,
        type: 'performance',
        category: 'positive',
        steps: [
          'Insert large dataset',
          'Execute queries using indexes',
          'Measure query performance',
          'Verify performance meets SLA'
        ]
      }));
      
      suites.push(suite);
    });
    
    return suites;
  }

  generateIntegrationTestSuites() {
    const suites = [];
    
    // Feature Integration Tests
    const features = [
      {
        name: 'User Authentication Flow',
        priority: 'critical',
        scenarios: [
          'Login with email/password',
          'Two-factor authentication',
          'Password reset',
          'Session management'
        ]
      },
      {
        name: 'Bookmark Management',
        priority: 'critical',
        scenarios: [
          'Create bookmark with AI enrichment',
          'Update bookmark with validation',
          'Delete bookmark with cleanup',
          'Search bookmarks with embeddings'
        ]
      },
      {
        name: 'Import Process',
        priority: 'high',
        scenarios: [
          'Chrome bookmarks import',
          'Large file import with progress',
          'Duplicate handling',
          'Import validation and enrichment'
        ]
      },
      {
        name: 'WebSocket Real-time Updates',
        priority: 'high',
        scenarios: [
          'Connection establishment',
          'Import progress updates',
          'Multi-client synchronization',
          'Reconnection handling'
        ]
      }
    ];
    
    features.forEach(feature => {
      const suite = {
        id: crypto.randomUUID(),
        name: `Integration - ${feature.name}`,
        layer: 'integration',
        module: feature.name,
        priority: feature.priority,
        testCases: []
      };
      
      feature.scenarios.forEach(scenario => {
        suite.testCases.push(this.createTestCase({
          name: `${feature.name} - ${scenario}`,
          type: 'integration',
          category: 'positive',
          steps: this.generateIntegrationSteps(scenario)
        }));
        
        // Add negative test
        suite.testCases.push(this.createTestCase({
          name: `${feature.name} - ${scenario} - error handling`,
          type: 'integration',
          category: 'negative',
          steps: this.generateNegativeIntegrationSteps(scenario)
        }));
      });
      
      suites.push(suite);
    });
    
    return suites;
  }

  generateE2ETestSuites() {
    const suites = [];
    
    // User Journey Tests
    const journeys = [
      {
        name: 'New User Onboarding',
        priority: 'critical',
        steps: [
          'Navigate to registration page',
          'Fill registration form',
          'Verify email',
          'Set up 2FA',
          'Complete profile',
          'Import bookmarks',
          'Explore dashboard'
        ]
      },
      {
        name: 'Power User Workflow',
        priority: 'high',
        steps: [
          'Login with 2FA',
          'Import large bookmark file',
          'Organize into collections',
          'Apply bulk tags',
          'Use advanced search',
          'Share collection',
          'Export data'
        ]
      },
      {
        name: 'Admin Management',
        priority: 'high',
        steps: [
          'Login as admin',
          'View system metrics',
          'Manage users',
          'Review logs',
          'Handle support issues',
          'Generate reports'
        ]
      }
    ];
    
    journeys.forEach(journey => {
      const suite = {
        id: crypto.randomUUID(),
        name: `E2E - ${journey.name}`,
        layer: 'e2e',
        module: journey.name,
        priority: journey.priority,
        testCases: []
      };
      
      // Happy Path
      suite.testCases.push(this.createTestCase({
        name: `${journey.name} - complete flow`,
        type: 'e2e',
        category: 'positive',
        steps: journey.steps
      }));
      
      // With Interruptions
      suite.testCases.push(this.createTestCase({
        name: `${journey.name} - with interruptions`,
        type: 'e2e',
        category: 'edge',
        steps: [
          ...journey.steps.slice(0, 3),
          'Simulate network interruption',
          'Verify graceful recovery',
          ...journey.steps.slice(3)
        ]
      }));
      
      suites.push(suite);
    });
    
    return suites;
  }

  generatePerformanceTestSuites() {
    const suites = [];
    
    const performanceScenarios = [
      {
        name: 'Page Load Performance',
        targets: ['Login', 'Dashboard', 'Bookmarks', 'Search'],
        metrics: ['First Contentful Paint', 'Time to Interactive', 'Total Load Time']
      },
      {
        name: 'API Response Times',
        targets: ['/bookmarks', '/search', '/collections'],
        metrics: ['Response Time', 'Throughput', 'Error Rate']
      },
      {
        name: 'Database Query Performance',
        targets: ['bookmark search', 'user queries', 'aggregations'],
        metrics: ['Query Time', 'CPU Usage', 'Memory Usage']
      },
      {
        name: 'Concurrent User Load',
        targets: ['10 users', '100 users', '1000 users'],
        metrics: ['Response Time', 'Error Rate', 'System Resources']
      }
    ];
    
    performanceScenarios.forEach(scenario => {
      const suite = {
        id: crypto.randomUUID(),
        name: `Performance - ${scenario.name}`,
        layer: 'performance',
        module: scenario.name,
        priority: 'high',
        testCases: []
      };
      
      scenario.targets.forEach(target => {
        scenario.metrics.forEach(metric => {
          suite.testCases.push(this.createTestCase({
            name: `${target} - measure ${metric}`,
            type: 'performance',
            category: 'positive',
            steps: [
              `Set up performance monitoring for ${metric}`,
              `Execute ${target} operation`,
              `Measure ${metric}`,
              `Verify within acceptable threshold`
            ]
          }));
        });
      });
      
      suites.push(suite);
    });
    
    return suites;
  }

  generateSecurityTestSuites() {
    const suites = [];
    
    const securityTests = [
      {
        name: 'Authentication Security',
        tests: [
          'SQL Injection in login',
          'XSS in user inputs',
          'CSRF token validation',
          'Session hijacking prevention',
          'Password strength enforcement',
          '2FA bypass attempts'
        ]
      },
      {
        name: 'Authorization Security',
        tests: [
          'Access control verification',
          'Privilege escalation attempts',
          'Direct object reference',
          'API endpoint authorization',
          'Admin function protection'
        ]
      },
      {
        name: 'Data Security',
        tests: [
          'Encryption at rest',
          'Encryption in transit',
          'Sensitive data exposure',
          'Input validation',
          'Output encoding'
        ]
      }
    ];
    
    securityTests.forEach(category => {
      const suite = {
        id: crypto.randomUUID(),
        name: `Security - ${category.name}`,
        layer: 'security',
        module: category.name,
        priority: 'critical',
        testCases: []
      };
      
      category.tests.forEach(test => {
        suite.testCases.push(this.createTestCase({
          name: test,
          type: 'security',
          category: 'negative',
          steps: this.generateSecurityTestSteps(test)
        }));
      });
      
      suites.push(suite);
    });
    
    return suites;
  }

  generateAccessibilityTestSuites() {
    const suites = [];
    
    const a11yTests = [
      {
        name: 'WCAG 2.1 Compliance',
        pages: ['Login', 'Dashboard', 'Bookmarks', 'Search'],
        criteria: [
          'Keyboard navigation',
          'Screen reader compatibility',
          'Color contrast ratios',
          'Focus indicators',
          'ARIA labels',
          'Form labels and errors'
        ]
      }
    ];
    
    a11yTests.forEach(category => {
      category.pages.forEach(page => {
        const suite = {
          id: crypto.randomUUID(),
          name: `Accessibility - ${page} Page`,
          layer: 'accessibility',
          module: page,
          priority: 'high',
          testCases: []
        };
        
        category.criteria.forEach(criterion => {
          suite.testCases.push(this.createTestCase({
            name: `${page} - ${criterion}`,
            type: 'accessibility',
            category: 'positive',
            steps: [
              `Navigate to ${page}`,
              `Test ${criterion}`,
              'Verify WCAG compliance',
              'Document any issues'
            ]
          }));
        });
        
        suites.push(suite);
      });
    });
    
    return suites;
  }

  createTestCase(params) {
    this.testCounter++;
    const testId = `TEST-${params.type.toUpperCase()}-${String(this.testCounter).padStart(4, '0')}`;
    
    return {
      id: crypto.randomUUID(),
      testId,
      name: params.name,
      type: params.type,
      category: params.category,
      steps: params.steps.map((step, index) => ({
        stepNumber: index + 1,
        description: step,
        expectedResult: 'Step completes successfully'
      })),
      priority: params.priority || 'medium',
      automated: false,
      createdBy: 'system'
    };
  }

  generateIntegrationSteps(scenario) {
    // Generate detailed steps based on scenario
    const stepMap = {
      'Login with email/password': [
        'Navigate to login page',
        'Enter valid email',
        'Enter valid password',
        'Submit login form',
        'Verify JWT token received',
        'Verify user data loaded',
        'Verify redirect to dashboard'
      ],
      'Create bookmark with AI enrichment': [
        'Authenticate user',
        'Send POST request to /bookmarks',
        'Verify bookmark created in database',
        'Verify AI enrichment job queued',
        'Wait for enrichment completion',
        'Verify AI tags added',
        'Verify embedding generated'
      ]
      // Add more scenarios...
    };
    
    return stepMap[scenario] || ['Execute scenario', 'Verify results'];
  }

  generateNegativeIntegrationSteps(scenario) {
    return [
      'Set up error condition',
      `Attempt ${scenario}`,
      'Verify error is handled',
      'Verify user sees error message',
      'Verify system remains stable',
      'Verify no data corruption'
    ];
  }

  generateSecurityTestSteps(test) {
    const stepMap = {
      'SQL Injection in login': [
        'Prepare SQL injection payloads',
        'Submit payloads in login form',
        'Verify no database errors exposed',
        'Verify login fails safely',
        'Check logs for injection attempts'
      ],
      'XSS in user inputs': [
        'Prepare XSS payloads',
        'Submit payloads in various input fields',
        'Verify scripts are not executed',
        'Verify output is properly encoded',
        'Check for Content Security Policy'
      ]
      // Add more security tests...
    };
    
    return stepMap[test] || ['Execute security test', 'Verify vulnerability not present'];
  }

  summarizeByLayer(suites) {
    const summary = {};
    suites.forEach(suite => {
      if (!summary[suite.layer]) {
        summary[suite.layer] = { suites: 0, tests: 0 };
      }
      summary[suite.layer].suites++;
      summary[suite.layer].tests += suite.testCases.length;
    });
    return summary;
  }

  summarizeByType(suites) {
    const summary = {};
    suites.forEach(suite => {
      suite.testCases.forEach(test => {
        if (!summary[test.type]) {
          summary[test.type] = 0;
        }
        summary[test.type]++;
      });
    });
    return summary;
  }

  summarizeByPriority(suites) {
    const summary = {};
    suites.forEach(suite => {
      if (!summary[suite.priority]) {
        summary[suite.priority] = { suites: 0, tests: 0 };
      }
      summary[suite.priority].suites++;
      summary[suite.priority].tests += suite.testCases.length;
    });
    return summary;
  }

  async saveToDatabase(suites) {
    console.log('\n💾 Saving test plan to database...');
    
    const client = new pg.Client(this.dbConfig);
    await client.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert test plan
      const planResult = await client.query(
        `INSERT INTO test_plans (name, version, description, scope, objectives, created_by, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING id`,
        [
          this.testPlan.name,
          this.testPlan.version,
          'Comprehensive test plan covering all aspects of the application',
          this.testPlan.scope,
          JSON.stringify(this.testPlan.objectives),
          'system',
          'approved'
        ]
      );
      
      const planId = planResult.rows[0].id;
      
      // Insert test suites and cases
      for (const suite of suites) {
        const suiteResult = await client.query(
          `INSERT INTO test_suites (plan_id, name, description, layer, module, priority)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [planId, suite.name, suite.name, suite.layer, suite.module, suite.priority]
        );
        
        const suiteId = suiteResult.rows[0].id;
        
        for (const testCase of suite.testCases) {
          await client.query(
            `INSERT INTO test_cases 
             (suite_id, test_id, name, type, category, steps, expected_results, priority, created_by)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
            [
              suiteId,
              testCase.testId,
              testCase.name,
              testCase.type,
              testCase.category,
              JSON.stringify(testCase.steps),
              JSON.stringify(testCase.steps.map(s => s.expectedResult)),
              testCase.priority,
              testCase.createdBy
            ]
          );
        }
      }
      
      await client.query('COMMIT');
      console.log('✅ Test plan saved to database');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to save to database:', error.message);
    } finally {
      await client.end();
    }
  }

  saveToFile(suites) {
    const outputPath = path.join(__dirname, '..', 'test-plans', 'comprehensive-test-plan.json');
    const outputDir = path.dirname(outputPath);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify({
      testPlan: this.testPlan,
      generatedAt: new Date().toISOString(),
      suites,
      summary: {
        totalSuites: suites.length,
        totalTests: suites.reduce((sum, suite) => sum + suite.testCases.length, 0)
      }
    }, null, 2));
    
    console.log(`\n✅ Test plan saved to: ${outputPath}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new ComprehensiveTestPlanGenerator();
  generator.generateComprehensiveTestPlan();
}

export default ComprehensiveTestPlanGenerator;