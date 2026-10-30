// Progress kept between runs: the ledger of victims, clues found, and small unlocks.
import { createRng } from './rng.ts';
import type { Ending } from './endings.ts';

export type Victim = { name: string; year: number; fate: 'suffocated' | 'escaped' | 'taken'; layer: number; saved: number; ending?: Ending };

export type Meta = {
  version: 1;
  runs: number;
  victims: Victim[];
  clues: string[];
  survivorsLeft: string[]; // ids of survivors abandoned (their bodies appear on later runs)
  endings: Ending[]; // every ending seen, in the order first reached
};

export const emptyMeta = (): Meta => ({ version: 1, runs: 0, victims: [], clues: [], survivorsLeft: [], endings: [] });

const FIRST = ['Elias', 'Ruth', 'Tomas', 'Ada', 'Jonah', 'Mara', 'Silas', 'Edith', 'Abel', 'Nora', 'Caleb', 'Iris', 'Hollis', 'Agnes', 'Wren', 'Ezra'];
const LAST = ['Marr', 'Calloway', 'Venn', 'Kell', 'Pryce', 'Ashby', 'Thorne', 'Gale', 'Morrow', 'Black', 'Rook', 'Vance', 'Holloway', 'Crane'];

export function victimName(seed: number): string {
  const r = createRng(seed ^ 0x5bd1e995);
  return `${r.pick(FIRST)} ${r.pick(LAST)}`;
}

export function unlocks(m: Meta) {
  return {
    extraMatch: m.clues.length >= 5,
    betterBattery: m.clues.length >= 10,
  };
}

export function recordRun(m: Meta, v: Victim, newClues: readonly string[], abandoned: readonly string[]): Meta {
  return {
    ...m,
    runs: m.runs + 1,
    victims: [...m.victims, v],
    clues: [...m.clues, ...newClues.filter((c) => !m.clues.includes(c))],
    survivorsLeft: [...m.survivorsLeft, ...abandoned],
    endings: v.ending && !m.endings.includes(v.ending) ? [...m.endings, v.ending] : m.endings,
  };
}
