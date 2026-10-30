"""Sculpt the Listener as one smooth, skinned body (same approach as tools/make_hand.py).

A signed-distance field of tapered capsules and ellipsoids, smooth-blended: a starved, 2 m tall body
with a sunken ribcage, spine knobs, a long neck, an eyeless elongated skull with a hinged jaw, arms to the
knees and 20 cm fingers. Marching cubes -> mesh, weighted to a 22-bone skeleton, mottled vertex colours.

Rest pose: standing upright, facing -z, feet at y = 0, arms hanging slightly out. The hunch is animated.
Output: assets/game/listener/listener.bin + listener.json. Run with tools/.venv/bin/python -I.
"""
import json, os, struct
import numpy as np
from skimage import measure

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "game", "listener")

def V(*a): return np.array(a, float)

# ---------------------------------------------------------------- skeleton
B = {}  # name -> (parent, pos)
def bone(name, parent, pos): B[name] = (parent, V(*pos))
bone("hips", None, (0, 1.0, 0))
bone("spine", "hips", (0, 1.2, 0.01))
bone("chest", "spine", (0, 1.44, 0.02))
bone("neck", "chest", (0, 1.6, 0.0))
bone("head", "neck", (0, 1.74, -0.035))
bone("jaw", "head", (0, 1.78, -0.055))
for s, n in ((1, "L"), (-1, "R")):
    bone(f"shoulder{n}", "chest", (s * 0.06, 1.56, 0.0))
    bone(f"upperArm{n}", f"shoulder{n}", (s * 0.2, 1.54, 0.0))
    bone(f"forearm{n}", f"upperArm{n}", (s * 0.245, 1.19, 0.02))
    bone(f"hand{n}", f"forearm{n}", (s * 0.27, 0.86, 0.0))
    bone(f"fingers{n}", f"hand{n}", (s * 0.278, 0.76, -0.005))
    bone(f"thigh{n}", "hips", (s * 0.09, 0.97, 0.0))
    bone(f"shin{n}", f"thigh{n}", (s * 0.1, 0.53, -0.02))
    bone(f"foot{n}", f"shin{n}", (s * 0.1, 0.08, 0.025))
names = list(B)
index = {n: i for i, n in enumerate(names)}
P = {n: B[n][1] for n in names}

# segments that drive skin weights: (bone, start, end, radius)
SEG = [("hips", P["hips"] + V(0, -0.06, 0), P["spine"], 0.11), ("spine", P["spine"], P["chest"], 0.09),
       ("chest", P["chest"] + V(0, -0.1, 0), P["neck"], 0.13), ("neck", P["neck"], P["head"], 0.04),
       ("head", P["head"] + V(0, 0.04, 0), P["head"] + V(0, 0.2, -0.01), 0.09), ("jaw", P["jaw"], V(0, 1.7, -0.12), 0.05)]
for n, s in (("L", 1), ("R", -1)):
    SEG += [(f"shoulder{n}", P[f"shoulder{n}"], P[f"upperArm{n}"], 0.05), (f"upperArm{n}", P[f"upperArm{n}"], P[f"forearm{n}"], 0.035),
            (f"forearm{n}", P[f"forearm{n}"], P[f"hand{n}"], 0.03), (f"hand{n}", P[f"hand{n}"], P[f"fingers{n}"], 0.03),
            (f"fingers{n}", P[f"fingers{n}"], P[f"fingers{n}"] + V(s * 0.012, -0.2, -0.02), 0.012),
            (f"thigh{n}", P[f"thigh{n}"], P[f"shin{n}"], 0.055), (f"shin{n}", P[f"shin{n}"], P[f"foot{n}"], 0.04),
            (f"foot{n}", P[f"foot{n}"], P[f"foot{n}"] + V(0, -0.06, -0.18), 0.03)]

# ---------------------------------------------------------------- SDF primitives
def capsule(X, a, b, ra, rb):
    ba = b - a; pa = X - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (ra + (rb - ra) * h), h

def ellipsoid(X, c, r):
    q = (X - c) / r
    k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

def smax(a, b, k): return -smin(-a, -b, k)

def field(X):
    y = X[:, 1]
    # ribcage, with ribs showing on the chest and sides
    rib = ellipsoid(X, V(0, 1.39, 0.005), V(0.135, 0.17, 0.105))
    front = np.clip(-X[:, 2] / 0.1 + 0.3, 0, 1)
    band = (y > 1.24) & (y < 1.53)
    rib = rib + 0.011 * np.maximum(0, np.sin(y * 62)) * front * band + 0.004 * np.maximum(0, np.sin(y * 62)) * (1 - front) * band
    rib = smax(rib, -capsule(X, V(0, 1.27, -0.11), V(0, 1.5, -0.105), 0.012, 0.012)[0], 0.01)  # sternum groove
    d = rib
    for s in (1, -1):
        d = smin(d, ellipsoid(X, V(s * 0.075, 1.45, 0.075), V(0.05, 0.07, 0.022)), 0.02)  # shoulder blades
        d = smin(d, capsule(X, V(s * 0.02, 1.565, -0.055), V(s * 0.17, 1.56, -0.01), 0.011, 0.011)[0], 0.012)  # collarbones
        d = smin(d, ellipsoid(X, V(s * 0.11, 1.04, -0.03), V(0.03, 0.03, 0.045)), 0.02)  # hip bones under the skin
    d = smin(d, capsule(X, V(0, 1.06, 0.03), V(0, 1.25, 0.025), 0.058, 0.075)[0], 0.035)  # hollow belly
    d = smin(d, ellipsoid(X, V(0, 0.99, 0.01), V(0.135, 0.085, 0.085)), 0.04)  # pelvis
    for t in np.linspace(0, 1, 9):  # spine knobs down the back
        p = V(0, 1.08 + t * 0.5, 0.07 + 0.035 * np.sin(t * np.pi))
        d = smin(d, np.linalg.norm(X - p, axis=1) - 0.02, 0.015)
    d = smin(d, capsule(X, V(0, 1.56, 0.0), V(0, 1.74, -0.035), 0.036, 0.03)[0], 0.03)  # long neck
    # the skull: long, narrow, eyeless; shallow pits where eyes should be
    skull = ellipsoid(X, V(0, 1.86, -0.035), V(0.075, 0.125, 0.098))
    skull = smin(skull, ellipsoid(X, V(0, 1.79, -0.1), V(0.06, 0.05, 0.05)), 0.03)  # brow and cheekbones
    for s in (1, -1):
        skull = smin(skull, ellipsoid(X, V(s * 0.055, 1.795, -0.095), V(0.018, 0.014, 0.02)), 0.012)  # sharp cheekbones
        skull = smax(skull, -ellipsoid(X, V(s * 0.06, 1.755, -0.095), V(0.02, 0.025, 0.03)), 0.012)  # sunken cheeks
    for s in (1, -1):
        skull = smax(skull, -(np.linalg.norm(X - V(s * 0.03, 1.835, -0.135), axis=1) - 0.022), 0.012)
    jaw = ellipsoid(X, V(0, 1.72, -0.085), V(0.05, 0.045, 0.06))
    head = smin(skull, jaw, 0.02)
    mouth = ellipsoid(X, V(0, 1.745, -0.13), V(0.032, 0.045, 0.06))
    head = smax(head, -mouth, 0.01)  # the gaping mouth
    d = smin(d, head, 0.025)
    for s in (1, -1):
        sh, ua, fa, hd, fg = P["shoulderL" if s > 0 else "shoulderR"], P["upperArmL" if s > 0 else "upperArmR"], P["forearmL" if s > 0 else "forearmR"], P["handL" if s > 0 else "handR"], P["fingersL" if s > 0 else "fingersR"]
        d = smin(d, capsule(X, sh, ua, 0.03, 0.04)[0], 0.035)  # collarbone and shoulder
        d = smin(d, capsule(X, ua, fa, 0.036, 0.028)[0], 0.02)
        d = smin(d, np.linalg.norm(X - fa, axis=1) - 0.033, 0.012)  # knobbly elbow
        d = smin(d, capsule(X, fa, hd, 0.03, 0.021)[0], 0.015)
        d = smin(d, ellipsoid(X, (hd + fg) / 2, V(0.035, 0.055, 0.016)), 0.015)  # narrow palm
        for k in range(4):  # long fingers, slightly spread
            base = fg + V(s * (k - 1.5) * 0.013, 0.0, -0.004 * k)
            tip = base + V(s * (k - 1.5) * 0.02, -(0.19 - abs(k - 1.2) * 0.02), -0.02)
            d = smin(d, capsule(X, base, tip, 0.0115, 0.0075)[0], 0.008)
        th, sn, ft = (P[f"{n}{'L' if s > 0 else 'R'}"] for n in ("thigh", "shin", "foot"))
        d = smin(d, capsule(X, th, sn, 0.06, 0.04)[0], 0.03)
        d = smin(d, np.linalg.norm(X - sn, axis=1) - 0.047, 0.015)  # bony knee
        d = smin(d, capsule(X, sn, ft, 0.04, 0.026)[0], 0.015)
        d = smin(d, capsule(X, ft, ft + V(0, -0.055, -0.17), 0.03, 0.018)[0], 0.02)  # long foot
    return d

STEP = 0.0095
lo = V(-0.42, -0.02, -0.33); hi = V(0.42, 2.02, 0.2)
xs, ys, zs = [np.arange(lo[i], hi[i], STEP) for i in range(3)]
G = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), -1).reshape(-1, 3)
vol = np.concatenate([field(G[i:i + 400000]) for i in range(0, len(G), 400000)]).reshape(len(xs), len(ys), len(zs))
verts, faces, _, _ = measure.marching_cubes(vol, 0.0, spacing=(STEP,) * 3)
verts += lo
# marching_cubes already winds triangles counter-clockwise seen from outside (normals point out)

# Taubin smoothing
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

# ---------------------------------------------------------------- skin weights
nb = len(names)
dist = np.full((len(verts), nb), np.inf); along = np.zeros((len(verts), nb))
for n, a, b, r in SEG:
    d, h = capsule(verts, a, b, r, r)
    i = index[n]
    better = np.maximum(d, 0) < dist[:, i]
    dist[better, i] = np.maximum(d, 0)[better]; along[better, i] = h[better]
sigma = 0.035
w = np.exp(-(dist / sigma) ** 2)
w[np.arange(len(verts)), np.argmin(dist, axis=1)] += 1e-6
for n, a, b, r in SEG:
    parent = B[n][0]
    if parent is None: continue
    i, p = index[n], index[parent]
    share = np.clip(0.3 - along[:, i], 0, 0.3) / 0.3 * 0.55
    moved = w[:, i] * share; w[:, i] -= moved; w[:, p] += moved
idx = np.argsort(-w, axis=1)[:, :4]
wt = np.take_along_axis(w, idx, 1); wt /= wt.sum(1, keepdims=True) + 1e-12

# ---------------------------------------------------------------- colour: mottled grey corpse skin
x, y, z = verts.T
mottle = 0.5 + 0.25 * np.sin(x * 23 + y * 7) * np.sin(y * 19 - z * 11) + 0.25 * np.sin(x * 61 + z * 47) * np.sin(y * 53)
col = np.stack([0.6 - 0.28 * mottle, 0.56 - 0.27 * mottle, 0.52 - 0.24 * mottle], 1)  # strong blotching: dead, uneven skin
bruise = np.clip(np.sin(x * 9 + 1) * np.sin(y * 13 + 2) * np.sin(z * 11) * 3 - 1.6, 0, 1)
col = col * (1 - 0.6 * bruise[:, None]) + np.array([0.26, 0.17, 0.22]) * 0.6 * bruise[:, None]
# darker in the hollows between ribs and in the belly
col[(np.abs(x) < 0.12) & (y > 1.05) & (y < 1.25)] *= 0.75
inside = ellipsoid(verts, V(0, 1.745, -0.13), V(0.04, 0.052, 0.07)) < 0.004
col[inside] = [0.05, 0.03, 0.03]
for s in (1, -1):
    pit = np.linalg.norm(verts - V(s * 0.03, 1.835, -0.135), axis=1) < 0.03
    col[pit] *= 0.45
low = y < 0.12  # filthy feet
col[low] *= 0.6
tips = (y < 0.7) & (np.abs(x) > 0.22)  # darkened fingertips
col[tips] *= np.clip((y[tips] - 0.52) / 0.18, 0.35, 1)[:, None]
uv = np.stack([x * 3 + z * 2, y * 3], 1)

# ---------------------------------------------------------------- write (same layout as the hand)
os.makedirs(OUT, exist_ok=True)
Vn, Fn = len(verts), len(faces)
with open(os.path.join(OUT, "listener.bin"), "wb") as f:
    f.write(struct.pack("<II", Vn, Fn))
    for arr, dt in ((verts, "<f4"), (normals, "<f4"), (uv, "<f4"), (col, "<f4"), (idx, "<u2"), (wt, "<f4"), (faces, "<u4")):
        f.write(arr.astype(dt).tobytes())
bones = [{"name": n, "parent": index[B[n][0]] if B[n][0] else -1, "pos": B[n][1].tolist()} for n in names]
json.dump({"bones": bones}, open(os.path.join(OUT, "listener.json"), "w"), indent=1)
print(f"listener: {Vn} vertices, {Fn} triangles, {nb} bones, {os.path.getsize(os.path.join(OUT, 'listener.bin')) // 1024} KB")
