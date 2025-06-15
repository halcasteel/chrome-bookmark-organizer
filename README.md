# Bookmark Manager Application

A production-grade bookmark management system with AI-powered classification, semantic search, and automatic URL validation.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.17.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-blue)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚨 Quick Start

```bash
cd bookmark-manager-app
node start-services.js  # THIS IS THE ONLY WAY TO RUN THE APP
```

**Note:** The startup script will automatically:
- Start PostgreSQL (port 5434) and Redis (port 6382) via Docker
- Run database migrations
- Start the backend API (port 3001)
- Start the frontend dev server (port 5173)
- Stream logs to both console and `logs/` directory

## ⚠️ Current Status

**The application is currently non-functional due to authentication issues.**

See [bookmark-manager-app/CHECKPOINT.md](bookmark-manager-app/CHECKPOINT.md) for current status and [bookmark-manager-app/CHECKLIST.md](bookmark-manager-app/CHECKLIST.md) for pending tasks.

## 📁 Repository Structure

```
.
├── bookmark-manager-app/      # Main application
│   ├── backend/              # Node.js/Express API
│   ├── frontend/             # React/TypeScript UI
│   ├── database/             # PostgreSQL schemas
│   ├── scripts/              # Deployment scripts
│   ├── docker-compose.yml    # Service definitions
│   ├── start-services.js     # 🚨 MAIN STARTUP SCRIPT
│   └── README.md             # Detailed documentation
├── CLAUDE.md                 # AI assistant context
└── README.md                 # This file
```

## 📋 Documentation

All documentation is in the `bookmark-manager-app/` directory:

- [README.md](bookmark-manager-app/README.md) - Detailed application documentation
- [CHECKPOINT.md](bookmark-manager-app/CHECKPOINT.md) - Current development status
- [CHECKLIST.md](bookmark-manager-app/CHECKLIST.md) - Task tracking with priorities
- [CLAUDE.md](bookmark-manager-app/CLAUDE.md) - AI assistant development context
- [UNIFIED_LOGGING_GUIDE.md](bookmark-manager-app/UNIFIED_LOGGING_GUIDE.md) - Logging system documentation

## 🛠️ Key Features

- **🔒 Secure Access**: Restricted to @az1.ai emails with mandatory 2FA
- **🤖 AI Classification**: Automatic categorization using OpenAI
- **🔍 Semantic Search**: Vector-based search with pgvector
- **✅ URL Validation**: Asynchronous validation with Puppeteer
- **📊 Smart Organization**: Collections, tags, and categories
- **📈 Unified Logging**: Comprehensive logging with real-time monitoring
- **🔄 Async Processing**: Import progress tracking via WebSockets

## 🏗️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Chakra UI
- **Backend**: Node.js 20+, Express, PostgreSQL 15, Redis
- **AI/ML**: OpenAI API, pgvector for embeddings
- **Infrastructure**: Docker, Google Cloud Run ready

## 📌 Important Notes

1. Always use `node start-services.js` to run the application
2. PostgreSQL runs on port 5434 (non-standard)
3. Redis runs on port 6382 (non-standard)
4. Check logs first when debugging: `tail -f logs/unified.log`
5. The application needs authentication fixes before it's functional

## 🗂️ Archived Content

The old Python-based bookmark organizer tools have been archived to `_archive-old-app/`. These are kept for reference only and are not part of the production application.

## 📄 License

MIT License - See LICENSE file for details.