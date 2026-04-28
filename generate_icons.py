#!/usr/bin/env python3
"""Generate SpyBot PNG icons from primitives (no SVG dep needed)."""
from PIL import Image, ImageDraw
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "icons")

CYAN = (77, 255, 230)
CYAN_SOFT = (0, 184, 163)
DARK = (10, 14, 26)
DARKER = (6, 9, 18)
MID = (19, 26, 44)
WHITE = (255, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_icon(size, rounded=True):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background — radial-ish gradient via concentric circles
    cx, cy = size / 2, size / 2
    bg = Image.new("RGB", (size, size), DARKER)
    bd = ImageDraw.Draw(bg)
    for r in range(int(size * 0.7), 0, -2):
        t = 1 - (r / (size * 0.7))
        bd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=lerp(DARKER, MID, t))
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=int(size * 0.18), fill=255)
        img.paste(bg, (0, 0), mask)
    else:
        img.paste(bg, (0, 0))

    d = ImageDraw.Draw(img)

    # Outer dashed ring
    ring_r = int(size * 0.43)
    n = 24
    for i in range(n):
        if i % 2 == 0:
            a0 = (360 / n) * i
            a1 = a0 + (360 / n) * 0.55
            d.arc([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r], a0, a1, fill=CYAN, width=max(2, size // 90))

    # Inner thin ring
    r2 = int(size * 0.36)
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], outline=CYAN_SOFT, width=max(2, size // 180))

    # Eye almond
    w = size * 0.78
    h = size * 0.32
    pts_outer = []
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        x = cx - w / 2 + w * t
        y = cy - h / 2 * math.sin(math.pi * t)
        pts_outer.append((x, y))
    for i in range(steps + 1):
        t = i / steps
        x = cx + w / 2 - w * t
        y = cy + h / 2 * math.sin(math.pi * t)
        pts_outer.append((x, y))
    d.polygon(pts_outer, outline=CYAN, fill=None)
    # Stroke thickness via multiple offsets
    for off in range(1, max(3, size // 80)):
        d.polygon([(p[0], p[1] - off) for p in pts_outer], outline=CYAN)
        d.polygon([(p[0], p[1] + off) for p in pts_outer], outline=CYAN)

    # Iris
    iris_r = int(size * 0.18)
    for r in range(iris_r, 0, -1):
        t = 1 - (r / iris_r)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=lerp(CYAN, CYAN_SOFT, t * 0.7))

    # Pupil
    pup_r = int(size * 0.065)
    d.ellipse([cx - pup_r, cy - pup_r, cx + pup_r, cy + pup_r], fill=DARK)

    # Highlight
    hl_r = max(3, size // 40)
    d.ellipse([cx + size * 0.04 - hl_r, cy - size * 0.05 - hl_r, cx + size * 0.04 + hl_r, cy - size * 0.05 + hl_r], fill=WHITE)

    # Crosshair ticks
    tick_len = size * 0.06
    tick_w = max(2, size // 90)
    d.line([(cx, size * 0.04), (cx, size * 0.04 + tick_len)], fill=CYAN, width=tick_w)
    d.line([(cx, size - size * 0.04), (cx, size - size * 0.04 - tick_len)], fill=CYAN, width=tick_w)
    d.line([(size * 0.04, cy), (size * 0.04 + tick_len, cy)], fill=CYAN, width=tick_w)
    d.line([(size - size * 0.04, cy), (size - size * 0.04 - tick_len, cy)], fill=CYAN, width=tick_w)

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in [192, 512, 180]:
        rounded = size != 180  # apple-touch-icon stays square; iOS rounds it
        img = make_icon(size, rounded=rounded)
        name = f"icon-{size}.png" if size != 180 else "apple-touch-icon.png"
        img.save(os.path.join(OUT, name))
        print(f"  ✓ {name}")
    # favicon (32x32)
    favicon = make_icon(64, rounded=True).resize((32, 32), Image.LANCZOS)
    favicon.save(os.path.join(OUT, "favicon.png"))
    print("  ✓ favicon.png")
    print("Done.")


if __name__ == "__main__":
    main()
