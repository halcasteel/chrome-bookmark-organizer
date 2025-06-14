#!/usr/bin/env python3
import json
import os
import re
from datetime import datetime
from urllib.parse import urlparse
import html as html_module

class BookmarkHTMLGenerator:
    def __init__(self, organized_dir, output_dir):
        self.organized_dir = organized_dir
        self.output_dir = output_dir
        self.categories = {}
        self.total_bookmarks = 0
        
    def load_organized_bookmarks(self):
        """Load all organized bookmark files"""
        # Load organization summary
        with open(os.path.join(self.organized_dir, 'organization_summary.json'), 'r') as f:
            self.summary = json.load(f)
        
        # Load bookmarks from each category
        for category in self.summary['categories']:
            category_dir = os.path.join(self.organized_dir, category)
            self.categories[category] = []
            
            if os.path.exists(category_dir):
                for filename in sorted(os.listdir(category_dir)):
                    if filename.endswith('.json'):
                        filepath = os.path.join(category_dir, filename)
                        with open(filepath, 'r') as f:
                            data = json.load(f)
                            self.categories[category].extend(data['bookmarks'])
                            self.total_bookmarks += len(data['bookmarks'])
        
        print(f"Loaded {self.total_bookmarks} bookmarks across {len(self.categories)} categories")
    
    def get_favicon_url(self, domain):
        """Generate favicon URL for a domain"""
        return f"https://www.google.com/s2/favicons?domain={domain}&sz=32"
    
    def format_date(self, timestamp):
        """Format timestamp to readable date"""
        if timestamp:
            try:
                return datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d')
            except:
                pass
        return 'Unknown'
    
    def create_category_page(self, category, bookmarks):
        """Create HTML page for a category"""
        category_name = category.replace('_', ' ')
        filename = f"{category}.html"
        
        # Sort bookmarks by domain then title
        bookmarks.sort(key=lambda x: (x.get('domain', ''), x.get('title', '')))
        
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{category_name} - Bookmarks Browser</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <h1><a href="index.html">📚 Bookmarks Browser</a></h1>
        <nav>
            <a href="index.html">← Back to Categories</a>
        </nav>
    </header>
    
    <main>
        <h2>{category_name}</h2>
        <p class="category-stats">{len(bookmarks)} bookmarks</p>
        
        <div class="search-box">
            <input type="text" id="search" placeholder="Search bookmarks..." onkeyup="filterBookmarks()">
        </div>
        
        <div class="bookmarks-list" id="bookmarks">
"""
        
        # Group by domain
        current_domain = None
        for bookmark in bookmarks:
            domain = bookmark.get('domain', 'Unknown')
            
            if domain != current_domain:
                if current_domain is not None:
                    html += '</div>\n'
                html += f'<div class="domain-group">\n'
                html += f'<h3 class="domain-header"><img src="{self.get_favicon_url(domain)}" alt="" class="favicon"> {domain}</h3>\n'
                current_domain = domain
            
            title = html_module.escape(bookmark.get('title', 'Untitled'))
            url = bookmark.get('url', '#')
            date = self.format_date(bookmark.get('timestamp'))
            
            # Extract description from title or URL
            description = ''
            if ' - ' in title:
                parts = title.split(' - ', 1)
                if len(parts) > 1:
                    description = parts[1]
            elif ' | ' in title:
                parts = title.split(' | ', 1)
                if len(parts) > 1:
                    description = parts[1]
            
            html += f"""
            <div class="bookmark-item" data-search="{title.lower()} {domain.lower()} {description.lower()}">
                <div class="bookmark-header">
                    <a href="{url}" target="_blank" class="bookmark-title">{title}</a>
                    <span class="bookmark-date">{date}</span>
                </div>
                {f'<p class="bookmark-description">{html_module.escape(description)}</p>' if description else ''}
                <p class="bookmark-url">{url}</p>
            </div>
"""
        
        if current_domain is not None:
            html += '</div>\n'
        
        html += """
        </div>
    </main>
    
    <script>
    function filterBookmarks() {
        const searchTerm = document.getElementById('search').value.toLowerCase();
        const bookmarks = document.querySelectorAll('.bookmark-item');
        
        bookmarks.forEach(bookmark => {
            const searchData = bookmark.getAttribute('data-search');
            if (searchData.includes(searchTerm)) {
                bookmark.style.display = 'block';
            } else {
                bookmark.style.display = 'none';
            }
        });
        
        // Hide empty domain groups
        document.querySelectorAll('.domain-group').forEach(group => {
            const visibleBookmarks = group.querySelectorAll('.bookmark-item[style="display: block"], .bookmark-item:not([style])');
            group.style.display = visibleBookmarks.length > 0 ? 'block' : 'none';
        });
    }
    </script>
</body>
</html>"""
        
        with open(os.path.join(self.output_dir, filename), 'w', encoding='utf-8') as f:
            f.write(html)
        
        return filename
    
    def create_index_page(self):
        """Create main index page with category navigation"""
        # Sort categories by bookmark count
        sorted_categories = sorted(self.categories.items(), key=lambda x: len(x[1]), reverse=True)
        
        html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bookmarks Browser</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <h1>📚 Bookmarks Browser</h1>
        <p class="subtitle">Your organized bookmarks collection</p>
    </header>
    
    <main>
        <div class="stats-summary">
            <div class="stat-card">
                <h3>Total Bookmarks</h3>
                <p class="stat-number">{}</p>
            </div>
            <div class="stat-card">
                <h3>Categories</h3>
                <p class="stat-number">{}</p>
            </div>
            <div class="stat-card">
                <h3>Duplicates Removed</h3>
                <p class="stat-number">{}</p>
            </div>
        </div>
        
        <h2>Categories</h2>
        <div class="categories-grid">
""".format(self.total_bookmarks, len(self.categories), self.summary.get('duplicates_removed', 0))
        
        # Add category cards
        for category, bookmarks in sorted_categories:
            if not bookmarks:
                continue
                
            category_name = category.replace('_', ' ')
            filename = f"{category}.html"
            
            # Get top domains for preview
            domains = {}
            for bookmark in bookmarks[:50]:  # Sample first 50
                domain = bookmark.get('domain', '')
                if domain:
                    domains[domain] = domains.get(domain, 0) + 1
            
            top_domains = sorted(domains.items(), key=lambda x: x[1], reverse=True)[:3]
            
            # Category emoji mapping
            emoji_map = {
                'AI_and_ML': '🤖',
                'Development_and_Tech': '💻',
                'Cloud_and_DevOps': '☁️',
                'Google_Services': '🔍',
                'News_and_Media': '📰',
                'Tech_News_and_Blogs': '📱',
                'Social_and_Professional': '👥',
                'Learning_and_Education': '🎓',
                'Documentation_and_Reference': '📖',
                'Research_and_Academic': '🔬',
                'Shopping_and_E-commerce': '🛒',
                'Entertainment_and_Media': '🎬',
                'Business_and_Finance': '💰',
                'Productivity_and_Tools': '⚡',
                'Sailing_and_Marine': '⛵',
                'Local_and_Development': '🏠',
                'Other': '📌'
            }
            
            emoji = emoji_map.get(category, '📁')
            
            html += f"""
            <a href="{filename}" class="category-card">
                <div class="category-emoji">{emoji}</div>
                <h3>{category_name}</h3>
                <p class="bookmark-count">{len(bookmarks)} bookmarks</p>
                <div class="top-domains">
"""
            
            for domain, count in top_domains:
                html += f'<span class="domain-tag">{domain}</span>\n'
            
            html += """
                </div>
            </a>
"""
        
        html += """
        </div>
        
        <footer>
            <p>Generated on {}</p>
        </footer>
    </main>
</body>
</html>""".format(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
        
        with open(os.path.join(self.output_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html)
    
    def create_css(self):
        """Create CSS stylesheet"""
        css = """/* Reset and base styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f5f5f5;
}

/* Header styles */
header {
    background-color: #2c3e50;
    color: white;
    padding: 2rem 0;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

header h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
}

header h1 a {
    color: white;
    text-decoration: none;
}

header h1 a:hover {
    opacity: 0.8;
}

.subtitle {
    font-size: 1.2rem;
    opacity: 0.9;
}

nav {
    margin-top: 1rem;
}

nav a {
    color: white;
    text-decoration: none;
    padding: 0.5rem 1rem;
    background-color: rgba(255,255,255,0.1);
    border-radius: 4px;
    transition: background-color 0.3s;
}

nav a:hover {
    background-color: rgba(255,255,255,0.2);
}

/* Main content */
main {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 0 2rem;
}

/* Stats summary */
.stats-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
}

.stat-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    text-align: center;
}

.stat-card h3 {
    color: #7f8c8d;
    font-size: 0.9rem;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
}

.stat-number {
    font-size: 2.5rem;
    font-weight: bold;
    color: #2c3e50;
}

/* Categories grid */
.categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-top: 2rem;
}

.category-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
    display: block;
}

.category-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.category-emoji {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.category-card h3 {
    color: #2c3e50;
    margin-bottom: 0.5rem;
}

.bookmark-count {
    color: #7f8c8d;
    margin-bottom: 1rem;
}

.top-domains {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.domain-tag {
    font-size: 0.8rem;
    padding: 0.2rem 0.6rem;
    background-color: #ecf0f1;
    border-radius: 3px;
    color: #34495e;
}

/* Category page styles */
.category-stats {
    color: #7f8c8d;
    margin-bottom: 2rem;
}

.search-box {
    margin-bottom: 2rem;
}

#search {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    transition: border-color 0.3s;
}

#search:focus {
    outline: none;
    border-color: #3498db;
}

/* Bookmarks list */
.bookmarks-list {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.domain-group {
    margin-bottom: 2rem;
}

.domain-header {
    font-size: 1.2rem;
    color: #2c3e50;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #ecf0f1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.favicon {
    width: 24px;
    height: 24px;
}

.bookmark-item {
    padding: 1rem;
    margin-bottom: 1rem;
    background-color: #f8f9fa;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.bookmark-item:hover {
    background-color: #e9ecef;
}

.bookmark-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    margin-bottom: 0.5rem;
}

.bookmark-title {
    color: #2c3e50;
    text-decoration: none;
    font-weight: 500;
    flex: 1;
    margin-right: 1rem;
}

.bookmark-title:hover {
    color: #3498db;
    text-decoration: underline;
}

.bookmark-date {
    color: #7f8c8d;
    font-size: 0.85rem;
    white-space: nowrap;
}

.bookmark-description {
    color: #555;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
}

.bookmark-url {
    color: #7f8c8d;
    font-size: 0.85rem;
    word-break: break-all;
}

/* Footer */
footer {
    text-align: center;
    padding: 2rem 0;
    color: #7f8c8d;
}

/* Responsive design */
@media (max-width: 768px) {
    header h1 {
        font-size: 2rem;
    }
    
    .categories-grid {
        grid-template-columns: 1fr;
    }
    
    .bookmark-header {
        flex-direction: column;
    }
    
    .bookmark-date {
        align-self: flex-start;
        margin-top: 0.5rem;
    }
}
"""
        
        with open(os.path.join(self.output_dir, 'style.css'), 'w', encoding='utf-8') as f:
            f.write(css)
    
    def generate_html_site(self):
        """Generate complete HTML site"""
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Create CSS
        self.create_css()
        
        # Create category pages
        for category, bookmarks in self.categories.items():
            if bookmarks:
                self.create_category_page(category, bookmarks)
        
        # Create index page
        self.create_index_page()
        
        print(f"\nHTML site generated in {self.output_dir}")
        print("You can now serve it with: python3 -m http.server 8080")


if __name__ == "__main__":
    import sys
    
    # Allow specifying paths via command line or use defaults
    organized_dir = sys.argv[1] if len(sys.argv) > 1 else "/home/halcasteel/BOOKMARKS/ORGANIZED_SMART"
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "/home/halcasteel/BOOKMARKS/HTML_SITE_CLEAN"
    
    generator = BookmarkHTMLGenerator(organized_dir, output_dir)
    
    generator.load_organized_bookmarks()
    generator.generate_html_site()