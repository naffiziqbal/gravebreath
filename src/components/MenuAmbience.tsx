// The haunted bed under the menus: starts the moment the app opens (right after the splash screen) and fades out
// when a run begins, because the game has its own sound. Follows the player's volume setting.
import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { SOUNDS } from '../game/engine/media';
import { useGame } from '../game/store';

const FADE_MS = 1200;

/** The players live outside React: created once, faded by setTarget. */
const bed: { drone?: AudioPlayer; air?: AudioPlayer; level: number; fade?: ReturnType<typeof setInterval> } = { level: 0 };

function start(volume: number) {
  if (bed.drone) return;
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' }).catch(() => {});
  try {
    bed.drone = createAudioPlayer(SOUNDS.drone_loop);
    bed.air = createAudioPlayer(SOUNDS.ambience_crypt_loop);
    for (const p of [bed.drone, bed.air]) { p.loop = true; p.volume = 0; p.play(); }
    const swell = createAudioPlayer(SOUNDS.ghost_swell); // one ghostly swell as the app opens
    swell.volume = 0.7 * volume;
    swell.play();
    setTimeout(() => swell.remove(), 9000);
  } catch (e) {
    console.warn('menu ambience could not start', e);
  }
}

/** Fade to full (menus) or silence (in a run); paused once silent so it costs nothing during play. */
function setTarget(on: boolean, volume: number) {
  const { drone, air } = bed;
  if (!drone || !air) return;
  if (bed.fade) clearInterval(bed.fade);
  if (on && !drone.playing) { drone.play(); air.play(); }
  const from = bed.level, target = on ? 1 : 0, t0 = Date.now();
  bed.fade = setInterval(() => {
    const u = Math.min(1, (Date.now() - t0) / FADE_MS);
    bed.level = from + (target - from) * u;
    drone.volume = 0.65 * volume * bed.level;
    air.volume = 0.4 * volume * bed.level;
    if (u >= 1) {
      clearInterval(bed.fade);
      if (!on) { drone.pause(); air.pause(); }
    }
  }, 50);
}

export function MenuAmbience() {
  const path = usePathname();
  const volume = useGame((s) => s.settings.volume);
  const inRun = path.startsWith('/play');
  useEffect(() => { start(volume); }, [volume]);
  useEffect(() => { setTarget(!inRun, volume); }, [inRun, volume]);
  return null;
}
