import axios from 'axios';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:3001/api';
const WS_URL = 'http://localhost:3001';

async function testAdminDashboard() {
  try {
    console.log('1. Testing login...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@az1.ai',
      password: 'changeme123'
    });
    
    const { token, user } = loginResponse.data;
    console.log('✓ Login successful:', { userId: user.id, role: user.role, email: user.email });
    
    // Set up axios with auth header
    const authAxios = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('\n2. Testing admin endpoints...');
    
    // Test health endpoint
    console.log('- Testing /admin/health...');
    const healthResponse = await authAxios.get('/admin/health');
    console.log('✓ Health status:', healthResponse.data);
    
    // Test logs endpoint
    console.log('\n- Testing /admin/logs...');
    const logsResponse = await authAxios.get('/admin/logs?limit=5');
    console.log('✓ Recent logs:', logsResponse.data.length, 'entries');
    
    // Test analytics endpoint
    console.log('\n- Testing /admin/analytics...');
    const analyticsResponse = await authAxios.get('/admin/analytics?timeRange=24h');
    console.log('✓ Analytics data:', analyticsResponse.data);
    
    // Test AI insights endpoint
    console.log('\n- Testing /admin/ai-insights...');
    const insightsResponse = await authAxios.get('/admin/ai-insights?timeRange=24h');
    console.log('✓ AI insights:', insightsResponse.data);
    
    // Test WebSocket with auth
    console.log('\n3. Testing WebSocket connection with auth...');
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        console.log('✓ WebSocket connected:', socket.id);
        resolve();
      });
      
      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        console.error('✗ WebSocket error:', error.message);
        reject(error);
      });
      
      socket.on('connection_confirmed', (data) => {
        console.log('✓ Connection confirmed:', data);
      });
    });
    
    // Disconnect WebSocket
    socket.disconnect();
    
    console.log('\n✅ All admin dashboard tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

// Run the test
testAdminDashboard().then(() => process.exit(0)).catch(() => process.exit(1));