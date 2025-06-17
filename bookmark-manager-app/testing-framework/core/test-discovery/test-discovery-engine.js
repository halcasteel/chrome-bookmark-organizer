import fs from 'fs';
import path from 'path';
import pkg from 'glob';
const { glob } = pkg;
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { unifiedLogger } from '../../../backend/src/services/unifiedLogger.js';

class TestDiscoveryEngine {
  constructor() {
    this.features = new Map();
    this.testCases = [];
    this.coverage = new Map();
    this.frontendPages = [];
    this.backendRoutes = [];
    this.components = [];
    this.logger = unifiedLogger.child({ service: 'test-discovery' });
  }

  async discoverAll() {
    this.logger.info('Starting comprehensive test discovery');
    
    await this.discoverFrontendFeatures();
    await this.discoverBackendFeatures();
    await this.discoverDatabaseFeatures();
    await this.mapFeaturesToTests();
    await this.generateTestSpecifications();
    
    return this.generateReport();
  }

  async discoverFrontendFeatures() {
    this.logger.info('Discovering frontend features');
    
    // Find all frontend pages
    const pageFiles = await glob('frontend/src/pages/**/*.tsx');
    
    for (const file of pageFiles) {
      const content = await fs.promises.readFile(file, 'utf8');
      const pageName = path.basename(file, '.tsx');
      
      const features = await this.extractFrontendFeatures(content, file);
      this.frontendPages.push({
        name: pageName,
        path: file,
        features,
        testableElements: this.identifyTestableElements(content)
      });
    }
    
    // Find all components
    const componentFiles = await glob('frontend/src/components/**/*.tsx');
    
    for (const file of componentFiles) {
      const content = await fs.promises.readFile(file, 'utf8');
      const componentName = path.basename(file, '.tsx');
      
      this.components.push({
        name: componentName,
        path: file,
        props: this.extractProps(content),
        events: this.extractEvents(content),
        states: this.extractStates(content)
      });
    }
  }

  async discoverBackendFeatures() {
    this.logger.info('Discovering backend features');
    
    // Find all route files
    const routeFiles = await glob('backend/src/routes/**/*.js');
    
    for (const file of routeFiles) {
      const content = await fs.promises.readFile(file, 'utf8');
      const routes = this.extractRoutes(content);
      
      this.backendRoutes.push(...routes.map(route => ({
        ...route,
        file,
        middleware: this.extractMiddleware(content, route.handler),
        validations: this.extractValidations(content, route.handler)
      })));
    }
    
    // Find all service files
    const serviceFiles = await glob('backend/src/services/**/*.js');
    
    for (const file of serviceFiles) {
      const content = await fs.promises.readFile(file, 'utf8');
      const serviceName = path.basename(file, '.js');
      
      const methods = this.extractServiceMethods(content);
      this.features.set(`service.${serviceName}`, {
        type: 'backend-service',
        path: file,
        methods,
        dependencies: this.extractDependencies(content)
      });
    }
  }

  async discoverDatabaseFeatures() {
    this.logger.info('Discovering database features');
    
    // Read schema files
    const schemaFiles = await glob('database/**/*.sql');
    
    for (const file of schemaFiles) {
      const content = await fs.promises.readFile(file, 'utf8');
      const tables = this.extractTables(content);
      
      tables.forEach(table => {
        this.features.set(`db.${table.name}`, {
          type: 'database',
          path: file,
          table,
          operations: ['create', 'read', 'update', 'delete', 'query']
        });
      });
    }
  }

  extractFrontendFeatures(content, filePath) {
    const features = [];
    
    // Extract form submissions
    const formMatches = content.matchAll(/onSubmit={([^}]+)}/g);
    for (const match of formMatches) {
      features.push({
        type: 'form-submission',
        handler: match[1],
        testTypes: ['validation', 'success', 'error', 'edge-cases']
      });
    }
    
    // Extract button clicks
    const clickMatches = content.matchAll(/onClick={([^}]+)}/g);
    for (const match of clickMatches) {
      features.push({
        type: 'button-click',
        handler: match[1],
        testTypes: ['enabled', 'disabled', 'loading', 'error']
      });
    }
    
    // Extract API calls
    const apiMatches = content.matchAll(/api\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g);
    for (const match of apiMatches) {
      features.push({
        type: 'api-call',
        method: match[1],
        endpoint: match[2],
        testTypes: ['success', 'error', 'timeout', 'validation']
      });
    }
    
    // Extract state management
    const stateMatches = content.matchAll(/useState<([^>]+)>/g);
    for (const match of stateMatches) {
      features.push({
        type: 'state',
        stateType: match[1],
        testTypes: ['initial', 'update', 'reset', 'edge-cases']
      });
    }
    
    return features;
  }

  identifyTestableElements(content) {
    const elements = [];
    
    // Input fields
    const inputMatches = content.matchAll(/<(Input|TextField|Select|Checkbox|Radio|Switch)[^>]*>/g);
    for (const match of inputMatches) {
      elements.push({
        type: match[1].toLowerCase(),
        tests: ['empty', 'valid', 'invalid', 'edge-cases', 'accessibility']
      });
    }
    
    // Forms
    if (content.includes('<form') || content.includes('<Form')) {
      elements.push({
        type: 'form',
        tests: ['submission', 'validation', 'reset', 'error-handling']
      });
    }
    
    // Lists and tables
    if (content.includes('.map(') && (content.includes('<li') || content.includes('<tr'))) {
      elements.push({
        type: 'list',
        tests: ['empty', 'single-item', 'multiple-items', 'pagination', 'sorting']
      });
    }
    
    // Modals and dialogs
    if (content.includes('Modal') || content.includes('Dialog')) {
      elements.push({
        type: 'modal',
        tests: ['open', 'close', 'confirm', 'cancel', 'escape-key']
      });
    }
    
    return elements;
  }

  extractRoutes(content) {
    const routes = [];
    const routePatterns = [
      /router\.(get|post|put|delete|patch)\(['"]([^'"]+)['"],\s*([^,\s]+)/g,
      /app\.(get|post|put|delete|patch)\(['"]([^'"]+)['"],\s*([^,\s]+)/g
    ];
    
    for (const pattern of routePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        routes.push({
          method: match[1].toUpperCase(),
          path: match[2],
          handler: match[3],
          tests: this.generateRouteTests(match[1], match[2])
        });
      }
    }
    
    return routes;
  }

  generateRouteTests(method, path) {
    const tests = [
      { type: 'success', description: `${method} ${path} returns success response` },
      { type: 'auth', description: `${method} ${path} requires authentication` },
      { type: 'validation', description: `${method} ${path} validates input` },
      { type: 'error', description: `${method} ${path} handles errors properly` }
    ];
    
    // Add specific tests based on method
    switch (method.toLowerCase()) {
      case 'get':
        tests.push(
          { type: 'empty', description: 'Returns empty result set' },
          { type: 'pagination', description: 'Handles pagination correctly' }
        );
        break;
      case 'post':
        tests.push(
          { type: 'duplicate', description: 'Handles duplicate creation' },
          { type: 'invalid-data', description: 'Rejects invalid data' }
        );
        break;
      case 'put':
      case 'patch':
        tests.push(
          { type: 'not-found', description: 'Handles non-existent resource' },
          { type: 'partial-update', description: 'Handles partial updates' }
        );
        break;
      case 'delete':
        tests.push(
          { type: 'not-found', description: 'Handles non-existent resource' },
          { type: 'cascade', description: 'Handles cascade deletion' }
        );
        break;
    }
    
    return tests;
  }

  async mapFeaturesToTests() {
    this.logger.info('Mapping features to test cases');
    
    // Map frontend features to tests
    for (const page of this.frontendPages) {
      const testSuite = {
        name: `Frontend.${page.name}`,
        type: 'e2e',
        page: page.path,
        tests: []
      };
      
      // Generate tests for each feature
      for (const feature of page.features) {
        feature.testTypes.forEach(testType => {
          testSuite.tests.push({
            id: `${testSuite.name}.${feature.type}.${testType}`,
            name: `${page.name} ${feature.type} ${testType}`,
            type: testType,
            positive: this.generatePositiveTest(feature, testType),
            negative: this.generateNegativeTest(feature, testType),
            coverage: {
              frontend: true,
              backend: feature.type === 'api-call',
              database: feature.type === 'api-call'
            }
          });
        });
      }
      
      this.testCases.push(testSuite);
    }
    
    // Map backend routes to tests
    for (const route of this.backendRoutes) {
      const testSuite = {
        name: `Backend.API.${route.path.replace(/[/:]/g, '_')}`,
        type: 'integration',
        route: route.path,
        tests: []
      };
      
      route.tests.forEach(test => {
        testSuite.tests.push({
          id: `${testSuite.name}.${test.type}`,
          name: test.description,
          type: test.type,
          positive: this.generatePositiveAPITest(route, test),
          negative: this.generateNegativeAPITest(route, test),
          coverage: {
            frontend: false,
            backend: true,
            database: true
          }
        });
      });
      
      this.testCases.push(testSuite);
    }
  }

  generatePositiveTest(feature, testType) {
    const test = {
      description: `Should successfully handle ${feature.type} - ${testType}`,
      steps: [],
      assertions: []
    };
    
    switch (feature.type) {
      case 'form-submission':
        test.steps = [
          'Fill all required fields with valid data',
          'Submit the form',
          'Wait for response'
        ];
        test.assertions = [
          'Form submits without errors',
          'Success message is displayed',
          'Data is saved correctly'
        ];
        break;
      case 'api-call':
        test.steps = [
          'Prepare valid request data',
          'Make API call',
          'Process response'
        ];
        test.assertions = [
          'Returns 2xx status code',
          'Response has expected structure',
          'Data is correctly processed'
        ];
        break;
      // Add more cases...
    }
    
    return test;
  }

  generateNegativeTest(feature, testType) {
    const test = {
      description: `Should handle ${feature.type} errors - ${testType}`,
      steps: [],
      assertions: []
    };
    
    switch (feature.type) {
      case 'form-submission':
        test.steps = [
          'Leave required fields empty or with invalid data',
          'Attempt to submit the form',
          'Check error handling'
        ];
        test.assertions = [
          'Form does not submit',
          'Validation errors are displayed',
          'No data is saved'
        ];
        break;
      case 'api-call':
        test.steps = [
          'Prepare invalid request data',
          'Make API call',
          'Handle error response'
        ];
        test.assertions = [
          'Returns 4xx status code',
          'Error message is descriptive',
          'No side effects occur'
        ];
        break;
      // Add more cases...
    }
    
    return test;
  }

  generatePositiveAPITest(route, test) {
    return {
      description: test.description,
      request: {
        method: route.method,
        path: route.path,
        headers: { 'Authorization': 'Bearer valid-token' },
        body: this.generateValidRequestBody(route)
      },
      expectedResponse: {
        status: route.method === 'POST' ? 201 : 200,
        body: { success: true }
      }
    };
  }

  generateNegativeAPITest(route, test) {
    return {
      description: `${test.description} - negative case`,
      request: {
        method: route.method,
        path: route.path,
        headers: test.type === 'auth' ? {} : { 'Authorization': 'Bearer valid-token' },
        body: this.generateInvalidRequestBody(route, test.type)
      },
      expectedResponse: {
        status: this.getExpectedErrorStatus(test.type),
        body: { error: true }
      }
    };
  }

  getExpectedErrorStatus(testType) {
    const statusMap = {
      'auth': 401,
      'validation': 400,
      'not-found': 404,
      'duplicate': 409,
      'error': 500
    };
    return statusMap[testType] || 400;
  }

  generateValidRequestBody(route) {
    // Generate valid request body based on route
    if (route.path.includes('bookmark')) {
      return {
        url: 'https://example.com',
        title: 'Example Bookmark',
        description: 'Test bookmark'
      };
    }
    // Add more cases...
    return {};
  }

  generateInvalidRequestBody(route, testType) {
    // Generate invalid request body based on test type
    if (testType === 'validation') {
      return { invalid: 'data' };
    }
    return {};
  }

  async generateTestSpecifications() {
    this.logger.info('Generating test specifications');
    
    const specifications = {
      timestamp: new Date().toISOString(),
      summary: {
        totalFeatures: this.features.size,
        totalTestCases: this.testCases.reduce((sum, suite) => sum + suite.tests.length, 0),
        frontendPages: this.frontendPages.length,
        backendRoutes: this.backendRoutes.length,
        components: this.components.length
      },
      testSuites: this.testCases,
      coverage: this.calculateCoverage()
    };
    
    // Save specifications
    await fs.promises.writeFile(
      path.join('testing-framework', 'test-specifications.json'),
      JSON.stringify(specifications, null, 2)
    );
    
    return specifications;
  }

  calculateCoverage() {
    const coverage = {
      frontend: {
        pages: this.frontendPages.length,
        components: this.components.length,
        features: this.frontendPages.reduce((sum, page) => sum + page.features.length, 0)
      },
      backend: {
        routes: this.backendRoutes.length,
        services: Array.from(this.features.values()).filter(f => f.type === 'backend-service').length
      },
      database: {
        tables: Array.from(this.features.values()).filter(f => f.type === 'database').length
      }
    };
    
    return coverage;
  }

  generateReport() {
    const report = {
      discoveryComplete: true,
      timestamp: new Date().toISOString(),
      summary: {
        featuresDiscovered: this.features.size,
        testCasesGenerated: this.testCases.reduce((sum, suite) => sum + suite.tests.length, 0),
        coverage: this.calculateCoverage()
      },
      recommendations: this.generateRecommendations()
    };
    
    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    
    // Check for untested features
    const untestedFeatures = Array.from(this.features.entries())
      .filter(([key, feature]) => !this.hasTestsForFeature(key));
    
    if (untestedFeatures.length > 0) {
      recommendations.push({
        priority: 'high',
        type: 'missing-tests',
        message: `${untestedFeatures.length} features lack test coverage`,
        features: untestedFeatures.map(([key]) => key)
      });
    }
    
    // Check for components without tests
    const untestedComponents = this.components.filter(c => !this.hasTestsForComponent(c.name));
    if (untestedComponents.length > 0) {
      recommendations.push({
        priority: 'medium',
        type: 'component-tests',
        message: `${untestedComponents.length} components need unit tests`,
        components: untestedComponents.map(c => c.name)
      });
    }
    
    return recommendations;
  }

  hasTestsForFeature(featureKey) {
    return this.testCases.some(suite => 
      suite.tests.some(test => test.id.includes(featureKey))
    );
  }

  hasTestsForComponent(componentName) {
    return this.testCases.some(suite => 
      suite.name.includes(componentName)
    );
  }

  // Helper methods for parsing
  extractProps(content) {
    const propsMatch = content.match(/interface\s+\w+Props\s*{([^}]+)}/);
    if (propsMatch) {
      return propsMatch[1].split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(line => {
          const [name, type] = line.split(':').map(s => s.trim());
          return { name, type: type?.replace(';', '') };
        })
        .filter(prop => prop.name);
    }
    return [];
  }

  extractEvents(content) {
    const events = [];
    const eventPatterns = [
      /on\w+:\s*\([^)]*\)\s*=>\s*[^;]+/g,
      /on\w+={[^}]+}/g
    ];
    
    for (const pattern of eventPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const eventName = match[0].match(/on(\w+)/)?.[1];
        if (eventName) {
          events.push(eventName);
        }
      }
    }
    
    return [...new Set(events)];
  }

  extractStates(content) {
    const states = [];
    const stateMatches = content.matchAll(/const\s*\[(\w+),\s*set\w+\]\s*=\s*useState/g);
    
    for (const match of stateMatches) {
      states.push(match[1]);
    }
    
    return states;
  }

  extractMiddleware(content, handlerName) {
    // Extract middleware used before the handler
    const middlewarePattern = new RegExp(`(\\w+(?:,\\s*\\w+)*),\\s*${handlerName}`, 'g');
    const match = content.match(middlewarePattern);
    
    if (match) {
      return match[1].split(',').map(m => m.trim());
    }
    
    return [];
  }

  extractValidations(content, handlerName) {
    // Look for validation schemas or validation logic
    const validations = [];
    
    // Check for Joi/Yup schemas
    if (content.includes('Joi.') || content.includes('yup.')) {
      validations.push('schema-validation');
    }
    
    // Check for express-validator
    if (content.includes('body(') || content.includes('param(')) {
      validations.push('express-validator');
    }
    
    return validations;
  }

  extractServiceMethods(content) {
    const methods = [];
    const methodPattern = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g;
    const matches = content.matchAll(methodPattern);
    
    for (const match of matches) {
      if (!['constructor', 'if', 'for', 'while', 'switch'].includes(match[1])) {
        methods.push(match[1]);
      }
    }
    
    return methods;
  }

  extractDependencies(content) {
    const dependencies = [];
    const importMatches = content.matchAll(/import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g);
    
    for (const match of importMatches) {
      dependencies.push(match[1]);
    }
    
    return dependencies;
  }

  extractTables(content) {
    const tables = [];
    const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([^;]+)\)/gi;
    const matches = content.matchAll(tablePattern);
    
    for (const match of matches) {
      const tableName = match[1];
      const columns = match[2].split(',').map(col => {
        const parts = col.trim().split(/\s+/);
        return {
          name: parts[0],
          type: parts[1],
          constraints: parts.slice(2).join(' ')
        };
      });
      
      tables.push({
        name: tableName,
        columns
      });
    }
    
    return tables;
  }
}

export default TestDiscoveryEngine;