#!/usr/bin/env python3
"""Align the three poses of each cat, cut them out on one canvas and measure the head for hats."""
import json
import numpy as np
from PIL import Image
from collections import deque


def mask_cut(path, tol=40):
    im = Image.open(path).convert("RGBA")
    a = np.array(im).astype(np.int16)
    h, w = a.shape[:2]
    bg = a[3, 3, :3]
    near = np.abs(a[:, :, :3] - bg).sum(axis=2) <= tol
    seen = np.zeros((h, w), bool)
    q = deque([(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)])
    out = np.zeros((h, w), bool)
    while q:
        y, x = q.popleft()
        if seen[y, x]:
            continue
        seen[y, x] = True
        if not near[y, x]:
            continue
        out[y, x] = True
        if y > 0: q.append((y - 1, x))
        if y < h - 1: q.append((y + 1, x))
        if x > 0: q.append((y, x - 1))
        if x < w - 1: q.append((y, x + 1))
    # strip light anti-alias fringe next to the background
    for _ in range(2):
        edge = np.zeros_like(out)
        edge[1:, :] |= out[:-1, :]; edge[:-1, :] |= out[1:, :]; edge[:, 1:] |= out[:, :-1]; edge[:, :-1] |= out[:, 1:]
        fringe = edge & ~out & (np.abs(a[:, :, :3] - bg).sum(axis=2) <= tol * 2.2)
        out |= fringe
    rgba = np.array(im)
    rgba[out, 3] = 0
    return rgba


def best_shift(ref, mov, region):
    """Shift (dy, dx) that makes mov's alpha match ref's alpha inside the head region."""
    r = ref[:, :, 3] > 0
    m = mov[:, :, 3] > 0
    y0, y1 = region
    best, arg = -1, (0, 0)
    for dy in range(-48, 49, 4):
        for dx in range(-48, 49, 4):
            sh = np.roll(np.roll(m, dy, 0), dx, 1)
            score = (sh[y0:y1] & r[y0:y1]).sum() - 0.5 * (sh[y0:y1] ^ r[y0:y1]).sum()
            if score > best:
                best, arg = score, (dy, dx)
    dy0, dx0 = arg
    for dy in range(dy0 - 3, dy0 + 4):
        for dx in range(dx0 - 3, dx0 + 4):
            sh = np.roll(np.roll(m, dy, 0), dx, 1)
            score = (sh[y0:y1] & r[y0:y1]).sum() - 0.5 * (sh[y0:y1] ^ r[y0:y1]).sum()
            if score > best:
                best, arg = score, (dy, dx)
    return arg


meta = {}
for cat in ("orange", "tuxedo", "calico"):
    base = mask_cut(f"assets_src/cat_{cat}.png")
    ys, xs = np.nonzero(base[:, :, 3])
    top, bot = ys.min(), ys.max()
    head_region = (top, top + int((bot - top) * 0.45))
    poses = {"base": base}
    for p in ("blink", "cheer"):
        mov = mask_cut(f"assets_src/cat_{cat}_{p}.png")
        dy, dx = best_shift(base, mov, head_region if p == "blink" else (top, top + int((bot - top) * 0.30)))
        poses[p] = np.roll(np.roll(mov, dy, 0), dx, 1)
        print(cat, p, "shift", dy, dx)
    alpha = np.zeros(base.shape[:2], bool)
    for v in poses.values():
        alpha |= v[:, :, 3] > 0
    ys, xs = np.nonzero(alpha)
    pad = 6
    y0, y1, x0, x1 = max(ys.min() - pad, 0), ys.max() + pad, max(xs.min() - pad, 0), xs.max() + pad
    H = 320
    scale = H / (y1 - y0)
    W = round((x1 - x0) * scale)
    for k, v in poses.items():
        im = Image.fromarray(v[y0:y1, x0:x1]).resize((W, H), Image.LANCZOS)
        name = f"app/img/cat_{cat}.png" if k == "base" else f"app/img/cat_{cat}_{k}.png"
        im.save(name, optimize=True)
    # head metrics on the base pose (in output pixels)
    b = poses["base"][y0:y1, x0:x1, 3] > 0
    rows = np.nonzero(b.any(axis=1))[0]
    t, btm = rows.min(), rows.max()
    hh = btm - t
    band = b[t + int(hh * 0.18): t + int(hh * 0.36)]
    cols = np.nonzero(band.any(axis=0))[0]
    hx0, hx1 = cols.min(), cols.max()
    cx = (hx0 + hx1) / 2
    # head top at the centre column (between the ears)
    col = b[:, int(cx) - 3:int(cx) + 4].any(axis=1)
    htop = np.nonzero(col)[0].min()
    meta[cat] = {
        "w": W, "h": H,
        "headX": round(cx * scale / scale / ((x1 - x0) / W) / W, 4) if False else round(cx / b.shape[1], 4),
        "headTop": round(htop / b.shape[0], 4),
        "earTop": round(t / b.shape[0], 4),
        "headW": round((hx1 - hx0) / b.shape[1], 4),
    }
    print(cat, meta[cat])
json.dump(meta, open("app/img/pets.json", "w"), indent=1)
