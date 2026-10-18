#!/usr/bin/env python3
"""Inline src/style.css and src/js/*.js into docs/index.html (the site GitHub Pages serves)."""
import glob
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page = open(os.path.join(ROOT, "src", "page.html")).read()
css = open(os.path.join(ROOT, "src", "style.css")).read()
js = "\n".join(open(f).read() for f in sorted(glob.glob(os.path.join(ROOT, "src", "js", "*.js"))))
out = page.replace("/*CSS*/", css).replace("/*JS*/", js)
os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
with open(os.path.join(ROOT, "docs", "index.html"), "w") as f:
    f.write(out)
print(f"docs/index.html {len(out)/1024:.0f} KB")
