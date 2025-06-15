#!/usr/bin/env python3
import json
import os
from collections import defaultdict
from datetime import datetime
from urllib.parse import urlparse

class BookmarkProcessorForClaude:
    def __init__(self, input_file, output_dir, batch_size=10):
        self.input_file = input_file
        self.output_dir = output_dir
        self.batch_size = batch_size
        self.bookmarks = []
        self.unique_bookmarks = []
        self.batches_dir = os.path.join(output_dir, 'batches_for_claude')
        self.results_dir = os.path.join(output_dir, 'claude_results')
        
    def load_bookmarks(self):
        """Load bookmarks from extracted JSON file"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            self.bookmarks = json.load(f)
        print(f"Loaded {len(self.bookmarks)} bookmarks")
        
    def normalize_url(self, url):
        """Simple URL normalization"""
        parsed = urlparse(url.lower())
        netloc = parsed.netloc
        if netloc.startswith('www.'):
            netloc = netloc[4:]
        return f"{parsed.scheme}://{netloc}{parsed.path}".rstrip('/')
    
    def deduplicate(self):
        """Remove duplicates"""
        seen = set()
        for bookmark in self.bookmarks:
            normalized = self.normalize_url(bookmark['url'])
            if normalized not in seen:
                seen.add(normalized)
                self.unique_bookmarks.append(bookmark)
        
        print(f"After deduplication: {len(self.unique_bookmarks)} unique bookmarks")
    
    def create_batches(self):
        """Create small batches for Claude to process"""
        os.makedirs(self.batches_dir, exist_ok=True)
        os.makedirs(self.results_dir, exist_ok=True)
        
        total_batches = (len(self.unique_bookmarks) + self.batch_size - 1) // self.batch_size
        
        print(f"\nCreating {total_batches} batches of {self.batch_size} bookmarks each...")
        
        for i in range(0, len(self.unique_bookmarks), self.batch_size):
            batch_num = (i // self.batch_size) + 1
            batch = self.unique_bookmarks[i:i + self.batch_size]
            
            # Create batch file
            batch_data = {
                'batch_number': batch_num,
                'total_batches': total_batches,
                'bookmarks': []
            }
            
            for idx, bookmark in enumerate(batch):
                batch_data['bookmarks'].append({
                    'index': idx + 1,
                    'global_index': i + idx,
                    'domain': bookmark['domain'],
                    'title': bookmark['title'],
                    'url': bookmark['url'],
                    'date_added': bookmark.get('date_added', 'Unknown')
                })
            
            # Save batch
            batch_file = os.path.join(self.batches_dir, f'batch_{batch_num:04d}.json')
            with open(batch_file, 'w') as f:
                json.dump(batch_data, f, ensure_ascii=False, indent=2)
            
            print(f"Created batch {batch_num}/{total_batches}")
        
        # Create processing instructions
        self.create_instructions()
        
    def create_instructions(self):
        """Create instructions file for Claude"""
        instructions = {
            'instructions': """Please categorize these bookmarks into appropriate categories.

AVAILABLE CATEGORIES:
1. AI & Machine Learning - AI tools, ML platforms, LLMs, neural networks
2. Programming & Development - Code repos, IDEs, programming tools
3. Cloud & DevOps - Cloud platforms, containers, CI/CD, infrastructure
4. Web Development - Frontend, backend, web frameworks, web tools
5. Data Science - Analytics, visualization, jupyter, data tools
6. Cybersecurity - Security tools, infosec resources
7. Business & Finance - Business tools, finance, trading, investing
8. Marketing & Sales - Marketing tools, SEO, advertising
9. E-commerce & Shopping - Online stores, marketplaces
10. News & Media - News sites, journalism, media outlets
11. Education & Learning - Courses, tutorials, educational platforms
12. Health & Wellness - Health info, fitness, medical resources
13. Food & Cooking - Recipes, restaurants, food sites
14. Travel & Tourism - Travel booking, destinations, guides
15. Entertainment - Movies, TV, music, gaming, streaming
16. Social Media - Social networks, forums, communities
17. Productivity Tools - Task management, notes, collaboration
18. Design & Creative - Design tools, art, photography
19. Science & Research - Academic papers, research tools
20. Government & Legal - Government services, legal resources
21. Documentation & Reference - API docs, technical documentation
22. Personal/Blog - Personal websites, blogs
23. Other - Doesn't fit other categories

For each bookmark, respond with:
<bookmark_index>: <category>

Example:
1: AI & Machine Learning
2: Programming & Development
3: News & Media""",
            
            'batch_count': len(os.listdir(self.batches_dir)),
            'total_bookmarks': len(self.unique_bookmarks),
            'created_at': datetime.now().isoformat()
        }
        
        with open(os.path.join(self.output_dir, 'CLAUDE_INSTRUCTIONS.json'), 'w') as f:
            json.dump(instructions, f, ensure_ascii=False, indent=2)
        
        print(f"\nInstructions saved to: {os.path.join(self.output_dir, 'CLAUDE_INSTRUCTIONS.json')}")
    
    def get_next_batch(self):
        """Get the next unprocessed batch"""
        batch_files = sorted([f for f in os.listdir(self.batches_dir) if f.endswith('.json')])
        result_files = [f for f in os.listdir(self.results_dir) if f.endswith('.json')]
        
        # Find first unprocessed batch
        for batch_file in batch_files:
            batch_num = int(batch_file.split('_')[1].split('.')[0])
            result_file = f'result_{batch_num:04d}.json'
            
            if result_file not in result_files:
                # Load and return this batch
                with open(os.path.join(self.batches_dir, batch_file), 'r') as f:
                    batch_data = json.load(f)
                
                print(f"\nNext batch to process: {batch_file}")
                print(f"Batch {batch_data['batch_number']} of {batch_data['total_batches']}")
                print("\nBookmarks in this batch:")
                
                for bookmark in batch_data['bookmarks']:
                    print(f"\n{bookmark['index']}. {bookmark['domain']}")
                    print(f"   Title: {bookmark['title']}")
                    print(f"   URL: {bookmark['url'][:80]}...")
                
                return batch_data
        
        print("\nAll batches have been processed!")
        return None
    
    def save_batch_results(self, batch_number, results):
        """Save categorization results for a batch"""
        result_file = os.path.join(self.results_dir, f'result_{batch_number:04d}.json')
        
        result_data = {
            'batch_number': batch_number,
            'processed_at': datetime.now().isoformat(),
            'categorizations': results
        }
        
        with open(result_file, 'w') as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)
        
        print(f"Saved results for batch {batch_number}")
    
    def compile_results(self):
        """Compile all batch results into final categorized bookmarks"""
        print("\nCompiling results...")
        
        # Load all results
        all_results = {}
        result_files = sorted([f for f in os.listdir(self.results_dir) if f.endswith('.json')])
        
        for result_file in result_files:
            with open(os.path.join(self.results_dir, result_file), 'r') as f:
                result_data = json.load(f)
                batch_num = result_data['batch_number']
                
                # Load corresponding batch
                batch_file = os.path.join(self.batches_dir, f'batch_{batch_num:04d}.json')
                with open(batch_file, 'r') as bf:
                    batch_data = json.load(bf)
                
                # Map results to bookmarks
                for bookmark in batch_data['bookmarks']:
                    global_idx = bookmark['global_index']
                    local_idx = bookmark['index']
                    
                    if str(local_idx) in result_data['categorizations']:
                        category = result_data['categorizations'][str(local_idx)]
                        all_results[global_idx] = category
        
        # Apply categorizations
        categories = defaultdict(list)
        for idx, bookmark in enumerate(self.unique_bookmarks):
            category = all_results.get(idx, 'Other')
            categories[category].append(bookmark)
        
        # Save final organized bookmarks
        self.save_final_results(categories)
        
        return categories
    
    def save_final_results(self, categories):
        """Save the final organized bookmarks"""
        final_dir = os.path.join(self.output_dir, 'final_organized')
        os.makedirs(final_dir, exist_ok=True)
        
        # Save each category
        for category, bookmarks in categories.items():
            if bookmarks:
                safe_name = category.replace(' & ', '_').replace(' ', '_').replace('/', '_')
                filepath = os.path.join(final_dir, f'{safe_name}.json')
                
                with open(filepath, 'w') as f:
                    json.dump({
                        'category': category,
                        'count': len(bookmarks),
                        'bookmarks': bookmarks
                    }, f, ensure_ascii=False, indent=2)
        
        # Save summary
        summary = {
            'total_bookmarks': len(self.unique_bookmarks),
            'categories': {cat: len(bookmarks) for cat, bookmarks in categories.items()},
            'processed_at': datetime.now().isoformat()
        }
        
        with open(os.path.join(self.output_dir, 'final_summary.json'), 'w') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        
        print(f"\nFinal results saved to: {final_dir}")
        print("\nCategory distribution:")
        for cat, bookmarks in sorted(categories.items(), key=lambda x: len(x[1]), reverse=True):
            print(f"{cat}: {len(bookmarks)}")


def main():
    processor = BookmarkProcessorForClaude(
        "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
        "/home/halcasteel/BOOKMARKS/CLAUDE_PROCESSING",
        batch_size=10
    )
    
    # Prepare bookmarks
    processor.load_bookmarks()
    processor.deduplicate()
    processor.create_batches()
    
    print("\n" + "="*60)
    print("BOOKMARKS PREPARED FOR CLAUDE PROCESSING")
    print("="*60)
    print(f"\nBatches created in: {processor.batches_dir}")
    print(f"Results will be saved in: {processor.results_dir}")
    print("\nTo process with Claude:")
    print("1. Run: python3 bookmark_processor_for_claude.py --next")
    print("2. Claude will categorize the batch")
    print("3. Save results and repeat until all batches are done")
    print("4. Run: python3 bookmark_processor_for_claude.py --compile")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        processor = BookmarkProcessorForClaude(
            "/home/halcasteel/BOOKMARKS/ANALYSIS/bookmarks_extracted.json",
            "/home/halcasteel/BOOKMARKS/CLAUDE_PROCESSING",
            batch_size=10
        )
        
        if sys.argv[1] == '--next':
            # Get next batch to process
            batch = processor.get_next_batch()
            
        elif sys.argv[1] == '--save' and len(sys.argv) > 2:
            # Save results for a batch
            # Usage: --save <batch_number> <results_json>
            batch_num = int(sys.argv[2])
            results = json.loads(sys.argv[3])
            processor.save_batch_results(batch_num, results)
            
        elif sys.argv[1] == '--compile':
            # Compile all results
            processor.compile_results()
    else:
        main()