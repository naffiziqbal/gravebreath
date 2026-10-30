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
