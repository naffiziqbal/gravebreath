"""Sculpt Cole: a tired man in a long worn coat, flat cap, scarf and boots, as one skinned mesh, in his own pose:
right arm bent with a fist closed around a lantern handle, left arm hanging clear of the coat. Facing -z, feet at y = 0.
His arms never bend (world/coleRig.ts only breathes him and turns his head), so they can't drag the coat.
Output: assets/game/cole/cole.bin + cole.json. Run with tools/.venv/bin/python -I.
"""
import json, os, struct
import numpy as np
from skimage import measure

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "game", "cole")
def V(*a): return np.array(a, float)

SHOULDER_R, ELBOW_R, WRIST_R, GRIP = V(-0.185, 1.42, 0.0), V(-0.27, 1.16, -0.06), V(-0.3, 1.04, -0.28), V(-0.305, 1.015, -0.345)
SHOULDER_L, ELBOW_L, WRIST_L, HAND_L = V(0.185, 1.42, 0.0), V(0.27, 1.14, 0.015), V(0.3, 0.88, -0.03), V(0.305, 0.81, -0.04)
B = {"root": (None, V(0, 0.95, 0)), "chest": ("root", V(0, 1.3, 0)), "head": ("chest", V(0, 1.56, -0.02)), "handR": ("chest", GRIP)}
names = list(B); index = {n: i for i, n in enumerate(names)}; P = {n: B[n][1] for n in names}

def capsule(X, a, b, ra, rb):
    ba = b - a; pa = X - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - (ra + (rb - ra) * h)
def ellipsoid(X, c, r):
    q = (X - c) / r; k0 = np.linalg.norm(q, axis=1); k1 = np.linalg.norm(q / r, axis=1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)

def head_field(X):
    h = ellipsoid(X, V(0, 1.66, 0.0), V(0.074, 0.088, 0.088))  # cranium
    h = smin(h, ellipsoid(X, V(0, 1.61, -0.035), V(0.058, 0.055, 0.058)), 0.03)  # cheeks
    h = smin(h, ellipsoid(X, V(0, 1.56, -0.052), V(0.04, 0.036, 0.04)), 0.03)  # jaw and chin
    h = smin(h, capsule(X, V(0, 1.648, -0.09), V(0, 1.606, -0.1), 0.0085, 0.012), 0.012)  # nose
    for s in (1, -1):
        h = smin(h, ellipsoid(X, V(s * 0.029, 1.655, -0.082), V(0.023, 0.007, 0.011)), 0.012)  # brow
        h = smax(h, -ellipsoid(X, V(s * 0.03, 1.637, -0.094), V(0.013, 0.006, 0.009)), 0.006)  # eye hollow
        h = smin(h, ellipsoid(X, V(s * 0.03, 1.636, -0.082), V(0.009, 0.0065, 0.008)), 0.002)  # eye
        h = smin(h, ellipsoid(X, V(s * 0.074, 1.633, -0.005), V(0.009, 0.024, 0.016)), 0.005)  # ear
    h = smax(h, -ellipsoid(X, V(0, 1.575, -0.098), V(0.024, 0.0035, 0.014)), 0.004)  # mouth
    return h

def arm(X, a, b, c, ra, rb, rc):
    return smin(capsule(X, a, b, ra, rb), capsule(X, b, c, rb, rc), 0.02)

def fist(X):
    d = ellipsoid(X, GRIP + V(0.002, 0.012, 0.03), V(0.03, 0.033, 0.042))  # back of the hand
    for k in range(4):  # fingers wrapped forward and down around the handle
        z = GRIP[2] + 0.012
        x = GRIP[0] - 0.022 + k * 0.0145
        d = smin(d, capsule(X, V(x, GRIP[1] + 0.02, z + 0.012), V(x, GRIP[1] + 0.012, z - 0.03), 0.0085, 0.008), 0.004)
        d = smin(d, capsule(X, V(x, GRIP[1] + 0.012, z - 0.03), V(x, GRIP[1] - 0.018, z - 0.024), 0.008, 0.0075), 0.004)
    return smin(d, capsule(X, GRIP + V(0.024, 0.01, 0.025), GRIP + V(0.012, -0.018, -0.02), 0.01, 0.008), 0.005)  # thumb

def open_hand(X):
    d = ellipsoid(X, HAND_L, V(0.018, 0.043, 0.032))
    for k in range(4):
        z = HAND_L[2] - 0.022 + k * 0.015
        d = smin(d, capsule(X, V(HAND_L[0], HAND_L[1] - 0.035, z), V(HAND_L[0] - 0.008, HAND_L[1] - 0.09 + abs(k - 1.5) * 0.008, z - 0.01), 0.0075, 0.0065), 0.004)
    return d

def coat_r(y):
    t = np.clip((1.45 - y) / 0.95, 0, 1)
    return 0.138 + 0.1 * t ** 1.05

def body_field(X):
    x, y, z = X.T
    d = np.full(len(X), 9.0)
    for s in (1, -1):
        hip, knee, ankle = V(s * 0.08, 0.92, 0), V(s * 0.092, 0.5, -0.02), V(s * 0.1, 0.11, 0)
        d = smin(d, capsule(X, hip, knee, 0.082, 0.058), 0.02)
        d = smin(d, capsule(X, knee, ankle, 0.058, 0.046), 0.015)
        boot = smin(ellipsoid(X, V(s * 0.1, 0.05, -0.05), V(0.052, 0.055, 0.115)), capsule(X, V(s * 0.1, 0.06, 0), V(s * 0.1, 0.24, 0), 0.052, 0.052), 0.02)
        d = smin(d, np.maximum(boot, -y), 0.01)
    # the coat, with soft vertical drapes that grow toward the hem, split up the front below the belt
    ang = np.arctan2(z, x)
    t = np.clip((1.45 - y) / 0.95, 0, 1)
    drape = (0.008 * np.sin(ang * 6 + 0.7) + 0.005 * np.sin(ang * 11 + y * 4)) * t ** 1.4
    coat = np.maximum(np.sqrt(x ** 2 + (z * 1.25) ** 2) - (coat_r(y) + drape), np.maximum(0.47 - y, y - 1.47))
    slit = capsule(X, V(0.012, 0.3, -0.27), V(0.0, 0.95, -0.19), 0.04, 0.003)
    d = smin(d, smax(coat, -slit, 0.006), 0.012)
    d = smin(d, ellipsoid(X, V(0, 1.42, 0), V(0.165, 0.058, 0.102)), 0.05)  # sloping shoulders
    for s in (1, -1):  # lapels lying on the chest
        lapel = capsule(X, V(s * 0.05, 1.45, -0.105), V(s * 0.012, 1.17, -0.135), 0.03, 0.009) * 1.0
        d = smin(d, np.maximum(lapel, -(z + 0.122)), 0.006)
    d = smin(d, np.maximum(np.abs(np.sqrt(x ** 2 + (z * 1.25) ** 2) - (coat_r(0.98) + 0.004)) - 0.009, np.abs(y - 0.98) - 0.022), 0.004)  # belt
    # scarf wound at the neck, one end hanging, then the neck
    d = smin(d, ellipsoid(X, V(0, 1.49, -0.008), V(0.083, 0.038, 0.085)), 0.012)
    d = smin(d, capsule(X, V(0.03, 1.47, -0.09), V(0.052, 1.2, -0.158), 0.029, 0.024), 0.008)
    for a, b in ((SHOULDER_R, ELBOW_R), (SHOULDER_L, ELBOW_L)):  # the shoulder flows into the coat; the rest of the arm stays clear of it
        d = smin(d, capsule(X, a, a + (b - a) * 0.3, 0.056, 0.054), 0.03)
    d = np.minimum(d, arm(X, SHOULDER_R, ELBOW_R, WRIST_R, 0.055, 0.05, 0.04))
    d = np.minimum(d, arm(X, SHOULDER_L, ELBOW_L, WRIST_L, 0.055, 0.05, 0.04))
    return d

def cap_field(X):
    # a soft flat cap, pulled low and forward: a floppy crown over a short stiff peak
    crown = ellipsoid(X, V(0, 1.735, -0.018), V(0.09, 0.036, 0.098))
    crown = smin(crown, ellipsoid(X, V(0, 1.722, -0.075), V(0.075, 0.019, 0.05)), 0.018)
    peak = ellipsoid(X, V(0, 1.7, -0.112), V(0.06, 0.0075, 0.028))
    return smin(crown, peak, 0.01)

def fine_field(X):
    d = smin(head_field(X), capsule(X, V(0, 1.47, 0), V(0, 1.57, -0.012), 0.046, 0.043), 0.015)
    return np.minimum(d, cap_field(X))

def hands_field(X):
    return np.minimum(smin(fist(X), capsule(X, WRIST_R, GRIP + V(0.003, 0.01, 0.05), 0.033, 0.03), 0.012), smin(open_hand(X), capsule(X, WRIST_L, HAND_L, 0.026, 0.024), 0.01))

def surface(f, lo, hi, step):
    xs, ys, zs = [np.arange(lo[i], hi[i], step) for i in range(3)]
    G = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), -1).reshape(-1, 3)
    vol = np.concatenate([f(G[i:i + 400000]) for i in range(0, len(G), 400000)]).reshape(len(xs), len(ys), len(zs))
    v, t, _, _ = measure.marching_cubes(vol, 0.0, spacing=(step,) * 3)
    return v + lo, t

# fine where it is looked at (the face and cap, the hands), coarser everywhere else; the pieces overlap inside the scarf and cuffs
parts = [surface(body_field, V(-0.45, -0.01, -0.45), V(0.45, 1.56, 0.38), 0.0135),
         surface(fine_field, V(-0.13, 1.46, -0.17), V(0.13, 1.79, 0.13), 0.0058),
         surface(hands_field, V(-0.38, 0.92, -0.42), V(-0.22, 1.1, -0.2), 0.006),
         surface(hands_field, V(0.25, 0.68, -0.12), V(0.36, 0.92, 0.05), 0.007)]
verts, faces, n0 = [], [], 0
for v, t in parts:
    verts.append(v); faces.append(t + n0); n0 += len(v)
verts, faces = np.vstack(verts), np.vstack(faces)
nbrs = [[] for _ in verts]
for f in faces:
    for a, b in ((0, 1), (1, 2), (2, 0)):
        nbrs[f[a]].append(f[b]); nbrs[f[b]].append(f[a])
nbrs = [np.unique(n) for n in nbrs]
for lam in (0.5, -0.53):  # a light pass: enough to lose the voxel steps, not the face
    avg = np.array([verts[n].mean(0) if len(n) else verts[i] for i, n in enumerate(nbrs)])
    verts = verts + lam * (avg - verts)
fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
normals = np.zeros_like(verts)
for k in range(3): np.add.at(normals, faces[:, k], fn)
normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12

# skin: the head turns above the neck, the upper body breathes, the fist can sway a little with the lantern
x, y, z = verts.T
w = np.zeros((len(verts), len(names)))
headw = np.clip((y - 1.53) / 0.04, 0, 1)
fistw = (np.linalg.norm(verts - GRIP, axis=1) < 0.075).astype(float)
chestw = np.clip((y - 1.0) / 0.25, 0, 1) * (1 - headw) * (1 - fistw)
w[:, index["head"]] = headw * (1 - fistw)
w[:, index["handR"]] = fistw
w[:, index["chest"]] = chestw
w[:, index["root"]] = np.maximum(1 - headw * (1 - fistw) - fistw - chestw, 0)
idx = np.argsort(-w, axis=1)[:, :4]
wt = np.take_along_axis(w, idx, 1); wt /= wt.sum(1, keepdims=True) + 1e-12

# colour: dark enough to survive a lantern a foot away
grain = 0.006 * np.sin(x * 37 + y * 13) * np.sin(z * 29 + y * 7) + 0.004 * np.sin(y * 71 + x * 41)
coat = np.array([0.036, 0.029, 0.024])
col = coat + grain[:, None]
col *= (0.82 + 0.18 * np.clip((np.sin(np.arctan2(z, x) * 6 + 0.7) + 1) / 2, 0, 1))[:, None]  # shadow in the folds
col[y < 0.47] = [0.018, 0.018, 0.022]  # trousers
col[y < 0.245] = [0.012, 0.009, 0.008]  # boots
def paint(mask, c): col[mask] = c
paint(np.abs(y - 0.98) < 0.024, [0.009, 0.007, 0.006])  # belt
paint((np.abs(y - 0.98) < 0.018) & (np.abs(x) < 0.022) & (z < 0), [0.1, 0.08, 0.04])  # buckle
for s in (1, -1):
    paint((capsule(verts, V(s * 0.05, 1.45, -0.105), V(s * 0.012, 1.17, -0.135), 0.033, 0.011) < 0.001) & (z < -0.11), [0.038, 0.03, 0.024])  # lapels
    paint((np.abs(x - s * 0.13) < 0.058) & (np.abs(y - 0.8) < 0.006) & (z < -0.05), [0.018, 0.014, 0.011])  # pocket flaps
for by in (0.9, 1.07, 1.14):
    paint((np.linalg.norm(verts[:, :2] - V(0.045, by), axis=1) < 0.011) & (z < -0.05), [0.016, 0.012, 0.01])  # buttons
for a, b, c in ((SHOULDER_R, ELBOW_R, WRIST_R), (SHOULDER_L, ELBOW_L, WRIST_L)):
    u = (c - b) / np.linalg.norm(c - b)
    t_ = (verts - c) @ u
    paint((np.abs(t_ + 0.03) < 0.006) & (capsule(verts, b, c, 0.055, 0.055) < 0.006), [0.018, 0.014, 0.011])  # cuffs
scarf = (ellipsoid(verts, V(0, 1.49, -0.008), V(0.092, 0.047, 0.094)) < 0.004) | (capsule(verts, V(0.03, 1.47, -0.09), V(0.052, 1.2, -0.158), 0.035, 0.03) < 0.002)
paint(scarf & (y < 1.53), [0.09, 0.016, 0.014])
skin = np.array([0.34, 0.215, 0.155])
neck = (y >= 1.5) & (y < 1.57) & (np.sqrt(x ** 2 + (z + 0.012) ** 2) < 0.06) & ~scarf
paint(neck, skin * 0.85)
head = (head_field(verts) < 0.006) & (y < 1.7)
shade = 0.92 + grain * 6
col[head] = skin * shade[head, None]
col[head & (y < 1.585) & (z < -0.015)] *= np.array([0.7, 0.68, 0.7])  # three days of stubble
col[head & ((z > 0.012 + (1.7 - y) * 0.3) | (y > 1.692))] = [0.04, 0.028, 0.02]  # short hair, back and sides
for s in (1, -1):
    paint(ellipsoid(verts, V(s * 0.029, 1.655, -0.086), V(0.024, 0.0065, 0.012)) < 0.004, [0.035, 0.024, 0.018])  # brow
    paint(ellipsoid(verts, V(s * 0.03, 1.636, -0.088), V(0.0125, 0.0075, 0.009)) < 0.0015, [0.42, 0.39, 0.34])  # the white of the eye
    paint(ellipsoid(verts, V(s * 0.03, 1.636, -0.09), V(0.0055, 0.0055, 0.0045)) < 0.0015, [0.012, 0.01, 0.009])  # iris
paint(ellipsoid(verts, V(0, 1.575, -0.098), V(0.026, 0.005, 0.016)) < 0.002, [0.1, 0.045, 0.04])  # mouth
cap = cap_field(verts) < 0.003
col[cap] = (np.array([0.03, 0.028, 0.024]) + grain[cap, None] * 0.6)
hands = fistw > 0
hands |= (open_hand(verts) < 0.006)
hands &= ~(capsule(verts, ELBOW_R, WRIST_R, 0.05, 0.043) < 0.0)
col[hands] = skin * 0.9
uv = np.stack([x * 4 + z * 3, y * 4], 1)

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "cole.bin"), "wb") as f:
    f.write(struct.pack("<II", len(verts), len(faces)))
    for arr, dt in ((verts, "<f4"), (normals, "<f4"), (uv, "<f4"), (col, "<f4"), (idx, "<u2"), (wt, "<f4"), (faces, "<u4")):
        f.write(arr.astype(dt).tobytes())
bones = [{"name": n, "parent": index[B[n][0]] if B[n][0] else -1, "pos": B[n][1].tolist()} for n in names]
json.dump({"bones": bones}, open(os.path.join(OUT, "cole.json"), "w"), indent=1)
print(f"cole: {len(verts)} vertices, {len(faces)} triangles, {len(names)} bones, {os.path.getsize(os.path.join(OUT, 'cole.bin')) // 1024} KB")
