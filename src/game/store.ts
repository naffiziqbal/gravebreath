// UI-facing state: what the HUD shows, the clue being read, and how the run ended.
import { create } from 'zustand';
import type { Clue } from './data/clues';
import type { Meta } from './sim/meta';
import type { Ending } from './sim/endings';
import { clearRun, loadMeta, saveMeta } from './save';
import { loadSettings, saveSettings, type Settings } from './settings';

export type Hud = {
  hasMap: boolean; // the scrap map is in your hand
  reading: 'lit' | 'dark' | null; // holding the map up, with or without a light to see it
  mapYou: { x: number; y: number; yaw: number } | null; // where you are on the map while reading it
  objective: string | null; // the chapter, and what you are trying to do in it
  job: boolean; // the opening robbery: you can still breathe, so no air bar
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

export type RunEnd = { fate: 'suffocated' | 'escaped' | 'taken'; victim: string; layer: number; newClues: string[]; saved: number; abandoned: number; ending?: Ending; cole?: 'saved' | 'left';
  cause?: string; tip?: string }; // what got you, and how to survive it next time

type Store = {
  hud: Hud;
  subtitle: string | null;
  clue: Clue | null;
  end: RunEnd | null;
  choices: Ending[] | null; // at the ledger: the endings on offer (pauses the run)
  chosen: Ending | null; // what the player picked; GameView hands it to the game
  paused: boolean; // the pause menu is open
  hint: string | null; // a one-time tip on screen
  loadProgress: number; // 0..1, how far the opening load has got
  cards: { kind: 'job' | 'burial'; done(): void } | null; // story passages over black
  settings: Settings;
  meta: Meta;
  setHud(h: Hud): void;
  say(text: string | null): void;
  showClue(c: Clue | null): void;
  finish(e: RunEnd, meta: Meta): void;
  choose(c: Ending[] | null): void;
  pick(e: Ending): void;
  setPaused(p: boolean): void;
  setLoadProgress(p: number): void;
  showCards(c: Store['cards']): void;
  showHint(id: string, text: string): void;
  hideHint(): void;
  updateSettings(s: Partial<Settings>): void;
  reset(): void;
};

const initialHud: Hud = { hasMap: false, reading: null, mapYou: null, objective: null, job: false, phase: 'loading', air: 1, panic: 0, matches: 0, matchLit: false, battery: 1, phoneOn: false, prompt: null, action: null, holdAction: false, progress: null, room: null, noise: null, hunted: false, seen: null, debug: null };

export const useGame = create<Store>((set) => ({
  hud: initialHud,
  subtitle: null,
  clue: null,
  end: null,
  choices: null,
  chosen: null,
  paused: false,
  hint: null,
  loadProgress: 0,
  cards: null,
  settings: loadSettings(),
  meta: loadMeta(),
  setHud: (hud) => set({ hud }),
  say: (subtitle) => set({ subtitle }),
  showClue: (clue) => set({ clue }),
  finish: (end, meta) => set((st) => {
    // the run's meta was copied when it started; keep the hints shown since then
    const merged = { ...meta, hints: [...new Set([...meta.hints, ...st.meta.hints])] };
    saveMeta(merged);
    clearRun(); // the run is over: nothing to resume
    return { end, meta: merged };
  }),
  choose: (choices) => set({ choices }),
  pick: (chosen) => set({ chosen, choices: null }),
  setPaused: (paused) => set({ paused }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  showCards: (cards) => set({ cards }),
  showHint: (id, text) => set((st) => {
    // remember it at once, so it never shows again even if this run is abandoned
    const meta = st.meta.hints.includes(id) ? st.meta : { ...st.meta, hints: [...st.meta.hints, id] };
    if (meta !== st.meta) saveMeta(meta);
    return { hint: text, meta };
  }),
  hideHint: () => set({ hint: null }),
  updateSettings: (s) => set((st) => { const settings = { ...st.settings, ...s }; saveSettings(settings); return { settings }; }),
  reset: () => set({ hud: initialHud, subtitle: null, clue: null, end: null, choices: null, chosen: null, paused: false, hint: null, cards: null, loadProgress: 0 }),
}));
