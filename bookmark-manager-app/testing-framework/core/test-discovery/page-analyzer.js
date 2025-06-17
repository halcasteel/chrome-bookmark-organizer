import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

class PageAnalyzer {
  constructor() {
    this.pages = [];
    this.components = [];
    this.features = new Map();
    this.testCases = [];
  }

  async analyzeFrontend() {
    console.log('Starting frontend analysis...');
    
    // Find all page components
    const pageFiles = await glob('frontend/src/pages/**/*.tsx');
    const componentFiles = await glob('frontend/src/components/**/*.tsx');
    
    // Analyze each page
    for (const pageFile of pageFiles) {
      const pageData = await this.analyzePage(pageFile);
      this.pages.push(pageData);
    }
    
    // Analyze components
    for (const componentFile of componentFiles) {
      const componentData = await this.analyzeComponent(componentFile);
      this.components.push(componentData);
    }
    
    return {
      pages: this.pages,
      components: this.components,
      features: Array.from(this.features.entries()),
      totalTestCases: this.testCases.length
    };
  }

  async analyzePage(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const pageName = path.basename(filePath, '.tsx');
    
    // Extract features from the page
    const features = {
      forms: this.extractForms(content),
      buttons: this.extractButtons(content),
      inputs: this.extractInputs(content),
      selects: this.extractSelects(content),
      modals: this.extractModals(content),
      tables: this.extractTables(content),
      navigation: this.extractNavigation(content),
      apiCalls: this.extractAPICalls(content),
      stateManagement: this.extractStateManagement(content),
      validations: this.extractValidations(content)
    };
    
    // Generate test cases for each feature
    const testCases = this.generateTestCasesForPage(pageName, features);
    
    return {
      pageName,
      filePath,
      route: this.extractRoute(content, pageName),
      features,
      testCases,
      dependencies: this.extractDependencies(content),
      authentication: this.requiresAuth(content)
    };
  }

  async analyzeComponent(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const componentName = path.basename(filePath, '.tsx');
    
    return {
      componentName,
      filePath,
      props: this.extractProps(content),
      events: this.extractEvents(content),
      conditionalRendering: this.extractConditionalRendering(content),
      testCases: this.generateTestCasesForComponent(componentName, content)
    };
  }

  extractForms(content) {
    const forms = [];
    const formRegex = /<form[^>]*>|<Form[^>]*>/g;
    const matches = content.match(formRegex) || [];
    
    matches.forEach((match, index) => {
      const formData = {
        id: `form-${index}`,
        fields: this.extractFormFields(content, index),
        validations: this.extractFormValidations(content, index),
        submitAction: this.extractFormSubmit(content, index)
      };
      forms.push(formData);
    });
    
    return forms;
  }

  extractButtons(content) {
    const buttons = [];
    const buttonRegex = /<Button[^>]*>([^<]*)<\/Button>|<button[^>]*>([^<]*)<\/button>/g;
    let match;
    
    while ((match = buttonRegex.exec(content)) !== null) {
      buttons.push({
        text: match[1] || match[2],
        onClick: this.extractOnClick(content, match.index),
        type: this.extractButtonType(match[0]),
        disabled: match[0].includes('disabled')
      });
    }
    
    return buttons;
  }

  extractInputs(content) {
    const inputs = [];
    const inputRegex = /<Input[^>]*\/?>|<input[^>]*\/?>/g;
    let match;
    
    while ((match = inputRegex.exec(content)) !== null) {
      const inputStr = match[0];
      inputs.push({
        name: this.extractAttribute(inputStr, 'name'),
        type: this.extractAttribute(inputStr, 'type') || 'text',
        placeholder: this.extractAttribute(inputStr, 'placeholder'),
        required: inputStr.includes('required'),
        validation: this.extractInputValidation(content, match.index)
      });
    }
    
    return inputs;
  }

  extractSelects(content) {
    const selects = [];
    const selectRegex = /<Select[^>]*>|<select[^>]*>/g;
    let match;
    
    while ((match = selectRegex.exec(content)) !== null) {
      selects.push({
        name: this.extractAttribute(match[0], 'name'),
        options: this.extractSelectOptions(content, match.index),
        required: match[0].includes('required')
      });
    }
    
    return selects;
  }

  extractModals(content) {
    const modals = [];
    const modalRegex = /<Modal[^>]*>|useDisclosure\(\)/g;
    const matches = content.match(modalRegex) || [];
    
    matches.forEach((match, index) => {
      modals.push({
        id: `modal-${index}`,
        trigger: this.extractModalTrigger(content, index),
        actions: this.extractModalActions(content, index)
      });
    });
    
    return modals;
  }

  extractTables(content) {
    const tables = [];
    const tableRegex = /<Table[^>]*>|<table[^>]*>/g;
    const matches = content.match(tableRegex) || [];
    
    matches.forEach((match, index) => {
      tables.push({
        id: `table-${index}`,
        columns: this.extractTableColumns(content, index),
        actions: this.extractTableActions(content, index),
        pagination: content.includes('pagination') || content.includes('Pagination')
      });
    });
    
    return tables;
  }

  extractNavigation(content) {
    const navigation = [];
    const navRegex = /<Link[^>]*to=["']([^"']+)["'][^>]*>|navigate\(["']([^"']+)["']\)/g;
    let match;
    
    while ((match = navRegex.exec(content)) !== null) {
      navigation.push({
        route: match[1] || match[2],
        method: match[0].includes('Link') ? 'Link' : 'navigate'
      });
    }
    
    return navigation;
  }

  extractAPICalls(content) {
    const apiCalls = [];
    const apiRegex = /api\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = apiRegex.exec(content)) !== null) {
      apiCalls.push({
        method: match[1].toUpperCase(),
        endpoint: match[2],
        authentication: content.includes('Bearer') || content.includes('token')
      });
    }
    
    return apiCalls;
  }

  extractStateManagement(content) {
    const states = [];
    const stateRegex = /useState(?:<[^>]+>)?\(([^)]*)\)/g;
    let match;
    
    while ((match = stateRegex.exec(content)) !== null) {
      const stateLine = content.substring(Math.max(0, match.index - 50), match.index);
      const stateNameMatch = stateLine.match(/const\s*\[\s*(\w+)\s*,\s*set(\w+)\s*\]/);
      
      if (stateNameMatch) {
        states.push({
          name: stateNameMatch[1],
          setter: `set${stateNameMatch[2]}`,
          initialValue: match[1]
        });
      }
    }
    
    return states;
  }

  extractValidations(content) {
    const validations = [];
    const validationPatterns = [
      /validate\w+/g,
      /\w+Schema/g,
      /required:/g,
      /min:/g,
      /max:/g,
      /pattern:/g,
      /email\(/g,
      /url\(/g
    ];
    
    validationPatterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      matches.forEach(match => {
        if (!validations.includes(match)) {
          validations.push(match);
        }
      });
    });
    
    return validations;
  }

  extractRoute(content, pageName) {
    // Try to find route definition
    const routeRegex = new RegExp(`path=["']([^"']*${pageName}[^"']*)["']`, 'i');
    const match = content.match(routeRegex);
    
    if (match) {
      return match[1];
    }
    
    // Default route based on page name
    return `/${pageName.toLowerCase()}`;
  }

  extractDependencies(content) {
    const dependencies = [];
    const importRegex = /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      if (!match[1].includes('.css') && !match[1].includes('.scss')) {
        dependencies.push(match[1]);
      }
    }
    
    return dependencies;
  }

  requiresAuth(content) {
    return content.includes('PrivateRoute') || 
           content.includes('requireAuth') || 
           content.includes('useAuth') ||
           content.includes('isAuthenticated');
  }

  extractAttribute(element, attribute) {
    const regex = new RegExp(`${attribute}=["']([^"']+)["']`);
    const match = element.match(regex);
    return match ? match[1] : null;
  }

  extractFormFields(content, formIndex) {
    // Simplified extraction - would be more complex in real implementation
    return this.extractInputs(content);
  }

  extractFormValidations(content, formIndex) {
    return this.extractValidations(content);
  }

  extractFormSubmit(content, formIndex) {
    const submitRegex = /onSubmit|handleSubmit/;
    return content.match(submitRegex) ? 'hasSubmitHandler' : null;
  }

  extractOnClick(content, position) {
    const snippet = content.substring(position - 100, position + 100);
    const onClickRegex = /onClick=\{([^}]+)\}/;
    const match = snippet.match(onClickRegex);
    return match ? match[1] : null;
  }

  extractButtonType(buttonStr) {
    const typeMatch = buttonStr.match(/type=["']([^"']+)["']/);
    return typeMatch ? typeMatch[1] : 'button';
  }

  extractInputValidation(content, position) {
    const snippet = content.substring(position - 200, position + 200);
    const validations = [];
    
    if (snippet.includes('required')) validations.push('required');
    if (snippet.includes('minLength')) validations.push('minLength');
    if (snippet.includes('maxLength')) validations.push('maxLength');
    if (snippet.includes('pattern')) validations.push('pattern');
    if (snippet.includes('email')) validations.push('email');
    
    return validations;
  }

  extractSelectOptions(content, position) {
    // Simplified - would parse actual options in real implementation
    return ['option1', 'option2', 'option3'];
  }

  extractModalTrigger(content, position) {
    return 'button'; // Simplified
  }

  extractModalActions(content, position) {
    return ['confirm', 'cancel']; // Simplified
  }

  extractTableColumns(content, position) {
    return ['column1', 'column2', 'column3']; // Simplified
  }

  extractTableActions(content, position) {
    return ['edit', 'delete', 'view']; // Simplified
  }

  extractProps(content) {
    const propsRegex = /interface\s+\w+Props\s*{([^}]+)}/;
    const match = content.match(propsRegex);
    
    if (match) {
      const propsContent = match[1];
      const props = [];
      const propRegex = /(\w+)(\?)?\s*:\s*([^;]+);/g;
      let propMatch;
      
      while ((propMatch = propRegex.exec(propsContent)) !== null) {
        props.push({
          name: propMatch[1],
          required: !propMatch[2],
          type: propMatch[3].trim()
        });
      }
      
      return props;
    }
    
    return [];
  }

  extractEvents(content) {
    const events = [];
    const eventRegex = /on\w+\s*[:=]\s*(?:\([^)]*\)\s*=>|function)/g;
    let match;
    
    while ((match = eventRegex.exec(content)) !== null) {
      const eventName = match[0].split(/[:=]/)[0].trim();
      events.push(eventName);
    }
    
    return events;
  }

  extractConditionalRendering(content) {
    const conditionals = [];
    const conditionalRegex = /\{[^{}]*\?[^{}]*:[^{}]*\}|\{[^{}]*&&[^{}]*\}/g;
    const matches = content.match(conditionalRegex) || [];
    
    return matches.length;
  }

  generateTestCasesForPage(pageName, features) {
    const testCases = [];
    let testId = 1;
    
    // Generate test cases for each feature type
    features.forms.forEach((form, index) => {
      testCases.push({
        id: `${pageName}-FORM-${String(testId++).padStart(3, '0')}`,
        type: 'positive',
        category: 'form',
        description: `Submit form ${index + 1} with valid data`,
        steps: [
          'Navigate to page',
          'Fill all required fields with valid data',
          'Submit form',
          'Verify success message/redirect'
        ]
      });
      
      testCases.push({
        id: `${pageName}-FORM-${String(testId++).padStart(3, '0')}`,
        type: 'negative',
        category: 'form',
        description: `Submit form ${index + 1} with missing required fields`,
        steps: [
          'Navigate to page',
          'Leave required fields empty',
          'Attempt to submit form',
          'Verify validation errors'
        ]
      });
    });
    
    features.buttons.forEach((button, index) => {
      testCases.push({
        id: `${pageName}-BTN-${String(testId++).padStart(3, '0')}`,
        type: 'positive',
        category: 'button',
        description: `Click "${button.text}" button and verify action`,
        steps: [
          'Navigate to page',
          `Click "${button.text}" button`,
          'Verify expected action occurs'
        ]
      });
      
      if (button.disabled) {
        testCases.push({
          id: `${pageName}-BTN-${String(testId++).padStart(3, '0')}`,
          type: 'negative',
          category: 'button',
          description: `Verify "${button.text}" button is disabled when appropriate`,
          steps: [
            'Navigate to page',
            'Create conditions for button to be disabled',
            'Verify button cannot be clicked'
          ]
        });
      }
    });
    
    features.inputs.forEach((input, index) => {
      if (input.validation.length > 0) {
        testCases.push({
          id: `${pageName}-INPUT-${String(testId++).padStart(3, '0')}`,
          type: 'positive',
          category: 'input',
          description: `Enter valid data in "${input.name || `input ${index + 1}`}" field`,
          steps: [
            'Navigate to page',
            'Enter valid data matching validation rules',
            'Verify no validation errors'
          ]
        });
        
        testCases.push({
          id: `${pageName}-INPUT-${String(testId++).padStart(3, '0')}`,
          type: 'negative',
          category: 'input',
          description: `Enter invalid data in "${input.name || `input ${index + 1}`}" field`,
          steps: [
            'Navigate to page',
            'Enter data that violates validation rules',
            'Verify appropriate validation error'
          ]
        });
      }
    });
    
    features.apiCalls.forEach((api, index) => {
      testCases.push({
        id: `${pageName}-API-${String(testId++).padStart(3, '0')}`,
        type: 'positive',
        category: 'api',
        description: `${api.method} ${api.endpoint} returns success`,
        steps: [
          'Navigate to page',
          'Trigger action that calls API',
          'Verify successful response',
          'Verify UI updates correctly'
        ]
      });
      
      testCases.push({
        id: `${pageName}-API-${String(testId++).padStart(3, '0')}`,
        type: 'negative',
        category: 'api',
        description: `${api.method} ${api.endpoint} handles error`,
        steps: [
          'Navigate to page',
          'Trigger action that calls API',
          'Mock API error response',
          'Verify error is handled gracefully'
        ]
      });
    });
    
    return testCases;
  }

  generateTestCasesForComponent(componentName, content) {
    const testCases = [];
    const props = this.extractProps(content);
    const events = this.extractEvents(content);
    let testId = 1;
    
    // Props testing
    props.forEach(prop => {
      if (prop.required) {
        testCases.push({
          id: `${componentName}-PROP-${String(testId++).padStart(3, '0')}`,
          type: 'negative',
          category: 'props',
          description: `Render without required prop "${prop.name}"`,
          expectation: 'Component should show error or default state'
        });
      }
      
      testCases.push({
        id: `${componentName}-PROP-${String(testId++).padStart(3, '0')}`,
        type: 'positive',
        category: 'props',
        description: `Render with valid "${prop.name}" prop`,
        expectation: 'Component renders correctly with provided prop'
      });
    });
    
    // Event testing
    events.forEach(event => {
      testCases.push({
        id: `${componentName}-EVENT-${String(testId++).padStart(3, '0')}`,
        type: 'positive',
        category: 'events',
        description: `Trigger ${event} event`,
        expectation: 'Event handler is called with correct parameters'
      });
    });
    
    return testCases;
  }
}

export default PageAnalyzer;