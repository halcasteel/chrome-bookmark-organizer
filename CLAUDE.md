# CLAUDE.md - AI Context for Bookmark Organizer Project

## 🚨 IMPORTANT: Active Development Directory
The main application is in `bookmark-manager-app/`. Always work in that directory.

To start the application:
```bash
cd bookmark-manager-app
node start-services.js  # THIS IS THE ONLY WAY TO RUN THE APP
```

## Project Overview
This repository contains a production-grade bookmark management application.

**Main Application:** `bookmark-manager-app/`
- Full-stack web application (React + Node.js)
- AI-powered classification and search
- Currently non-functional due to auth issues
- See `bookmark-manager-app/CLAUDE.md` for detailed context

**Note:** The old Python bookmark organizer scripts have been archived to `_archive-old-app/` and are not part of the active development.

## Key Reminders for AI Assistants

1. **ALWAYS** start the application with:
   ```bash
   cd bookmark-manager-app
   node start-services.js
   ```

2. **Current Issues:**
   - Authentication is broken - users cannot log in
   - This blocks access to all features
   - Check `bookmark-manager-app/CHECKPOINT.md` for status

3. **Important Ports:**
   - PostgreSQL: 5434 (not 5432)
   - Redis: 6382 (not 6379)
   - Backend API: 3001
   - Frontend: 5173

4. **Logging:**
   - All logs go to `bookmark-manager-app/logs/`
   - Use the unified logger for any new code
   - Check logs first when debugging

5. **File Organization:**
   - 127 essential files after cleanup
   - Don't create new files in root directory
   - All development happens in `bookmark-manager-app/`

