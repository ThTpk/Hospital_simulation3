#!/usr/bin/env python3
"""Development server with caching switched off.

    python serve.py          -> http://localhost:8767

The built index.html needs no server at all — open it from the file system. This exists for working on the source
under sim/, where the browser will otherwise hold on to an old .js and you will swear the edit did nothing.
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8767


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # one line per request, without the date noise
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), NoCache) as httpd:
        print(f"serving this folder on http://localhost:{PORT}  (ctrl-c to stop)")
        print(f"  the built page:   http://localhost:{PORT}/index.html")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
