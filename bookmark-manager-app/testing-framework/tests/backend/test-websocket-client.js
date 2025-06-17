/**
 * Test WebSocket Client
 * 
 * This script tests WebSocket connectivity with JWT authentication
 * Usage: node test-websocket-client.js <jwt-token>
 * 
 * Purpose: Debug WebSocket connection issues
 * Created: June 2025
 */

import { io } from 'socket.io-client';

// Get token from localStorage or pass it as argument
const token = process.argv[2];

if (!token) {
  console.error('Please provide JWT token as argument');
  console.error('Usage: node test-websocket-client.js <jwt-token>');
  console.error('\nTo get your token from the browser:');
  console.error('1. Open Developer Tools (F12)');
  console.error('2. Go to Application/Storage > Local Storage');
  console.error('3. Look for "token" key');
  console.error('4. Copy the value and use it as argument');
  process.exit(1);
}

console.log('Testing WebSocket connection...');
console.log('Token:', token.substring(0, 20) + '...');

const socket = io('http://localhost:3001', {
  auth: { token },
  transports: ['websocket', 'polling'],
  debug: true,
});

socket.on('connect', () => {
  console.log('✅ WebSocket connected!');
  console.log('Socket ID:', socket.id);
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.error('❌ WebSocket connection error:', error.message);
  console.error('Error type:', error.type);
  console.error('Error details:', error);
  process.exit(1);
});

// Timeout after 5 seconds
setTimeout(() => {
  console.error('❌ Connection timeout after 5 seconds');
  process.exit(1);
}, 5000);