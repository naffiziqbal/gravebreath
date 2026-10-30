"""Draw the coffin lid decals: the scratched warning, tally marks, and the cracks that spread as you push.
Run: tools/.venv/bin/python -I tools/make_decals.py
"""
import os, random, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "game", "decals")
FONT = os.path.join(ROOT, "assets", "fonts", "Creepster-Regular.ttf")
random.seed(41)

def scratches():
    W, H = 1024, 2048  # lid is tall in the upright coffin frame
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    f = ImageFont.truetype(FONT, 150)
    for i, word in enumerate(["DON'T", "WASTE", "IT"]):
        # several jittered passes read as letters gouged by fingernails
        for _ in range(5):
            d.text((W / 2 + random.uniform(-4, 4), 520 + i * 190 + random.uniform(-4, 4)), word, font=f, fill=random.randint(120, 255), anchor="mm")
    # tally marks: forty-one, the last unfinished
    x0, y0 = 150, 1250
    for n in range(41):
        g, k = divmod(n, 5)
        gx, gy = x0 + (g % 4) * 190, y0 + (g // 4) * 160
        if k < 4:
            x = gx + k * 30
            length = 110 if n < 40 else 55
            d.line([(x + random.uniform(-3, 3), gy), (x + random.uniform(-6, 6), gy + length)], fill=230, width=7)
        else:
            d.line([(gx - 15, gy + 90), (gx + 120, gy + 20)], fill=230, width=7)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    # gouge = pale torn wood in the middle, dark rim around it
    rim = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(3))
    dark = Image.new("RGBA", (W, H), (25, 12, 6, 0)); dark.putalpha(rim.point(lambda v: int(v * 0.85)))
    pale = Image.new("RGBA", (W, H), (214, 178, 128, 0)); pale.putalpha(mask)
    img.alpha_composite(dark); img.alpha_composite(pale)
    return img

def cracks():
    W, H = 1024, 2048
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    def branch(x, y, ang, length, width, depth):
        if depth == 0 or width < 1: return
        for _ in range(int(length / 12)):
            ang += random.uniform(-0.35, 0.35)
            nx, ny = x + math.cos(ang) * 12, y + math.sin(ang) * 12
            d.line([(x, y), (nx, ny)], fill=255, width=int(width))
            x, y = nx, ny
            if random.random() < 0.08:
                branch(x, y, ang + random.choice([-1, 1]) * random.uniform(0.5, 1.1), length * 0.55, width * 0.6, depth - 1)
    for _ in range(7):
        branch(W / 2 + random.uniform(-80, 80), H * 0.45 + random.uniform(-120, 120), random.uniform(0, 2 * math.pi), 520, 9, 4)
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    img = Image.new("RGBA", (W, H), (8, 4, 2, 0)); img.putalpha(mask)
    return img

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    scratches().save(os.path.join(OUT, "lid_scratches.png"), optimize=True)
    cracks().save(os.path.join(OUT, "lid_cracks.png"), optimize=True)
    print("decals written")
