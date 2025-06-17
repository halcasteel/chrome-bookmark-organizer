import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Enable global test APIs (describe, it, expect)
    globals: true,
    
    // Test environment
    environment: 'node',
    
    // Setup files
    setupFiles: ['./tests/setup/global-setup.js'],
    
    // Test match patterns
    include: [
      'tests/unit/**/*.test.js',
      'tests/integration/**/*.test.js',
      'tests/a2a/**/*.test.js',
      'backend/**/*.test.js',
      'frontend/**/*.test.{js,jsx,ts,tsx}'
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.js',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80
    },
    
    // Reporters
    reporters: ['default', 'json'],
    outputFile: {
      json: './test-results/results.json'
    },
    
    // Timeouts
    testTimeout: 60000, // Increased for validation tests with network requests
    hookTimeout: 30000,
    
    // Watch mode
    watchExclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    
    // Parallel execution
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    
    // Retry flaky tests
    retry: process.env.CI ? 2 : 0,
    
    // Aliases for cleaner imports in tests
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, './backend/src'),
      '@frontend': path.resolve(__dirname, './frontend/src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@backend': path.resolve(__dirname, './backend/src'),
      '@frontend': path.resolve(__dirname, './frontend/src')
    }
  }
});