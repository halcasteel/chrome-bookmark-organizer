import validationAgent from './src/agents/validationAgent.js';
import unifiedLogger from './src/services/unifiedLogger.js';

async function testValidation() {
  unifiedLogger.info('Starting direct validation test', {
    service: 'test-validation',
    method: 'testValidation'
  });
  
  try {
    const result = await validationAgent.validateUrl('https://www.az1.ai');
    
    console.log('\n=== Validation Result ===');
    console.log('URL: https://www.az1.ai');
    console.log('Is Valid:', result.isValid);
    console.log('Status Code:', result.metadata?.statusCode);
    console.log('Final URL:', result.metadata?.finalUrl);
    console.log('Redirected:', result.metadata?.redirected);
    console.log('Error:', result.metadata?.error);
    console.log('\nFull metadata:', JSON.stringify(result.metadata, null, 2));
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await validationAgent.cleanup();
    process.exit(0);
  }
}

testValidation();