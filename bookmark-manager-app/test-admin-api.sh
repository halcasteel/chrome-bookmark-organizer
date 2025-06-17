#!/bin/bash

# Get auth token
echo "1. Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@az1.ai", "password": "changeme123"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')
echo "✓ Token obtained"

# Test admin endpoints
echo -e "\n2. Testing admin/health..."
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/admin/health | jq

echo -e "\n3. Testing admin/logs..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/admin/logs?limit=5" | jq

echo -e "\n4. Testing admin/analytics..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/admin/analytics?timeRange=24h" | jq

echo -e "\n5. Testing admin/ai-insights..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/admin/ai-insights?timeRange=24h" | jq

echo -e "\n✅ Admin API tests complete!"