# Backend Dockerfile
FROM node:20-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Production build
FROM base AS production
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/index.js"]

# Development build
FROM base AS development
ENV NODE_ENV=development
RUN npm install
EXPOSE 3001
CMD ["npm", "run", "dev"]