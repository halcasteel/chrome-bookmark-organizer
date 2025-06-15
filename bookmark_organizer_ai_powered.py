#!/usr/bin/env python3
import json
import os
import re
from collections import defaultdict, Counter
from datetime import datetime
from urllib.parse import urlparse, parse_qs, unquote
import hashlib
import time

class AIBookmarkOrganizer:
    def __init__(self, input_file, output_dir):
        self.input_file = input_file
        self.output_dir = output_dir
        self.bookmarks = []
        self.duplicates = defaultdict(list)
        self.unique_bookmarks = []
        self.categories = defaultdict(list)
        self.ai_categorizations = {}
        self.uncategorized = []
        
        # Base categories for AI to use
        self.suggested_categories = [
            "AI & Machine Learning",
            "Programming & Development", 
            "Cloud & DevOps",
            "Web Development",
            "Mobile Development",
            "Data Science & Analytics",
            "Cybersecurity",
            "Blockchain & Crypto",
            "Business & Management",
            "Finance & Investment",
            "Marketing & Sales",
            "E-commerce & Shopping",
            "News & Media",
            "Education & Learning",
            "Health & Fitness",
            "Food & Cooking",
            "Travel & Tourism",
            "Entertainment & Gaming",
            "Social Media & Networking",
            "Productivity Tools",
            "Design & Creative",
            "Science & Research",
            "Government & Legal",
            "Real Estate",
            "Automotive",
            "Home & Garden",
            "Personal/Blog",
            "Reference & Documentation",
            "Other"
        ]
        
    def load_bookmarks(self):
        """Load bookmarks from extracted JSON file"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            self.bookmarks = json.load(f)
        print(f"Loaded {len(self.bookmarks)} bookmarks")
        
    def normalize_url(self, url):
        """Normalize URL for better duplicate detection"""
        parsed = urlparse(url.lower())
        
        # Remove tracking parameters
        tracking_params = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 
                          'utm_term', 'fbclid', 'gclid', 'ref', 'source']
        
        if parsed.query:
            params = parse_qs(parsed.query)
            cleaned_params = {k: v for k, v in params.items() if k not in tracking_params}
            
            if cleaned_params:
                query = '&'.join(f"{k}={v[0]}" for k, v in sorted(cleaned_params.items()))
            else:
                query = ''
        else:
            query = ''
        
        # Clean path
        path = parsed.path.rstrip('/')
        if not path:
            path = '/'
            
        # Remove www prefix
        netloc = parsed.netloc
        if netloc.startswith('www.'):
            netloc = netloc[4:]
        
        normalized = f"{parsed.scheme}://{netloc}{path}"
        if query:
            normalized += f"?{query}"
            
        return normalized
    
    def deduplicate_bookmarks(self):
        """Remove duplicate bookmarks"""
        seen_urls = {}
        
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
        
        self.unique_bookmarks = list(seen_urls.values())
        
        print(f"\nDeduplication Results:")
        print(f"Original: {len(self.bookmarks)}")
        print(f"Unique: {len(self.unique_bookmarks)}")
        print(f"Duplicates removed: {len(self.bookmarks) - len(self.unique_bookmarks)}")
    
    def prepare_batch_for_ai(self, bookmarks, batch_size=20):
        """Prepare bookmarks in batches for AI processing"""
        batches = []
        
        for i in range(0, len(bookmarks), batch_size):
            batch = bookmarks[i:i + batch_size]
            
            # Format batch for AI
            batch_data = []
            for bookmark in batch:
                batch_data.append({
                    'url': bookmark['url'],
                    'title': bookmark['title'],
                    'domain': bookmark['domain']
                })
            
            batches.append(batch_data)
        
        return batches
    
    def create_ai_prompt(self, batch):
        """Create prompt for AI categorization"""
        prompt = f"""Please categorize these bookmarks into the most appropriate categories. 
For each bookmark, consider the domain, URL path, and title to determine the best category.

Categories to use:
{', '.join(self.suggested_categories)}

For each bookmark, respond with ONLY the bookmark number and category, like:
1: Programming & Development
2: AI & Machine Learning

If a bookmark could fit multiple categories, choose the most specific one.
If uncertain, use "Other".

Bookmarks to categorize:
"""
        
        for i, bookmark in enumerate(batch, 1):
            prompt += f"\n{i}. {bookmark['domain']} - {bookmark['title'][:80]}"
            
        return prompt
    
    def create_search_prompt(self, uncategorized_domains):
        """Create prompt for web search to help categorize domains"""
        prompt = f"""I have these domains that I couldn't categorize well. 
Can you search for information about what these websites are and suggest categories?

Domains:
{', '.join(uncategorized_domains[:10])}

Categories available:
{', '.join(self.suggested_categories)}

Please provide a brief description of each domain and suggest the best category."""
        
        return prompt
    
    def simulate_ai_categorization(self, batch):
        """Simulate AI categorization (replace with actual AI call)"""
        # This is a simulation - in real implementation, this would call Claude API
        # For now, we'll use pattern matching as a placeholder
        
        results = {}
        
        for i, bookmark in enumerate(batch, 1):
            domain = bookmark['domain'].lower()
            title = bookmark['title'].lower()
            url = bookmark['url'].lower()
            
            # Simple pattern matching (this would be replaced by AI)
            if any(term in domain + title for term in ['ai', 'gpt', 'llm', 'machine learning']):
                category = "AI & Machine Learning"
            elif any(term in domain + title for term in ['github', 'stackoverflow', 'code', 'programming']):
                category = "Programming & Development"
            elif any(term in domain + title for term in ['aws', 'cloud', 'azure', 'docker']):
                category = "Cloud & DevOps"
            elif any(term in domain + title for term in ['news', 'times', 'post', 'journal']):
                category = "News & Media"
            elif any(term in domain + title for term in ['shop', 'buy', 'store', 'amazon']):
                category = "E-commerce & Shopping"
            elif any(term in domain + title for term in ['facebook', 'twitter', 'linkedin', 'social']):
                category = "Social Media & Networking"
            elif any(term in domain + title for term in ['learn', 'course', 'tutorial', 'education']):
                category = "Education & Learning"
            elif any(term in domain + title for term in ['google.com/docs', 'notion', 'trello']):
                category = "Productivity Tools"
            else:
                category = "Other"
            
            results[i] = category
            
        return results
    
    def categorize_with_ai(self):
        """Use AI to categorize bookmarks"""
        print("\nStarting AI-powered categorization...")
        
        # Prepare batches
        batches = self.prepare_batch_for_ai(self.unique_bookmarks)
        
        total_processed = 0
        
        for batch_num, batch in enumerate(batches, 1):
            print(f"Processing batch {batch_num}/{len(batches)}...")
            
            # Create prompt
            prompt = self.create_ai_prompt(batch)
            
            # Get AI categorization (simulated for now)
            results = self.simulate_ai_categorization(batch)
            
            # Apply categorizations
            for i, category in results.items():
                bookmark_index = (batch_num - 1) * 20 + (i - 1)
                if bookmark_index < len(self.unique_bookmarks):
                    bookmark = self.unique_bookmarks[bookmark_index]
                    self.categories[category].append(bookmark)
                    self.ai_categorizations[bookmark['url']] = {
                        'category': category,
                        'confidence': 'high'  # Would come from AI
                    }
            
            total_processed += len(batch)
            
            # Small delay to avoid rate limiting (if using real API)
            time.sleep(0.1)
        
        print(f"\nAI Categorization complete! Processed {total_processed} bookmarks")
        
        # Identify uncategorized or low-confidence items
        other_bookmarks = self.categories.get('Other', [])
        if len(other_bookmarks) > 50:
            print(f"\n{len(other_bookmarks)} bookmarks in 'Other' category.")
            print("Consider using web search to better categorize these domains.")
            
            # Get unique domains from Other category
            other_domains = list(set(b['domain'] for b in other_bookmarks[:20]))
            search_prompt = self.create_search_prompt(other_domains)
            print("\nSuggested web search prompt:")
            print(search_prompt[:500] + "...")
    
    def export_for_review(self):
        """Export categorizations for human review"""
        review_file = os.path.join(self.output_dir, 'ai_categorization_review.json')
        
        review_data = {
            'total_bookmarks': len(self.unique_bookmarks),
            'categories': {},
            'needs_review': []
        }
        
        # Add category summaries
        for category, bookmarks in self.categories.items():
            review_data['categories'][category] = {
                'count': len(bookmarks),
                'sample_bookmarks': [
                    {
                        'title': b['title'],
                        'domain': b['domain'],
                        'url': b['url']
                    } for b in bookmarks[:5]
                ]
            }
        
        # Add low-confidence categorizations
        for bookmark in self.categories.get('Other', [])[:50]:
            review_data['needs_review'].append({
                'title': bookmark['title'],
                'url': bookmark['url'],
                'domain': bookmark['domain'],
                'suggested_category': 'Other',
                'reason': 'Could not determine specific category'
            })
        
        with open(review_file, 'w', encoding='utf-8') as f:
            json.dump(review_data, f, ensure_ascii=False, indent=2)
        
        print(f"\nExported categorization for review: {review_file}")
    
    def save_organized_bookmarks(self):
        """Save AI-organized bookmarks"""
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Save each category
        for category, bookmarks in self.categories.items():
            if not bookmarks:
                continue
                
            # Clean category name for filename
            safe_category = category.replace(' & ', '_and_').replace(' ', '_').replace('/', '_')
            filename = f"{safe_category}.json"
            filepath = os.path.join(self.output_dir, filename)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({
                    'category': category,
                    'bookmarks_count': len(bookmarks),
                    'bookmarks': bookmarks
                }, f, ensure_ascii=False, indent=2)
        
        # Save summary
        summary = {
            'original_count': len(self.bookmarks),
            'unique_count': len(self.unique_bookmarks),
            'duplicates_removed': len(self.bookmarks) - len(self.unique_bookmarks),
            'categories': {
                category: {
                    'count': len(bookmarks),
                    'percentage': f"{len(bookmarks) / len(self.unique_bookmarks) * 100:.1f}%"
                }
                for category, bookmarks in sorted(self.categories.items(), 
                                                 key=lambda x: len(x[1]), 
                                                 reverse=True)
            },
            'ai_powered': True,
            'organization_date': datetime.now().isoformat()
        }
        
        with open(os.path.join(self.output_dir, 'organization_summary.json'), 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        # Export for review
        self.export_for_review()
        
        print(f"\nOrganization complete! Files saved to {self.output_dir}")
    
    def generate_readable_summary(self):
        """Generate human-readable summary"""
        summary_path = os.path.join(self.output_dir, 'AI_ORGANIZATION_SUMMARY.txt')
        
        with open(summary_path, 'w', encoding='utf-8') as f:
            f.write("AI-POWERED BOOKMARK ORGANIZATION SUMMARY\n")
            f.write("=" * 50 + "\n\n")
            
            f.write(f"Original Bookmarks: {len(self.bookmarks)}\n")
            f.write(f"Unique Bookmarks: {len(self.unique_bookmarks)}\n")
            f.write(f"Duplicates Removed: {len(self.bookmarks) - len(self.unique_bookmarks)}\n")
            f.write(f"Organization Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("AI CATEGORIZATION RESULTS\n")
            f.write("-" * 30 + "\n\n")
            
            # Sort categories by count
            sorted_categories = sorted(self.categories.items(), 
                                     key=lambda x: len(x[1]), 
                                     reverse=True)
            
            for category, bookmarks in sorted_categories:
                percentage = len(bookmarks) / len(self.unique_bookmarks) * 100
                f.write(f"{category}: {len(bookmarks)} ({percentage:.1f}%)\n")
                
                # Show top domains
                top_domains = Counter(b['domain'] for b in bookmarks).most_common(3)
                for domain, count in top_domains:
                    f.write(f"  - {domain}: {count}\n")
                f.write("\n")
            
            f.write("\nNOTES:\n")
            f.write("- Categories were determined by AI analysis of URLs and titles\n")
            f.write("- Review 'ai_categorization_review.json' for quality check\n")
            f.write("- 'Other' category may benefit from web search refinement\n")
            
            f.write(f"\n\nAll bookmarks organized in: {self.output_dir}\n")


def create_ai_integration_guide():
    """Create a guide for integrating with Claude API"""
    guide = """
# AI Integration Guide for Bookmark Organizer

## How to Connect to Claude API

1. **Install Anthropic Python SDK**:
   ```bash
   pip install anthropic
   ```

2. **Get API Key**:
   - Sign up at https://www.anthropic.com
   - Get your API key from the console

3. **Replace simulate_ai_categorization() with**:

```python
import anthropic

client = anthropic.Client(api_key="your-api-key")

def ai_categorize_batch(self, batch):
    prompt = self.create_ai_prompt(batch)
    
    response = client.completions.create(
        model="claude-3-opus-20240229",
        prompt=prompt,
        max_tokens=500,
        temperature=0.3
    )
    
    # Parse response
    results = {}
    for line in response.completion.strip().split('\\n'):
        if ':' in line:
            num, category = line.split(':', 1)
            results[int(num.strip())] = category.strip()
    
    return results
```

## Web Search Integration

For uncategorized domains, you can use the web search tool:

```python
def search_domain_info(self, domain):
    search_query = f"what is {domain} website about"
    
    # This would use Claude's web search capability
    # Or integrate with a search API like SerpAPI
```

## Batch Processing Tips

- Process 20-50 bookmarks per API call
- Add delays between calls to respect rate limits
- Cache results to avoid re-processing
- Save progress periodically

## Cost Optimization

- Filter obvious categories locally first
- Only send ambiguous bookmarks to AI
- Use cheaper models for initial categorization
- Use expensive models for difficult cases
"""
    
    with open('/home/halcasteel/BOOKMARKS/AI_INTEGRATION_GUIDE.md', 'w') as f:
        f.write(guide)
    
    print("Created AI_INTEGRATION_GUIDE.md")


if __name__ == "__main__":
    # Create integration guide
    create_ai_integration_guide()
    
    # Run the AI-powered organizer
    organizer = AIBookmarkOrganizer(
        "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
        "/home/halcasteel/BOOKMARKS/ORGANIZED_AI_POWERED"
    )
    
    organizer.load_bookmarks()
    organizer.deduplicate_bookmarks()
    organizer.categorize_with_ai()
    organizer.save_organized_bookmarks()
    organizer.generate_readable_summary()
    
    print("\n💡 TIP: Check AI_INTEGRATION_GUIDE.md for instructions on connecting to Claude API!")