import { describe, it, expect } from 'vitest';
import unifiedLogger from '../../../../backend/src/services/unifiedLogger.js';

describe('Backend.Services.UnifiedLogger.Unit.Success.LogMessage', () => {
  it('should successfully log a message', () => {
    // Simple test - just verify logger exists and can log
    expect(unifiedLogger).toBeDefined();
    
    // Try to log a message - should not throw
    expect(() => {
      unifiedLogger.info('Test message from unit test');
    }).not.toThrow();
  });
  
  it('should have expected log methods', () => {
    expect(typeof unifiedLogger.info).toBe('function');
    expect(typeof unifiedLogger.error).toBe('function');
    expect(typeof unifiedLogger.warn).toBe('function');
    expect(typeof unifiedLogger.debug).toBe('function');
  });
});