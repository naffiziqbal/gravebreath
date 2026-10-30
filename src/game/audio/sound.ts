// Game audio on expo-audio: looping beds whose volume the game steers every frame, plus one-shots.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { SOUNDS, type SoundName } from '../engine/media';

const LOOPS = ['ambience_crypt_loop', 'breath_calm_loop', 'breath_panic_loop', 'heartbeat', 'match_burn_loop', 'wind_loop', 'dig_loop', 'listener_breath_loop', 'hushman_chant_loop', 'rain_loop', 'drone_loop', 'tension_loop'] as const;
export type LoopName = (typeof LOOPS)[number];
type VariantPrefix = 'step_stone' | 'step_dirt' | 'dig' | 'lid_creak' | 'listener_step' | 'listener_stomp' | 'listener_growl' | 'water_step' | 'hushman_step' | 'whisper';

/** One-shot players kept open at once. Android can only open so many audio sessions: past this the least recently
 *  used player is released (it is recreated if that sound plays again). */
const MAX_ONE_SHOTS = 40;

export class Sound {
  private players = new Map<SoundName, AudioPlayer>(); // insertion order doubles as recency for one-shots
  private loopVolume = new Map<LoopName, number>();
  private muted = false;
  private master = 1; // the player's volume setting

  async init() {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
    // only the looping beds are opened up front; one-shots open the first time they play (see player())
    for (const name of LOOPS) {
      const p = this.open(name);
      if (!p) continue;
      p.loop = true;
      p.volume = 0;
    }
  }

  private open(name: SoundName): AudioPlayer | undefined {
    try {
      const p = createAudioPlayer(SOUNDS[name]);
      this.players.set(name, p);
      return p;
    } catch (e) {
      console.warn(`sound ${name} could not open`, e); // a missing sound must never stop the game
      return undefined;
    }
  }

  /** The player for a one-shot, opening it on first use and releasing the least recently used beyond the cap. */
  private player(name: SoundName): AudioPlayer | undefined {
    const existing = this.players.get(name);
    if (existing) {
      if (!(LOOPS as readonly string[]).includes(name)) { this.players.delete(name); this.players.set(name, existing); } // mark recent
      return existing;
    }
    let oneShots = this.players.size - LOOPS.length;
    for (const [n, p] of this.players) {
      if (oneShots < MAX_ONE_SHOTS) break;
      if ((LOOPS as readonly string[]).includes(n)) continue;
      p.remove();
      this.players.delete(n);
      oneShots--;
    }
    return this.open(name);
  }

  /** Start all loops silent; their volume is then faded by `setLoop`. */
  startLoops() {
    for (const name of LOOPS) {
      const p = this.players.get(name);
      if (p) { p.volume = 0; p.play(); }
    }
  }

  stopLoops() {
    for (const name of LOOPS) this.players.get(name)?.pause();
  }

  /** Smoothly steer a loop toward a volume (call every frame). */
  setLoop(name: LoopName, target: number, dt: number, rate = 4) {
    const p = this.players.get(name);
    if (!p) return;
    const cur = this.loopVolume.get(name) ?? 0;
    const next = cur + (target - cur) * Math.min(1, dt * rate);
    this.loopVolume.set(name, next);
    p.volume = this.muted ? 0 : Math.max(0, Math.min(1, next * this.master));
  }

  private rates = new Map<SoundName, number>();

  /** Change speed (and pitch); skipped unless it moved enough to hear, since it crosses to native code. */
  setRate(name: SoundName, rate: number) {
    const p = this.players.get(name);
    const r = Math.max(0.5, Math.min(2, rate));
    if (!p || Math.abs((this.rates.get(name) ?? 1) - r) < 0.04) return;
    this.rates.set(name, r);
    p.setPlaybackRate(r);
  }

  play(name: SoundName, volume = 1) {
    if (this.muted) return;
    const p = this.player(name);
    if (!p) return;
    p.volume = Math.max(0, Math.min(1, volume * this.master));
    p.seekTo(0).catch(() => {});
    p.play();
  }

  /**
   * Play a sound from a direction: pan -1 is hard left, +1 hard right (from the listener's point of view). Picks the
   * nearest pre-rendered stereo copy (`name__p0`..`name__p4`); sounds without copies play centred.
   */
  playAt(name: SoundName, volume: number, pan: number) {
    const k = Math.max(0, Math.min(4, Math.round((pan + 1) * 2)));
    const variant = `${name}__p${k}` as SoundName;
    this.play(k !== 2 && variant in SOUNDS ? variant : name, volume);
  }

  private lastVariant = new Map<string, number>();

  /** Play one of the numbered variants `${prefix}_0`, `${prefix}_1`, …, never the same one twice running. */
  playVariant(prefix: VariantPrefix, volume = 1, pan?: number) {
    const options = (Object.keys(SOUNDS) as SoundName[]).filter((n) => n.startsWith(`${prefix}_`) && /_\d+$/.test(n));
    if (!options.length) return;
    let i = Math.floor(Math.random() * options.length);
    if (options.length > 1 && i === this.lastVariant.get(prefix)) i = (i + 1) % options.length;
    this.lastVariant.set(prefix, i);
    if (pan === undefined) this.play(options[i], volume);
    else this.playAt(options[i], volume, pan);
  }

  setMaster(v: number) { this.master = Math.max(0, Math.min(1, v)); }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) for (const p of this.players.values()) p.volume = 0;
  }

  dispose() {
    for (const p of this.players.values()) p.remove();
    this.players.clear();
  }
}
