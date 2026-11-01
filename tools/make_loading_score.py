"""The loading music, two seamless 16 s layers: a pounding bed, and a shrieking layer the game fades in with progress.
Everything is synthesised, so nothing needs licensing. Written to assets/game/audio/ (and a preview, with --preview path).
Run: tools/.venv/bin/python -I tools/make_loading_score.py"""
import os, subprocess, sys, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets/game/audio")
SR, T, BPM = 44100, 16.0, 120  # 32 beats, so it repeats exactly on the bar
N = int(SR * T)
t = np.arange(N) / SR
beat = 60 / BPM
rng = np.random.default_rng(13)

def snap(f):  # a whole number of cycles in the loop, so nothing clicks at the seam
    return round(f * T) / T

def saw(f, phase=0.0, harmonics=24):
    f = snap(f)
    k = np.arange(1, min(harmonics, int(SR / 2 / f)) + 1)[:, None]
    return (np.sin(2 * np.pi * k * f * t[None, :] + phase * k) / k).sum(axis=0)

def lowpass(x, cut):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (f / cut) ** 4), len(x))

def highpass(x, cut):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (1 - 1 / (1 + (f / cut) ** 4)), len(x))

def place(hit, at, gain=1.0, into=None):
    """Add a hit at a time, wrapping past the end so the tail lands at the start of the loop."""
    i = (int(at * SR) + np.arange(len(hit))) % N
    np.add.at(into, i, hit * gain)

def drum(size=1.0):
    d = np.arange(int(SR * 1.1)) / SR
    pitch = 44 + 95 * np.exp(-d * 34)
    body = np.sin(2 * np.pi * np.cumsum(pitch) / SR) * np.exp(-d * (4.2 / size))
    skin = rng.normal(size=len(d)) * np.exp(-d * 55) * 0.4
    return np.tanh((body + lowpass_short(skin)) * 2.2)

def lowpass_short(x, cut=1800):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (f / cut) ** 2), len(x))

def metal():
    d = np.arange(int(SR * 1.6)) / SR
    parts = sum(np.sin(2 * np.pi * f * d) * np.exp(-d * r) for f, r in ((311, 3), (743, 4), (1187, 6), (1693, 8), (2531, 11), (3307, 15)))
    return parts / 3 + rng.normal(size=len(d)) * np.exp(-d * 60) * 0.25

def reverb(x, seconds=1.7, wet=0.3):
    ir = rng.normal(size=int(SR * seconds)) * np.exp(-np.arange(int(SR * seconds)) / (SR * seconds / 5))
    ir = np.pad(ir, (0, N - len(ir)))
    y = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(ir), N)
    return x + wet * y / (np.abs(y).max() + 1e-9) * np.abs(x).max()

def pulses(hits):
    env = np.zeros(N)
    for at, attack, decay, g in hits:
        d = np.arange(int(SR * (attack + decay * 4))) / SR
        shape = np.minimum(d / attack, 1) * np.exp(-np.maximum(d - attack, 0) / decay)
        place(shape, at, g, env)
    return env

# ---------------------------------------------------------------- the bed: war drums over a grinding low cluster
drums = np.zeros(N)
big, small = drum(1.3), drum(0.6)
for bar in range(8):
    b0 = bar * 4 * beat
    for off, g in ((0, 1.0), (1.5, 0.75), (2, 0.9), (3, 0.7), (3.5, 0.8)):
        place(big if off == 0 else small, b0 + off * beat, g, drums)
    if bar % 2 == 1:  # a fill that drags you into the next bar
        for k in range(4): place(small, b0 + (3.5 + k * 0.125) * beat, 0.45 + k * 0.12, drums)

low = sum(saw(f, p) for f, p in ((41.2, 0), (43.65, 1.1), (61.74, 2.3), (58.27, 0.6))) / 4  # E, F, B, Bb: all tritones and semitones
grind = lowpass(np.tanh(low * 2.5), 260) * (0.75 + 0.25 * np.sin(2 * np.pi * snap(beat ** -1) * t))
bed = 0.95 * drums + 0.55 * grind

# ---------------------------------------------------------------- the top: BRAAM stabs, shrieks and struck metal
stab = sum(saw(f, p, 40) for f, p in ((82.41, 0), (87.31, 0.7), (116.54, 1.5), (123.47, 2.2), (164.81, 0.4)))
stab = lowpass(np.tanh(stab * 1.4), 1300) * pulses([(b * beat, 0.02, 0.45, 1.0) for b in (0, 6, 8, 14, 16, 22, 24, 27, 30)])

vib = 0.006 * np.sin(2 * np.pi * snap(6.3) * t)
shriek = np.zeros(N)
for f, g, p in ((1318.5, 1, 0), (1396.9, 1, 0.8), (1864.7, 0.8, 1.7), (1975.5, 0.8, 2.6), (2637, 0.45, 0.3)):
    f = snap(f)
    shriek += g * np.sign(np.sin(2 * np.pi * f * t + p + 2 * np.pi * f * np.cumsum(vib) / SR)) * 0.5
tremolo = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * snap(12) * t))  # bowed hard and fast
swell = 0.3 + 0.7 * pulses([(b * beat, 1.1, 0.8, 1.0) for b in (2, 10, 18, 26)])
shriek = lowpass(highpass(shriek, 900), 5200) * tremolo * swell

strikes = np.zeros(N); m = metal()
for b in (1.5, 5, 7.5, 9.5, 13, 15.5, 17.5, 21, 23.5, 25.5, 28.5, 29.5, 31): place(m, b * beat, 0.8, strikes)

top = 0.85 * stab + 0.4 * shriek + 0.32 * strikes

def stereo(x, width, seed):
    y = reverb(x)
    d = int(SR * 0.012 * width)
    return np.stack([y, np.roll(y, d)], axis=1)

def peak(x, level):
    return x / np.abs(x).max() * level

def encode(x, name):
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    tmp = os.path.join(OUT, name + ".tmp.wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-c:a", "libmp3lame", "-b:a", "128k", os.path.join(OUT, name + ".mp3")], check=True)
    os.remove(tmp)

a = peak(stereo(bed, 1, 1), 0.9)
b = peak(stereo(top, 1.5, 2), 0.9)
encode(a, "loading_bed_loop")
encode(b, "loading_rise_loop")
print("wrote layers; rms bed %.3f, rise %.3f" % (np.sqrt((a ** 2).mean()), np.sqrt((b ** 2).mean())))

# what a 16 s load sounds like, with the volumes the game uses, ending on the cut
if len(sys.argv) > 2 and sys.argv[1] == "--preview":
    p = np.arange(N) / N
    mix = a * (0.5 + 0.35 * p)[:, None] + b * (0.08 * 1 + 0.72 * p ** 1.6)[:, None]
    pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
    with wave.open(sys.argv[2] + ".wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", sys.argv[2] + ".wav", "-c:a", "libmp3lame", "-b:a", "192k", sys.argv[2] + ".mp3"], check=True)
    os.remove(sys.argv[2] + ".wav")
