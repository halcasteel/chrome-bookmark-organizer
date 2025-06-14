#!/usr/bin/env python3
import http.server
import socketserver
import os
import webbrowser
from threading import Timer

PORT = 8080
DIRECTORY = "/home/halcasteel/BOOKMARKS/HTML_SITE"

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
        print("📚 BOOKMARK BROWSER SERVER")
        print("=" * 50)
        print(f"\n✅ Server running at: http://localhost:{PORT}")
        print("\n📊 Statistics:")
        print("   - 4,327 unique bookmarks (229 duplicates removed)")
        print("   - 17 categories")
        print("   - Organized by domain and content type")
        print("\n🔍 Features:")
        print("   - Browse by category")
        print("   - Search within categories")
        print("   - View by domain grouping")
        print("   - Responsive design")
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