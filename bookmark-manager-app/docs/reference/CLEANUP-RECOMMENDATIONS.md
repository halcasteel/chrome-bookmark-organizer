# Cleanup Recommendations
**Total Space to Reclaim**: ~578MB

## Immediate Actions

### 1. Remove Deprecated Node.js Backend (117MB)
```bash
rm -rf backend/
```
- No longer needed since Rust backend is production
- Contains old code and 3MB log file

### 2. Consolidate Archive Directories (368MB)
```bash
# Option 1: Keep the organized archive/
mv _archive/* archive/
rmdir _archive/

# Option 2: If _archive has nothing valuable
rm -rf _archive/
```

### 3. Clean Log Files (93MB)
```bash
# Clear old logs
rm -rf logs/archive/
> logs/unified.log  # Or rm logs/unified.log
```

### 4. Remove Sensitive Files from Git
```bash
# These shouldn't be tracked
git rm --cached .env
git rm --cached .env.production
echo ".env" >> .gitignore
echo ".env.production" >> .gitignore
```

## After Cleanup, Root Will Have:
- Only working directories (frontend/, rust-backend/, etc.)
- Only necessary config files
- No deprecated code
- No large log files
- No duplicate archives
- No sensitive environment files in git

This will reclaim ~578MB and make the project much cleaner!