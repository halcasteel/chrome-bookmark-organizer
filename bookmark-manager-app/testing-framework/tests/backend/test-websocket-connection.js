/**
 * WebSocket Connection Test Script
 * =================================
 * Purpose: Test WebSocket connection with authentication
 * Created: 2025-06-15
 * Usage: node tests/test-websocket-connection.js
 */

import { io } from 'socket.io-client';
import axios from 'axios';

async function testWebSocketConnection() {
  try {
    // First, get a valid token by logging in
    console.log('1. Getting authentication token...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'admin@az1.ai',
      password: 'changeme123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Got token:', token.substring(0, 30) + '...');
    
    // Now test WebSocket connection
    console.log('\n2. Connecting to WebSocket...');
    const socket = io('http://localhost:3001', {
      auth: {
        token: token
      },
      transports: ['polling'],  // Try polling only first
      reconnection: false
    });
    
    socket.on('connect', () => {
      console.log('✅ WebSocket connected!');
      console.log('Socket ID:', socket.id);
      
      // Test subscribing to import
      socket.emit('subscribe:import', 'test-import-123');
      console.log('✅ Subscribed to import updates');
      
      // Wait a bit then disconnect
      setTimeout(() => {
        socket.disconnect();
        console.log('✅ Disconnected from WebSocket');
        process.exit(0);
      }, 2000);
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error.message);
      console.error('Error type:', error.type);
      process.exit(1);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });
    
    socket.on('connection_confirmed', (data) => {
      console.log('✅ Connection confirmed:', data);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testWebSocketConnection();