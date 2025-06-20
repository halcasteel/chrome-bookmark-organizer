# 🔖 Bookmark Manager Application

> **A production-grade, AI-powered bookmark management system with self-healing infrastructure**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![Node.js](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-14%2B-blue.svg)](https://www.postgresql.org/)

## 🚀 Overview

The Bookmark Manager is a full-stack web application that helps users organize, search, and manage their web bookmarks with advanced AI capabilities. Built with a **Rust microservices backend** and **React frontend**, it features autonomous self-management through the revolutionary **AI-Ops Core** infrastructure.

### Key Features

- 📥 **Smart Import**: Import bookmarks from Chrome, Firefox, and other browsers
- 🤖 **AI Categorization**: Automatic categorization using AI
- 🔍 **Semantic Search**: Find bookmarks using natural language
- 🏷️ **Smart Tagging**: Auto-tagging and tag suggestions
- 🔧 **Self-Healing**: Autonomous problem detection and resolution
- 📊 **Analytics**: Usage patterns and insights
- 🔐 **Secure**: JWT authentication with mandatory 2FA

## 📚 Documentation Structure

### 🎯 Quick Start
- [**README.md**](README.md) - You are here!
- [**CLAUDE.md**](CLAUDE.md) - AI assistant context and instructions
- [**CHECKPOINT-2025-01-19T21-15-00Z.md**](CHECKPOINT-2025-01-19T21-15-00Z.md) - Latest development checkpoint
- [**TODO-2025-01-19T21-30-00Z.md**](TODO-2025-01-19T21-30-00Z.md) - Current task list with 88 items

### 🧠 AI-Ops Core Documentation
- [**Foundation Guide**](ai-ops-core/FOUNDATION-GUIDE.md) - Complete technical reference
- [**Quick Reference**](ai-ops-core/QUICK-REFERENCE.md) - Condensed guide for quick lookups  
- [**Bookmark Integration**](ai-ops-core/BOOKMARK-INTEGRATION.md) - How AI-Ops enhances the bookmark manager
- [**Ecosystem Design**](ai-ops-core/ECOSYSTEM-DESIGN.md) - Overall system architecture

### 📖 Development Documentation
- [**Software Design Document**](docs/development/SOFTWARE-DESIGN-DOCUMENT.md) - System architecture and design
- [**Technical Design Document**](docs/development/TECHNICAL-DESIGN-DOCUMENT.md) - Technical implementation details

### 🔄 Migration Documentation
- [**Rust Migration Complete**](docs/migrations/RUST_MIGRATION_COMPLETE.md) - Node.js to Rust migration status
- [**Rust Migration Comparison**](docs/migrations/RUST_MIGRATION_COMPARISON.md) - Before/after comparison
- [**Frontend API Migration**](docs/migrations/FRONTEND-RUST-API-MIGRATION.md) - Frontend integration guide

### 📊 Analysis & Planning
- [**Detailed Analysis Plan**](docs/analysis/ANALYSIS-PLAN-DETAILED-2025-06-19.md) - Comprehensive analysis
- [**Backend Analysis**](docs/analysis/BACKEND-ANALYSIS-2025-06-19.md) - Backend architecture analysis
- [**SAREEEI Analysis Plan**](docs/planning/SAREEEI-ANALYSIS-PLAN.md) - Strategic planning framework

### 🚀 Deployment & Operations
- [**Deployment Guide**](docs/deployment/DEPLOYMENT-GUIDE.md) - Production deployment instructions
- [**GCP Setup**](docs/GCP_SETUP.md) - Google Cloud Platform configuration
- [**Logging Standards**](docs/LOGGING_STANDARDS.md) - Unified logging approach
- [**E2E Testing Guide**](docs/E2E_TESTING_GUIDE.md) - End-to-end testing documentation

### 🤖 Claude Command Palette
- [**Master Prompts**](CLAUDE-CODE-CORE-MASTER-PROMPTS/) - AI automation commands
  - [**Options Matrix**](CLAUDE-CODE-CORE-MASTER-PROMPTS/docs/OPTIONS-MATRIX.md) - Available commands
  - [**Integration Guide**](CLAUDE-CODE-CORE-MASTER-PROMPTS/docs/INTEGRATION-GUIDE.md) - How to use commands

### 🗄️ Archives
- [**Checkpoints Archive**](archive/checkpoints/) - Historical checkpoints by date
- [**TODOs Archive**](archive/todos/) - Historical TODO lists
- [**Scripts Archive**](_archive/scripts-archive/) - Deprecated scripts

## 🏗️ Project Structure

```
bookmark-manager-app/
├── frontend/                 # React TypeScript frontend
│   ├── src/                 # Source code
│   ├── public/              # Static assets
│   └── package.json         # Dependencies
│
├── backend/                 # Node.js backend (being deprecated)
│   ├── src/                 # Source code
│   └── scripts/             # Utility scripts
│
├── rust-backend/            # Rust microservices (production)
│   ├── services/            # Individual services
│   │   ├── auth/           # Authentication service (port 8001)
│   │   ├── bookmarks/      # Bookmarks CRUD (port 8002)
│   │   ├── import/         # Import service (port 8003)
│   │   ├── search/         # Search service (port 8004)
│   │   └── gateway/        # API gateway (port 8000)
│   │
│   ├── crates/             # Shared libraries
│   │   ├── ai-ops-core/    # Autonomous infrastructure
│   │   ├── domain/         # Business logic
│   │   └── shared/         # Common utilities
│   │
│   └── migrations/         # Database migrations
│
├── database/               # Database schemas and scripts
├── tests/                  # Integration tests
├── scripts/                # Development scripts
└── docs/                   # Documentation
```

## 🚦 Getting Started

### Prerequisites

- **Docker** & **Docker Compose**
- **Node.js** 18+ and npm
- **Rust** 1.75+ and Cargo
- **PostgreSQL** 14+ with pgvector
- **Redis** 6.0+

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/halcasteel/chrome-bookmark-organizer.git
   cd bookmark-manager-app
   ```

2. **Start infrastructure**
   ```bash
   node start-services.js
   ```

3. **Start Rust backend**
   ```bash
   cd rust-backend
   cargo build --release
   ./target/release/gateway
   ```

4. **Start frontend** (in another terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5173
   - API Gateway: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Default Credentials
- Email: `admin@az1.ai`
- Password: `changeme123`

## 🧪 Testing

### Running Tests
```bash
# Backend tests
cd rust-backend
cargo test

# Frontend tests
cd frontend
npm test

# E2E tests
npm run test:e2e
```

See [Testing Framework](testing-framework/) for comprehensive testing documentation.

## 🤖 AI-Ops Core

The application features a revolutionary self-managing infrastructure:

- **Autonomous Agents**: Monitor, diagnose, heal, and learn
- **Knowledge Graph**: Semantic storage of problems and solutions
- **Event Mesh**: Real-time distributed event processing
- **Continuous Learning**: Improves from every interaction

Learn more in the [AI-Ops Core Foundation Guide](ai-ops-core/FOUNDATION-GUIDE.md).

## 🛠️ Development

### Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit with your values
vim .env
```

### Key Ports
- Frontend: `5173`
- API Gateway: `8000`
- Auth Service: `8001`
- Bookmarks Service: `8002`
- Import Service: `8003`
- Search Service: `8004`
- PostgreSQL: `5434`
- Redis: `6382`

### Useful Commands
```bash
# Check service health
curl http://localhost:8000/health

# View logs
tail -f logs/unified.log

# Database access
psql -h localhost -p 5434 -U admin -d bookmark_manager
```

## 📦 Deployment

See the [Deployment Guide](docs/deployment/DEPLOYMENT-GUIDE.md) for production deployment instructions.

### Cloud Deployment
- Google Cloud Platform: [GCP Setup Guide](docs/GCP_SETUP.md)
- Custom domain setup included
- Auto-scaling configuration

## 🔒 Security

- JWT-based authentication
- Mandatory 2FA for @az1.ai domain
- Argon2 password hashing  
- Rate limiting on all endpoints
- Comprehensive audit logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with Claude AI assistance
- Powered by cutting-edge Rust and React technologies
- Special thanks to the open-source community

---

**For AI assistants**: See [CLAUDE.md](CLAUDE.md) for context and instructions when working on this project.