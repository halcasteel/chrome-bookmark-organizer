#!/usr/bin/env python3
import json
import os
import math

def chunk_file_by_size(input_file, output_dir, max_chunk_size=100000, overlap_percent=0.05):
    """
    Chunk a file into smaller parts based on size with proportional overlap and JSON metadata.
    
    Args:
        input_file: Path to the input file
        output_dir: Directory to save chunks
        max_chunk_size: Maximum size of each chunk in bytes (~100KB)
        overlap_percent: Percentage of lines to overlap (0.05 = 5%)
    """
    # Read all lines from the input file
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    total_lines = len(lines)
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    chunk_num = 1
    start_line = 0
    chunks_info = []
    
    # First pass: determine chunk boundaries based on size
    while start_line < total_lines:
        # Build chunk content line by line until we reach size limit
        chunk_lines = []
        current_size = 0
        end_line = start_line
        
        # Add lines until we reach the size limit or end of file
        while end_line < total_lines:
            line = lines[end_line]
            line_size = len(line.encode('utf-8'))
            
            # Check if adding this line would exceed the limit
            # Always include at least one line per chunk
            if current_size + line_size > max_chunk_size and len(chunk_lines) > 0:
                break
            
            chunk_lines.append(line)
            current_size += line_size
            end_line += 1
        
        # Calculate overlap based on 5% of current chunk's line count
        lines_in_chunk = end_line - start_line
        overlap_lines = max(1, int(lines_in_chunk * overlap_percent))
        
        # Store chunk info for metadata
        chunks_info.append({
            'start': start_line,
            'end': end_line,
            'size': current_size,
            'overlap': overlap_lines if end_line < total_lines else 0
        })
        
        # Calculate start of next chunk with proportional overlap
        if end_line < total_lines:
            # Go back by calculated overlap lines from the end
            next_start = max(start_line + 1, end_line - overlap_lines)
        else:
            next_start = total_lines
        
        start_line = next_start
    
    # Second pass: create the actual chunks with proper metadata
    total_chunks = len(chunks_info)
    
    for chunk_num, chunk_info in enumerate(chunks_info, 1):
        # Extract chunk content
        start = chunk_info['start']
        end = chunk_info['end']
        chunk_content = lines[start:end]
        
        # Create metadata
        metadata = {
            "chunk_number": chunk_num,
            "total_chunks": total_chunks,
            "chunk_start_line": start + 1,  # 1-indexed for readability
            "chunk_end_line": end,
            "overlap_lines": chunk_info['overlap'],
            "overlap_percent": f"{overlap_percent * 100:.1f}%",
            "total_lines": total_lines,
            "lines_in_chunk": len(chunk_content),
            "chunk_size_bytes": chunk_info['size']
        }
        
        # Create chunk filename
        chunk_filename = f"chunk_{chunk_num:04d}.json"
        chunk_path = os.path.join(output_dir, chunk_filename)
        
        # Write chunk with metadata
        chunk_data = {
            "metadata": metadata,
            "content": ''.join(chunk_content)
        }
        
        with open(chunk_path, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, ensure_ascii=False, indent=2)
        
        print(f"Created {chunk_filename}: lines {metadata['chunk_start_line']}-{metadata['chunk_end_line']} "
              f"({metadata['chunk_size_bytes']:,} bytes, {metadata['overlap_lines']} overlap lines)")
    
    print(f"\nChunking complete!")
    print(f"Total lines: {total_lines}")
    print(f"Total chunks: {total_chunks}")
    print(f"Overlap: {overlap_percent * 100:.1f}% of each chunk")
    print(f"Output directory: {output_dir}")

if __name__ == "__main__":
    input_file = "/home/halcasteel/BOOKMARKS/bookmarks_6_14_25.html"
    output_dir = "/home/halcasteel/BOOKMARKS/BOOKMARK-CHUNKS"
    
    chunk_file_by_size(input_file, output_dir, max_chunk_size=100000, overlap_percent=0.05)