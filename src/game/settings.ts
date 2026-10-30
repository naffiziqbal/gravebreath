// Player settings, kept between sessions next to the ledger save: a JSON file on device, localStorage on web.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

export type Quality = 'low' | 'medium' | 'high';

export type Settings = {
  version: 1;
  volume: number; // 0..1, master volume for everything
  sensitivity: number; // look speed multiplier, 0.5..2
  invertY: boolean;
  vibration: boolean;
  subtitles: boolean;
  quality: Quality;
};

export const defaultSettings = (): Settings => ({
  version: 1, volume: 1, sensitivity: 1, invertY: false, vibration: true, subtitles: true,
  quality: Platform.OS === 'web' ? 'high' : 'medium',
});

const NAME = 'gravebreath-settings.json';

export function loadSettings(): Settings {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(NAME) : readFile();
    if (!raw) return defaultSettings();
    const s = JSON.parse(raw) as Settings;
    return s.version === 1 ? { ...defaultSettings(), ...s } : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  const raw = JSON.stringify(s);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(NAME, raw);
    else new File(Paths.document, NAME).write(raw);
  } catch (e) {
    console.warn('settings save failed', e);
  }
}

function readFile(): string | null {
  const f = new File(Paths.document, NAME);
  return f.exists ? f.textSync() : null;
}

/** What each graphics quality costs: internal render scale, how far bones are drawn, rain, lantern beams. */
export const QUALITY = {
  low: { maxScale: 0.5, minWidth: 854, minScale: 0.35, boneCull: 6.5, rain: 0.4, beams: false },
  medium: { maxScale: 0.66, minWidth: 1280, minScale: 0.4, boneCull: 7.5, rain: 0.7, beams: true },
  high: { maxScale: 1, minWidth: 1920, minScale: 0.5, boneCull: 8.5, rain: 1, beams: true },
} as const;
