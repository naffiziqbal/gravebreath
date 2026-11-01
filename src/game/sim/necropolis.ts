// Layer 4: the necropolis hall, generated from the run seed. Pure data, no rendering.
//
// World space: you arrive at the south end (z = 0) from the bone stair and the hall runs north to z = -HALL_DEPTH,
// where an iron gate opens into the flooded chapel. Tombs stand in rows either side of a central aisle.
import { cluesForAct, actFor } from '../data/clues.ts';
import { createRng } from './rng.ts';
import type { Interactable } from './layout.ts';

export const HALL_WIDTH = 26;
export const HALL_DEPTH = 30;
export const HALL_HEIGHT = 7;
export const CHAPEL = { width: 10, depth: 8, gate: 4 }; // the gate is 4 m wide in the hall's north wall

export const COLE_GRAVE = { x: 0, z: -14 };

/** Does he repay you for digging him out, or call the lanterns? Decided by the run, so a resumed run agrees. */
export function coleBetrays(seed: number): boolean {
  return createRng(seed ^ 0xc01e).chance(0.5);
}

export type TombKind = 'sarcophagus' | 'mausoleum';
export type Tomb = { kind: TombKind; x: number; z: number; w: number; d: number; h: number; rotY: number };
export type Point = { x: number; z: number };

export type NecropolisLayout = {
  seed: number;
  tombs: Tomb[];
  routes: Point[][]; // one patrol loop per Hushman
  interactables: Interactable[];
  airPockets: { x: number; z: number; radius: number }[];
  candles: Point[];
  spawn: Point;
};

/** Tall tombs block a Hushman's sight; low sarcophagi don't (you can be seen over them). */
export const SIGHT_BLOCK_HEIGHT = 1.6;

const COLUMNS = [-9.5, -6, -2.6, 2.6, 6, 9.5]; // tomb centres across the hall; aisles run between them
const ROWS = [-4.5, -8, -11.5, -15, -18.5, -22, -25.5];

export function generateNecropolis(seed: number, foundClues: readonly string[]): NecropolisLayout {
  const rng = createRng(seed ^ 0x2e9ec0);
  const tombs: Tomb[] = [];
  for (const z of ROWS) {
    for (const x of COLUMNS) {
      if (rng.chance(0.18)) continue; // gaps to cut through
      const tall = rng.chance(0.42);
      tombs.push(tall
        ? { kind: 'mausoleum', x: x + (rng.next() - 0.5) * 0.3, z: z + (rng.next() - 0.5) * 0.3, w: 2.2, d: 2.2, h: 2.6, rotY: 0 }
        : { kind: 'sarcophagus', x: x + (rng.next() - 0.5) * 0.4, z: z + (rng.next() - 0.5) * 0.4, w: 1.0, d: 2.1, h: 0.95, rotY: (rng.next() - 0.5) * 0.12 });
    }
  }
  // patrols walk the aisles between the tomb columns
  const inner = [{ x: -4.3, z: -6.2 }, { x: 4.3, z: -6.2 }, { x: 4.3, z: -23.8 }, { x: -4.3, z: -23.8 }];
  const outer = [{ x: 11.6, z: -9.8 }, { x: 11.6, z: -27.3 }, { x: -11.6, z: -27.3 }, { x: -11.6, z: -9.8 }];
  const routes = rng.chance(0.5) ? [inner, outer] : [inner.slice().reverse(), outer.slice().reverse()];

  // clues: the necropolis's own, plus the final ledger page on the chapel altar once the story has reached act 3
  const act = actFor(foundClues.length);
  const clues = rng.shuffle(cluesForAct(act, foundClues).filter((c) => c.id.startsWith('nec-')));
  const besideTomb = (): Point => {
    const t = rng.pick(tombs);
    const side = rng.chance(0.5) ? 1 : -1;
    return { x: t.x + side * (t.w / 2 + 0.45), z: t.z + (rng.next() - 0.5) * t.d * 0.6 };
  };
  const interactables: Interactable[] = [];
  clues.slice(0, 2).forEach((clue) => {
    const item = clue.kind === 'ledger' ? 'page' : clue.kind === 'gravestone' ? 'stone' : 'postcard';
    interactables.push({ type: 'clue', clueId: clue.id, item, ...besideTomb() });
  });
  if (act >= 3 && !foundClues.includes('ledger-page-final')) {
    interactables.push({ type: 'clue', clueId: 'ledger-page-final', item: 'page', x: 0, z: -HALL_DEPTH - CHAPEL.depth + 1.6 });
  }
  for (let k = 0; k < 2; k++) interactables.push({ type: 'matches', count: rng.int(1, 2), ...besideTomb() });
  // Cole, sold to the Order in his turn, under a fresh heap in the open central aisle: digging him out means being seen
  interactables.push({ type: 'survivor', x: COLE_GRAVE.x, z: COLE_GRAVE.z, side: 'left', trap: false, cole: true });
  // the way up: stone steps behind the chapel altar
  interactables.push({ type: 'exit', x: 0, z: -HALL_DEPTH - CHAPEL.depth + 0.7, to: 5 });

  // cracks in the vault where air and a little moonlight get in, over aisle crossings
  const airPockets = rng.shuffle([{ x: -4.3, z: -13.2 }, { x: 4.3, z: -16.8 }, { x: 0, z: -20.2 }, { x: -7.8, z: -9.8 }]).slice(0, 2).map((p) => ({ ...p, radius: 0.85 }));
  const candles = rng.shuffle(tombs.filter((t) => t.kind === 'sarcophagus')).slice(0, 4).map((t) => ({ x: t.x, z: t.z + t.d * 0.3 }));
  return { seed, tombs, routes, interactables, airPockets, candles, spawn: { x: 0, z: -1 } };
}

/** Does the segment a→b pass through any tall tomb? (2D, footprints as boxes, ignoring the small tilt) */
export function sightBlocked(a: Point, b: Point, tombs: readonly Tomb[]): boolean {
  for (const t of tombs) {
    if (t.h < SIGHT_BLOCK_HEIGHT) continue;
    if (segmentHitsBox(a, b, t.x - t.w / 2, t.x + t.w / 2, t.z - t.d / 2, t.z + t.d / 2)) return true;
  }
  return false;
}

function segmentHitsBox(a: Point, b: Point, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  // slab test
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [p, d, lo, hi] of [[a.x, dx, minX, maxX], [a.z, dz, minZ, maxZ]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
