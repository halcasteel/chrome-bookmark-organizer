# Root Directory Cleanup Plan
**Date**: 2025-06-19T20:00:00-04:00
**Goal**: Clean up root without breaking anything

## Current Situation
- ✅ **Good**: All working code is properly organized in subdirectories
- ✅ **Good**: Essential config files are in root where they belong
- ❌ **Bad**: 13 documentation files cluttering root
- ❌ **Bad**: Test data and temporary files in root

## What Stays in Root (Correct as-is)
```
✅ Configuration Files:
- package.json, package-lock.json
- docker-compose.yml
- .gitignore, .eslintrc.json, .prettierrc.json
- playwright.config.js, vitest.config.js
- cloudbuild.yaml

✅ Essential Scripts:
- start-services.js (main entry point)
- deploy.sh, deploy-app.sh
- restart-clean.sh
- run-e2e-tests.sh
- setup-claude-prompts.sh

✅ Required Documentation:
- README.md (project readme)
- CLAUDE.md (AI context - tools look for this)

✅ Directories (all correctly placed):
- frontend/ → Contains React app
- rust-backend/ → Contains Rust services
- backend/ → Node.js (to be removed)
- scripts/ → Utility scripts
- docs/ → Documentation
- tests/ → Test suites
- etc.
```

## What Needs to Move

### 1. Documentation Files → docs/
```bash
# Create subdirectories
mkdir -p docs/integration docs/planning docs/checkpoints docs/reference

# Move integration docs
mv INTEGRATION-GUIDE.md docs/integration/
mv PATH-FIXES-REQUIRED.md docs/integration/
mv TODO-TDD-INTEGRATION-PLAN.md docs/integration/

# Move planning docs
mv TODO-2025-06-19-INTEGRATION.md docs/planning/
mv TODO-COMPLETE-INTEGRATION-PLAN.md docs/planning/
mv PRODUCTION-DIRECTORY-REORGANIZATION.md docs/planning/
mv ROOT-CLEANUP-PLAN.md docs/planning/

# Move checkpoints
mv CONSOLIDATION-CHECKPOINT-2025-06-19.md docs/checkpoints/

# Move reference docs
mv OPTIONS-MATRIX.md docs/reference/
mv QUICK-REFERENCE.md docs/reference/
mv STRUCTURE-ANALYSIS.md docs/reference/

# Move AI-Ops specific
mv PROJECT-CHECKLIST-AI-OPS-CORE.md ai-ops-core/
```

### 2. Test Data → imports/
```bash
mv bookmarks_6_16_25.html imports/test-data/
```

### 3. Update .gitignore
```bash
# Add these lines to .gitignore
tree.txt
tree-*.txt
*.tmp
*.temp
```

### 4. Remove Temporary Files
```bash
rm -f tree.txt tree-directories.txt
```

## After Cleanup - Root Directory Will Have:

```
bookmark-manager-app/
├── ai-ops-core/           # AI-Ops documentation
├── backend/               # Node.js (to be deprecated)
├── frontend/              # React app
├── rust-backend/          # Rust services
├── database/              # DB schemas
├── docs/                  # ALL documentation organized
├── scripts/               # Utility scripts
├── tests/                 # Test suites
├── testing-framework/     # Test infrastructure
├── imports/               # Import data
├── docker/                # Docker configs
├── node_modules/          # Dependencies
├── README.md             # Project readme
├── CLAUDE.md             # AI context
├── package.json          # NPM config
├── package-lock.json     # NPM lock
├── docker-compose.yml    # Docker compose
├── .gitignore            # Git ignores
├── cloudbuild.yaml       # GCP config
├── *.config.js           # Various configs
└── *.sh                  # Deployment scripts
```

## Benefits
1. **Cleaner root**: Only 20 files instead of 35
2. **Better organization**: Docs in docs/, tests in tests/
3. **Professional appearance**: Standard project structure
4. **Easier navigation**: Clear where everything lives
5. **No broken functionality**: All paths remain valid

## Note on Directory Structure
The current structure is actually quite good:
- `frontend/` and `rust-backend/` at root level is common
- Not everything needs to be in `src/`
- Many projects keep services at root level

The main issue is just documentation clutter, not the code organization!