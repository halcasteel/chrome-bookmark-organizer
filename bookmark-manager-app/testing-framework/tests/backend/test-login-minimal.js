/**
 * Minimal Login Test Script
 * =========================
 * Purpose: Test login functionality with minimal logging to isolate crash issue
 * Created: 2025-06-15
 * Usage: node tests/test-login-minimal.js
 */

import axios from 'axios';

async function testLogin() {
  try {
    console.log('Testing login endpoint...');
    
    const response = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@az1.ai',
      password: 'changeme123'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: function (status) {
        return status < 600; // Don't throw on any HTTP status
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    
    if (response.data.token) {
      console.log('✅ Login successful!');
      console.log('Token:', response.data.token.substring(0, 50) + '...');
    } else {
      console.log('❌ Login failed');
    }
    
  } catch (error) {
    console.error('❌ Request error:', error.message);
    if (error.code === 'ECONNRESET') {
      console.error('The backend crashed during the request');
    }
  }
}

testLogin();