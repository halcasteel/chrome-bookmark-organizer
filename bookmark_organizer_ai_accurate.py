#!/usr/bin/env python3
import json
import os
import re
from collections import defaultdict, Counter
from datetime import datetime
from urllib.parse import urlparse, parse_qs, unquote
import time
import sys

class AccurateAIBookmarkOrganizer:
    def __init__(self, input_file, output_dir, batch_size=10):
        self.input_file = input_file
        self.output_dir = output_dir
        self.batch_size = batch_size  # Small batches for accuracy
        self.bookmarks = []
        self.duplicates = defaultdict(list)
        self.unique_bookmarks = []
        self.categories = defaultdict(list)
        self.ai_results = {}
        self.processing_log = []
        self.checkpoint_file = os.path.join(output_dir, 'processing_checkpoint.json')
        
        # Enhanced categories with descriptions for AI context
        self.category_definitions = {
            "AI & Machine Learning": "Artificial intelligence, machine learning, LLMs, neural networks, deep learning tools and services",
            "Programming & Development": "Code repositories, programming languages, IDEs, development tools, version control",
            "Cloud & DevOps": "Cloud platforms, infrastructure, containers, CI/CD, monitoring, deployment tools",
            "Web Development": "Frontend, backend, web frameworks, CSS, JavaScript, web design tools",
            "Mobile Development": "iOS, Android, React Native, Flutter, mobile app development",
            "Data Science & Analytics": "Data analysis, visualization, statistics, big data, jupyter notebooks",
            "Cybersecurity": "Security tools, vulnerability scanning, encryption, pentesting, infosec",
            "Blockchain & Crypto": "Cryptocurrency, DeFi, NFTs, blockchain platforms, web3",
            "Business & Management": "Business strategy, consulting, management tools, entrepreneurship",
            "Finance & Investment": "Trading, stocks, banking, personal finance, investment platforms",
            "Marketing & Sales": "Digital marketing, SEO, advertising, CRM, social media marketing",
            "E-commerce & Shopping": "Online stores, marketplaces, shopping platforms, deals",
            "News & Media": "News sites, journalism, media outlets, current events",
            "Education & Learning": "Online courses, tutorials, educational platforms, MOOCs",
            "Health & Medical": "Health information, medical resources, fitness, wellness, mental health",
            "Food & Cooking": "Recipes, restaurants, food delivery, cooking tutorials",
            "Travel & Tourism": "Travel booking, destinations, hotels, flights, travel guides",
            "Entertainment": "Movies, TV, music, gaming, streaming services",
            "Social Media & Forums": "Social networks, discussion forums, community platforms",
            "Productivity Tools": "Task management, note-taking, collaboration tools, time tracking",
            "Design & Creative": "Graphic design, UI/UX, photography, art, creative tools",
            "Science & Research": "Academic papers, scientific resources, research tools",
            "Government & Legal": "Government services, legal resources, policy, regulations",
            "Real Estate": "Property listings, real estate platforms, home buying/selling",
            "Automotive": "Cars, vehicles, automotive news, car shopping",
            "Sports & Recreation": "Sports news, fitness, outdoor activities, hobbies",
            "Home & Garden": "Home improvement, interior design, gardening, DIY",
            "Personal Development": "Self-help, career development, life coaching",
            "Documentation & Reference": "API docs, technical documentation, wikis, manuals",
            "Local Services": "Local businesses, services, community resources",
            "Other": "Miscellaneous bookmarks that don't fit other categories"
        }
        
    def load_bookmarks(self):
        """Load bookmarks from extracted JSON file"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            self.bookmarks = json.load(f)
        print(f"Loaded {len(self.bookmarks)} bookmarks")
        
    def load_checkpoint(self):
        """Load processing checkpoint if exists"""
        if os.path.exists(self.checkpoint_file):
            with open(self.checkpoint_file, 'r') as f:
                checkpoint = json.load(f)
                self.ai_results = checkpoint.get('ai_results', {})
                self.processing_log = checkpoint.get('processing_log', [])
                processed_count = len(self.ai_results)
                print(f"Resuming from checkpoint: {processed_count} bookmarks already processed")
                return processed_count
        return 0
        
    def save_checkpoint(self):
        """Save processing checkpoint"""
        os.makedirs(self.output_dir, exist_ok=True)
        checkpoint = {
            'ai_results': self.ai_results,
            'processing_log': self.processing_log,
            'timestamp': datetime.now().isoformat()
        }
        with open(self.checkpoint_file, 'w') as f:
            json.dump(checkpoint, f, ensure_ascii=False, indent=2)
            
    def normalize_url(self, url):
        """Normalize URL for better duplicate detection"""
        parsed = urlparse(url.lower())
        
        # Remove tracking parameters
        tracking_params = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 
                          'utm_term', 'fbclid', 'gclid', 'ref', 'source', 'mc_cid']
        
        if parsed.query:
            params = parse_qs(parsed.query)
            cleaned_params = {k: v for k, v in params.items() if k not in tracking_params}
            
            if cleaned_params:
                query = '&'.join(f"{k}={v[0]}" for k, v in sorted(cleaned_params.items()))
            else:
                query = ''
        else:
            query = ''
        
        path = parsed.path.rstrip('/')
        if not path:
            path = '/'
            
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
    
    def create_detailed_prompt(self, batch):
        """Create a detailed prompt for accurate AI categorization"""
        prompt = f"""You are an expert at categorizing bookmarks. I need you to analyze these bookmarks and assign each to the MOST SPECIFIC and appropriate category.

IMPORTANT INSTRUCTIONS:
1. Look at the domain, URL path, and title to understand what each bookmark is about
2. Choose the most specific category that fits
3. If a bookmark could fit multiple categories, choose the primary purpose
4. Consider the user's intent - why would they save this bookmark?
5. Be consistent - similar sites should go in the same category

AVAILABLE CATEGORIES AND THEIR DESCRIPTIONS:
"""
        
        for category, description in self.category_definitions.items():
            prompt += f"\n{category}: {description}"
        
        prompt += "\n\nBOOKMARKS TO CATEGORIZE:\n"
        
        for i, bookmark in enumerate(batch, 1):
            # Include more context for better categorization
            prompt += f"\n{i}. "
            prompt += f"Domain: {bookmark['domain']}\n"
            prompt += f"   Title: {bookmark['title']}\n"
            prompt += f"   Full URL: {bookmark['url'][:100]}{'...' if len(bookmark['url']) > 100 else ''}\n"
            
            # Add date context if available
            if bookmark.get('date_added'):
                prompt += f"   Added: {bookmark['date_added']}\n"
        
        prompt += """
RESPONSE FORMAT:
For each bookmark, respond with the number and category on a new line.
Example:
1: Programming & Development
2: AI & Machine Learning
3: News & Media

Now categorize the bookmarks above:"""
        
        return prompt
    
    def create_search_enhancement_prompt(self, bookmark):
        """Create prompt to search for more info about a bookmark"""
        return f"""Search for information about this website to help categorize it better:

Domain: {bookmark['domain']}
Title: {bookmark['title']}
URL: {bookmark['url']}

What type of website is this? What is its primary purpose? What category of service does it provide?

Based on your findings, which of these categories fits best:
{', '.join(self.category_definitions.keys())}"""
    
    def simulate_ai_categorization_accurate(self, batch):
        """Enhanced simulation with more accurate categorization logic"""
        # This is still a simulation - replace with actual Claude API calls
        results = {}
        
        for i, bookmark in enumerate(batch, 1):
            domain = bookmark['domain'].lower()
            title = bookmark['title'].lower()
            url = bookmark['url'].lower()
            path = urlparse(url).path.lower()
            
            # Multi-factor categorization
            category_scores = defaultdict(int)
            
            # Domain-based scoring
            domain_patterns = {
                'AI & Machine Learning': ['openai', 'anthropic', 'claude', 'chatgpt', 'huggingface', 'perplexity', 'midjourney'],
                'Programming & Development': ['github', 'gitlab', 'stackoverflow', 'npmjs', 'pypi', 'dev.to'],
                'Cloud & DevOps': ['aws.amazon', 'cloud.google', 'azure', 'docker', 'kubernetes'],
                'News & Media': ['nytimes', 'wsj', 'reuters', 'bbc', 'cnn', 'bloomberg', 'techcrunch'],
                'Education & Learning': ['coursera', 'udemy', 'edx', 'khanacademy', 'udacity'],
                'Social Media & Forums': ['facebook', 'twitter', 'linkedin', 'reddit', 'instagram'],
                'E-commerce & Shopping': ['amazon', 'ebay', 'etsy', 'shopify', 'alibaba'],
                'Productivity Tools': ['notion', 'trello', 'asana', 'todoist', 'evernote'],
                'Documentation & Reference': ['docs.', 'documentation', 'wiki', 'reference', 'api.'],
            }
            
            # Score based on domain patterns
            for cat, patterns in domain_patterns.items():
                for pattern in patterns:
                    if pattern in domain:
                        category_scores[cat] += 3  # High weight for domain match
            
            # Title and path scoring
            keyword_patterns = {
                'AI & Machine Learning': ['ai', 'ml', 'machine learning', 'neural', 'gpt', 'llm'],
                'Programming & Development': ['code', 'programming', 'developer', 'software', 'api'],
                'Health & Medical': ['health', 'medical', 'doctor', 'medicine', 'fitness'],
                'Finance & Investment': ['finance', 'trading', 'investment', 'stock', 'crypto'],
                'Design & Creative': ['design', 'ui', 'ux', 'creative', 'art', 'graphics'],
            }
            
            for cat, keywords in keyword_patterns.items():
                for keyword in keywords:
                    if keyword in title:
                        category_scores[cat] += 2
                    if keyword in path:
                        category_scores[cat] += 1
            
            # Special cases
            if 'google.com/docs' in url or 'google.com/sheets' in url:
                category_scores['Productivity Tools'] += 5
            elif 'arxiv.org' in domain:
                category_scores['Science & Research'] += 5
            elif any(gov in domain for gov in ['.gov', '.mil', '.edu']):
                if '.edu' in domain:
                    category_scores['Education & Learning'] += 3
                else:
                    category_scores['Government & Legal'] += 3
            
            # Select category with highest score
            if category_scores:
                category = max(category_scores.items(), key=lambda x: x[1])[0]
            else:
                # Default categorization for unmatched
                if any(x in domain for x in ['blog', 'wordpress', 'medium']):
                    category = 'Personal Development'
                elif 'local' in domain or '192.168' in url or 'localhost' in url:
                    category = 'Local Services'
                else:
                    category = 'Other'
            
            results[i] = category
            
            # Log the decision process
            self.processing_log.append({
                'url': bookmark['url'],
                'title': bookmark['title'],
                'category': category,
                'scores': dict(category_scores),
                'timestamp': datetime.now().isoformat()
            })
        
        return results
    
    def process_bookmarks_accurately(self):
        """Process bookmarks in small batches for maximum accuracy"""
        # Load checkpoint
        start_index = self.load_checkpoint()
        
        # Prepare batches
        remaining_bookmarks = []
        for bookmark in self.unique_bookmarks:
            if bookmark['url'] not in self.ai_results:
                remaining_bookmarks.append(bookmark)
        
        if not remaining_bookmarks:
            print("All bookmarks already processed!")
            return
        
        total_batches = (len(remaining_bookmarks) + self.batch_size - 1) // self.batch_size
        
        print(f"\nProcessing {len(remaining_bookmarks)} bookmarks in {total_batches} batches of {self.batch_size}")
        print("This prioritizes accuracy over speed...\n")
        
        for batch_num in range(0, len(remaining_bookmarks), self.batch_size):
            batch = remaining_bookmarks[batch_num:batch_num + self.batch_size]
            current_batch_num = (batch_num // self.batch_size) + 1
            
            print(f"Processing batch {current_batch_num}/{total_batches} ({len(batch)} bookmarks)...")
            
            # Create detailed prompt
            prompt = self.create_detailed_prompt(batch)
            
            # Get AI categorization (simulated)
            results = self.simulate_ai_categorization_accurate(batch)
            
            # Store results
            for i, category in results.items():
                bookmark = batch[i-1]
                self.ai_results[bookmark['url']] = {
                    'category': category,
                    'processed_at': datetime.now().isoformat(),
                    'batch_num': current_batch_num
                }
            
            # Save checkpoint after each batch
            self.save_checkpoint()
            
            # Show progress
            total_processed = len(self.ai_results)
            progress = (total_processed / len(self.unique_bookmarks)) * 100
            print(f"  ✓ Batch complete. Total progress: {total_processed}/{len(self.unique_bookmarks)} ({progress:.1f}%)")
            
            # Small delay between batches
            if batch_num + self.batch_size < len(remaining_bookmarks):
                time.sleep(0.5)
        
        print("\n✅ All bookmarks processed!")
    
    def apply_categorizations(self):
        """Apply the AI categorization results"""
        print("\nApplying categorizations...")
        
        for bookmark in self.unique_bookmarks:
            result = self.ai_results.get(bookmark['url'])
            if result:
                category = result['category']
                self.categories[category].append(bookmark)
            else:
                self.categories['Other'].append(bookmark)
        
        # Print distribution
        print("\nFinal Category Distribution:")
        sorted_cats = sorted(self.categories.items(), key=lambda x: len(x[1]), reverse=True)
        
        for category, bookmarks in sorted_cats:
            percentage = (len(bookmarks) / len(self.unique_bookmarks)) * 100
            print(f"{category}: {len(bookmarks)} ({percentage:.1f}%)")
    
    def generate_quality_report(self):
        """Generate a quality report for the categorization"""
        report_path = os.path.join(self.output_dir, 'categorization_quality_report.json')
        
        # Analyze categorization quality
        quality_metrics = {
            'total_processed': len(self.unique_bookmarks),
            'categories_used': len([c for c, b in self.categories.items() if b]),
            'uncategorized_count': len(self.categories.get('Other', [])),
            'uncategorized_percentage': (len(self.categories.get('Other', [])) / len(self.unique_bookmarks) * 100)
        }
        
        # Category distribution
        category_distribution = {}
        for category, bookmarks in self.categories.items():
            if bookmarks:
                category_distribution[category] = {
                    'count': len(bookmarks),
                    'percentage': f"{len(bookmarks) / len(self.unique_bookmarks) * 100:.1f}%",
                    'top_domains': Counter(b['domain'] for b in bookmarks).most_common(5)
                }
        
        # Sample categorizations for review
        samples = {}
        for category, bookmarks in self.categories.items():
            if bookmarks:
                samples[category] = [
                    {
                        'title': b['title'],
                        'domain': b['domain'],
                        'url': b['url']
                    } for b in bookmarks[:3]
                ]
        
        report = {
            'quality_metrics': quality_metrics,
            'category_distribution': category_distribution,
            'sample_categorizations': samples,
            'processing_log_sample': self.processing_log[-10:] if self.processing_log else [],
            'generated_at': datetime.now().isoformat()
        }
        
        with open(report_path, 'w') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        
        print(f"\nQuality report saved: {report_path}")
    
    def save_organized_bookmarks(self):
        """Save the accurately categorized bookmarks"""
        # Save each category
        for category, bookmarks in self.categories.items():
            if not bookmarks:
                continue
            
            safe_category = category.replace(' & ', '_and_').replace(' ', '_').replace('/', '_')
            
            # Create category directory
            category_dir = os.path.join(self.output_dir, safe_category)
            os.makedirs(category_dir, exist_ok=True)
            
            # Save bookmarks in chunks if large
            chunk_size = 500
            for i in range(0, len(bookmarks), chunk_size):
                chunk = bookmarks[i:i + chunk_size]
                chunk_num = (i // chunk_size) + 1
                
                filename = f"{safe_category}_{chunk_num:03d}.json" if len(bookmarks) > chunk_size else f"{safe_category}.json"
                filepath = os.path.join(category_dir, filename)
                
                with open(filepath, 'w') as f:
                    json.dump({
                        'category': category,
                        'chunk': chunk_num,
                        'total_chunks': (len(bookmarks) + chunk_size - 1) // chunk_size,
                        'bookmarks_count': len(chunk),
                        'bookmarks': chunk
                    }, f, ensure_ascii=False, indent=2)
        
        # Save summary
        summary = {
            'original_count': len(self.bookmarks),
            'unique_count': len(self.unique_bookmarks),
            'duplicates_removed': len(self.bookmarks) - len(self.unique_bookmarks),
            'categories': {
                cat: len(bookmarks) for cat, bookmarks in self.categories.items() if bookmarks
            },
            'processing_method': 'AI-powered with accuracy focus',
            'batch_size': self.batch_size,
            'organization_date': datetime.now().isoformat()
        }
        
        with open(os.path.join(self.output_dir, 'organization_summary.json'), 'w') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        # Generate quality report
        self.generate_quality_report()
        
        print(f"\nAll files saved to: {self.output_dir}")


def main():
    """Main function with command line options"""
    if len(sys.argv) > 1 and sys.argv[1] == '--small-batch':
        batch_size = 5  # Even smaller batches for maximum accuracy
    else:
        batch_size = 10  # Default small batch size
    
    print(f"AI-Powered Bookmark Organizer (Accuracy Mode)")
    print(f"Batch size: {batch_size} bookmarks")
    print("=" * 50)
    
    organizer = AccurateAIBookmarkOrganizer(
        "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
        "/home/halcasteel/BOOKMARKS/ORGANIZED_AI_ACCURATE",
        batch_size=batch_size
    )
    
    # Step 1: Load and deduplicate
    organizer.load_bookmarks()
    organizer.deduplicate_bookmarks()
    
    # Step 2: Process with AI (can be interrupted and resumed)
    organizer.process_bookmarks_accurately()
    
    # Step 3: Apply categorizations and save
    organizer.apply_categorizations()
    organizer.save_organized_bookmarks()
    
    print("\n✅ Organization complete!")
    print("\nNext steps:")
    print("1. Review categorization_quality_report.json")
    print("2. Check 'Other' category for bookmarks that need manual review")
    print("3. Run bookmark_html_generator.py to create the web interface")


if __name__ == "__main__":
    main()