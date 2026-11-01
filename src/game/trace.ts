// Temporary crash breadcrumbs for release builds: each startup step is written to a file straight away, so after a
// native crash the title screen can show how far the last launch got. Remove before the store release.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const NAME = 'gravebreath-trace.txt';
let steps: string[] = [];

export function trace(step: string) {
  steps = [...steps.slice(-11), step];
  if (Platform.OS === 'web') return;
  try { new File(Paths.document, NAME).write(steps.join('\n')); } catch { /* never let tracing hurt the game */ }
}

function readPrevious(): string[] | null {
  if (Platform.OS === 'web') return null;
  try {
    const f = new File(Paths.document, NAME);
    if (!f.exists) return null;
    const t = f.textSync().split('\n');
    return t[t.length - 1] === 'frame 120 ok' ? null : t;
  } catch {
    return null;
  }
}

// Read as this module loads, before any trace() of this launch can overwrite the file.
const previous = readPrevious();

/** What the previous launch recorded; null if it reached the game safely or nothing was recorded. */
export function lastTrace(): string[] | null {
  return previous;
}
