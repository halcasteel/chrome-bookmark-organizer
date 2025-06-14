#!/usr/bin/env python3
import json
import os
import requests
import socket
import ssl
from urllib.parse import urlparse
from datetime import datetime
import concurrent.futures
import time
from bs4 import BeautifulSoup
import re
from collections import Counter
import hashlib

class BookmarkSemanticValidator:
    def __init__(self, input_file, output_dir):
        self.input_file = input_file
        self.output_dir = output_dir
        self.bookmarks = []
        self.validation_results = {}
        
        # User agent to mimic browser
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
        
    def load_bookmarks(self):
        """Load bookmarks from JSON file"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Handle both raw bookmark list and organized format
            if isinstance(data, list):
                self.bookmarks = data
            elif isinstance(data, dict) and 'bookmarks' in data:
                self.bookmarks = data['bookmarks']
            else:
                # Try to extract from organized format
                self.bookmarks = []
                for key, value in data.items():
                    if isinstance(value, list):
                        self.bookmarks.extend(value)
        
        print(f"Loaded {len(self.bookmarks)} bookmarks to validate")
    
    def extract_text_content(self, html, limit=5000):
        """Extract meaningful text content from HTML"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Get text
            text = soup.get_text()
            
            # Clean up text
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = ' '.join(chunk for chunk in chunks if chunk)
            
            # Limit text length
            return text[:limit]
        except:
            return ""
    
    def extract_metadata(self, html, url):
        """Extract comprehensive metadata from HTML"""
        metadata = {
            'title': None,
            'description': None,
            'keywords': [],
            'og_description': None,
            'author': None,
            'content_text': None,
            'headings': [],
            'links_count': 0,
            'images_count': 0,
            'main_content': None
        }
        
        try:
            soup = BeautifulSoup(html, 'html.parser')
            
            # Title
            title_tag = soup.find('title')
            if title_tag:
                metadata['title'] = title_tag.text.strip()[:200]
            
            # Meta description
            desc_tag = soup.find('meta', attrs={'name': 'description'})
            if desc_tag and desc_tag.get('content'):
                metadata['description'] = desc_tag['content'].strip()[:500]
            
            # Keywords
            keywords_tag = soup.find('meta', attrs={'name': 'keywords'})
            if keywords_tag and keywords_tag.get('content'):
                metadata['keywords'] = [k.strip() for k in keywords_tag['content'].split(',')[:10]]
            
            # Open Graph description
            og_desc = soup.find('meta', attrs={'property': 'og:description'})
            if og_desc and og_desc.get('content'):
                metadata['og_description'] = og_desc['content'].strip()[:500]
            
            # Author
            author_tag = soup.find('meta', attrs={'name': 'author'})
            if author_tag and author_tag.get('content'):
                metadata['author'] = author_tag['content'].strip()[:100]
            
            # Headings (h1, h2, h3)
            headings = []
            for tag in ['h1', 'h2', 'h3']:
                for heading in soup.find_all(tag)[:5]:  # Limit to 5 per type
                    text = heading.text.strip()
                    if text:
                        headings.append(text[:100])
            metadata['headings'] = headings[:10]  # Max 10 headings
            
            # Count links and images
            metadata['links_count'] = len(soup.find_all('a'))
            metadata['images_count'] = len(soup.find_all('img'))
            
            # Try to extract main content
            # Look for common content containers
            content_tags = ['main', 'article', 'section', 'div']
            content_classes = ['content', 'main-content', 'article-body', 'post-content', 'entry-content']
            content_ids = ['content', 'main', 'article', 'post']
            
            main_content = None
            
            # Try by tag name
            for tag_name in content_tags:
                if main_content:
                    break
                for tag in soup.find_all(tag_name):
                    # Check class
                    tag_classes = tag.get('class', [])
                    if any(cls in ' '.join(tag_classes).lower() for cls in content_classes):
                        main_content = tag
                        break
                    
                    # Check id
                    tag_id = tag.get('id', '').lower()
                    if any(id_part in tag_id for id_part in content_ids):
                        main_content = tag
                        break
            
            # If no main content found, use body
            if not main_content:
                main_content = soup.find('body')
            
            if main_content:
                # Extract text from main content
                content_text = self.extract_text_content(str(main_content), limit=2000)
                if content_text:
                    metadata['main_content'] = content_text
            
            # Full page text as fallback
            metadata['content_text'] = self.extract_text_content(html, limit=1000)
            
        except Exception as e:
            print(f"Error extracting metadata: {e}")
        
        return metadata
    
    def generate_semantic_summary(self, url, title, metadata):
        """Generate a semantic summary for the bookmark"""
        summary_parts = []
        
        # Use title as primary summary
        if title:
            summary_parts.append(title)
        
        # Add description if available
        if metadata.get('description'):
            summary_parts.append(metadata['description'])
        elif metadata.get('og_description'):
            summary_parts.append(metadata['og_description'])
        
        # Add key headings
        if metadata.get('headings'):
            summary_parts.extend(metadata['headings'][:3])
        
        # Add main content snippet
        if metadata.get('main_content'):
            # Get first 200 chars of main content
            content_snippet = metadata['main_content'][:200].strip()
            if content_snippet:
                summary_parts.append(content_snippet)
        elif metadata.get('content_text'):
            # Fallback to general content
            content_snippet = metadata['content_text'][:200].strip()
            if content_snippet:
                summary_parts.append(content_snippet)
        
        # Combine all parts
        full_summary = ' | '.join(filter(None, summary_parts))
        
        # Add domain info
        domain = urlparse(url).netloc
        if domain:
            full_summary = f"[{domain}] {full_summary}"
        
        return full_summary[:1000]  # Limit to 1000 chars
    
    def extract_keywords_from_text(self, text):
        """Extract keywords from text using simple frequency analysis"""
        # Common stop words
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'under', 'over', 'out',
            'off', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
            'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i',
            'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'what', 'which',
            'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'some',
            'any', 'few', 'more', 'most', 'other', 'such', 'no', 'nor', 'not', 'only',
            'own', 'same', 'so', 'than', 'too', 'very', 'just', 'now', 'new', 'also'
        }
        
        # Extract words
        words = re.findall(r'\b[a-z]+\b', text.lower())
        
        # Filter out stop words and short words
        keywords = [w for w in words if w not in stop_words and len(w) > 3]
        
        # Count frequencies
        word_freq = Counter(keywords)
        
        # Get top keywords
        top_keywords = [word for word, freq in word_freq.most_common(20)]
        
        return top_keywords
    
    def validate_url(self, url):
        """Validate URL and extract semantic content"""
        result = {
            'url': url,
            'valid': False,
            'status_code': None,
            'error': None,
            'redirect_url': None,
            'response_time': None,
            'content_type': None,
            'title': None,
            'metadata': {},
            'semantic_summary': None,
            'keywords': [],
            'content_hash': None
        }
        
        try:
            # Parse URL
            parsed = urlparse(url)
            
            # Special handling for local URLs
            if parsed.scheme in ['chrome', 'chrome-extension', 'about', 'file']:
                result['valid'] = True
                result['error'] = 'Browser internal URL - assumed valid'
                result['semantic_summary'] = f"Browser internal URL: {url}"
                return result
            
            # Check if localhost/local network
            if parsed.hostname in ['localhost', '127.0.0.1', '0.0.0.0'] or \
               (parsed.hostname and parsed.hostname.startswith('192.168.') or parsed.hostname.startswith('10.')):
                # Try to connect to local service
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(2)
                    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
                    sock.connect((parsed.hostname, port))
                    sock.close()
                    result['valid'] = True
                    result['error'] = 'Local service accessible'
                    result['semantic_summary'] = f"Local service at {parsed.hostname}:{port}"
                except:
                    result['valid'] = False
                    result['error'] = 'Local service not running'
                return result
            
            # For external URLs, make HTTP request
            start_time = time.time()
            
            # Always use GET for semantic extraction
            response = requests.get(url, headers=self.headers, timeout=15, allow_redirects=True)
            
            result['response_time'] = round(time.time() - start_time, 2)
            result['status_code'] = response.status_code
            
            # Check if successful
            if response.status_code < 400:
                result['valid'] = True
                
                # Get final URL after redirects
                if response.url != url:
                    result['redirect_url'] = response.url
                
                # Get content type
                result['content_type'] = response.headers.get('Content-Type', '').split(';')[0]
                
                # For HTML pages, extract semantic content
                if 'text/html' in response.headers.get('Content-Type', ''):
                    try:
                        # Get content
                        content = response.text[:50000]  # Limit to 50KB
                        
                        # Generate content hash
                        result['content_hash'] = hashlib.md5(content.encode()).hexdigest()
                        
                        # Extract metadata
                        metadata = self.extract_metadata(content, url)
                        result['metadata'] = metadata
                        
                        # Use metadata title if available
                        if metadata.get('title'):
                            result['title'] = metadata['title']
                        
                        # Generate semantic summary
                        result['semantic_summary'] = self.generate_semantic_summary(
                            url, 
                            result['title'], 
                            metadata
                        )
                        
                        # Extract keywords
                        all_text = ' '.join(filter(None, [
                            metadata.get('title', ''),
                            metadata.get('description', ''),
                            ' '.join(metadata.get('headings', [])),
                            metadata.get('main_content', '')[:500]
                        ]))
                        
                        keywords = self.extract_keywords_from_text(all_text)
                        if metadata.get('keywords'):
                            keywords.extend(metadata['keywords'])
                        
                        # Deduplicate and limit keywords
                        seen = set()
                        unique_keywords = []
                        for kw in keywords:
                            if kw.lower() not in seen:
                                seen.add(kw.lower())
                                unique_keywords.append(kw)
                        
                        result['keywords'] = unique_keywords[:15]
                        
                    except Exception as e:
                        print(f"Error extracting semantic content: {e}")
                else:
                    # Non-HTML content
                    result['semantic_summary'] = f"{result['content_type']} content at {parsed.netloc}"
            else:
                result['error'] = f'HTTP {response.status_code}'
                
        except requests.exceptions.SSLError as e:
            result['error'] = 'SSL certificate error'
            # Try without SSL verification
            try:
                response = requests.get(url, headers=self.headers, timeout=15, verify=False)
                if response.status_code < 400:
                    result['valid'] = True
                    result['error'] = 'SSL certificate invalid but site accessible'
                    result['status_code'] = response.status_code
                    # Still try to get basic info
                    result['semantic_summary'] = f"Site with SSL issues at {urlparse(url).netloc}"
            except:
                pass
                
        except requests.exceptions.ConnectionError:
            result['error'] = 'Connection failed - site unreachable'
            
        except requests.exceptions.Timeout:
            result['error'] = 'Request timed out'
            
        except requests.exceptions.TooManyRedirects:
            result['error'] = 'Too many redirects'
            
        except Exception as e:
            result['error'] = f'Error: {str(e)[:100]}'
        
        return result
    
    def validate_bookmarks(self, max_workers=5, sample_size=None):
        """Validate bookmarks in parallel with semantic extraction"""
        # Take a sample if specified
        bookmarks_to_check = self.bookmarks[:sample_size] if sample_size else self.bookmarks
        
        print(f"\nValidating {len(bookmarks_to_check)} bookmarks with semantic extraction...")
        print(f"Using {max_workers} parallel workers (slower for accuracy)\n")
        
        valid_count = 0
        invalid_count = 0
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all tasks
            future_to_bookmark = {
                executor.submit(self.validate_url, bookmark['url']): bookmark 
                for bookmark in bookmarks_to_check
            }
            
            # Process results as they complete
            for i, future in enumerate(concurrent.futures.as_completed(future_to_bookmark)):
                bookmark = future_to_bookmark[future]
                
                try:
                    result = future.result()
                    self.validation_results[bookmark['url']] = result
                    
                    # Update counts
                    if result['valid']:
                        valid_count += 1
                        status = "✅ VALID"
                    else:
                        invalid_count += 1
                        status = "❌ INVALID"
                    
                    # Progress update
                    if (i + 1) % 5 == 0 or (i + 1) == len(bookmarks_to_check):
                        print(f"Progress: {i + 1}/{len(bookmarks_to_check)} checked. "
                              f"Valid: {valid_count}, Invalid: {invalid_count}")
                    
                    # Show semantic info for valid URLs
                    if result['valid'] and result.get('semantic_summary'):
                        print(f"{status}: {bookmark['domain']}")
                        print(f"  Summary: {result['semantic_summary'][:100]}...")
                        if result.get('keywords'):
                            print(f"  Keywords: {', '.join(result['keywords'][:5])}")
                    elif not result['valid']:
                        print(f"{status}: {bookmark['domain']} - {result['error']}")
                        
                except Exception as e:
                    print(f"Error checking {bookmark['url']}: {e}")
        
        # Summary
        print(f"\n{'='*60}")
        print(f"VALIDATION COMPLETE")
        print(f"{'='*60}")
        print(f"Total checked: {len(bookmarks_to_check)}")
        print(f"Valid URLs: {valid_count} ({valid_count/len(bookmarks_to_check)*100:.1f}%)")
        print(f"Invalid URLs: {invalid_count} ({invalid_count/len(bookmarks_to_check)*100:.1f}%)")
    
    def save_results(self):
        """Save validation results with semantic data"""
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Separate valid and invalid bookmarks
        valid_bookmarks = []
        invalid_bookmarks = []
        
        for bookmark in self.bookmarks:
            result = self.validation_results.get(bookmark['url'])
            if result:
                # Create enhanced bookmark with semantic data
                enhanced_bookmark = bookmark.copy()
                enhanced_bookmark['validation'] = result
                
                # Add semantic fields at top level for easier access
                if result.get('semantic_summary'):
                    enhanced_bookmark['semantic_summary'] = result['semantic_summary']
                if result.get('keywords'):
                    enhanced_bookmark['keywords'] = result['keywords']
                if result.get('content_hash'):
                    enhanced_bookmark['content_hash'] = result['content_hash']
                
                if result['valid']:
                    valid_bookmarks.append(enhanced_bookmark)
                else:
                    invalid_bookmarks.append(enhanced_bookmark)
        
        # Save valid bookmarks with semantic data
        valid_file = os.path.join(self.output_dir, 'valid_bookmarks_semantic.json')
        with open(valid_file, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(valid_bookmarks),
                'bookmarks': valid_bookmarks
            }, f, ensure_ascii=False, indent=2)
        
        # Save invalid bookmarks
        invalid_file = os.path.join(self.output_dir, 'invalid_bookmarks.json')
        with open(invalid_file, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(invalid_bookmarks),
                'bookmarks': invalid_bookmarks
            }, f, ensure_ascii=False, indent=2)
        
        # Save semantic index for search
        semantic_index = []
        for bookmark in valid_bookmarks:
            if bookmark.get('semantic_summary'):
                semantic_index.append({
                    'url': bookmark['url'],
                    'title': bookmark['title'],
                    'domain': bookmark['domain'],
                    'semantic_summary': bookmark['semantic_summary'],
                    'keywords': bookmark.get('keywords', []),
                    'content_hash': bookmark.get('content_hash')
                })
        
        semantic_file = os.path.join(self.output_dir, 'semantic_index.json')
        with open(semantic_file, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(semantic_index),
                'index': semantic_index
            }, f, ensure_ascii=False, indent=2)
        
        # Save detailed report
        report = {
            'validation_date': datetime.now().isoformat(),
            'total_bookmarks': len(self.bookmarks),
            'checked_bookmarks': len(self.validation_results),
            'valid_count': len(valid_bookmarks),
            'invalid_count': len(invalid_bookmarks),
            'validity_rate': f"{len(valid_bookmarks)/len(self.validation_results)*100:.1f}%" if self.validation_results else "0%",
            'semantic_extracted': len(semantic_index),
            'error_types': {}
        }
        
        # Count error types
        for result in self.validation_results.values():
            if not result['valid'] and result['error']:
                error_type = result['error'].split('-')[0].strip()
                report['error_types'][error_type] = report['error_types'].get(error_type, 0) + 1
        
        # Sort error types by count
        report['error_types'] = dict(sorted(report['error_types'].items(), key=lambda x: x[1], reverse=True))
        
        # Save report
        report_file = os.path.join(self.output_dir, 'validation_report.json')
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        print(f"\nResults saved to {self.output_dir}")
        print(f"- Valid bookmarks with semantic data: {valid_file}")
        print(f"- Invalid bookmarks: {invalid_file}")
        print(f"- Semantic search index: {semantic_file}")
        print(f"- Validation report: {report_file}")
        
        # Print semantic extraction stats
        print(f"\nSemantic extraction stats:")
        print(f"- Bookmarks with summaries: {len(semantic_index)}")
        
        # Count keywords
        all_keywords = []
        for item in semantic_index:
            all_keywords.extend(item.get('keywords', []))
        keyword_freq = Counter(all_keywords)
        
        print(f"- Total unique keywords: {len(keyword_freq)}")
        print("\nTop 10 keywords:")
        for keyword, count in keyword_freq.most_common(10):
            print(f"  - {keyword}: {count}")


def main():
    import sys
    
    # Test mode or full validation
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        # Test with small sample
        validator = BookmarkSemanticValidator(
            "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
            "/home/halcasteel/BOOKMARKS/SEMANTIC_VALIDATION"
        )
        
        validator.load_bookmarks()
        validator.validate_bookmarks(max_workers=3, sample_size=10)
        validator.save_results()
    else:
        # Full validation
        validator = BookmarkSemanticValidator(
            "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
            "/home/halcasteel/BOOKMARKS/SEMANTIC_VALIDATION"
        )
        
        validator.load_bookmarks()
        
        # Use fewer workers for semantic extraction (more intensive)
        validator.validate_bookmarks(max_workers=10)
        
        validator.save_results()


if __name__ == "__main__":
    main()