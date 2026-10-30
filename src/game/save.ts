// Saves the ledger (Meta) between sessions: a JSON file on device, localStorage on web.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { emptyMeta, type Meta } from './sim/meta';

const NAME = 'gravebreath-save.json';

export function loadMeta(): Meta {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(NAME) : readFile();
    if (!raw) return emptyMeta();
    const m = JSON.parse(raw) as Meta;
    return m.version === 1 ? { ...emptyMeta(), ...m } : emptyMeta();
  } catch {
    return emptyMeta();
  }
}

export function saveMeta(m: Meta) {
  const raw = JSON.stringify(m);
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(NAME, raw);
    else new File(Paths.document, NAME).write(raw);
  } catch (e) {
    console.warn('save failed', e);
  }
}

function readFile(): string | null {
  const f = new File(Paths.document, NAME);
  return f.exists ? f.textSync() : null;
}

/** A run in progress, saved when the app goes to the background so a phone call or app switch doesn't lose it. */
export type RunSnapshot = {
  version: 1;
  seed: number;
  layer: number; // 2..5: the level you were walking in
  run: Record<string, unknown>; // the RunState (air, matches, battery, panic…)
  foundClues: string[];
  saved: number;
  pos: { x: number; z: number };
  yaw: number;
  genClues: string[]; // the clue list the level was generated from, so it rebuilds identically
  done: number[]; // indices of the level's interactables already used
};

const RUN = 'gravebreath-run.json';

export function saveRun(s: RunSnapshot) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(RUN, JSON.stringify(s));
    else new File(Paths.document, RUN).write(JSON.stringify(s));
  } catch (e) {
    console.warn('run save failed', e);
  }
}

export function loadRun(): RunSnapshot | null {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(RUN) : (() => { const f = new File(Paths.document, RUN); return f.exists ? f.textSync() : null; })();
    if (!raw) return null;
    const s = JSON.parse(raw) as RunSnapshot;
    return s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function clearRun() {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(RUN);
    else { const f = new File(Paths.document, RUN); if (f.exists) f.delete(); }
  } catch {
    // nothing saved
  }
}
