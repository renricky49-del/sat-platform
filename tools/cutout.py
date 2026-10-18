#!/usr/bin/env python3
"""Cut the flat background out of generated pixel-art images and shrink them for the app."""
import sys
from collections import deque
from PIL import Image


def cutout(src, dst, max_side=256, tol=40):
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    bg = px[2, 2][:3]
    def is_bg(c):
        return sum(abs(c[i] - bg[i]) for i in range(3)) <= tol
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    # soften the light fringe left by anti-aliasing
    for _ in range(2):
        clear = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                c = px[x, y]
                if c[3] == 0:
                    continue
                if any(px[nx, ny][3] == 0 for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                    if sum(abs(c[i] - bg[i]) for i in range(3)) <= tol * 2.2:
                        clear.append((x, y))
        for x, y in clear:
            px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    im = im.crop(bbox)
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    im.save(dst, optimize=True)
    print(dst, im.size)


if __name__ == "__main__":
    max_side = int(sys.argv[3]) if len(sys.argv) > 3 else 256
    cutout(sys.argv[1], sys.argv[2], max_side)
