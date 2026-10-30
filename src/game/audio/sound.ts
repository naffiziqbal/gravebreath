// Game audio on expo-audio: looping beds whose volume the game steers every frame, plus one-shots.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { SOUNDS, type SoundName } from '../engine/media';

const LOOPS = ['ambience_crypt_loop', 'breath_calm_loop', 'breath_panic_loop', 'heartbeat', 'match_burn_loop', 'wind_loop', 'dig_loop', 'listener_breath_loop', 'hushman_chant_loop', 'rain_loop'] as const;
export type LoopName = (typeof LOOPS)[number];

export class Sound {
  private players = new Map<SoundName, AudioPlayer>();
  private loopVolume = new Map<LoopName, number>();
  private muted = false;

  async init() {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' });
    for (const name of Object.keys(SOUNDS) as SoundName[]) {
      const p = createAudioPlayer(SOUNDS[name]);
      if ((LOOPS as readonly string[]).includes(name)) {
        p.loop = true;
        p.volume = 0;
      }
      this.players.set(name, p);
    }
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
    p.volume = this.muted ? 0 : Math.max(0, Math.min(1, next));
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
    const p = this.players.get(name);
    if (!p || this.muted) return;
    p.volume = Math.max(0, Math.min(1, volume));
    p.seekTo(0).catch(() => {});
    p.play();
  }

  private lastVariant = new Map<string, number>();

  /** Play one of the numbered variants `${prefix}_0`, `${prefix}_1`, …, never the same one twice running. */
  playVariant(prefix: 'step_stone' | 'step_dirt' | 'dig' | 'lid_creak' | 'listener_step' | 'listener_stomp' | 'listener_growl' | 'water_step', volume = 1) {
    const options = (Object.keys(SOUNDS) as SoundName[]).filter((n) => n.startsWith(`${prefix}_`) && /_\d+$/.test(n));
    if (!options.length) return;
    let i = Math.floor(Math.random() * options.length);
    if (options.length > 1 && i === this.lastVariant.get(prefix)) i = (i + 1) % options.length;
    this.lastVariant.set(prefix, i);
    this.play(options[i], volume);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (m) for (const p of this.players.values()) p.volume = 0;
  }

  dispose() {
    for (const p of this.players.values()) p.remove();
    this.players.clear();
  }
}
