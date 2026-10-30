"""App icon, Android adaptive icon layers, splash image and favicon: a close-up of a Hushman's porcelain mask, the
hand painted over its mouth, framed by the dark of the cowl and lit from below by a lantern. Written to assets/.

Deliberately a close-up: the face carries the identity, not a hooded silhouette (a full hooded figure reads as
other things at icon size). Run: tools/.venv/bin/python -I tools/make_icons.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets")
SS = 2048  # draw large, then scale down

def radial(size, cx, cy, r, inner, outer):
    y, x = np.mgrid[0:size, 0:size] / size
    t = np.clip(np.hypot(x - cx, y - cy) / r, 0, 1)[..., None]
    return (np.array(inner) * (1 - t) + np.array(outer) * t).astype(np.uint8)

def layers(size, s, cx, cy):
    """Masks for the face oval, the eye holes and the painted hand (with its runs)."""
    face = Image.new("L", (size, size), 0)
    ImageDraw.Draw(face).ellipse([cx - s * 0.30, cy - s * 0.42, cx + s * 0.30, cy + s * 0.36], fill=255)
    eyes = Image.new("L", (size, size), 0); ed = ImageDraw.Draw(eyes)
    for side in (-1, 1):  # hollow almond holes, tilted down at the outer corners
        ex = cx + side * s * 0.12
        ed.polygon([(ex - side * s * 0.085, cy - s * 0.16), (ex, cy - s * 0.205), (ex + side * s * 0.095, cy - s * 0.135), (ex, cy - s * 0.115)], fill=255)
    hand = Image.new("L", (size, size), 0); hd = ImageDraw.Draw(hand)
    hd.rounded_rectangle([cx - s * 0.17, cy - s * 0.02, cx + s * 0.03, cy + s * 0.17], radius=int(s * 0.06), fill=255)  # palm
    for k in range(4):  # fingers reaching across the mouth
        y = cy - s * 0.015 + k * s * 0.042
        hd.rounded_rectangle([cx - s * 0.01, y, cx + s * (0.24 - abs(k - 1.4) * 0.025), y + s * 0.03], radius=int(s * 0.015), fill=255)
    hd.rounded_rectangle([cx - s * 0.155, cy - s * 0.10, cx - s * 0.085, cy + s * 0.0], radius=int(s * 0.03), fill=255)  # thumb
    for dx, y0, ln, w in ((-0.135, 0.15, 0.055, 0.007), (-0.07, 0.16, 0.135, 0.009), (-0.02, 0.15, 0.03, 0.006), (0.09, 0.105, 0.075, 0.006), (0.19, 0.075, 0.035, 0.005)):
        x, y0 = cx + s * dx, cy + s * y0  # the paint has run, unevenly
        hd.polygon([(x - s * w, y0), (x + s * w, y0), (x + s * w * 0.6, y0 + s * ln), (x - s * w * 0.6, y0 + s * ln)], fill=255)
        hd.ellipse([x - s * w * 1.5, y0 + s * ln - s * w, x + s * w * 1.5, y0 + s * ln + s * w * 2.2], fill=255)
    blur = lambda m, r: m.filter(ImageFilter.GaussianBlur(s * r))
    return blur(face, 0.002), blur(eyes, 0.0015), blur(hand, 0.0015)

def mask_art(size=SS, scale=1.0):
    """The mask in its cowl on transparency; `scale` is the share of the frame the mask fills."""
    s = size * scale
    cx, cy = size / 2, size / 2 + s * 0.02
    face, eyes, hand = layers(size, s, cx, cy)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # the cowl's rounded opening, a little larger than the face, black inside with a faint warm rim of wool
    cowl = Image.new("L", (size, size), 0)
    ImageDraw.Draw(cowl).ellipse([cx - s * 0.44, cy - s * 0.58, cx + s * 0.44, cy + s * 0.62], fill=255)
    cowl = cowl.filter(ImageFilter.GaussianBlur(s * 0.004))
    wool = radial(size, 0.5, 0.92, 0.7, (64, 30, 16), (8, 6, 6))
    im.paste(Image.fromarray(wool), (0, 0), cowl)
    shadow = Image.new("L", (size, size), 0)
    ImageDraw.Draw(shadow).ellipse([cx - s * 0.36, cy - s * 0.50, cx + s * 0.36, cy + s * 0.46], fill=255)
    im.paste((3, 2, 2), (0, 0), shadow.filter(ImageFilter.GaussianBlur(s * 0.03)))
    # porcelain, lit from below and lost in the cowl's shadow toward the brow
    y = (np.mgrid[0:size, 0:size][0] / size)[..., None]
    t = np.clip((y - (cy - s * 0.42) / size) / (s * 0.78 / size), 0, 1)
    porcelain = (np.array([26, 22, 20]) * (1 - t) ** 1.6 + np.array([248, 230, 200]) * (1 - (1 - t) ** 1.6)).astype(np.uint8)
    im.paste(Image.fromarray(porcelain), (0, 0), face)
    im.paste((6, 4, 4), (0, 0), eyes)
    im.paste((136, 16, 12), (0, 0), hand)
    d = ImageDraw.Draw(im)  # a hairline crack from the brow
    d.line([(cx + s * 0.10, cy - s * 0.40), (cx + s * 0.06, cy - s * 0.29), (cx + s * 0.11, cy - s * 0.22), (cx + s * 0.09, cy - s * 0.17)], fill=(46, 38, 34, 255), width=max(1, int(s * 0.006)))
    return im

def monochrome(size=SS, scale=1.0):
    """Android's themed icon: the mask oval with the eyes and the hand punched out."""
    s = size * scale
    face, eyes, hand = layers(size, s, size / 2, size / 2 + s * 0.02)
    a = np.clip(np.asarray(face, np.float32) - np.asarray(eyes, np.float32) - np.asarray(hand, np.float32), 0, 255).astype(np.uint8)
    m = Image.fromarray(a)
    return Image.merge("RGBA", (m, m, m, m))

def background(size=SS):
    return Image.fromarray(radial(size, 0.5, 0.85, 0.9, (96, 24, 8), (3, 2, 3))).convert("RGBA")  # a lantern glow from below

def save(im, path, size):
    im.resize((size, size), Image.LANCZOS).save(os.path.join(A, path))
    print("wrote", path, size)

if __name__ == "__main__":
    full = background(); full.alpha_composite(mask_art(scale=0.95))
    save(full.convert("RGB"), "icon.png", 1024)
    save(full.convert("RGB"), "favicon.png", 48)
    # adaptive icon: launchers mask to a circle or squircle and keep the middle ~66%, so the mask is smaller here
    save(mask_art(scale=0.62), "android-icon-foreground.png", 1024)
    save(background().convert("RGB"), "android-icon-background.png", 1024)
    save(monochrome(scale=0.55), "android-icon-monochrome.png", 1024)
    save(mask_art(scale=0.9), "splash-icon.png", 1024)
