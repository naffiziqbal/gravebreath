// UI-facing state: what the HUD shows, the clue being read, and how the run ended.
import { create } from 'zustand';
import type { Clue } from './data/clues';
import type { Meta } from './sim/meta';
import type { Ending } from './sim/endings';
import { loadMeta, saveMeta } from './save';

export type Hud = {
  phase: 'loading' | 'coffin' | 'crypt' | 'catacombs' | 'necropolis' | 'surface' | 'over';
  air: number; // 0..1
  panic: number;
  matches: number;
  matchLit: boolean;
  battery: number;
  phoneOn: boolean;
  prompt: string | null;
  action: string | null; // the action button's verb for what you're facing (PUSH, DIG, TAKE…); null hides it
  holdAction: boolean; // true when the action is held (pushing, digging) rather than tapped
  progress: number | null; // 0..1 while digging or pushing
  room: string | null;
  noise: number | null; // 0..1, how far you can be heard; only in the catacombs
  hunted: boolean; // something is coming for you
  seen: number | null; // 0..1, how close a Hushman is to spotting you; only in the necropolis
  debug: string | null; // dev builds only: render resolution and fps
};

export type RunEnd = { fate: 'suffocated' | 'escaped' | 'taken'; victim: string; layer: number; newClues: string[]; saved: number; abandoned: number; ending?: Ending };

type Store = {
  hud: Hud;
  subtitle: string | null;
  clue: Clue | null;
  end: RunEnd | null;
  choices: Ending[] | null; // at the ledger: the endings on offer (pauses the run)
  chosen: Ending | null; // what the player picked; GameView hands it to the game
  meta: Meta;
  setHud(h: Hud): void;
  say(text: string | null): void;
  showClue(c: Clue | null): void;
  finish(e: RunEnd, meta: Meta): void;
  choose(c: Ending[] | null): void;
  pick(e: Ending): void;
  reset(): void;
};

const initialHud: Hud = { phase: 'loading', air: 1, panic: 0, matches: 0, matchLit: false, battery: 1, phoneOn: false, prompt: null, action: null, holdAction: false, progress: null, room: null, noise: null, hunted: false, seen: null, debug: null };

export const useGame = create<Store>((set) => ({
  hud: initialHud,
  subtitle: null,
  clue: null,
  end: null,
  choices: null,
  chosen: null,
  meta: loadMeta(),
  setHud: (hud) => set({ hud }),
  say: (subtitle) => set({ subtitle }),
  showClue: (clue) => set({ clue }),
  finish: (end, meta) => {
    saveMeta(meta);
    set({ end, meta });
  },
  choose: (choices) => set({ choices }),
  pick: (chosen) => set({ chosen, choices: null }),
  reset: () => set({ hud: initialHud, subtitle: null, clue: null, end: null, choices: null, chosen: null }),
}));
