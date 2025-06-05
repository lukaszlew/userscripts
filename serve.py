#!/usr/bin/env python3
"""
Simple HTTP server to serve userscripts with CORS headers
Usage: python3 serve.py
Serves on http://localhost:8001
"""

import http.server
import socketserver
import os
from urllib.parse import urlparse

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()


    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")

def main():
    import sys
    
    # Get port from command line argument or use default
    PORT = 8000
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print(f"❌ Invalid port: {sys.argv[1]}")
            print("Usage: python3 serve.py [port]")
            return
    
    # Change to the userscripts directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    try:
        with socketserver.TCPServer(("", PORT), CORSHTTPRequestHandler) as httpd:
            print(f"🚀 Serving userscripts on http://localhost:{PORT}")
            print(f"📁 Directory contents available at: http://localhost:{PORT}/")
            print(f"🔧 Use URLs like http://localhost:{PORT}/loader.user.js for development")
            print(f"💡 Press Ctrl+C to stop the server")
            
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\n🛑 Server stopped")
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"❌ Port {PORT} is already in use!")
            print("🔍 Checking for existing processes...")
            
            import subprocess
            
            # Find processes using the port
            try:
                result = subprocess.run(['lsof', '-i', f':{PORT}'], 
                                      capture_output=True, text=True)
                if result.stdout:
                    print("\n📋 Processes using port", PORT, ":")
                    lines = result.stdout.strip().split('\n')
                    if len(lines) > 1:
                        # Print header
                        print(lines[0])
                        # Print process lines and extract PIDs
                        pids = []
                        for line in lines[1:]:
                            print(line)
                            parts = line.split()
                            if len(parts) >= 2:
                                pids.append(parts[1])
                        
                        if pids:
                            print(f"\n💀 To kill these processes, run:")
                            for pid in pids:
                                print(f"   kill {pid}")
                            print(f"   # Or kill all at once: kill {' '.join(pids)}")
                else:
                    print("No processes found using lsof")
            except FileNotFoundError:
                # lsof not available, try netstat
                try:
                    result = subprocess.run(['netstat', '-tlnp'], 
                                          capture_output=True, text=True)
                    if result.stdout:
                        print(f"\n📋 Checking netstat for port {PORT}...")
                        for line in result.stdout.split('\n'):
                            if f':{PORT} ' in line:
                                print(line)
                                # Extract PID from netstat output
                                parts = line.split()
                                if len(parts) >= 7 and '/' in parts[6]:
                                    pid = parts[6].split('/')[0]
                                    if pid.isdigit():
                                        print(f"\n💀 To kill this process, run:")
                                        print(f"   kill {pid}")
                except FileNotFoundError:
                    print("Neither lsof nor netstat available")
                    print(f"Try manually: ps aux | grep {PORT}")
        else:
            print(f"❌ Error starting server: {e}")

if __name__ == "__main__":
    main()