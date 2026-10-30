"""Paint the Hushman's mask: pale cracked porcelain, two eye slits, and a dark handprint pressed over the mouth.
Run: tools/.venv/bin/python -I tools/make_mask.py  ->  assets/game/hushman/mask.png
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "game", "hushman", "mask.png")
W, H = 512, 640
random.seed(9)
img = Image.new("RGB", (W, H), (196, 186, 166))
d = ImageDraw.Draw(img)
# aged porcelain: blotches and grime toward the edges
for _ in range(900):
    x, y, r = random.uniform(0, W), random.uniform(0, H), random.uniform(4, 22)
    c = random.randint(150, 205)
    d.ellipse((x - r, y - r, x + r, y + r), fill=(c, c - 8, c - 22))
img = img.filter(ImageFilter.GaussianBlur(6))
d = ImageDraw.Draw(img)
edge = Image.new("L", (W, H), 0)
ImageDraw.Draw(edge).ellipse((40, 40, W - 40, H - 40), fill=255)
edge = edge.filter(ImageFilter.GaussianBlur(60))
img = Image.composite(img, Image.new("RGB", (W, H), (70, 62, 52)), edge)
d = ImageDraw.Draw(img)
# eye slits: narrow, slightly downturned
for s in (-1, 1):
    cx = W / 2 + s * 95
    d.polygon([(cx - 55 * s, 250), (cx + 50 * s, 262), (cx + 48 * s, 272), (cx - 52 * s, 262)], fill=(8, 6, 5))
# cracks
def crack(x, y, a, n):
    for _ in range(n):
        a += random.uniform(-0.5, 0.5)
        nx, ny = x + math.cos(a) * 9, y + math.sin(a) * 9
        d.line([(x, y), (nx, ny)], fill=(60, 50, 40), width=2)
        x, y = nx, ny
crack(150, 120, 1.2, 30); crack(360, 90, 2.0, 22); crack(300, 470, -1.9, 18)
# the Order's mark: a hand pressed across the mouth, fingers reaching toward the cheek
hand = Image.new("L", (W, H), 0)
h = ImageDraw.Draw(hand)
h.ellipse((150, 400, 300, 520), fill=255)  # palm over the mouth
for k, (dy, length) in enumerate([(-38, 150), (-12, 172), (14, 160), (38, 128)]):
    y = 455 + dy
    h.rounded_rectangle((260, y - 11, 260 + length, y + 11), radius=11, fill=255)
h.rounded_rectangle((170, 362, 205, 440), radius=16, fill=255)  # thumb up toward the nose
hand = hand.filter(ImageFilter.GaussianBlur(2.5))
paint = Image.new("RGB", (W, H), (58, 16, 12))
img = Image.composite(paint, img, hand.point(lambda v: int(v * 0.9)))
img.save(OUT, optimize=True)
print("mask written", OUT)
