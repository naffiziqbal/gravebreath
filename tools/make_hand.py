"""Sculpt the first-person hand as one smooth, skinned mesh (instead of boxes and capsules).

The hand is defined as a signed-distance field: palm, thenar/hypothenar pads, knuckles and tapered finger
segments, all blended with a smooth minimum so there are no seams. Marching cubes turns it into a mesh,
each vertex is weighted to the bones that should move it, and grime is painted into the vertex colours.

Right hand, rest pose: wrist at the origin, fingers along -z, palm facing -y, thumb toward -x.
Output: assets/game/hand/hand.bin (+ hand.json with the bone layout). Run with tools/.venv/bin/python -I.
"""
import json, os, struct
import numpy as np
from skimage import measure

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "game", "hand")

def norm(v): return v / np.linalg.norm(v)

# ---------------------------------------------------------------- skeleton (metres)
FINGERS = {  # MCP joint, segment lengths, base radius
    "index": ((-0.027, 0.0015, -0.090), (0.040, 0.025, 0.020), 0.0094),
    "middle": ((-0.009, 0.002, -0.094), (0.044, 0.028, 0.021), 0.0096),
    "ring": ((0.009, 0.0015, -0.092), (0.041, 0.027, 0.020), 0.0091),
    "pinky": ((0.026, 0.0005, -0.083), (0.032, 0.021, 0.017), 0.0081),
}
bones = [{"name": "wrist", "parent": -1, "pos": [0.0, 0.0, 0.0]}]
segments = []  # (bone index, start, end, r0, r1)
for name, (mcp, lens, r) in FINGERS.items():
    p = np.array(mcp); parent = 0
    d = np.array([0.0, -0.004, -1.0]); d = norm(d)  # a hair of natural droop
    for k, L in enumerate(lens):
        bones.append({"name": f"{name}{k}", "parent": parent, "pos": p.tolist()})
        bi = len(bones) - 1
        q = p + d * L
        r0, r1 = r * (1 - 0.1 * k), r * (0.9 - 0.1 * k)
        segments.append((bi, p.copy(), q.copy(), r0, r1))
        p, parent = q, bi
# thumb: from the heel of the palm, angled forward, out and down
tp = np.array([-0.029, -0.005, -0.022]); parent = 0
for k, (L, d, r) in enumerate([(0.036, (-0.55, -0.32, -0.77), 0.0118), (0.029, (-0.32, -0.28, -0.9), 0.0104), (0.023, (-0.2, -0.25, -0.95), 0.0094)]):
    bones.append({"name": f"thumb{k}", "parent": parent, "pos": tp.tolist()})
    bi = len(bones) - 1
    q = tp + norm(np.array(d)) * L
    segments.append((bi, tp.copy(), q.copy(), r, r * 0.9))
    tp, parent = q, bi

# ---------------------------------------------------------------- signed distance field
def sd_capsule(P, a, b, ra, rb):
    ba = b - a; pa = P - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (ra + (rb - ra) * h), h

def sd_ellipsoid(P, c, r):
    q = (P - c) / r
    k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)

def sd_palm(P):
    # rounded box, wider at the knuckles than at the wrist
    c = np.array([0.0, 0.0, -0.047])
    q = P - c
    t = np.clip((-q[:, 2] + 0.045) / 0.09, 0, 1)
    half = np.stack([0.030 + 0.009 * t, np.full(len(P), 0.0072), np.full(len(P), 0.042)], 1)
    rr = 0.0075
    d = np.abs(q) - half + rr
    return np.linalg.norm(np.maximum(d, 0), axis=1) + np.minimum(np.max(d, axis=1), 0) - rr

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

def field(P):
    d = sd_palm(P)
    d = smin(d, sd_ellipsoid(P, np.array([-0.021, -0.0075, -0.03]), np.array([0.017, 0.0095, 0.024])), 0.006)  # thumb pad
    d = smin(d, sd_ellipsoid(P, np.array([0.025, -0.0055, -0.042]), np.array([0.011, 0.0075, 0.027])), 0.006)  # heel of the hand
    wrist, _ = sd_capsule(P * np.array([1, 1.35, 1]), np.array([0, 0, 0.002]), np.array([0, 0, 0.045]), 0.023, 0.022)
    d = smin(d, wrist, 0.012)
    for name, (mcp, _, r) in FINGERS.items():  # knuckles on the back of the hand
        d = smin(d, np.linalg.norm(P - (np.array(mcp) + [0, 0.0045, 0.004]), axis=1) - r * 0.95, 0.005)
    for bi, a, b, r0, r1 in segments:
        seg, _ = sd_capsule(P, a, b, r0, r1)
        k = 0.009 if bones[bi]["parent"] == 0 else 0.0035
        d = smin(d, seg, k)
    return d

STEP = 0.0016
lo = np.array([-0.085, -0.055, -0.21]); hi = np.array([0.05, 0.028, 0.05])
xs, ys, zs = [np.arange(lo[i], hi[i], STEP) for i in range(3)]
G = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), -1).reshape(-1, 3)
vol = field(G).reshape(len(xs), len(ys), len(zs))
verts, faces, normals, _ = measure.marching_cubes(vol, 0.0, spacing=(STEP, STEP, STEP))
verts += lo
# marching_cubes already winds triangles counter-clockwise seen from outside (normals point out)
# cut the wrist end open where the forearm and sleeve take over
keep_v = verts[:, 2] < 0.03
remap = -np.ones(len(verts), int); remap[keep_v] = np.arange(keep_v.sum())
faces = remap[faces]; faces = faces[(faces >= 0).all(1)]
verts, normals = verts[keep_v], normals[keep_v]

# light Taubin smoothing: rounder skin without shrinking
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

# ---------------------------------------------------------------- skin weights: nearest bones, blended at the joints
nb = len(bones)
dist = np.full((len(verts), nb), np.inf)
along = np.zeros((len(verts), nb))
for bi, a, b, r0, r1 in segments:
    d, h = sd_capsule(verts, a, b, r0, r1)
    dist[:, bi] = np.maximum(d, 0); along[:, bi] = h
dist[:, 0] = np.maximum(sd_palm(verts), 0) + 0.002
sigma = 0.0045
w = np.exp(-(dist / sigma) ** 2)
# skin far from every bone still follows the nearest one
w[np.arange(len(verts)), np.argmin(dist, axis=1)] += 1e-6
# near the start of a segment, share with the parent so the knuckle bends smoothly
for bi, a, b, r0, r1 in segments:
    p = bones[bi]["parent"]
    share = np.clip(0.35 - along[:, bi], 0, 0.35) / 0.35 * 0.6
    moved = w[:, bi] * share
    w[:, bi] -= moved; w[:, p] += moved
idx = np.argsort(-w, axis=1)[:, :4]
wt = np.take_along_axis(w, idx, 1)
wt /= wt.sum(1, keepdims=True) + 1e-12

# ---------------------------------------------------------------- grime: dirt in the creases, at the tips and under the nails
col = np.ones((len(verts), 3))
dirt = np.array([0.42, 0.31, 0.24])
g = np.zeros(len(verts))
for bi, a, b, r0, r1 in segments:
    if bones[bi]["name"][-1] == "2":  # fingertips
        d, h = sd_capsule(verts, a, b, r0, r1)
        g = np.maximum(g, np.clip((h - 0.55) / 0.45, 0, 1) * (d < 0.004))
creases = np.clip(1 - np.linalg.norm(normals * [0, 1, 0], axis=1), 0, 1) * 0.25
# soft, uneven smudges rather than stripes
smudge = np.clip(np.sin(verts[:, 0] * 160 + 1.3) * np.sin(verts[:, 2] * 120 + 0.4) * np.sin(verts[:, 1] * 200), 0, 1) * 0.18
g = np.clip(g * 0.85 + creases * 0.6 + smudge, 0, 1)
col = col * (1 - g[:, None]) + dirt * g[:, None]
# nails: a paler, smoother patch on the back of each fingertip
for bi, a, b, r0, r1 in segments:
    if bones[bi]["name"][-1] == "2":
        tip = b - norm(b - a) * 0.006
        near = (np.linalg.norm(verts - tip, axis=1) < r1 * 1.2) & (verts[:, 1] > tip[1] + r1 * 0.3)
        col[near] = col[near] * 0.5 + np.array([0.8, 0.68, 0.62]) * 0.5
uv = np.stack([verts[:, 0] * 18 + verts[:, 1] * 9, verts[:, 2] * 18], 1)

# ---------------------------------------------------------------- write
os.makedirs(OUT, exist_ok=True)
V, F = len(verts), len(faces)
with open(os.path.join(OUT, "hand.bin"), "wb") as f:
    f.write(struct.pack("<II", V, F))
    f.write(verts.astype("<f4").tobytes()); f.write(normals.astype("<f4").tobytes())
    f.write(uv.astype("<f4").tobytes()); f.write(col.astype("<f4").tobytes())
    f.write(idx.astype("<u2").tobytes()); f.write(wt.astype("<f4").tobytes())
    f.write(faces.astype("<u4").tobytes())
json.dump({"bones": bones}, open(os.path.join(OUT, "hand.json"), "w"), indent=1)
print(f"hand: {V} vertices, {F} triangles, {nb} bones, {os.path.getsize(os.path.join(OUT, 'hand.bin')) // 1024} KB")
