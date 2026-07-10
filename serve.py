"""Dev server: python3 serve.py — serves this folder at http://127.0.0.1:8901"""
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = str(Path(__file__).resolve().parent)
handler = partial(SimpleHTTPRequestHandler, directory=ROOT)
print(f"Serving {ROOT} at http://127.0.0.1:8901")
HTTPServer(("127.0.0.1", 8901), handler).serve_forever()
