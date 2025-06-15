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

class BookmarkValidator:
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
    
    def validate_url(self, url):
        """Validate if a URL is accessible"""
        result = {
            'url': url,
            'valid': False,
            'status_code': None,
            'error': None,
            'redirect_url': None,
            'response_time': None,
            'content_type': None,
            'title': None
        }
        
        try:
            # Parse URL
            parsed = urlparse(url)
            
            # Special handling for local URLs
            if parsed.scheme in ['chrome', 'chrome-extension', 'about', 'file']:
                result['valid'] = True
                result['error'] = 'Browser internal URL - assumed valid'
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
                except:
                    result['valid'] = False
                    result['error'] = 'Local service not running'
                return result
            
            # For external URLs, make HTTP request
            start_time = time.time()
            
            # Try HEAD request first (faster)
            try:
                response = requests.head(url, headers=self.headers, timeout=10, allow_redirects=True)
            except:
                # If HEAD fails, try GET
                response = requests.get(url, headers=self.headers, timeout=10, allow_redirects=True, stream=True)
            
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
                
                # For HTML pages, try to get title
                if 'text/html' in result['content_type'] and response.request.method == 'GET':
                    try:
                        # Read first 10KB to find title
                        content = next(response.iter_content(10240)).decode('utf-8', errors='ignore')
                        import re
                        title_match = re.search(r'<title[^>]*>(.*?)</title>', content, re.IGNORECASE | re.DOTALL)
                        if title_match:
                            result['title'] = title_match.group(1).strip()[:100]
                    except:
                        pass
            else:
                result['error'] = f'HTTP {response.status_code}'
                
        except requests.exceptions.SSLError as e:
            result['error'] = 'SSL certificate error'
            # Try without SSL verification
            try:
                response = requests.head(url, headers=self.headers, timeout=10, verify=False)
                if response.status_code < 400:
                    result['valid'] = True
                    result['error'] = 'SSL certificate invalid but site accessible'
                    result['status_code'] = response.status_code
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
    
    def validate_bookmarks(self, max_workers=10, sample_size=None):
        """Validate bookmarks in parallel"""
        # Take a sample if specified
        bookmarks_to_check = self.bookmarks[:sample_size] if sample_size else self.bookmarks
        
        print(f"\nValidating {len(bookmarks_to_check)} bookmarks...")
        print(f"Using {max_workers} parallel workers\n")
        
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
                    if (i + 1) % 10 == 0 or (i + 1) == len(bookmarks_to_check):
                        print(f"Progress: {i + 1}/{len(bookmarks_to_check)} checked. "
                              f"Valid: {valid_count}, Invalid: {invalid_count}")
                    
                    # Verbose output for invalid URLs
                    if not result['valid']:
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
        """Save validation results"""
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Separate valid and invalid bookmarks
        valid_bookmarks = []
        invalid_bookmarks = []
        
        for bookmark in self.bookmarks:
            result = self.validation_results.get(bookmark['url'])
            if result:
                bookmark['validation'] = result
                if result['valid']:
                    valid_bookmarks.append(bookmark)
                else:
                    invalid_bookmarks.append(bookmark)
        
        # Save valid bookmarks
        valid_file = os.path.join(self.output_dir, 'valid_bookmarks.json')
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
        
        # Save detailed report
        report = {
            'validation_date': datetime.now().isoformat(),
            'total_bookmarks': len(self.bookmarks),
            'checked_bookmarks': len(self.validation_results),
            'valid_count': len(valid_bookmarks),
            'invalid_count': len(invalid_bookmarks),
            'validity_rate': f"{len(valid_bookmarks)/len(self.validation_results)*100:.1f}%" if self.validation_results else "0%",
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
        print(f"- Valid bookmarks: {valid_file}")
        print(f"- Invalid bookmarks: {invalid_file}")
        print(f"- Validation report: {report_file}")
        
        # Print top error types
        if report['error_types']:
            print("\nTop error types:")
            for error_type, count in list(report['error_types'].items())[:5]:
                print(f"  - {error_type}: {count}")
    
    def test_single_url(self, url):
        """Test a single URL and print detailed results"""
        print(f"\nTesting URL: {url}")
        print("-" * 60)
        
        result = self.validate_url(url)
        
        print(f"Valid: {'✅ Yes' if result['valid'] else '❌ No'}")
        print(f"Status Code: {result['status_code'] or 'N/A'}")
        print(f"Response Time: {result['response_time']}s" if result['response_time'] else "Response Time: N/A")
        print(f"Content Type: {result['content_type'] or 'N/A'}")
        
        if result['redirect_url']:
            print(f"Redirected to: {result['redirect_url']}")
        
        if result['title']:
            print(f"Page Title: {result['title']}")
            
        if result['error']:
            print(f"Error: {result['error']}")
        
        print("-" * 60)
        return result


def main():
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        # Test single URL mode
        if len(sys.argv) > 2:
            validator = BookmarkValidator(None, None)
            validator.test_single_url(sys.argv[2])
        else:
            print("Usage: python3 bookmark_validator.py --test <URL>")
    else:
        # Full validation mode
        validator = BookmarkValidator(
            "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
            "/home/halcasteel/BOOKMARKS/VALIDATION_RESULTS"
        )
        
        validator.load_bookmarks()
        
        # You can test with a sample first
        # validator.validate_bookmarks(max_workers=10, sample_size=50)
        
        # Or validate all bookmarks
        validator.validate_bookmarks(max_workers=20)
        
        validator.save_results()


if __name__ == "__main__":
    main()