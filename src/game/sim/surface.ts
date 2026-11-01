// Layer 5: Vael's graveyard on the surface, generated from the run seed. Pure data, no rendering.
//
// World space: you climb out of a mausoleum at the south end (z = 0) and the graveyard runs north to the church
// porch at z = -YARD_DEPTH, where the Order's ledger lies open on a lectern. Gravestones are low (they don't hide
// you); dead trees and mausoleums are tall and block a Hushman's sight, using the same Tomb shapes as layer 4.
import { createRng } from './rng.ts';
import type { Interactable } from './layout.ts';
import type { Point, Tomb } from './necropolis.ts';

export const YARD_WIDTH = 30;
export const YARD_DEPTH = 34;
export const LECTERN: Point = { x: 0, z: -YARD_DEPTH + 1.5 };
/** The opening robbery: the Ashby tomb, its door facing the path. */
export const COLE_AT = { x: 2.3, z: -0.4 };
export const ASHBY = { x: -4, z: -14, doorX: -2.9 };

export type SurfaceLayout = {
  seed: number;
  tombs: Tomb[]; // gravestones (low), mausoleums and trees (tall); trees are 0.8 m squares
  trees: Point[];
  routes: Point[][]; // two Hushmen guard the church
  interactables: Interactable[];
  spawn: Point;
  job: boolean; // laid out for the opening robbery instead of the ledger
};

const PATH_HALF = 1.4; // the gravel path up the middle stays clear

export function generateSurface(seed: number, job = false): SurfaceLayout {
  const rng = createRng(seed ^ 0x5e7face);
  const tombs: Tomb[] = [];
  const trees: Point[] = [];
  for (let z = -4; z > -YARD_DEPTH + 5; z -= 2.6) {
    for (let x = -YARD_WIDTH / 2 + 2; x < YARD_WIDTH / 2 - 1.5; x += 2.2) {
      if (Math.abs(x) < PATH_HALF + 0.8) continue;
      const roll = rng.next();
      const jx = x + (rng.next() - 0.5) * 0.5, jz = z + (rng.next() - 0.5) * 0.6;
      if (roll < 0.55) tombs.push({ kind: 'sarcophagus', x: jx, z: jz, w: 0.7, d: 0.25, h: 0.6 + rng.next() * 0.5, rotY: (rng.next() - 0.5) * 0.3 });
      else if (roll < 0.63) tombs.push({ kind: 'mausoleum', x: jx, z: jz, w: 2.0, d: 2.0, h: 2.8, rotY: 0 });
      else if (roll < 0.7) { trees.push({ x: jx, z: jz }); tombs.push({ kind: 'mausoleum', x: jx, z: jz, w: 0.8, d: 0.8, h: 5, rotY: 0 }); }
    }
  }
  // the Hushmen: one walks the path in front of the church, one circles the yard's upper half
  const porch = [{ x: -5, z: -YARD_DEPTH + 4 }, { x: 5, z: -YARD_DEPTH + 4 }];
  const loop = [{ x: -PATH_HALF * 0.5, z: -17 }, { x: -PATH_HALF * 0.5, z: -YARD_DEPTH + 6 }, { x: PATH_HALF * 0.5, z: -YARD_DEPTH + 6 }, { x: PATH_HALF * 0.5, z: -17 }];
  const routes = rng.chance(0.5) ? [porch, loop] : [porch.slice().reverse(), loop.slice().reverse()];
  const interactables: Interactable[] = [
    { type: 'matches', count: 1, x: rng.chance(0.5) ? -PATH_HALF - 0.2 : PATH_HALF + 0.2, z: -6 - rng.next() * 6 },
    { type: 'exit', x: LECTERN.x, z: LECTERN.z, to: 6 }, // the ledger: reaching it ends the run (see endings.ts)
  ];
  if (job) {
    const clear = (p: Point) => Math.hypot(p.x - ASHBY.x, p.z - ASHBY.z) > 3.2;
    return {
      // on the job the lanterns keep to the church, in sight but out of range, so the tomb can actually be reached
      seed, job, spawn: { x: 0, z: -1 }, trees: trees.filter(clear),
      routes: [porch, porch.map((p) => ({ x: p.x * 0.6, z: p.z + 2.5 }))],
      tombs: [...tombs.filter(clear), { kind: 'mausoleum', x: ASHBY.x, z: ASHBY.z, w: 2.0, d: 2.0, h: 2.8, rotY: 0 }],
      interactables: [{ type: 'exit', x: ASHBY.doorX, z: ASHBY.z, to: 7 }, { type: 'exit', x: ASHBY.doorX, z: ASHBY.z, to: 8 }], // the door, then the ring
    };
  }
  return { seed, tombs, trees, routes, interactables, spawn: { x: 0, z: -1 }, job };
}
