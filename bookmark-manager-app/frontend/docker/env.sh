#!/bin/sh

# This script injects runtime environment variables into the built frontend
# It runs as part of the nginx startup process

# Create a runtime config file that will be loaded by the frontend
cat > /usr/share/nginx/html/config.js << EOF
window.__RUNTIME_CONFIG__ = {
  API_URL: "${VITE_API_URL:-https://bookmarks.az1.ai/api}"
};
EOF

# Also update any environment variables in the built files
# This is a fallback in case the app was built with placeholders
if [ -n "$VITE_API_URL" ]; then
  find /usr/share/nginx/html -type f -name "*.js" -exec sed -i "s|VITE_API_URL_PLACEHOLDER|$VITE_API_URL|g" {} +
fi

echo "Runtime configuration injected successfully"