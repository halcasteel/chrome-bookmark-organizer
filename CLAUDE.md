# CLAUDE.md - AI Context for Bookmark Organizer Project

## 🚨 IMPORTANT: Active Development Directory
The main application is in `bookmark-manager-app/`. Always work in that directory.

To start the application:
```bash
cd bookmark-manager-app
node start-services.js  # THIS IS THE ONLY WAY TO RUN THE APP
```

## Project Overview
This repository contains TWO bookmark management systems:

1. **bookmark-manager-app/** - The main production application (React/Node.js)
   - Full-stack web application with AI features
   - Currently non-functional due to auth issues
   - See `bookmark-manager-app/CLAUDE.md` for details

2. **Python bookmark organizers** - Simple HTML bookmark processors
   - Standalone Python scripts for organizing exported bookmarks
   - Creates static HTML sites from bookmark files

## Key Components

### 1. **bookmark_chunker.py**
- Splits large bookmark HTML files into ~100KB chunks with 5% line overlap
- Creates JSON files with metadata for each chunk
- Handles files too large to process in memory

### 2. **bookmark_analyzer.py**
- Extracts bookmarks from chunked files
- Analyzes content types and domains
- Generates statistics about bookmark collection

### 3. **bookmark_organizer_smart.py**
- Main organizer with smart dead link detection
- Removes duplicates (normalized URLs)
- Categorizes into 17+ categories
- Identifies suspicious bookmarks without URL testing
- Suspicious patterns: >5 years old, discontinued services, personal blogs

### 4. **bookmark_html_generator.py**
- Creates beautiful HTML interface
- Generates category pages with search
- Groups bookmarks by domain with favicons
- Responsive design

### 5. **serve_bookmarks_clean.py**
- HTTP server for bookmark browser
- Auto-opens browser
- Serves from HTML_SITE_CLEAN directory

## Directory Structure
```
/home/halcasteel/BOOKMARKS/
├── bookmarks_6_14_25.html          # Original bookmark file (5,806 lines)
├── BOOKMARK-CHUNKS/                # Chunked bookmark files
├── ANALYSIS/                       # Initial analysis results
├── ORGANIZED_SMART/                # Smart organized bookmarks
│   ├── AI_and_ML/                 # Category folders
│   ├── Google_Services/           
│   ├── Needs_Review/              # Suspicious bookmarks
│   └── ...
├── HTML_SITE_CLEAN/               # Final HTML site
│   ├── index.html                 # Main page
│   ├── style.css                  # Styling
│   └── [category].html            # Category pages
└── Scripts                        # All Python scripts
```

## Current Statistics
- Original bookmarks: 4,556
- Duplicates removed: 229
- Live bookmarks: 4,183
- Suspicious bookmarks: 144
- Categories: 18 (including Needs_Review)

## Categories
1. AI_and_ML (1,778 bookmarks)
2. Google_Services (558)
3. Development_and_Tech (209)
4. Cloud_and_DevOps (88)
5. News_and_Media (149)
6. Social_and_Professional (113)
7. Shopping_and_E-commerce (108)
8. Entertainment_and_Media (64)
9. Learning_and_Education (49)
10. Documentation_and_Reference (53)
11. Research_and_Academic (32)
12. Business_and_Finance (26)
13. Productivity_and_Tools (46)
14. Sailing_and_Marine (67)
15. Tech_News_and_Blogs (25)
16. Local_and_Development (63)
17. Other (755)
18. Needs_Review (144) - Suspicious/potentially dead

## Smart Features
- **No URL testing** - Uses patterns to identify suspicious links
- **Duplicate detection** - Normalizes URLs, removes tracking parameters
- **Smart categorization** - Domain and keyword-based
- **Suspicious patterns**:
  - Old bookmarks (>5 years)
  - Discontinued services (Google+, Reader, etc.)
  - Personal blog platforms
  - Error keywords in titles

## Usage Commands
```bash
# Full pipeline from scratch
python3 bookmark_chunker.py
python3 bookmark_analyzer.py
python3 bookmark_organizer_smart.py
python3 bookmark_html_generator.py
python3 serve_bookmarks_clean.py

# Quick rebuild (if bookmarks already analyzed)
python3 bookmark_organizer_smart.py
python3 bookmark_html_generator.py
python3 serve_bookmarks_clean.py
```

## Maintenance Tasks
- Review "Needs_Review" category periodically
- Re-run organizer to catch new patterns
- Update reliable_domains list in organizer
- Add new categories as needed

## Future Enhancements
- Export bookmarks back to HTML format
- Bookmark tagging system
- Import from multiple bookmark files
- Automated backup to cloud
- Share bookmark collections
- Browser extension for adding bookmarks

## Important Notes
- Server runs on http://localhost:8080
- All processing is done locally
- No external API calls for privacy
- Smart detection avoids testing 4,000+ URLs
- Original bookmark file is never modified