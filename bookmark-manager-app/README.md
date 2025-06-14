# Bookmark Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.17.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-blue)](https://www.postgresql.org/)

A cloud-based bookmark management system with AI-powered classification, semantic search, and automatic URL validation. Built for the @az1.ai domain with mandatory 2FA authentication.

## 🌟 Key Features

- **🔒 Secure Access**: Restricted to @az1.ai email addresses with mandatory 2FA
- **🤖 AI Classification**: Automatic categorization and tagging using OpenAI
- **🔍 Semantic Search**: Vector-based search using pgvector for finding related content
- **✅ URL Validation**: Headless browser validation with Puppeteer
- **📊 Smart Organization**: Collections, tags, and AI-generated categories
- **☁️ Cloud Native**: Deployed on Google Cloud Run with automatic scaling
- **📱 Responsive Design**: Works seamlessly across all devices
- **🔄 Auto Import**: Watch folder for automatic bookmark processing

## 📋 Documentation

- [Software Design Document (SDD)](./SDD.md) - High-level architecture and design
- [Technical Design Document (TDD)](./TDD.md) - Implementation details and code structure
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Step-by-step deployment instructions
- [Bookmark Processing](./BOOKMARK_PROCESSING.md) - URL validation and AI classification
- [Logging Standards](./LOGGING_STANDARDS.md) - Application logging guidelines
- [TODO List](./TODO-LIST-with-CHECKBOXES.md) - Development roadmap and tasks

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript (strict mode)
- **Chakra UI** for modern, accessible components
- **Vite** for fast development and building
- **Axios** for API communication
- **React Router** for navigation

### Backend
- **Node.js 20+** with ES6 modules
- **Express 4** web framework
- **PostgreSQL 15** with **pgvector** extension
- **Puppeteer** for URL validation
- **OpenAI API** for embeddings and classification
- **Winston** for structured logging
- **JWT** + **Speakeasy** for auth & 2FA

### Infrastructure
- **Google Cloud Run** for serverless deployment
- **Cloud SQL** for managed PostgreSQL
- **Cloud Storage** for file uploads
- **Docker** for containerization
- **GitHub Actions** for CI/CD

## 🚀 Quick Start

### Prerequisites

- Node.js 20.17.0 or higher
- PostgreSQL 15+ with pgvector extension
- Docker and Docker Compose
- Google Cloud SDK (for deployment)
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/bookmark-manager.git
   cd bookmark-manager
   ```

2. **Set up the database**
   ```bash
   ./scripts/setup-local-db.sh
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

5. **Create admin user**
   ```bash
   node scripts/create-admin-user.js
   ```

6. **Start development server**
   ```bash
   ./scripts/start-local.sh
   ```

   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

### Running Tests

```bash
# Run all tests
npm test

# Run linting
./scripts/lint-all.sh

# Test bookmark validation
npm run validate-bookmarks:test
```

## 📁 Project Structure

```
bookmark-manager-app/
├── backend/              # Express API server
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── services/    # Business logic
│   │   ├── middleware/  # Auth, validation, etc.
│   │   └── utils/       # Logging, helpers
│   └── scripts/         # Utility scripts
├── frontend/            # React application
│   ├── src/
│   │   ├── pages/      # Route components
│   │   ├── components/ # Reusable UI components
│   │   ├── services/   # API client
│   │   └── types/      # TypeScript definitions
│   └── public/         # Static assets
├── database/           # SQL schemas and migrations
├── scripts/            # Deployment and setup scripts
└── imports/            # Bookmark import directory
```

## 🔧 Configuration

### Environment Variables

```bash
# Backend
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://admin:admin@localhost:5434/bookmark_manager
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-key

# Frontend
VITE_API_URL=http://localhost:3001/api
VITE_APP_NAME=Bookmark Manager
```

## 🚢 Deployment

### Local Development
```bash
./scripts/start-local.sh
```

### Production Deployment
```bash
# Enable GCP APIs
./scripts/enable-apis.sh

# Deploy to Cloud Run
gcloud builds submit --config cloudbuild.yaml

# Set up custom domain
./scripts/setup-custom-domain.sh
```

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

## 📝 API Documentation

### Authentication
- `POST /api/auth/register` - Register new user (@az1.ai only)
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/2fa/setup` - Setup 2FA
- `POST /api/auth/2fa/verify` - Verify 2FA code

### Bookmarks
- `GET /api/bookmarks` - List bookmarks (paginated)
- `POST /api/bookmarks` - Create new bookmark
- `PUT /api/bookmarks/:id` - Update bookmark
- `DELETE /api/bookmarks/:id` - Delete bookmark

### Search
- `POST /api/search` - Semantic search with filters
- `GET /api/search/suggest` - Search suggestions

### Import/Export
- `POST /api/import/upload` - Upload bookmarks HTML
- `GET /api/export` - Export bookmarks

## 🧪 Testing

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# E2E tests
npm run test:e2e

# Validate bookmarks
npm run validate-bookmarks sample-bookmarks.html <user-id>
```

## 📊 Monitoring

- **Logs**: Structured JSON logging with Winston
- **Metrics**: Request latency, error rates, bookmark statistics
- **Alerts**: Failed imports, dead links, authentication failures

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests and linting (`./scripts/lint-all.sh`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details

## 🙏 Acknowledgments

- OpenAI for GPT API
- Google Cloud Platform
- Puppeteer team
- pgvector contributors