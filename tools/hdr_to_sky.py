"""Turn the Poly Haven night HDRI (Radiance .hdr) into a tone-mapped equirectangular sky image for the surface.
Phones can't easily load HDR files, so the sky is baked to an ordinary JPEG. CC0 source: rogland_moonlit_night.
Run: tools/.venv/bin/python -I tools/hdr_to_sky.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art-source", "hdri", "rogland_moonlit_night_1k.hdr")
OUT = os.path.join(ROOT, "assets", "game", "sky", "night.jpg")

def read_hdr(path):
    data = open(path, "rb").read()
    head_end = data.index(b"\n\n") + 2
    res_end = data.index(b"\n", head_end)
    parts = data[head_end:res_end].split()  # e.g. -Y 512 +X 1024
    h, w = int(parts[1]), int(parts[3])
    p = res_end + 1
    img = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        if data[p] == 2 and data[p + 1] == 2:  # new-style run-length encoded scanline
            p += 4
            for c in range(4):
                x = 0
                while x < w:
                    n = data[p]; p += 1
                    if n > 128:
                        n -= 128; img[y, x:x + n, c] = data[p]; p += 1
                    else:
                        img[y, x:x + n, c] = np.frombuffer(data[p:p + n], np.uint8); p += n
                    x += n
        else:  # flat RGBE
            img[y] = np.frombuffer(data[p:p + w * 4], np.uint8).reshape(w, 4); p += w * 4
    e = img[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return img[..., :3].astype(np.float64) * scale[..., None]

rgb = read_hdr(SRC)
lum = (rgb * [0.2126, 0.7152, 0.0722]).sum(-1)
key = np.exp(np.log(lum + 1e-6).mean())
x = rgb * (0.12 / key)  # a dark night exposure
x = x * (1 + x / 4) / (1 + x)  # Reinhard with a little white point
x = np.clip(x ** (1 / 2.2), 0, 1)
x = x * np.array([0.82, 0.9, 1.08]) * 0.75  # moonlight is cold; it's raining, so dimmer
# below the horizon the game draws its own graveyard: fade the desert into the rain fog so its hills read as far silhouettes
h = x.shape[0]
v = (np.arange(h) + 0.5) / h  # 0 = zenith, 0.5 = horizon
FOG = np.array([0.055, 0.065, 0.08])
t = np.clip((v - 0.44) / 0.1, 0, 1)[:, None, None]
x = x * (1 - t) + FOG * t
# a low veil of rain cloud near the horizon
veil = np.clip(1 - np.abs(v - 0.42) / 0.12, 0, 1)[:, None, None] * 0.45
x = x * (1 - veil) + FOG * 1.3 * veil
img = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8)).resize((2048, 1024), Image.LANCZOS)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, quality=88)
print("sky written", OUT, img.size)
