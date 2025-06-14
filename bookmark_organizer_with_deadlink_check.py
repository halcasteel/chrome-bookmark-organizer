#!/usr/bin/env python3
import json
import os
import re
from collections import defaultdict, Counter
from datetime import datetime
from urllib.parse import urlparse, parse_qs, unquote
import hashlib
import requests
import concurrent.futures
from threading import Lock
import time

class BookmarkOrganizerWithDeadlinkCheck:
    def __init__(self, input_file, output_dir):
        self.input_file = input_file
        self.output_dir = output_dir
        self.bookmarks = []
        self.duplicates = defaultdict(list)
        self.unique_bookmarks = []
        self.categories = {}
        self.dead_bookmarks = []
        self.check_results = {}
        self.check_lock = Lock()
        
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
    
    def check_url_accessibility(self, url):
        """Check if a URL is accessible"""
        # Skip certain URL patterns that don't need checking
        skip_patterns = [
            'chrome://', 'chrome-extension://', 'about:', 'file://',
            'view-source:', 'blob:', 'localhost', '127.0.0.1', '0.0.0.0',
            '192.168.', '10.0.'
        ]
        
        for pattern in skip_patterns:
            if url.startswith(pattern) or pattern in url:
                return True  # Assume local/special URLs are valid
        
        try:
            # Use a short timeout to avoid hanging
            response = requests.head(url, timeout=5, allow_redirects=True, 
                                   headers={'User-Agent': 'Mozilla/5.0 (compatible; BookmarkChecker/1.0)'})
            
            # Accept various success and redirect codes
            if response.status_code < 400:
                return True
            
            # Try GET request for certain status codes
            if response.status_code in [403, 405]:  # Forbidden or Method Not Allowed
                response = requests.get(url, timeout=5, allow_redirects=True,
                                      headers={'User-Agent': 'Mozilla/5.0 (compatible; BookmarkChecker/1.0)'})
                return response.status_code < 400
                
            return False
            
        except requests.exceptions.SSLError:
            # Try without SSL verification for some sites
            try:
                response = requests.head(url, timeout=5, allow_redirects=True, verify=False,
                                       headers={'User-Agent': 'Mozilla/5.0 (compatible; BookmarkChecker/1.0)'})
                return response.status_code < 400
            except:
                return False
        except requests.exceptions.Timeout:
            return False  # Timeout means dead
        except requests.exceptions.ConnectionError:
            return False  # Connection error means dead
        except Exception:
            return False  # Any other error means dead
    
    def check_bookmarks_batch(self, bookmarks_batch):
        """Check a batch of bookmarks for accessibility"""
        results = []
        for bookmark in bookmarks_batch:
            url = bookmark['url']
            is_accessible = self.check_url_accessibility(url)
            
            with self.check_lock:
                self.check_results[url] = is_accessible
                if not is_accessible:
                    print(f"❌ Dead link: {url}")
                else:
                    print(f"✓ Live: {bookmark['domain']}")
            
            results.append((bookmark, is_accessible))
            time.sleep(0.1)  # Small delay to avoid overwhelming servers
            
        return results
    
    def deduplicate_and_check_bookmarks(self):
        """Remove duplicate bookmarks and check accessibility"""
        seen_urls = {}
        seen_titles = defaultdict(list)
        
        # First, deduplicate
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
        
        unique_bookmarks_list = list(seen_urls.values())
        
        print(f"\nDeduplication Results:")
        print(f"Original bookmarks: {len(self.bookmarks)}")
        print(f"After deduplication: {len(unique_bookmarks_list)}")
        print(f"Duplicates removed: {len(self.bookmarks) - len(unique_bookmarks_list)}")
        
        # Now check accessibility in parallel
        print(f"\nChecking bookmark accessibility (this may take a while)...")
        print("=" * 50)
        
        # Split bookmarks into batches for parallel processing
        batch_size = 10
        batches = [unique_bookmarks_list[i:i + batch_size] 
                  for i in range(0, len(unique_bookmarks_list), batch_size)]
        
        # Process batches in parallel with limited workers
        max_workers = 5  # Limit concurrent requests
        all_results = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_batch = {executor.submit(self.check_bookmarks_batch, batch): batch 
                              for batch in batches}
            
            for future in concurrent.futures.as_completed(future_to_batch):
                try:
                    results = future.result()
                    all_results.extend(results)
                except Exception as e:
                    print(f"Error checking batch: {e}")
        
        # Separate live and dead bookmarks
        for bookmark, is_accessible in all_results:
            if is_accessible:
                self.unique_bookmarks.append(bookmark)
            else:
                self.dead_bookmarks.append(bookmark)
        
        print(f"\n\nAccessibility Check Results:")
        print(f"Live bookmarks: {len(self.unique_bookmarks)}")
        print(f"Dead bookmarks: {len(self.dead_bookmarks)}")
        
    def categorize_bookmarks(self):
        """Enhanced categorization of bookmarks"""
        # Define comprehensive category patterns
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
        self.categories['Deadend'] = self.dead_bookmarks  # Add dead bookmarks category
        
        # Categorize each live bookmark
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
            'unique_count': len(self.unique_bookmarks) + len(self.dead_bookmarks),
            'live_count': len(self.unique_bookmarks),
            'dead_count': len(self.dead_bookmarks),
            'duplicates_removed': len(self.bookmarks) - (len(self.unique_bookmarks) + len(self.dead_bookmarks)),
            'categories': category_summary,
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
        
        # Save accessibility check results
        check_report = {
            'total_checked': len(self.check_results),
            'accessible': sum(1 for v in self.check_results.values() if v),
            'inaccessible': sum(1 for v in self.check_results.values() if not v),
            'check_date': datetime.now().isoformat(),
            'dead_bookmarks': [
                {
                    'url': b['url'],
                    'title': b['title'],
                    'domain': b['domain'],
                    'date_added': b.get('date_added', 'Unknown')
                } for b in self.dead_bookmarks
            ]
        }
        
        with open(os.path.join(self.output_dir, 'accessibility_report.json'), 'w', encoding='utf-8') as f:
            json.dump(check_report, f, ensure_ascii=False, indent=2)
        
        print(f"\nOrganization complete! Files saved to {self.output_dir}")
        
    def generate_readable_summary(self):
        """Generate a human-readable summary"""
        summary_path = os.path.join(self.output_dir, 'ORGANIZATION_SUMMARY.txt')
        
        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write("BOOKMARK ORGANIZATION SUMMARY WITH DEAD LINK CHECK\n")
            f.write("=" * 60 + "\n\n")
            
            f.write(f"Original Bookmarks: {len(self.bookmarks)}\n")
            f.write(f"After Deduplication: {len(self.unique_bookmarks) + len(self.dead_bookmarks)}\n")
            f.write(f"Duplicates Removed: {len(self.bookmarks) - (len(self.unique_bookmarks) + len(self.dead_bookmarks))}\n\n")
            
            f.write("ACCESSIBILITY CHECK:\n")
            f.write("-" * 30 + "\n")
            f.write(f"Live Bookmarks: {len(self.unique_bookmarks)}\n")
            f.write(f"Dead Bookmarks: {len(self.dead_bookmarks)}\n")
            f.write(f"Organization Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("CATEGORIES\n")
            f.write("-" * 30 + "\n")
            
            for category, bookmarks in sorted(self.categories.items(), key=lambda x: len(x[1]), reverse=True):
                if bookmarks and category != 'Deadend':
                    f.write(f"\n{category.replace('_', ' ')}: {len(bookmarks)} bookmarks\n")
                    
                    # Top domains in category
                    top_domains = Counter(b.get('domain', '') for b in bookmarks).most_common(5)
                    for domain, count in top_domains:
                        if domain:
                            f.write(f"  - {domain}: {count}\n")
            
            # Dead bookmarks summary
            if self.dead_bookmarks:
                f.write(f"\n\nDEAD BOOKMARKS: {len(self.dead_bookmarks)} total\n")
                f.write("-" * 30 + "\n")
                dead_domains = Counter(b.get('domain', '') for b in self.dead_bookmarks).most_common(10)
                for domain, count in dead_domains:
                    if domain:
                        f.write(f"  - {domain}: {count}\n")
            
            f.write(f"\n\nAll bookmarks have been organized into category folders in:\n")
            f.write(f"{self.output_dir}\n")
            f.write(f"\nDead bookmarks have been moved to the 'Deadend' folder.\n")


if __name__ == "__main__":
    organizer = BookmarkOrganizerWithDeadlinkCheck(
        "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
        "/home/halcasteel/BOOKMARKS/ORGANIZED_WITH_DEADLINK_CHECK"
    )
    
    organizer.load_bookmarks()
    organizer.deduplicate_and_check_bookmarks()
    organizer.categorize_bookmarks()
    organizer.save_organized_bookmarks()
    organizer.generate_readable_summary()