# CLAUDE.md - AI Assistant Context for Bookmark Manager Application

**Last Updated**: June 18, 2025 - 03:45 AM

## Project Overview
This is a production-grade bookmark management application with AI-powered features, built with React/TypeScript frontend and Node.js/Express backend. The application is designed for the @az1.ai domain with mandatory 2FA authentication.

## 🚨 IMPORTANT: Rust Migration In Progress
A Rust microservices platform is being built to replace this Node.js backend:
- **Rust Project Location**: `/home/halcasteel/RUST-ACTIX-MIGRATION/`
- **Rust Documentation**: `/home/halcasteel/RUST-ACTIX-MIGRATION/CLAUDE.md`
- **Status**: Auth service complete, other services in development
- **GitHub**: https://github.com/AZ1-ai/bookmark-manager

Both applications share the same PostgreSQL database (port 5434).

## 🚨 CRITICAL: How to Run the Application

**ALWAYS use the unified startup script:**
```bash
node start-services.js
```

This script is the **ONLY** supported way to start the application. It handles:
- Docker container orchestration (PostgreSQL on 5434, Redis on 6382)
- Health checks and dependency management
- Database migrations
- Service startup with proper logging
- Real-time progress monitoring
- Graceful error handling

**Never start services individually** - the startup script ensures proper initialization order and dependency management.

## Help Commands
- The project includes a comprehensive CLAUDE command palette with powerful automation commands
- Use `#HELP` to display all available commands
- Available commands include:
  - `#FIX:` - Diagnose and fix issues automatically
  - `#REVIEW` - Comprehensive code review with AI
  - `#DEBUG` - Interactive debugging assistant
  - `#SHIP` - Complete deployment pipeline
  - `#MONITOR` - Real-time system monitoring
  - `#PERF` - Performance analysis and optimization
  - And many more detailed in the command palette documentation

## Next Autonomous Trigger Configuration Tasks
1. Configure autonomous trigger patterns from CLAUDE-CODE-CORE-MASTER-PROMPTS
2. Implement automated command routing
3. Create trigger mappings for different project phases
4. Set up advanced AI-driven task prioritization
5. Develop context-aware command execution framework

## Remaining Content
(Rest of the previous file content remains the same)