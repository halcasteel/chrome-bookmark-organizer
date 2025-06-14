#!/usr/bin/env python3
import json
import os
import re
from collections import defaultdict, Counter
from datetime import datetime
from urllib.parse import urlparse
import html

class BookmarkAnalyzer:
    def __init__(self, chunks_dir):
        self.chunks_dir = chunks_dir
        self.bookmarks = []
        self.duplicates = defaultdict(list)
        
    def extract_bookmarks(self):
        """Extract all bookmarks from chunk files"""
        # Pattern to match bookmark entries
        bookmark_pattern = r'<DT><A\s+HREF="([^"]+)"(?:\s+ADD_DATE="(\d+)")?(?:\s+ICON="[^"]*")?[^>]*>([^<]+)</A>'
        
        # Process all chunk files
        chunk_files = sorted([f for f in os.listdir(self.chunks_dir) if f.endswith('.json')])
        
        seen_urls = set()
        
        for chunk_file in chunk_files:
            with open(os.path.join(self.chunks_dir, chunk_file), 'r', encoding='utf-8') as f:
                chunk_data = json.load(f)
                content = chunk_data['content']
                
                # Find all bookmarks in this chunk
                matches = re.finditer(bookmark_pattern, content, re.IGNORECASE)
                
                for match in matches:
                    url = match.group(1)
                    add_date = match.group(2)
                    title = html.unescape(match.group(3))
                    
                    # Skip if we've already seen this URL (due to overlap)
                    if url in seen_urls:
                        continue
                    
                    seen_urls.add(url)
                    
                    # Parse the URL
                    parsed_url = urlparse(url)
                    domain = parsed_url.netloc.lower()
                    
                    # Remove www. prefix for consistency
                    if domain.startswith('www.'):
                        domain = domain[4:]
                    
                    # Convert timestamp to readable date
                    date_added = None
                    if add_date:
                        try:
                            date_added = datetime.fromtimestamp(int(add_date)).strftime('%Y-%m-%d %H:%M:%S')
                        except:
                            date_added = None
                    
                    bookmark = {
                        'url': url,
                        'title': title,
                        'domain': domain,
                        'protocol': parsed_url.scheme,
                        'path': parsed_url.path,
                        'date_added': date_added,
                        'timestamp': int(add_date) if add_date else None
                    }
                    
                    self.bookmarks.append(bookmark)
        
        print(f"Extracted {len(self.bookmarks)} unique bookmarks")
        
    def categorize_by_content_type(self):
        """Categorize bookmarks by content type based on domain and URL patterns"""
        categories = defaultdict(list)
        
        # Define content type patterns
        content_patterns = {
            'News & Media': [
                'nytimes.com', 'wsj.com', 'bloomberg.com', 'reuters.com', 'cnn.com',
                'bbc.com', 'guardian.com', 'washingtonpost.com', 'forbes.com',
                'businessinsider.com', 'economist.com', 'ft.com', 'apnews.com',
                'cnet.com', 'wired.com', 'theverge.com', 'arstechnica.com',
                'venturebeat.com', 'fortune.com'
            ],
            'Social Media & Professional': [
                'linkedin.com', 'twitter.com', 'facebook.com', 'instagram.com',
                'reddit.com', 'medium.com', 'substack.com'
            ],
            'Developer & Tech': [
                'github.com', 'gitlab.com', 'stackoverflow.com', 'docker.com',
                'kubernetes.io', 'terraform.io', 'aws.amazon.com', 'cloud.google.com',
                'azure.microsoft.com', 'digitalocean.com', 'heroku.com'
            ],
            'AI & Machine Learning': [
                'openai.com', 'anthropic.com', 'deepmind.com', 'huggingface.co',
                'kaggle.com', 'arxiv.org', 'papers.nips.cc', 'neurips.cc',
                'scale.com', 'wandb.ai', 'cohere.ai', 'stability.ai',
                'midjourney.com', 'claude.ai', 'chatgpt.com', 'bard.google.com',
                'perplexity.ai', 'character.ai', 'replicate.com', 'roboflow.com'
            ],
            'Academic & Research': [
                'scholar.google.com', 'nature.com', 'science.org', 'pubmed.ncbi.nlm.nih.gov',
                'ieee.org', 'acm.org', 'springer.com', 'wiley.com', 'elsevier.com',
                'jstor.org', 'researchgate.net', 'academia.edu', 'orcid.org',
                'doi.org', 'crossref.org', 'sciencedirect.com'
            ],
            'Documentation & Learning': [
                'docs.python.org', 'developer.mozilla.org', 'w3schools.com',
                'tutorialspoint.com', 'geeksforgeeks.org', 'freecodecamp.org',
                'codecademy.com', 'coursera.org', 'udacity.com', 'edx.org',
                'khanacademy.org', 'pluralsight.com', 'udemy.com',
                'docs.docker.com', 'kubernetes.io/docs', 'terraform.io/docs'
            ],
            'Forums & Communities': [
                'news.ycombinator.com', 'reddit.com', 'discourse.org',
                'community.', 'forum.', 'discuss.'
            ],
            'Video & Streaming': [
                'youtube.com', 'vimeo.com', 'twitch.tv', 'netflix.com',
                'hulu.com', 'primevideo.com', 'disneyplus.com'
            ],
            'E-commerce & Services': [
                'amazon.com', 'ebay.com', 'etsy.com', 'shopify.com',
                'stripe.com', 'paypal.com', 'square.com'
            ],
            'Productivity & Tools': [
                'notion.so', 'trello.com', 'asana.com', 'jira.atlassian.com',
                'slack.com', 'zoom.us', 'calendly.com', 'todoist.com',
                'evernote.com', 'onenote.com', 'dropbox.com', 'drive.google.com'
            ],
            'Analytics & Business': [
                'analytics.google.com', 'mixpanel.com', 'amplitude.com',
                'segment.com', 'datadog.com', 'newrelic.com', 'sentry.io',
                'mckinsey.com', 'bcg.com', 'bain.com', 'deloitte.com',
                'pwc.com', 'ey.com', 'kpmg.com', 'accenture.com'
            ],
            'Venture Capital & Startups': [
                'a16z.com', 'ycombinator.com', 'techcrunch.com', 'crunchbase.com',
                'pitchbook.com', 'angellist.com', 'producthunt.com',
                'sequoiacap.com', 'kleinerperkins.com', 'greylock.com'
            ],
            'Local & Development': [
                'localhost', '127.0.0.1', '0.0.0.0', '192.168.',
                'chrome://', 'file://', 'about:'
            ]
        }
        
        # Additional patterns based on URL content
        url_patterns = {
            'API & Documentation': ['/api/', '/docs/', '/documentation/', '/reference/'],
            'Blog & Articles': ['/blog/', '/article/', '/post/', '/story/'],
            'Research Papers': ['/paper/', '/pdf/', '/research/', '/publication/'],
            'Code & Repositories': ['/repo/', '/repository/', '/code/', '/src/'],
            'Tutorials & Guides': ['/tutorial/', '/guide/', '/how-to/', '/learn/']
        }
        
        # Categorize each bookmark
        for bookmark in self.bookmarks:
            domain = bookmark['domain']
            url = bookmark['url'].lower()
            path = bookmark['path'].lower()
            categorized = False
            
            # Check domain patterns
            for category, patterns in content_patterns.items():
                for pattern in patterns:
                    if pattern in domain:
                        categories[category].append(bookmark)
                        categorized = True
                        break
                if categorized:
                    break
            
            # If not categorized by domain, check URL patterns
            if not categorized:
                for category, patterns in url_patterns.items():
                    for pattern in patterns:
                        if pattern in path:
                            categories[category].append(bookmark)
                            categorized = True
                            break
                    if categorized:
                        break
            
            # Default category
            if not categorized:
                categories['Other'].append(bookmark)
        
        return dict(categories)
    
    def analyze_domains(self):
        """Analyze most common domains"""
        domain_counter = Counter(bookmark['domain'] for bookmark in self.bookmarks if bookmark['domain'])
        return domain_counter.most_common(50)
    
    def analyze_temporal_distribution(self):
        """Analyze when bookmarks were added"""
        temporal_dist = defaultdict(int)
        
        for bookmark in self.bookmarks:
            if bookmark['date_added']:
                year_month = bookmark['date_added'][:7]  # YYYY-MM
                temporal_dist[year_month] += 1
        
        return dict(sorted(temporal_dist.items()))
    
    def generate_report(self):
        """Generate comprehensive analysis report"""
        categories = self.categorize_by_content_type()
        top_domains = self.analyze_domains()
        temporal_dist = self.analyze_temporal_distribution()
        
        report = {
            'summary': {
                'total_bookmarks': len(self.bookmarks),
                'unique_domains': len(set(b['domain'] for b in self.bookmarks if b['domain'])),
                'date_range': self._get_date_range(),
                'protocols': Counter(b['protocol'] for b in self.bookmarks)
            },
            'categories': {
                category: {
                    'count': len(bookmarks),
                    'percentage': f"{len(bookmarks) / len(self.bookmarks) * 100:.1f}%",
                    'top_domains': Counter(b['domain'] for b in bookmarks).most_common(10),
                    'sample_bookmarks': [
                        {'title': b['title'], 'url': b['url'], 'date': b['date_added']}
                        for b in bookmarks[:5]
                    ]
                }
                for category, bookmarks in categories.items()
            },
            'top_domains': [
                {'domain': domain, 'count': count, 'percentage': f"{count / len(self.bookmarks) * 100:.1f}%"}
                for domain, count in top_domains
            ],
            'temporal_distribution': temporal_dist
        }
        
        return report
    
    def _get_date_range(self):
        """Get the date range of bookmarks"""
        dates = [b['date_added'] for b in self.bookmarks if b['date_added']]
        if dates:
            return {
                'earliest': min(dates),
                'latest': max(dates)
            }
        return None
    
    def save_results(self, output_dir):
        """Save analysis results"""
        os.makedirs(output_dir, exist_ok=True)
        
        # Save raw bookmarks data
        with open(os.path.join(output_dir, 'bookmarks_extracted.json'), 'w', encoding='utf-8') as f:
            json.dump(self.bookmarks, f, ensure_ascii=False, indent=2)
        
        # Save analysis report
        report = self.generate_report()
        with open(os.path.join(output_dir, 'bookmarks_analysis.json'), 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        # Save human-readable report
        self._save_readable_report(report, os.path.join(output_dir, 'bookmarks_report.txt'))
        
        print(f"\nAnalysis complete! Results saved to {output_dir}")
    
    def _save_readable_report(self, report, filepath):
        """Save a human-readable text report"""
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write("BOOKMARKS ANALYSIS REPORT\n")
            f.write("=" * 50 + "\n\n")
            
            # Summary
            f.write("SUMMARY\n")
            f.write("-" * 20 + "\n")
            f.write(f"Total Bookmarks: {report['summary']['total_bookmarks']}\n")
            f.write(f"Unique Domains: {report['summary']['unique_domains']}\n")
            if report['summary']['date_range']:
                f.write(f"Date Range: {report['summary']['date_range']['earliest']} to {report['summary']['date_range']['latest']}\n")
            f.write("\nProtocols:\n")
            for protocol, count in report['summary']['protocols'].items():
                f.write(f"  {protocol}: {count}\n")
            
            # Categories
            f.write("\n\nCONTENT CATEGORIES\n")
            f.write("-" * 20 + "\n")
            for category, data in sorted(report['categories'].items(), key=lambda x: x[1]['count'], reverse=True):
                f.write(f"\n{category}: {data['count']} ({data['percentage']})\n")
                f.write("  Top domains:\n")
                for domain, count in data['top_domains'][:5]:
                    f.write(f"    - {domain}: {count}\n")
            
            # Top domains overall
            f.write("\n\nTOP 20 DOMAINS OVERALL\n")
            f.write("-" * 20 + "\n")
            for item in report['top_domains'][:20]:
                f.write(f"{item['domain']}: {item['count']} ({item['percentage']})\n")


if __name__ == "__main__":
    analyzer = BookmarkAnalyzer("/home/halcasteel/BOOKMARKS/BOOKMARK-CHUNKS")
    analyzer.extract_bookmarks()
    analyzer.save_results("/home/halcasteel/BOOKMARKS/ANALYSIS")