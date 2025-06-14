#!/usr/bin/env python3
import http.server
import socketserver
import os
import webbrowser
from threading import Timer

PORT = 8080
DIRECTORY = "/home/halcasteel/BOOKMARKS/HTML_SITE_CLEAN"

class BookmarkHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Add headers to prevent caching during development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

def open_browser():
    """Open the browser after a short delay"""
    webbrowser.open(f'http://localhost:{PORT}')

def serve():
    """Start the HTTP server"""
    with socketserver.TCPServer(("", PORT), BookmarkHTTPRequestHandler) as httpd:
        print("=" * 50)
        print("📚 CLEAN BOOKMARK BROWSER SERVER")
        print("=" * 50)
        print(f"\n✅ Server running at: http://localhost:{PORT}")
        print("\n📊 Statistics:")
        print("   - 4,183 verified bookmarks")
        print("   - 144 suspicious bookmarks in 'Needs Review'")
        print("   - 229 duplicates removed")
        print("   - 18 categories")
        print("\n🔍 Smart Filtering Applied:")
        print("   - Excluded bookmarks >5 years old")
        print("   - Flagged personal blogs & discontinued services")
        print("   - Separated bookmarks with error keywords")
        print("\n✨ Features:")
        print("   - Browse by category")
        print("   - Search within categories")
        print("   - View by domain grouping")
        print("   - Responsive design")
        print("   - 'Needs Review' section for suspicious links")
        print("\n⚡ Press Ctrl+C to stop the server\n")
        
        # Open browser after 1 second
        Timer(1.0, open_browser).start()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n🛑 Server stopped")

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    serve()