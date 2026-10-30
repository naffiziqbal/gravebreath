"""Turn the CC0 foley recordings in art-source/audio into game sounds in assets/game/audio.

Sources (all CC0): Kenney "50 RPG sound effects", Fantozzi footsteps (stone/sand), Corsica_S gravel footsteps.
Each output is trimmed, given a little room tone, peak-normalised and saved as mp3. Several variants per
sound so repeats never sound identical. Run: tools/.venv/bin/python -I tools/import_foley.py
"""
import os, subprocess, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "art-source", "audio")
OUT = os.path.join(ROOT, "assets", "game", "audio")
SR = 44100
KENNEY = os.path.join(SRC, "kenney-rpg", "OGG")
FANTOZZI = os.path.join(SRC, "fantozzi", "Fantozzi-footsteps", "flac")
CORSICA = os.path.join(SRC, "corsica", "Corsica_S-Walking_in_Snow")
rng = np.random.default_rng(5)

def load(path, pitch=1.0):
    """Decode to mono float; pitch < 1 lowers pitch and slows it, like a heavier body."""
    af = f"asetrate={SR}*{pitch},aresample={SR}" if pitch != 1.0 else "anull"
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-af", af, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float64) / 32768

def trim(x, thresh=0.01, pad=0.01):
    idx = np.where(np.abs(x) > thresh * np.abs(x).max())[0]
    if not len(idx): return x
    a, b = max(0, idx[0] - int(pad * SR)), min(len(x), idx[-1] + int(0.08 * SR))
    y = x[a:b].copy()
    f = min(len(y), int(0.03 * SR))
    y[-f:] *= np.linspace(1, 0, f)
    return y

def lp(x, f): return sosfilt(butter(2, f, btype="low", fs=SR, output="sos"), x)
def hp(x, f): return sosfilt(butter(2, f, btype="high", fs=SR, output="sos"), x)

def room(x, wet=0.18, tau=0.25):
    n = int(0.8 * SR)
    ir = lp(rng.normal(0, 1, n) * np.exp(-np.arange(n) / (tau * SR)), 3000)
    ir /= np.sqrt((ir ** 2).sum())
    y = np.concatenate([x, np.zeros(n)])
    return y + fftconvolve(y, ir)[: len(y)] * wet

def save(name, x, peak=0.9):
    x = x / (np.abs(x).max() + 1e-9) * peak
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((x * 32767).astype(np.int16).tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-c:a", "libmp3lame", "-q:a", "3", os.path.join(OUT, f"{name}.mp3")], check=True)
    os.unlink(tmp.name)
    print(f"{name:20s} {len(x) / SR:.2f}s")

def main():
    os.makedirs(OUT, exist_ok=True)
    # footsteps on crypt stone: alternate left/right recordings, slightly darkened, a hint of stone room
    for i, f in enumerate(["StoneL1", "StoneR1", "StoneL2", "StoneR2", "StoneL3", "StoneR3"]):
        save(f"step_stone_{i}", room(lp(trim(load(os.path.join(FANTOZZI, f"Fantozzi-{f}.flac"), 0.97 + 0.03 * (i % 2))), 7000), 0.22))
    # footsteps on catacomb dirt: the sand recordings, lower and softer
    for i, f in enumerate(["SandL1", "SandR1", "SandL2", "SandR2", "SandL3", "SandR3"]):
        save(f"step_dirt_{i}", room(lp(trim(load(os.path.join(FANTOZZI, f"Fantozzi-{f}.flac"), 0.9)), 5500), 0.15))
    # digging by hand: a handful of gravelly soil scraped and dropped, plus the sleeve moving
    gravel = sorted(f for f in os.listdir(CORSICA) if f.endswith(".flac"))
    picks = [gravel[i] for i in (2, 6, 9, 13, 21, 27)]
    cloth = [load(os.path.join(KENNEY, f"cloth{k}.ogg")) for k in (1, 2, 3, 4)]
    for i, f in enumerate(picks):
        soil = trim(load(os.path.join(CORSICA, f), 0.78))
        soil = lp(soil, 4500) * 1.0
        sleeve = cloth[i % 4] * 0.35
        n = max(len(soil) + int(0.05 * SR), len(sleeve))
        mix = np.zeros(n); mix[: len(sleeve)] += sleeve; mix[int(0.05 * SR): int(0.05 * SR) + len(soil)] += soil / (np.abs(soil).max() + 1e-9)
        save(f"dig_{i}", room(mix, 0.12))
    # picking things up: a sleeve rustle as you reach, then the thing itself
    save("reach", room(trim(load(os.path.join(KENNEY, "cloth3.ogg"))), 0.1), 0.6)
    save("take_paper", room(trim(load(os.path.join(KENNEY, "bookFlip2.ogg"))), 0.12), 0.7)
    save("take_metal", room(trim(load(os.path.join(KENNEY, "handleCoins.ogg"), 1.15)), 0.12), 0.6)
    save("take_matches", room(np.concatenate([trim(load(os.path.join(KENNEY, "handleSmallLeather.ogg"))), np.zeros(int(0.05 * SR)), trim(load(os.path.join(KENNEY, "metalClick.ogg"), 1.6)) * 0.4]), 0.1), 0.7)
    # the coffin lid straining: real wood creaks, pitched down for a heavier board
    for i, k in enumerate((1, 2, 3)):
        save(f"lid_creak_{i}", room(trim(load(os.path.join(KENNEY, f"creak{k}.ogg"), 0.8)), 0.2), 0.75)
    # the Listener's feet: the sand steps slowed right down, dragged
    for i, f in enumerate(["SandL2", "SandR3"]):
        save(f"listener_step_{i}", room(lp(trim(load(os.path.join(FANTOZZI, f"Fantozzi-{f}.flac"), 0.62)), 3500), 0.35), 0.8)

if __name__ == "__main__":
    main()
