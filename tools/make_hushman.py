"""Sculpt a Hushman: a hooded lantern-bearer of the Order, as one skinned mesh (same approach as make_listener.py).

A heavy robe to the floor, a deep hood, sleeves with grey hands, a rope belt, and inside the hood a pale mask
painted with a dark hand pressed over the mouth: the Order's mark. Rest pose: standing, facing -z, feet at y = 0,
right arm forward to hold the lantern (the game hangs the Lantern_01 model from the right hand bone).
Output: assets/game/hushman/hushman.bin + hushman.json. Run with tools/.venv/bin/python -I.
"""
import json, os, struct
import numpy as np
from skimage import measure

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "game", "hushman")
def V(*a): return np.array(a, float)

B = {}
def bone(n, parent, pos): B[n] = (parent, V(*pos))
bone("root", None, (0, 0.95, 0))
bone("spine", "root", (0, 1.2, 0.0))
bone("chest", "spine", (0, 1.42, 0.0))
bone("head", "chest", (0, 1.62, -0.02))
for s, n in ((1, "L"), (-1, "R")):
    bone(f"upperArm{n}", "chest", (s * 0.2, 1.47, 0.0))
    bone(f"forearm{n}", f"upperArm{n}", (s * 0.24, 1.18, -0.04))
    bone(f"hand{n}", f"forearm{n}", (s * 0.25, 0.95, -0.1))
names = list(B); index = {n: i for i, n in enumerate(names)}; P = {n: B[n][1] for n in names}

def capsule(X, a, b, ra, rb):
    ba = b - a; pa = X - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (ra + (rb - ra) * h), h
def ellipsoid(X, c, r):
    q = (X - c) / r; k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)

def field(X):
    x, y, z = X.T
    # the robe: a cone from the shoulders to a wide hem on the floor, with heavy folds
    t = np.clip((1.48 - y) / 1.48, 0, 1)
    r = 0.17 + 0.25 * t ** 1.2
    ang = np.arctan2(z, x)
    folds = 0.018 * np.sin(ang * 9 + y * 2) * t
    robe = np.sqrt(x ** 2 + (z * 1.15) ** 2) - (r + folds)
    robe = np.maximum(robe, np.maximum(-y, y - 1.5))
    d = robe
    d = smin(d, ellipsoid(X, V(0, 1.45, 0.01), V(0.22, 0.1, 0.15)), 0.06)  # shoulders
    waist = 0.17 + 0.25 * ((1.48 - 1.0) / 1.48) ** 1.2
    belt = np.maximum(np.abs(np.sqrt(x ** 2 + (z * 1.15) ** 2) - waist) - 0.022, np.abs(y - 1.0) - 0.025)  # rope belt
    d = smin(d, belt, 0.01)
    # the hood: a deep rounded cowl with the face opening carved out of the front
    hood = ellipsoid(X, V(0, 1.68, 0.0), V(0.15, 0.19, 0.17))
    hood = smin(hood, ellipsoid(X, V(0, 1.82, 0.05), V(0.09, 0.08, 0.1)), 0.05)  # the peak falls back
    opening = ellipsoid(X, V(0, 1.66, -0.15), V(0.085, 0.12, 0.12))
    hood = smax(hood, -opening, 0.015)
    d = smin(d, hood, 0.05)
    # the mask, set back inside the hood
    d = smin(d, ellipsoid(X, V(0, 1.655, -0.07), V(0.07, 0.095, 0.06)), 0.01)
    for s in (1, -1):
        ua, fa, hd = P["upperArmL" if s > 0 else "upperArmR"], P["forearmL" if s > 0 else "forearmR"], P["handL" if s > 0 else "handR"]
        d = smin(d, capsule(X, ua, fa, 0.06, 0.07)[0], 0.04)  # wide sleeves
        d = smin(d, capsule(X, fa, hd + V(0, 0.04, 0.03), 0.07, 0.08)[0], 0.03)
        d = smin(d, ellipsoid(X, hd + V(s * 0.005, -0.04, -0.01), V(0.03, 0.05, 0.02)), 0.015)  # hand
    return d

STEP = 0.016
lo = V(-0.5, -0.01, -0.5); hi = V(0.5, 1.95, 0.5)
xs, ys, zs = [np.arange(lo[i], hi[i], STEP) for i in range(3)]
G = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), -1).reshape(-1, 3)
vol = np.concatenate([field(G[i:i + 400000]) for i in range(0, len(G), 400000)]).reshape(len(xs), len(ys), len(zs))
verts, faces, _, _ = measure.marching_cubes(vol, 0.0, spacing=(STEP,) * 3)
verts += lo
# marching_cubes already winds triangles counter-clockwise seen from outside
nbrs = [[] for _ in verts]
for f in faces:
    for a, b in ((0, 1), (1, 2), (2, 0)):
        nbrs[f[a]].append(f[b]); nbrs[f[b]].append(f[a])
nbrs = [np.unique(n) for n in nbrs]
for lam in (0.5, -0.53, 0.5, -0.53):
    avg = np.array([verts[n].mean(0) if len(n) else verts[i] for i, n in enumerate(nbrs)])
    verts = verts + lam * (avg - verts)
fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
normals = np.zeros_like(verts)
for k in range(3): np.add.at(normals, faces[:, k], fn)
normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12

# skin weights: arms and hands by capsule distance; the head by height; everything else to the body chain
SEG = [("root", V(0, 0.0, 0), V(0, 1.1, 0), 0.3), ("spine", P["spine"], P["chest"], 0.2), ("chest", P["chest"], P["head"], 0.2),
       ("head", P["head"], P["head"] + V(0, 0.22, 0.02), 0.16)]
for n in ("L", "R"):
    SEG += [(f"upperArm{n}", P[f"upperArm{n}"], P[f"forearm{n}"], 0.07), (f"forearm{n}", P[f"forearm{n}"], P[f"hand{n}"], 0.08), (f"hand{n}", P[f"hand{n}"], P[f"hand{n}"] + V(0, -0.1, -0.02), 0.04)]
dist = np.full((len(verts), len(names)), np.inf)
for n, a, b, r in SEG:
    d, _ = capsule(verts, a, b, r, r)
    dist[:, index[n]] = np.minimum(dist[:, index[n]], np.maximum(d, 0))
# the robe never follows the arms, or lifting one would drag the cloth up with it; only the sleeves themselves do
t_ = np.clip((1.48 - verts[:, 1]) / 1.48, 0, 1)
on_robe = (np.sqrt(verts[:, 0] ** 2 + (verts[:, 2] * 1.15) ** 2) - (0.17 + 0.25 * t_ ** 1.2) < 0.022) & (verts[:, 1] < 1.34)
for n in ("upperArmL", "upperArmR", "forearmL", "forearmR", "handL", "handR"):
    dist[on_robe, index[n]] = np.inf
w = np.exp(-(dist / 0.05) ** 2)
w[np.arange(len(verts)), np.argmin(dist, axis=1)] += 1e-6
idx = np.argsort(-w, axis=1)[:, :4]
wt = np.take_along_axis(w, idx, 1); wt /= wt.sum(1, keepdims=True) + 1e-12

# colour: dark, worn wool; grey hands; inside the hood, a pale mask with a dark hand over the mouth
x, y, z = verts.T
wool = 0.085 + 0.012 * np.sin(x * 23 + y * 7) * np.sin(z * 19 + y * 3) + 0.008 * np.sin(y * 31 + x * 11)  # worn, faintly uneven wool
col = np.stack([wool * 1.15, wool, wool * 0.9], 1)
col[(np.abs(y - 1.0) < 0.03)] = [0.23, 0.18, 0.12]  # rope belt
hands = np.zeros(len(verts), bool)
for n, s in (("L", 1), ("R", -1)):
    hands |= ellipsoid(verts, P[f"hand{n}"] + V(s * 0.005, -0.04, -0.01), V(0.034, 0.056, 0.024)) < 0.006
col[hands] = [0.42, 0.39, 0.36]
# the face is a separate textured mask (tools/make_mask.py, world/hushmanRig.ts); keep the shadow inside the hood dark
inside = ellipsoid(verts, V(0, 1.655, -0.07), V(0.08, 0.105, 0.07)) < 0.02
col[inside] = [0.02, 0.018, 0.016]
uv = np.stack([x * 4 + z * 3, y * 4], 1)

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "hushman.bin"), "wb") as f:
    f.write(struct.pack("<II", len(verts), len(faces)))
    for arr, dt in ((verts, "<f4"), (normals, "<f4"), (uv, "<f4"), (col, "<f4"), (idx, "<u2"), (wt, "<f4"), (faces, "<u4")):
        f.write(arr.astype(dt).tobytes())
bones = [{"name": n, "parent": index[B[n][0]] if B[n][0] else -1, "pos": B[n][1].tolist()} for n in names]
json.dump({"bones": bones}, open(os.path.join(OUT, "hushman.json"), "w"), indent=1)
print(f"hushman: {len(verts)} vertices, {len(faces)} triangles, {len(names)} bones, {os.path.getsize(os.path.join(OUT, 'hushman.bin')) // 1024} KB")
