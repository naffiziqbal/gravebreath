"""Cole's spoken lines: the Kokoro voice am_michael (Apache 2.0), with each line's performance built from its pacing, its
pauses and how it is treated. Needs Python 3.12 with kokoro-onnx and soundfile, Homebrew's espeak-ng, and the model files.
Run: KOKORO_DIR=<folder with kokoro-v1.0.onnx and voices-v1.0.bin> <that python> tools/make_cole_voice.py [preview.mp3]
Writes assets/game/audio/cole_*.mp3"""
import os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets/game/audio")
K = os.environ["KOKORO_DIR"]
k = Kokoro(os.path.join(K, "kokoro-v1.0.onnx"), os.path.join(K, "voices-v1.0.bin"),
           espeak_config=EspeakConfig(lib_path="/opt/homebrew/lib/libespeak-ng.dylib", data_path="/opt/homebrew/share/espeak-ng-data"))

def pitch(f):  # shift pitch by a factor, keeping the speed
    return f"asetrate=44100*{f},aresample=44100,atempo={1 / f:.4f}"

# (phrase, pause after in seconds), speed, ffmpeg treatment
LINES = {
    # friendly: an easy, warm voice, close to your ear, nothing to worry about
    "cole_gate": ([("Left of the path, halfway up.", 0.28), ("Don't worry.", 0.16), ("I'll watch the gate.", 0)], 1.0,
                  f"{pitch(0.97)},equalizer=f=170:t=q:w=1:g=3,equalizer=f=3000:t=q:w=1.5:g=-2,lowpass=f=7500"),
    # the mask drops: flat, slow, and he won't look at you
    "cole_sorry": ([("I'm sorry.", 0.85), ("They pay by the name.", 0)], 0.78,
                   f"{pitch(0.91)},highpass=f=80,lowpass=f=5200,aecho=0.8:0.5:60:0.12"),
    # under the earth: muffled, breaking off, running out of air
    "cole_buried": ([("Is someone there?", 0.55), ("It's me.", 0.3), ("It's Cole.", 0.65), ("Please.", 0.8), ("I can't breathe.", 0)], 0.84,
                    f"{pitch(0.95)},tremolo=f=6:d=0.22,lowpass=f=1050,highpass=f=110,aecho=0.8:0.6:38|70:0.3|0.16"),
    # hoarse and quick: grave dirt in his throat
    "cole_help": ([("Take these.", 0.3), ("They're watching the porch.", 0.22), ("Now go.", 0)], 0.96,
                  f"{pitch(0.93)},highpass=f=170,lowpass=f=4200,acrusher=level_in=1.6:level_out=1:bits=10:mix=0.25,aecho=0.8:0.5:50:0.15"),
    # shouting into the dark: strained, too fast, ringing off the vault
    "cole_betray": ([("Here! Over here!", 0.1), ("I found one!", 0.08), ("I found one for you!", 0)], 1.2,
                    f"{pitch(1.12)},highpass=f=240,equalizer=f=2500:t=q:w=1:g=6,volume=3,alimiter=limit=0.8,aecho=0.8:0.75:180|360|620:0.42|0.26|0.14"),
    # almost gone: weak, shaking, and meant
    "cole_left": ([("Don't.", 0.8), ("Don't leave me.", 0.75), ("Not like I left you.", 0)], 0.76,
                  f"{pitch(0.9)},tremolo=f=5:d=0.3,lowpass=f=1700,highpass=f=110,aecho=0.8:0.6:42|85:0.28|0.14"),
}

with tempfile.TemporaryDirectory() as tmp:
    done = []
    for name, (phrases, speed, chain) in LINES.items():
        parts, sr = [], 24000
        for text, pause in phrases:
            a, sr = k.create(text, voice="am_michael", speed=speed, lang="en-us")
            cut = np.flatnonzero(np.abs(a) > 0.01)
            parts += [a[max(0, cut[0] - 400):cut[-1] + 1600], np.zeros(int(sr * pause))]
        wav = os.path.join(tmp, name + ".wav")
        sf.write(wav, np.concatenate(parts + [np.zeros(int(sr * 0.5))]), sr)
        mp3 = os.path.join(OUT, name + ".mp3")
        af = f"aresample=44100,{chain},loudnorm=I=-16:TP=-1.5,aresample=44100"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", af, "-ac", "1", "-b:a", "96k", mp3], check=True)
        done.append(mp3)
        print("wrote", name)
    if len(sys.argv) > 1:
        gap = os.path.join(tmp, "gap.wav")
        sf.write(gap, np.zeros(int(44100 * 1.2)), 44100)
        items = []
        for m in done: items += [m, gap]
        args = sum((["-i", i] for i in items), [])
        graph = "".join(f"[{n}:a]aresample=44100,aformat=channel_layouts=mono[a{n}];" for n in range(len(items))) + "".join(f"[a{n}]" for n in range(len(items))) + f"concat=n={len(items)}:v=0:a=1"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", graph, "-b:a", "128k", sys.argv[1]], check=True)
