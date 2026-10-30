"""Download CC0 assets from Poly Haven into the Gravebreath project and write a credits file."""
import json, os, sys, urllib.request, time

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "art-source")
API = "https://api.polyhaven.com"

# id -> (folder name in project, resolution). 2k only for surfaces the player sees up close.
TEXTURES = {
    "weathered_planks": ("coffin_wood", "2k"),
    "rough_linen": ("coffin_linen", "1k"),
    "medieval_blocks_02": ("crypt_wall", "2k"),
    "mossy_cobblestone": ("crypt_floor", "1k"),
    "rock_wall_10": ("catacomb_rock", "1k"),
    "stone_tiles_02": ("necropolis_floor", "1k"),
    "old_stone_wall": ("necropolis_wall", "1k"),
    "brown_mud_rocks_01": ("grave_dirt", "1k"),
    "leaves_forest_ground": ("graveyard_ground", "1k"),
    "castle_wall_slates": ("tomb_stone", "1k"),
}
# texture maps we keep: colour, normal (OpenGL), roughness, ambient occlusion
MAPS = {"Diffuse": "diff", "nor_gl": "nor", "Rough": "rough", "AO": "ao"}

MODELS = [
    "Lantern_01", "wooden_lantern_01", "vintage_oil_lamp", "wooden_candlestick", "brass_candleholders",
    "crowbar_01", "rusted_spade_01", "root_cluster_01", "pine_roots", "gothic_statue", "marble_bust_01",
    "lion_head", "large_iron_gate", "large_castle_door", "dead_tree_trunk", "dead_tree_trunk_02",
    "rock_moss_set_01", "boulder_01", "stone_01", "vintage_pocket_watch", "postcard_set_01",
    "book_encyclopedia_set_01", "wooden_bucket_01", "old_military_crate",
]
HDRIS = {"rogland_moonlit_night": "1k", "moonless_golf": "1k"}

def get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "gravebreath-asset-fetch"})
            with urllib.request.urlopen(req, timeout=120) as r, open(dest + ".part", "wb") as f:
                f.write(r.read())
            os.replace(dest + ".part", dest)
            return
        except Exception as e:
            print("retry", url, e, flush=True); time.sleep(3)
    raise RuntimeError("failed " + url)

def api(path):
    req = urllib.request.Request(API + path, headers={"User-Agent": "gravebreath-asset-fetch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

credits = []
for pid, (name, res) in TEXTURES.items():
    files = api(f"/files/{pid}")
    for key, short in MAPS.items():
        if key not in files: continue
        entry = files[key].get(res, {}).get("jpg") or files[key].get("1k", {}).get("jpg")
        if not entry: continue
        get(entry["url"], f"{ROOT}/textures/{name}/{name}_{short}.jpg")
    credits.append((f"textures/{name}", pid, f"https://polyhaven.com/a/{pid}"))
    print("texture", name, flush=True)

for pid in MODELS:
    files = api(f"/files/{pid}")
    g = files["gltf"]["1k"]["gltf"]
    base = f"{ROOT}/models/{pid}"
    get(g["url"], f"{base}/{pid}.gltf")
    for rel, inc in g.get("include", {}).items():
        get(inc["url"], f"{base}/{rel}")
    credits.append((f"models/{pid}", pid, f"https://polyhaven.com/a/{pid}"))
    print("model", pid, flush=True)

for pid, res in HDRIS.items():
    files = api(f"/files/{pid}")
    get(files["hdri"][res]["hdr"]["url"], f"{ROOT}/hdri/{pid}_{res}.hdr")
    credits.append((f"hdri/{pid}_{res}.hdr", pid, f"https://polyhaven.com/a/{pid}"))
    print("hdri", pid, flush=True)

with open(os.path.join(os.path.dirname(ROOT), "CREDITS.md"), "w") as f:
    f.write("# Asset credits\n\nAll assets below are CC0 (public domain) from Poly Haven: https://polyhaven.com/license\n"
            "No attribution is required; this list is kept for our records.\n\n| Project path | Poly Haven asset | Source |\n| --- | --- | --- |\n")
    for path, pid, url in credits:
        f.write(f"| `art-source/{path}` | {pid} | {url} |\n")
    f.write("\n## Fonts (SIL Open Font License)\n\n| Font | Source |\n| --- | --- |\n"
            "| Nosifer | https://fonts.google.com/specimen/Nosifer |\n| Creepster | https://fonts.google.com/specimen/Creepster |\n"
            "\n## Audio\n\nAll sound effects in `assets/audio/` are synthesized in-house by `tools/make_sfx.py` (owned by Nexus Benders).\n")
print("done", flush=True)
