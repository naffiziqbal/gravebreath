"""A soft, tileable fog texture for the low mist in the necropolis. Run: tools/.venv/bin/python -I tools/make_fog.py"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(3)
n = 512
f = sum(gaussian_filter(rng.normal(0, 1, (n, n)), s, mode="wrap") * w for s, w in ((40, 1.0), (16, 0.5), (6, 0.25)))
f = (f - f.min()) / (f.max() - f.min())
alpha = np.clip((f - 0.35) / 0.5, 0, 1) ** 1.5
rgba = np.zeros((n, n, 4), np.uint8)
rgba[..., :3] = (170, 180, 195)
rgba[..., 3] = (alpha * 255).astype(np.uint8)
Image.fromarray(rgba, "RGBA").save(os.path.join(ROOT, "assets", "game", "decals", "fog.png"), optimize=True)
print("fog written")
