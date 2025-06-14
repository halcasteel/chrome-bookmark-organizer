#!/usr/bin/env python3
import json
import os
import re
from collections import defaultdict, Counter
from datetime import datetime
from urllib.parse import urlparse, parse_qs, unquote
import hashlib

class SmartBookmarkOrganizer:
    def __init__(self, input_file, output_dir, check_mode='smart'):
        self.input_file = input_file
        self.output_dir = output_dir
        self.check_mode = check_mode  # 'none', 'smart', 'all'
        self.bookmarks = []
        self.duplicates = defaultdict(list)
        self.unique_bookmarks = []
        self.categories = {}
        self.suspicious_bookmarks = []
        
        # Known reliable domains that don't need checking
        self.reliable_domains = {
            # Major tech companies
            'google.com', 'docs.google.com', 'drive.google.com', 'mail.google.com',
            'calendar.google.com', 'youtube.com', 'github.com', 'microsoft.com',
            'apple.com', 'amazon.com', 'facebook.com', 'twitter.com', 'linkedin.com',
            'reddit.com', 'stackoverflow.com', 'wikipedia.org',
            
            # Major AI companies
            'openai.com', 'anthropic.com', 'claude.ai', 'chatgpt.com', 'perplexity.ai',
            
            # Major news sites
            'nytimes.com', 'wsj.com', 'bloomberg.com', 'reuters.com', 'bbc.com',
            'cnn.com', 'forbes.com', 'techcrunch.com', 'theverge.com', 'wired.com',
            
            # Cloud providers
            'aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com',
            
            # Development platforms
            'gitlab.com', 'bitbucket.org', 'docker.com', 'kubernetes.io',
            
            # Education
            'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org',
            
            # Local/special URLs
            'localhost', '127.0.0.1', '0.0.0.0'
        }
        
        # Patterns that suggest a bookmark might be dead
        self.suspicious_patterns = [
            # Personal/small sites
            r'\.blogspot\.', r'\.wordpress\.com', r'\.tumblr\.com',
            r'\.geocities\.', r'\.angelfire\.', r'\.tripod\.',
            
            # Old file sharing
            r'megaupload\.', r'rapidshare\.', r'mediafire\.',
            
            # Discontinued services
            r'plus\.google\.com', r'reader\.google\.com',
            
            # Very old domains
            r'\.com\.br', r'\.net\.cn', r'\.org\.uk',
            
            # Personal pages
            r'~[^/]+/', r'/personal/', r'/users?/',
            
            # Old protocols
            r'^ftp://', r'^gopher://',
        ]
        
    def load_bookmarks(self):
        """Load bookmarks from extracted JSON file"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            self.bookmarks = json.load(f)
        print(f"Loaded {len(self.bookmarks)} bookmarks")
        
    def normalize_url(self, url):
        """Normalize URL for better duplicate detection"""
        # Parse URL
        parsed = urlparse(url.lower())
        
        # Remove common tracking parameters
        tracking_params = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 
                          'utm_term', 'fbclid', 'gclid', 'ref', 'source']
        
        if parsed.query:
            params = parse_qs(parsed.query)
            cleaned_params = {k: v for k, v in params.items() if k not in tracking_params}
            
            # Reconstruct query string
            if cleaned_params:
                query = '&'.join(f"{k}={v[0]}" for k, v in sorted(cleaned_params.items()))
            else:
                query = ''
        else:
            query = ''
        
        # Remove trailing slashes from path
        path = parsed.path.rstrip('/')
        if not path:
            path = '/'
            
        # Remove www. prefix
        netloc = parsed.netloc
        if netloc.startswith('www.'):
            netloc = netloc[4:]
        
        # Reconstruct normalized URL
        normalized = f"{parsed.scheme}://{netloc}{path}"
        if query:
            normalized += f"?{query}"
            
        return normalized
    
    def is_suspicious_bookmark(self, bookmark):
        """Check if a bookmark might be dead based on patterns"""
        url = bookmark.get('url', '').lower()
        domain = bookmark.get('domain', '').lower()
        
        # Check if it's a known reliable domain
        for reliable in self.reliable_domains:
            if reliable in domain:
                return False
        
        # Check suspicious patterns
        for pattern in self.suspicious_patterns:
            if re.search(pattern, url):
                return True
        
        # Check age - very old bookmarks might be dead
        timestamp = bookmark.get('timestamp')
        if timestamp:
            try:
                # If bookmark is older than 5 years, mark as suspicious
                bookmark_date = datetime.fromtimestamp(timestamp)
                age_days = (datetime.now() - bookmark_date).days
                if age_days > 1825:  # 5 years
                    return True
            except:
                pass
        
        # Check for common dead link indicators in title
        title = bookmark.get('title', '').lower()
        dead_indicators = ['404', 'not found', 'error', 'expired', 'discontinued']
        for indicator in dead_indicators:
            if indicator in title:
                return True
        
        return False
    
    def deduplicate_bookmarks(self):
        """Remove duplicate bookmarks and identify suspicious ones"""
        seen_urls = {}
        seen_titles = defaultdict(list)
        
        for bookmark in self.bookmarks:
            normalized_url = self.normalize_url(bookmark['url'])
            
            if normalized_url in seen_urls:
                existing = seen_urls[normalized_url]
                existing_date = existing.get('timestamp', 0) or 0
                current_date = bookmark.get('timestamp', 0) or 0
                
                if current_date > existing_date:
                    self.duplicates[normalized_url].append(existing)
                    seen_urls[normalized_url] = bookmark
                else:
                    self.duplicates[normalized_url].append(bookmark)
            else:
                seen_urls[normalized_url] = bookmark
        
        # Separate bookmarks based on suspicion level
        for bookmark in seen_urls.values():
            if self.check_mode == 'smart' and self.is_suspicious_bookmark(bookmark):
                self.suspicious_bookmarks.append(bookmark)
            else:
                self.unique_bookmarks.append(bookmark)
        
        print(f"\nDeduplication Results:")
        print(f"Original bookmarks: {len(self.bookmarks)}")
        print(f"After deduplication: {len(seen_urls)}")
        print(f"Duplicates removed: {len(self.bookmarks) - len(seen_urls)}")
        
        if self.check_mode == 'smart':
            print(f"\nSmart Analysis:")
            print(f"Reliable bookmarks: {len(self.unique_bookmarks)}")
            print(f"Suspicious bookmarks (moved to review): {len(self.suspicious_bookmarks)}")
        
    def categorize_bookmarks(self):
        """Enhanced categorization of bookmarks"""
        # Define comprehensive category patterns (same as before)
        category_patterns = {
            'AI_and_ML': {
                'domains': [
                    'openai.com', 'anthropic.com', 'claude.ai', 'chatgpt.com',
                    'perplexity.ai', 'character.ai', 'midjourney.com', 'stability.ai',
                    'huggingface.co', 'replicate.com', 'cohere.ai', 'scale.ai',
                    'wandb.ai', 'roboflow.com', 'kaggle.com', 'paperswithcode.com',
                    'bard.google.com', 'gemini.google.com', 'ai.google', 'deepmind.com'
                ],
                'keywords': ['ai', 'artificial-intelligence', 'machine-learning', 'deep-learning',
                            'neural', 'gpt', 'llm', 'transformer', 'diffusion']
            },
            'Development_and_Tech': {
                'domains': [
                    'github.com', 'gitlab.com', 'bitbucket.org', 'stackoverflow.com',
                    'docker.com', 'kubernetes.io', 'terraform.io', 'jenkins.io',
                    'circleci.com', 'travis-ci.org', 'heroku.com', 'vercel.com',
                    'netlify.com', 'digitalocean.com', 'linode.com', 'vultr.com'
                ],
                'keywords': ['api', 'sdk', 'framework', 'library', 'package', 'module',
                            'repository', 'code', 'programming', 'development']
            },
            'Cloud_and_DevOps': {
                'domains': [
                    'aws.amazon.com', 'cloud.google.com', 'console.cloud.google.com',
                    'azure.microsoft.com', 'portal.azure.com', 'cloud.ibm.com',
                    'oracle.com/cloud', 'alibabacloud.com', 'datadog.com',
                    'newrelic.com', 'splunk.com', 'elastic.co', 'grafana.com'
                ],
                'keywords': ['cloud', 'devops', 'infrastructure', 'monitoring', 'logging',
                            'metrics', 'observability', 'container', 'orchestration']
            },
            'Google_Services': {
                'domains': [
                    'docs.google.com', 'drive.google.com', 'mail.google.com',
                    'calendar.google.com', 'meet.google.com', 'sites.google.com',
                    'sheets.google.com', 'slides.google.com', 'forms.google.com',
                    'keep.google.com', 'photos.google.com', 'contacts.google.com'
                ],
                'keywords': ['google-docs', 'google-drive', 'gmail', 'google-calendar']
            },
            'News_and_Media': {
                'domains': [
                    'nytimes.com', 'wsj.com', 'washingtonpost.com', 'bloomberg.com',
                    'reuters.com', 'apnews.com', 'bbc.com', 'cnn.com', 'foxnews.com',
                    'theguardian.com', 'economist.com', 'ft.com', 'politico.com',
                    'thehill.com', 'axios.com', 'vox.com', 'vice.com', 'buzzfeed.com',
                    'huffpost.com', 'dailymail.co.uk', 'usatoday.com', 'forbes.com',
                    'businessinsider.com', 'fortune.com', 'cnbc.com', 'marketwatch.com'
                ],
                'keywords': ['news', 'article', 'report', 'analysis', 'opinion', 'editorial']
            },
            'Tech_News_and_Blogs': {
                'domains': [
                    'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
                    'engadget.com', 'gizmodo.com', 'mashable.com', 'venturebeat.com',
                    'zdnet.com', 'cnet.com', 'thenextweb.com', 'hackernews.com',
                    'news.ycombinator.com', 'slashdot.org', 'techdirt.com',
                    'anandtech.com', 'tomshardware.com', 'bleepingcomputer.com'
                ],
                'keywords': ['tech-news', 'technology', 'gadget', 'startup', 'innovation']
            },
            'Social_and_Professional': {
                'domains': [
                    'linkedin.com', 'twitter.com', 'x.com', 'facebook.com',
                    'instagram.com', 'reddit.com', 'pinterest.com', 'tumblr.com',
                    'discord.com', 'slack.com', 'teams.microsoft.com'
                ],
                'keywords': ['social', 'network', 'community', 'forum', 'discussion']
            },
            'Learning_and_Education': {
                'domains': [
                    'coursera.org', 'udemy.com', 'edx.org', 'udacity.com',
                    'khanacademy.org', 'pluralsight.com', 'lynda.com', 'skillshare.com',
                    'masterclass.com', 'brilliant.org', 'codecademy.com', 'datacamp.com',
                    'freecodecamp.org', 'w3schools.com', 'tutorialspoint.com',
                    'geeksforgeeks.org', 'leetcode.com', 'hackerrank.com'
                ],
                'keywords': ['tutorial', 'course', 'learn', 'education', 'training', 'certification']
            },
            'Documentation_and_Reference': {
                'domains': [
                    'docs.python.org', 'developer.mozilla.org', 'devdocs.io',
                    'cppreference.com', 'php.net', 'ruby-doc.org', 'golang.org/doc',
                    'rust-lang.org/learn', 'docs.oracle.com', 'docs.microsoft.com',
                    'developer.apple.com', 'developer.android.com'
                ],
                'keywords': ['documentation', 'reference', 'manual', 'guide', 'specification']
            },
            'Research_and_Academic': {
                'domains': [
                    'arxiv.org', 'scholar.google.com', 'nature.com', 'science.org',
                    'sciencedirect.com', 'springer.com', 'wiley.com', 'pubmed.ncbi.nlm.nih.gov',
                    'jstor.org', 'acm.org', 'ieee.org', 'researchgate.net',
                    'academia.edu', 'semanticscholar.org', 'bioRxiv.org', 'ssrn.com'
                ],
                'keywords': ['research', 'paper', 'study', 'journal', 'publication', 'academic']
            },
            'Shopping_and_E-commerce': {
                'domains': [
                    'amazon.com', 'ebay.com', 'etsy.com', 'alibaba.com', 'walmart.com',
                    'target.com', 'bestbuy.com', 'costco.com', 'homedepot.com',
                    'lowes.com', 'wayfair.com', 'overstock.com', 'newegg.com',
                    'shopify.com', 'squarespace.com', 'woocommerce.com'
                ],
                'keywords': ['shop', 'store', 'buy', 'purchase', 'product', 'marketplace']
            },
            'Entertainment_and_Media': {
                'domains': [
                    'youtube.com', 'netflix.com', 'hulu.com', 'disneyplus.com',
                    'hbomax.com', 'primevideo.com', 'spotify.com', 'applemusic.com',
                    'soundcloud.com', 'twitch.tv', 'vimeo.com', 'dailymotion.com',
                    'tiktok.com', 'imdb.com', 'rottentomatoes.com', 'metacritic.com'
                ],
                'keywords': ['video', 'music', 'movie', 'show', 'stream', 'entertainment']
            },
            'Business_and_Finance': {
                'domains': [
                    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com',
                    'americanexpress.com', 'paypal.com', 'venmo.com', 'square.com',
                    'stripe.com', 'quickbooks.intuit.com', 'mint.com', 'personalcapital.com',
                    'fidelity.com', 'vanguard.com', 'schwab.com', 'etrade.com',
                    'robinhood.com', 'coinbase.com', 'binance.com', 'kraken.com'
                ],
                'keywords': ['finance', 'banking', 'investment', 'trading', 'payment', 'crypto']
            },
            'Productivity_and_Tools': {
                'domains': [
                    'notion.so', 'evernote.com', 'todoist.com', 'trello.com',
                    'asana.com', 'monday.com', 'clickup.com', 'airtable.com',
                    'zapier.com', 'ifttt.com', 'calendly.com', 'doodle.com',
                    'grammarly.com', 'canva.com', 'figma.com', 'miro.com'
                ],
                'keywords': ['productivity', 'tool', 'workflow', 'automation', 'collaboration']
            },
            'Sailing_and_Marine': {
                'domains': [
                    'yachtworld.com', 'boats.com', 'boattrader.com', 'marinetraffic.com',
                    'windy.com', 'sailingmagazine.net', 'cruisingworld.com',
                    'yachtingmagazine.com', 'practical-sailor.com', 'boatus.com',
                    'westmarine.com', 'landfall-navigation.com', 'defender.com',
                    'smallboatsmonthly.com', 'woodenboat.com', 'classicboat.co.uk'
                ],
                'keywords': ['sailing', 'boat', 'yacht', 'marine', 'nautical', 'vessel', 'harbor']
            },
            'Local_and_Development': {
                'domains': ['localhost', '127.0.0.1', '0.0.0.0', '192.168.', '10.0.'],
                'keywords': ['local', 'dev', 'test', 'staging']
            }
        }
        
        # Initialize categories
        for category in category_patterns:
            self.categories[category] = []
        self.categories['Other'] = []
        
        # Add suspicious bookmarks category if in smart mode
        if self.check_mode == 'smart' and self.suspicious_bookmarks:
            self.categories['Needs_Review'] = self.suspicious_bookmarks
        
        # Categorize each bookmark
        for bookmark in self.unique_bookmarks:
            domain = bookmark.get('domain', '').lower()
            url = bookmark.get('url', '').lower()
            title = bookmark.get('title', '').lower()
            path = bookmark.get('path', '').lower()
            
            categorized = False
            
            # Check each category
            for category, patterns in category_patterns.items():
                # Check domain patterns
                for pattern in patterns.get('domains', []):
                    if pattern in domain:
                        self.categories[category].append(bookmark)
                        categorized = True
                        break
                
                # If not categorized by domain, check keywords
                if not categorized:
                    for keyword in patterns.get('keywords', []):
                        if keyword in url or keyword in title or keyword in path:
                            self.categories[category].append(bookmark)
                            categorized = True
                            break
                
                if categorized:
                    break
            
            # If still not categorized, put in Other
            if not categorized:
                self.categories['Other'].append(bookmark)
        
        # Print category summary
        print("\nCategory Distribution:")
        for category, bookmarks in sorted(self.categories.items(), key=lambda x: len(x[1]), reverse=True):
            if bookmarks:
                print(f"{category}: {len(bookmarks)} bookmarks")
    
    def save_organized_bookmarks(self):
        """Save bookmarks organized by category"""
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Save each category to its own file
        category_summary = {}
        
        for category, bookmarks in self.categories.items():
            if not bookmarks:
                continue
                
            # Create category directory
            category_dir = os.path.join(self.output_dir, category)
            os.makedirs(category_dir, exist_ok=True)
            
            # Split large categories into chunks (max 500 bookmarks per file)
            chunk_size = 500
            num_chunks = (len(bookmarks) + chunk_size - 1) // chunk_size
            
            category_files = []
            
            for i in range(num_chunks):
                start_idx = i * chunk_size
                end_idx = min((i + 1) * chunk_size, len(bookmarks))
                chunk = bookmarks[start_idx:end_idx]
                
                # Save chunk
                filename = f"{category}_{i+1:03d}.json" if num_chunks > 1 else f"{category}.json"
                filepath = os.path.join(category_dir, filename)
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump({
                        'category': category,
                        'chunk': i + 1,
                        'total_chunks': num_chunks,
                        'bookmarks_count': len(chunk),
                        'bookmarks': chunk
                    }, f, ensure_ascii=False, indent=2)
                
                category_files.append(filename)
            
            # Save category summary
            category_summary[category] = {
                'total_bookmarks': len(bookmarks),
                'files': category_files,
                'chunks': num_chunks,
                'top_domains': Counter(b.get('domain', '') for b in bookmarks).most_common(10)
            }
        
        # Save overall summary
        summary = {
            'original_count': len(self.bookmarks),
            'unique_count': len(self.unique_bookmarks),
            'suspicious_count': len(self.suspicious_bookmarks),
            'duplicates_removed': len(self.bookmarks) - len(self.unique_bookmarks) - len(self.suspicious_bookmarks),
            'categories': category_summary,
            'check_mode': self.check_mode,
            'organization_date': datetime.now().isoformat()
        }
        
        with open(os.path.join(self.output_dir, 'organization_summary.json'), 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        # Save duplicates report
        if self.duplicates:
            duplicates_report = []
            for url, dups in self.duplicates.items():
                duplicates_report.append({
                    'normalized_url': url,
                    'count': len(dups) + 1,  # +1 for the kept bookmark
                    'duplicates': dups
                })
            
            with open(os.path.join(self.output_dir, 'duplicates_report.json'), 'w', encoding='utf-8') as f:
                json.dump(duplicates_report, f, ensure_ascii=False, indent=2)
        
        print(f"\nOrganization complete! Files saved to {self.output_dir}")
        
    def generate_readable_summary(self):
        """Generate a human-readable summary"""
        summary_path = os.path.join(self.output_dir, 'ORGANIZATION_SUMMARY.txt')
        
        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write("SMART BOOKMARK ORGANIZATION SUMMARY\n")
            f.write("=" * 50 + "\n\n")
            
            f.write(f"Original Bookmarks: {len(self.bookmarks)}\n")
            f.write(f"Unique Bookmarks: {len(self.unique_bookmarks)}\n")
            f.write(f"Duplicates Removed: {len(self.bookmarks) - len(self.unique_bookmarks) - len(self.suspicious_bookmarks)}\n")
            
            if self.check_mode == 'smart':
                f.write(f"Suspicious Bookmarks (Needs Review): {len(self.suspicious_bookmarks)}\n")
            
            f.write(f"Organization Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("CATEGORIES\n")
            f.write("-" * 30 + "\n")
            
            for category, bookmarks in sorted(self.categories.items(), key=lambda x: len(x[1]), reverse=True):
                if bookmarks and category != 'Needs_Review':
                    f.write(f"\n{category.replace('_', ' ')}: {len(bookmarks)} bookmarks\n")
                    
                    # Top domains in category
                    top_domains = Counter(b.get('domain', '') for b in bookmarks).most_common(5)
                    for domain, count in top_domains:
                        if domain:
                            f.write(f"  - {domain}: {count}\n")
            
            if self.check_mode == 'smart' and self.suspicious_bookmarks:
                f.write(f"\n\nNEEDS REVIEW: {len(self.suspicious_bookmarks)} bookmarks\n")
                f.write("-" * 30 + "\n")
                f.write("These bookmarks may be dead based on:\n")
                f.write("- Old age (>5 years)\n")
                f.write("- Suspicious domains (personal blogs, discontinued services)\n")
                f.write("- Error keywords in titles\n\n")
                
                suspicious_domains = Counter(b.get('domain', '') for b in self.suspicious_bookmarks).most_common(10)
                for domain, count in suspicious_domains:
                    if domain:
                        f.write(f"  - {domain}: {count}\n")
            
            f.write(f"\n\nAll bookmarks have been organized into category folders in:\n")
            f.write(f"{self.output_dir}\n")


if __name__ == "__main__":
    # Run with smart mode - identifies potentially dead bookmarks without checking
    organizer = SmartBookmarkOrganizer(
        "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
        "/home/halcasteel/BOOKMARKS/ORGANIZED_SMART",
        check_mode='smart'  # Options: 'none', 'smart', 'all'
    )
    
    organizer.load_bookmarks()
    organizer.deduplicate_bookmarks()
    organizer.categorize_bookmarks()
    organizer.save_organized_bookmarks()
    organizer.generate_readable_summary()