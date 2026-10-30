// Layer 3: a maze of bone-lined tunnels, generated from the run seed. Pure data, no rendering.
//
// Grid coordinates: cell (cx, cy), cy = 0 is the row you enter on. World space: x = (cx - (cols-1)/2) * CELL,
// z = -cy * CELL, so going "north" (cy + 1) walks along -z like the crypt does.
import { cluesForAct, actFor } from '../data/clues.ts';
import { createRng, type Rng } from './rng.ts';
import type { Interactable } from './layout.ts';

export const CELL = 3.2; // metres between cell centres
export const TUNNEL = 1.5; // tunnel width
export const TUNNEL_HEIGHT = 2.25;

export type Dir = 'n' | 'e' | 's' | 'w';
export const DIRS: Dir[] = ['n', 'e', 's', 'w'];
const STEP: Record<Dir, [number, number]> = { n: [0, 1], e: [1, 0], s: [0, -1], w: [-1, 0] };
const OPPOSITE: Record<Dir, Dir> = { n: 's', e: 'w', s: 'n', w: 'e' };

export type Cell = { cx: number; cy: number; open: Record<Dir, boolean> };
export type Maze = { cols: number; rows: number; cells: Cell[]; entrance: Cell; exit: Cell };

export type CatacombLayout = {
  seed: number;
  maze: Maze;
  interactables: Interactable[];
  airPockets: { x: number; z: number; radius: number }[];
  candles: { x: number; z: number }[];
  listenerStart: Cell;
};

export function cellAt(m: Maze, cx: number, cy: number): Cell | undefined {
  if (cx < 0 || cy < 0 || cx >= m.cols || cy >= m.rows) return undefined;
  return m.cells[cy * m.cols + cx];
}

export function neighbours(m: Maze, c: Cell): Cell[] {
  return DIRS.filter((d) => c.open[d]).map((d) => cellAt(m, c.cx + STEP[d][0], c.cy + STEP[d][1])).filter((n): n is Cell => !!n);
}

export function cellCentre(m: Maze, c: Cell) {
  return { x: (c.cx - (m.cols - 1) / 2) * CELL, z: -c.cy * CELL };
}

export function cellOf(m: Maze, x: number, z: number): Cell | undefined {
  return cellAt(m, Math.round(x / CELL + (m.cols - 1) / 2), Math.round(-z / CELL));
}

/** Steps from `from` to every reachable cell. */
export function distances(m: Maze, from: Cell): Map<Cell, number> {
  const dist = new Map<Cell, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of neighbours(m, c)) {
      if (!dist.has(n)) { dist.set(n, dist.get(c)! + 1); queue.push(n); }
    }
  }
  return dist;
}

/** The next cell to walk into on a shortest path from `from` to `to` (or `from` itself if already there). */
export function nextToward(m: Maze, from: Cell, to: Cell): Cell {
  if (from === to) return from;
  const dist = distances(m, to);
  let best = from;
  for (const n of neighbours(m, from)) if ((dist.get(n) ?? Infinity) < (dist.get(best) ?? Infinity)) best = n;
  return best;
}

export function generateMaze(rng: Rng, cols = 6, rows = 4): Maze {
  const cells: Cell[] = [];
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) cells.push({ cx, cy, open: { n: false, e: false, s: false, w: false } });
  const m: Maze = { cols, rows, cells, entrance: cells[Math.floor(cols / 2)], exit: cells[0] };
  // carve a perfect maze with a randomised depth-first walk from the entrance
  const seen = new Set<Cell>([m.entrance]);
  const stack = [m.entrance];
  while (stack.length) {
    const c = stack.at(-1)!;
    const options = rng.shuffle(DIRS).filter((d) => {
      const n = cellAt(m, c.cx + STEP[d][0], c.cy + STEP[d][1]);
      return n && !seen.has(n);
    });
    if (!options.length) { stack.pop(); continue; }
    const d = options[0];
    const n = cellAt(m, c.cx + STEP[d][0], c.cy + STEP[d][1])!;
    c.open[d] = true; n.open[OPPOSITE[d]] = true;
    seen.add(n); stack.push(n);
  }
  // knock through a few extra walls so there are loops to lose the Listener in
  for (let k = 0; k < 4; k++) {
    const c = rng.pick(cells);
    const d = rng.pick(DIRS.filter((dd) => !c.open[dd] && cellAt(m, c.cx + STEP[dd][0], c.cy + STEP[dd][1])));
    if (!d) continue;
    const n = cellAt(m, c.cx + STEP[d][0], c.cy + STEP[d][1])!;
    c.open[d] = true; n.open[OPPOSITE[d]] = true;
  }
  // the bone stair climbs north out of the far row, from the cell there farthest from where you come in
  const dist = distances(m, m.entrance);
  m.exit = cells.filter((c) => c.cy === rows - 1).sort((a, b) => dist.get(b)! - dist.get(a)! || a.cx - b.cx)[0];
  return m;
}

export function generateCatacombs(seed: number, foundClues: readonly string[]): CatacombLayout {
  const rng = createRng(seed ^ 0x3c3c3c3c);
  const maze = generateMaze(rng);
  const dist = distances(maze, maze.entrance);
  const max = Math.max(...dist.values());
  const deadEnds = rng.shuffle(maze.cells.filter((c) => c !== maze.entrance && c !== maze.exit && neighbours(maze, c).length === 1));
  const junctions = rng.shuffle(maze.cells.filter((c) => neighbours(maze, c).length >= 3));
  const middle = rng.shuffle(maze.cells.filter((c) => c !== maze.exit && (dist.get(c) ?? 0) >= max * 0.4 && (dist.get(c) ?? 0) <= max * 0.75));
  const listenerStart = middle[0] ?? maze.cells[maze.cells.length - 1];

  // something to find a little off the centre of a cell, so it isn't in the middle of the path
  const spot = (c: Cell) => {
    const p = cellCentre(maze, c);
    return { x: p.x + (rng.next() - 0.5) * 0.6, z: p.z + (rng.next() - 0.5) * 0.6 };
  };
  // air comes in at dead ends; mazes with few of them use the quietest side cells instead
  const sideCells = [...deadEnds, ...rng.shuffle(maze.cells.filter((c) => c !== maze.entrance && c !== maze.exit && !deadEnds.includes(c)))
    .sort((a, b) => neighbours(maze, a).length - neighbours(maze, b).length)];
  const airPockets = sideCells.slice(0, 2).map((c) => ({ ...cellCentre(maze, c), radius: 0.75 }));
  const interactables: Interactable[] = [];
  const act = actFor(foundClues.length);
  // only the catacombs' own clues spawn here, so nothing found in the crypt can turn up twice
  const clues = rng.shuffle(cluesForAct(act, foundClues).filter((c) => c.id.startsWith('cat-')));
  const clueCells = sideCells.slice(2);
  clues.slice(0, 2).forEach((clue, i) => {
    const item = clue.kind === 'ledger' ? 'page' : clue.kind === 'gravestone' ? 'stone' : clue.id.includes('watch') ? 'watch' : 'postcard';
    interactables.push({ type: 'clue', clueId: clue.id, item, ...spot(clueCells[i]) });
  });
  rng.shuffle(maze.cells.filter((c) => c !== maze.entrance)).slice(0, 2).forEach((c) => interactables.push({ type: 'matches', count: rng.int(1, 2), ...spot(c) }));
  const exitCentre = cellCentre(maze, maze.exit);
  interactables.push({ type: 'exit', x: exitCentre.x, z: exitCentre.z - CELL / 2 + 0.5, to: 4 });
  const candles = junctions.slice(0, 4).map((c) => {
    const p = cellCentre(maze, c);
    return { x: p.x + TUNNEL / 2 - 0.25, z: p.z + TUNNEL / 2 - 0.25 };
  });
  return { seed, maze, interactables, airPockets, candles, listenerStart };
}
