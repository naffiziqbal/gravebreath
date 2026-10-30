"""Synthesize the game's sound effects (all original, owned by Nexus Benders) into assets/game/audio.

Loops are crossfaded at their seam so they repeat without a click.
Run: tools/.venv/bin/python -I tools/make_sfx.py   (needs ffmpeg on PATH)
"""
import os, subprocess, tempfile, wave, math, random
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "game", "audio")
rng = np.random.default_rng(3)
random.seed(3)

def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], btype="band", fs=SR, output="sos"), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, btype="low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, btype="high", fs=SR, output="sos"), x)
def env_exp(n, tau): return np.exp(-np.arange(n) / (tau * SR))
def noise(n): return rng.normal(0, 1, n)
def secs(s): return int(s * SR)

def room(x, dur=1.2, tau=0.3, wet=0.25):
    n = secs(dur); ir = lp(noise(n) * env_exp(n, tau), 3000); ir /= np.sqrt((ir ** 2).sum())
    return x + fftconvolve(x, ir)[: len(x)] * wet

def add(buf, t, sig, g=1.0):
    i = secs(t); sig = sig[: max(0, len(buf) - i)]; buf[i:i + len(sig)] += sig * g

def loopify(x, fade=0.4):
    f = secs(fade); head, tail = x[:f], x[-f:]
    w = np.linspace(0, 1, f)
    y = x[f:].copy(); y[-f:] = tail * (1 - w) + head * w
    return y

def write(name, x, peak=0.9):
    x = x / (np.abs(x).max() + 1e-9) * peak
    os.makedirs(OUT, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
            f.writeframes((x * 32767).astype(np.int16).tobytes())
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp.name, "-c:a", "libmp3lame", "-q:a", "3",
                        os.path.join(OUT, f"{name}.mp3")], check=True)
    os.unlink(tmp.name)
    print(name, f"{len(x) / SR:.1f}s")

# ---- building blocks (same character as the trailer)
def breath(dur, inhale):
    n = secs(dur); e = np.sin(np.linspace(0, np.pi, n)) ** 2
    lo, hi = (600, 3000) if inhale else (300, 1800)
    return bp(noise(n), lo, hi) * e

def knock():
    n = secs(0.35); t = np.arange(n) / SR
    return np.sin(2 * np.pi * 95 * t) * env_exp(n, 0.05) + bp(noise(n), 200, 1500) * env_exp(n, 0.015) * 0.6

def heartbeat():
    n = secs(0.5); t = np.arange(n) / SR
    beat = np.sin(2 * np.pi * 50 * t) * env_exp(n, 0.07) + np.sin(2 * np.pi * 100 * t) * env_exp(n, 0.03) * 0.3
    out = np.zeros(secs(1.0)); add(out, 0, beat); add(out, 0.18, beat, 0.7)
    return out

def creak(dur):
    n = secs(dur); x = np.zeros(n); t, rate = 0.0, random.uniform(35, 60)
    while t < dur:
        i = secs(t)
        if i < n: x[i] = random.uniform(0.6, 1.0)
        rate *= random.uniform(0.97, 1.05); t += 1 / max(15, rate)
    return (bp(x, 350, 900) + 0.5 * bp(x, 1400, 1900)) * np.sin(np.linspace(0, np.pi, n))

def ghost(dur=8.0, f0=47.8, attack=1.5, tau=2.8, bright=1500, seed=0):
    n = secs(dur); t = np.arange(n) / SR; r = np.random.default_rng(seed)
    env = np.minimum(1, t / attack) ** 2 * np.exp(-np.maximum(0, t - attack) / tau)
    fc = 600 + (bright - 600) * np.exp(-np.maximum(0, t - attack) / (tau * 1.2))
    out = np.zeros(n)
    for f, a in [(f0 * k, 1 / k ** 1.4) for k in range(1, 15)] + [(59.0, 0.4), (72.0, 0.35), (118, 0.2), (144, 0.15)]:
        for det in (0.996, 1.0, 1.004):
            ph = r.uniform(0, 2 * np.pi); vib = 1 + 0.003 * np.sin(2 * np.pi * r.uniform(0.1, 0.3) * t + ph)
            out += a / 3 * np.exp(-f / fc) * np.sin(2 * np.pi * f * det * np.cumsum(vib) / SR + ph)
    return out * env

def main():
    # breathing loops: calm (8 s cycle x2) and panicked (fast, ragged)
    x = np.zeros(secs(16.4))
    for k in range(4):
        add(x, k * 4.0 + 0.2, breath(1.3, True), 1.0); add(x, k * 4.0 + 1.7, breath(1.9, False), 0.8)
    write("breath_calm_loop", loopify(room(x)))
    x = np.zeros(secs(8.4)); t = 0.1
    while t < 8:
        add(x, t, breath(0.42, True), 1.0); add(x, t + 0.45, breath(0.55, False), 0.85); t += random.uniform(0.95, 1.15)
    write("breath_panic_loop", loopify(room(x)))
    x = np.zeros(secs(3.0)); add(x, 0.1, breath(2.6, True), 1.0)
    write("breath_hold", room(x * np.linspace(1, 0.3, len(x))))
    x = np.zeros(secs(2.2)); add(x, 0.05, bp(noise(secs(0.5)), 400, 2600) * np.sin(np.linspace(0, np.pi, secs(0.5))), 1.0)
    add(x, 0.4, breath(1.6, False), 0.9)
    write("gasp", room(x))

    write("heartbeat", heartbeat())  # one beat per second; the game changes playbackRate
    x = np.zeros(secs(1.6))
    for k in range(3): add(x, k * 0.28, knock())
    write("knock", room(x, 1.5, 0.4, 0.4))
    x = np.zeros(secs(1.3)); add(x, 0, lp(knock(), 400)); write("step_stone", room(x, 0.8, 0.2, 0.3), 0.7)

    n = secs(1.6)
    strike = hp(noise(n), 2500) * env_exp(n, 0.04) + bp(noise(n), 800, 5000) * np.minimum(1, np.arange(n) / secs(0.1)) * env_exp(n, 0.6) * 0.3
    write("match_strike", strike)
    n = secs(6.4); crackle = np.zeros(n)
    for _ in range(140):
        i = rng.integers(0, n - 400); crackle[i:i + 400] += hp(noise(400), 3000) * env_exp(400, 0.002) * rng.uniform(0.2, 1)
    burn = bp(noise(n), 200, 2000) * 0.08 + crackle * 0.4
    write("match_burn_loop", loopify(burn), 0.5)
    n = secs(0.6); write("match_out", bp(noise(n), 300, 1500) * env_exp(n, 0.12) * np.minimum(1, np.arange(n) / secs(0.05)), 0.5)
    n = secs(0.12); write("phone_click", hp(noise(n), 2000) * env_exp(n, 0.006), 0.4)

    n = secs(1.3); t = np.arange(n) / SR
    write("thud", np.sin(2 * np.pi * 48 * t) * env_exp(n, 0.25) + lp(noise(n), 300) * env_exp(n, 0.12) * 0.8)
    for k in range(3): write(f"creak_{k}", room(creak(random.uniform(1.0, 1.8)), 1.0, 0.25, 0.2), 0.6)
    # pushing the lid: wood strain + a crack
    x = np.zeros(secs(1.4)); add(x, 0, creak(0.9), 0.7)
    n = secs(0.3); add(x, 0.8, hp(noise(n), 900) * env_exp(n, 0.03), 1.0)
    write("wood_crack", room(x))
    x = np.zeros(secs(3.0)); n = secs(0.6)
    add(x, 0, hp(noise(n), 500) * env_exp(n, 0.08), 1.0)
    for k in range(18): add(x, 0.2 + k * 0.1 + rng.uniform(0, 0.08), lp(noise(secs(0.2)), 1200) * env_exp(secs(0.2), 0.04), rng.uniform(0.3, 0.8))
    write("lid_break", room(x, 1.6, 0.4, 0.35))
    x = np.zeros(secs(4.2)); t = 0.0
    while t < 4.0:
        n = secs(0.25); add(x, t, bp(noise(n), 200, 2500) * np.hanning(n), rng.uniform(0.5, 1.0)); t += rng.uniform(0.18, 0.3)
    write("dig_loop", loopify(x), 0.7)
    x = np.zeros(secs(2.0))
    for k in range(10): add(x, k * 0.15 + rng.uniform(0, 0.1), lp(noise(secs(0.15)), 900) * env_exp(secs(0.15), 0.03), rng.uniform(0.3, 1))
    write("dirt_fall", room(x), 0.6)

    # ambience: dark filtered air, no steady tones (steady low tones buzz on phone speakers)
    n = secs(20.4); tt = np.arange(n) / SR
    amb = lp(noise(n), 300) * (0.6 + 0.4 * np.sin(2 * np.pi * tt / 20.0)) + bp(noise(n), 800, 2400) * 0.05 * (0.5 + 0.5 * np.sin(2 * np.pi * tt / 10.0))
    write("ambience_crypt_loop", loopify(room(amb, 3.0, 0.8, 0.4)), 0.5)
    n = secs(10.4); tt = np.arange(n) / SR
    wind = bp(noise(n), 300, 1600) * (0.5 + 0.5 * np.sin(2 * np.pi * tt / 5.0) ** 2)
    write("wind_loop", loopify(wind), 0.6)
    write("ghost_swell", ghost(8.0, 47.8, seed=2))
    write("ghost_sting", ghost(5.0, 42.6, attack=0.15, tau=1.5, bright=2400, seed=5))
    # the Listener: wet rasping breath, a shriek when it hears you, feet dragging on stone
    x = np.zeros(secs(8.4))
    t = 0.2
    while t < 8:
        n = secs(random.uniform(0.9, 1.3)); e = np.sin(np.linspace(0, np.pi, n)) ** 1.5
        rasp = bp(noise(n), 500, 2600) * e
        # wet clicks in the throat
        clicks = np.zeros(n)
        for _ in range(int(n / SR * 30)):
            i = rng.integers(0, n - 200); clicks[i:i + 200] += hp(noise(200), 1500) * env_exp(200, 0.003)
        add(x, t, rasp + clicks * 0.6 * e, 1.0)
        m = secs(random.uniform(1.2, 1.6)); add(x, t + n / SR + 0.1, bp(noise(m), 250, 1400) * np.sin(np.linspace(0, np.pi, m)) ** 2, 0.8)
        t += n / SR + m / SR + random.uniform(0.3, 0.7)
    write("listener_breath_loop", loopify(room(x, 1.5, 0.5, 0.35)), 0.8)
    n = secs(2.4); tt = np.arange(n) / SR
    sweep = np.zeros(n)
    for f0, f1, g in ((900, 3200, 1.0), (1300, 4100, 0.6), (700, 2400, 0.5)):
        fc = f0 + (f1 - f0) * np.minimum(1, tt / 0.5)
        seg = 2400
        for i in range(0, n - seg, seg // 2):
            c = fc[i]; w = np.hanning(seg)
            sweep[i:i + seg] += bp(noise(seg), c * 0.92, c * 1.08) * w * g
    trem = 1 + 0.5 * np.sin(2 * np.pi * 23 * tt)
    shriek = sweep * trem * np.minimum(1, tt / 0.05) * np.exp(-np.maximum(0, tt - 0.6) / 0.5)
    write("listener_shriek", room(shriek + ghost(2.4, 42.6, attack=0.05, tau=0.8, bright=2600, seed=9) * 0.6, 2.0, 0.6, 0.45))
    n = secs(1.1); e = np.sin(np.linspace(0, np.pi, n)) ** 2
    write("listener_drag", room(bp(noise(n), 250, 1600) * e * (0.6 + 0.4 * np.sin(np.linspace(0, 20, n)) ** 2), 1.0, 0.3, 0.3), 0.7)

    # pickups and paper
    n = secs(0.5); write("page", bp(noise(n), 1500, 6000) * np.sin(np.linspace(0, np.pi, n)) ** 3, 0.5)
    x = np.zeros(secs(0.6)); add(x, 0, knock() * 0.3); n = secs(0.25); add(x, 0.05, bp(noise(n), 2500, 7000) * env_exp(n, 0.04), 0.6)
    write("pickup", x, 0.5)

if __name__ == "__main__":
    main()
