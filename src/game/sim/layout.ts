// Builds a run's world as plain data: hand-designed room templates shuffled around fixed landmarks.
import { cluesForAct, actFor } from '../data/clues.ts';
import { createRng } from './rng.ts';

export type PropKind =
  | 'candlestick' | 'candleholders' | 'lantern' | 'oilLamp' | 'crowbar' | 'spade' | 'roots'
  | 'statue' | 'bust' | 'lionHead' | 'crate' | 'bucket' | 'rocks' | 'boulder' | 'books';

/** Props with collision; they must stay out of the walkway (see `walkwayClear`). */
export const BLOCKING: readonly PropKind[] = ['statue', 'boulder', 'crate', 'rocks'];
/** Largest floor footprint (metres) each prop is scaled to; some Poly Haven models are whole sets several metres wide. */
export const FOOTPRINT: Partial<Record<PropKind, number>> = { rocks: 1.0, boulder: 0.75, statue: 1.1, roots: 1.6, crate: 0.9, books: 0.5 };

export type Prop = { kind: PropKind; x: number; z: number; rotY: number; scale?: number; lit?: boolean };

export type Interactable =
  | { type: 'clue'; clueId: string; x: number; z: number; item: 'watch' | 'postcard' | 'page' | 'stone' | 'map' }
  | { type: 'survivor'; x: number; z: number; side: Side; trap: boolean; clueId?: string; cole?: boolean }
  | { type: 'matches'; x: number; z: number; count: number }
  | { type: 'exit'; x: number; z: number; to: number };

export type Side = 'left' | 'right';

export type Room = {
  id: string;
  name: string;
  landmark: boolean;
  /** room centre in world space; rooms chain along -z */
  x: number;
  z: number;
  width: number; // x extent
  depth: number; // z extent
  height: number;
  niches: { side: Side; along: number }[]; // coffin niches in the side walls, `along` in metres from room centre
  props: Prop[];
  airPocket?: { x: number; z: number; radius: number };
  interactables: Interactable[];
};

export type Layout = { seed: number; startNiche: number; rooms: Room[] };

type Template = {
  id: string;
  name: string;
  width: number;
  depth: number;
  height: number;
  niches: number; // per side
  props: Prop[]; // local coordinates
  airPocket?: boolean;
};

// Layer 2 room kit. Coordinates are local to the room centre.
const CRYPT_KIT: Template[] = [
  { id: 'ossuary', name: 'Ossuary hall', width: 4, depth: 7, height: 3, niches: 3,
    props: [{ kind: 'candlestick', x: -1.4, z: 2.6, rotY: 0, lit: true }, { kind: 'rocks', x: 1.3, z: -2.2, rotY: 1 }, { kind: 'bucket', x: 1.5, z: 1.8, rotY: 0.4 }] },
  { id: 'chapel', name: 'Collapsed chapel', width: 6, depth: 6, height: 3.6, niches: 2,
    props: [{ kind: 'statue', x: -1.9, z: -1.4, rotY: 0.6, scale: 1 }, { kind: 'candleholders', x: -1.8, z: -2.5, rotY: 0, lit: true }, { kind: 'boulder', x: 2, z: 1.6, rotY: 2 }, { kind: 'roots', x: -2.2, z: 1.2, rotY: 0.5 }],
    airPocket: true },
  { id: 'workroom', name: 'Gravedigger\'s workroom', width: 4.5, depth: 5, height: 2.8, niches: 1,
    props: [{ kind: 'crate', x: 1.4, z: -1.6, rotY: 0.3 }, { kind: 'spade', x: 1.9, z: 0.4, rotY: 1.4 }, { kind: 'crowbar', x: -1.8, z: -1.2, rotY: 0.2 }, { kind: 'lantern', x: -1.6, z: 1.7, rotY: 0, lit: true }] },
  { id: 'roots', name: 'Root-choked passage', width: 3, depth: 8, height: 2.6, niches: 4,
    props: [{ kind: 'roots', x: 0.8, z: 2, rotY: 0 }, { kind: 'roots', x: -0.7, z: -2.4, rotY: 2.1 }, { kind: 'rocks', x: 1.25, z: -3.3, rotY: 0.6 }],
    airPocket: true },
  { id: 'reliquary', name: 'Reliquary', width: 5, depth: 5, height: 3.2, niches: 2,
    props: [{ kind: 'bust', x: -1.8, z: -1.8, rotY: 0.7 }, { kind: 'lionHead', x: 1.8, z: -2.2, rotY: -0.5 }, { kind: 'oilLamp', x: 1.7, z: 1.5, rotY: 0, lit: true }, { kind: 'books', x: -1.9, z: 1.4, rotY: 1.2 }] },
];

// Fixed landmark that ends layer 2: always the same, so players learn it.
const LEDGER_ALCOVE: Template = {
  id: 'ledger-alcove', name: 'The ledger alcove', width: 5, depth: 6, height: 3.4, niches: 2,
  props: [{ kind: 'candleholders', x: 0, z: -2.4, rotY: 0, lit: true }, { kind: 'books', x: 1.6, z: -2.4, rotY: 0.3 }, { kind: 'statue', x: -1.9, z: -2.3, rotY: 0.4, scale: 0.8 }],
};

/** True when no blocking prop intrudes on the 1.4 m centre walkway that links every doorway. */
export function walkwayClear(room: Room): boolean {
  return room.props.every((p) => !BLOCKING.includes(p.kind) || Math.abs(p.x) - ((FOOTPRINT[p.kind] ?? 1) / 2) * (p.scale ?? 1) >= 0.7);
}

export function generateLayout(seed: number, foundClues: readonly string[]): Layout {
  const rng = createRng(seed);
  const act = actFor(foundClues.length);
  const templates = [...rng.shuffle(CRYPT_KIT).slice(0, 3), LEDGER_ALCOVE];
  // catacomb ('cat-') and necropolis ('nec-') clues belong to their own layers
  let clues = rng.shuffle(cluesForAct(act, foundClues).filter((c) => c.kind !== 'lid' && !c.id.startsWith('cat-') && !c.id.startsWith('nec-')));
  const takeClue = (kind?: string) => {
    const i = clues.findIndex((c) => !kind || c.kind === kind);
    if (i < 0) return undefined;
    const [c] = clues.splice(i, 1);
    return c;
  };

  const rooms: Room[] = [];
  let z = -2; // the coffin niche opens into the first room at z = 0
  const knockingRooms = new Set(rng.shuffle([0, 1, 2]).slice(0, rng.int(1, 2)));
  templates.forEach((t, i) => {
    const cz = z - t.depth / 2;
    const room: Room = {
      id: `${t.id}-${i}`, name: t.name, landmark: t === LEDGER_ALCOVE,
      x: 0, z: cz, width: t.width, depth: t.depth, height: t.height,
      niches: [], props: t.props.map((p) => ({ ...p, x: p.x, z: cz + p.z })), interactables: [],
    };
    for (const side of ['left', 'right'] as const) {
      for (let k = 0; k < t.niches; k++) {
        const along = -t.depth / 2 + (t.depth / (t.niches + 1)) * (k + 1);
        room.niches.push({ side, along });
      }
    }
    if (t.airPocket) {
      room.airPocket = { x: rng.next() * (t.width - 2) - (t.width - 2) / 2, z: cz + (rng.next() - 0.5) * (t.depth - 2), radius: 0.9 };
    }
    if (knockingRooms.has(i) && room.niches.length) {
      const n = rng.pick(room.niches);
      const survivorClue = takeClue('survivor');
      room.interactables.push({
        type: 'survivor', side: n.side, trap: !survivorClue && rng.chance(0.35),
        x: (n.side === 'left' ? -1 : 1) * (t.width / 2 - 0.35), z: cz + n.along, clueId: survivorClue?.id,
      });
    }
    const clue = takeClue();
    if (clue && clue.kind !== 'survivor') {
      const item = clue.kind === 'ledger' ? 'page' : clue.kind === 'gravestone' ? 'stone' : clue.id.includes('watch') ? 'watch' : 'postcard';
      room.interactables.push({ type: 'clue', clueId: clue.id, item, x: (rng.next() - 0.5) * (t.width - 1.6), z: cz + (rng.next() - 0.5) * (t.depth - 1.6) });
    }
    if (rng.chance(0.5)) {
      room.interactables.push({ type: 'matches', count: rng.int(1, 2), x: (rng.next() - 0.5) * (t.width - 1.4), z: cz + (rng.next() - 0.5) * (t.depth - 1.4) });
    }
    if (room.landmark) room.interactables.push({ type: 'exit', x: 0, z: cz - t.depth / 2 + 0.6, to: 3 });
    rooms.push(room);
    z -= t.depth + 1.2; // short doorway passage between rooms
  });
  return { seed, startNiche: rng.int(0, 3), rooms };
}
