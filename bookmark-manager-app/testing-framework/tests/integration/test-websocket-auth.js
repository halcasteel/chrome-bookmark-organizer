import { io } from 'socket.io-client';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';
const WS_URL = 'http://localhost:3001';

async function testWebSocket() {
  try {
    // Login first
    console.log('1. Logging in...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@az1.ai',
      password: 'changeme123'
    });
    
    const { token } = loginResponse.data;
    console.log('✓ Got token:', token.substring(0, 50) + '...');
    
    // Test WebSocket with different configurations
    console.log('\n2. Testing WebSocket connection...');
    
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['polling', 'websocket'], // Try polling first
      reconnection: false,
      timeout: 10000,
    });
    
    // Add all event listeners
    socket.on('connect', () => {
      console.log('✓ Connected!', socket.id);
      console.log('Transport:', socket.io.engine.transport.name);
    });
    
    socket.on('connect_error', (error) => {
      console.error('✗ Connection error:', error.message);
      console.error('Error type:', error.type);
      console.error('Error data:', error.data);
    });
    
    socket.on('error', (error) => {
      console.error('✗ Socket error:', error);
    });
    
    socket.on('connection_confirmed', (data) => {
      console.log('✓ Connection confirmed:', data);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });
    
    // Also listen to raw socket.io events
    socket.io.on('upgrade', (transport) => {
      console.log('Transport upgraded to:', transport.name);
    });
    
    socket.io.on('error', (error) => {
      console.error('Engine.IO error:', error);
    });
    
    // Wait for connection or error
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('✗ Connection timeout after 10 seconds');
        socket.disconnect();
        reject(new Error('Connection timeout'));
      }, 10000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    
    // Wait a bit to see if we get confirmation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\n✅ WebSocket test successful!');
    socket.disconnect();
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
  
  process.exit(0);
}

testWebSocket();