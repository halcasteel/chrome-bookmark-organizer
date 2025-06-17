import { io } from 'socket.io-client';

// Test WebSocket connection with authentication
const token = process.argv[2];

if (!token) {
  console.error('Please provide a JWT token as argument');
  console.error('Usage: node test-websocket-auth.js <jwt-token>');
  process.exit(1);
}

console.log('Testing WebSocket connection...');
console.log('Token:', token.substring(0, 20) + '...');

const socket = io('http://localhost:3001', {
  auth: {
    token: token
  },
  transports: ['websocket', 'polling'],
  debug: true
});

socket.on('connect', () => {
  console.log('✅ Connected successfully!');
  console.log('Socket ID:', socket.id);
});

socket.on('connection_confirmed', (data) => {
  console.log('✅ Connection confirmed:', data);
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  console.error('Error type:', error.type);
  console.error('Error data:', error.data);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

// Keep the script running
setTimeout(() => {
  console.log('Test complete. Disconnecting...');
  socket.disconnect();
  process.exit(0);
}, 5000);