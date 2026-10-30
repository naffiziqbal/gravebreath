/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, step, strikeMatch, airDrainRate, scare } from './run.ts';
import { generateLayout, walkwayClear } from './layout.ts';
import { generateSurface, LECTERN } from './surface.ts';
import { endingChoices } from './endings.ts';
import { emptyMeta, recordRun, unlocks, victimName } from './meta.ts';
import { AIR, LIGHT } from '../config.ts';
import { cellCentre, distances, generateCatacombs, neighbours, nextToward } from './catacombs.ts';
import { noiseRadius, spawnListener, stepListener } from './listener.ts';
import { createRng } from './rng.ts';

test('staying calm makes the full air supply last', () => {
  let s = { ...newRun(1, 0), panic: 0 };
  for (let t = 0; t < AIR.start - 1; t++) s = step(s, 1, { calming: true });
  assert.equal(s.dead, false);
  s = step(s, 2, { calming: true });
  assert.equal(s.dead, true);
});

test('low air feeds panic, so ignoring it suffocates you sooner', () => {
  let s = { ...newRun(1, 0), panic: 0 };
  let t = 0;
  while (!s.dead) { s = step(s, 1); t++; }
  assert.ok(t < AIR.start - 10);
});

test('sprinting, panic and a lit match each cost extra air', () => {
  const base = { ...newRun(1, 0), panic: 0 };
  assert.equal(airDrainRate(base), AIR.still);
  assert.equal(airDrainRate({ ...base, movement: 'sprint' }), AIR.sprint);
  assert.ok(airDrainRate(scare(base, 1)) > AIR.still * 1.9);
  assert.equal(airDrainRate(strikeMatch(base)), AIR.still + AIR.matchExtra);
});

test('a match burns out, and sprinting blows it out', () => {
  let s = strikeMatch(newRun(1, 0));
  assert.equal(s.matches, LIGHT.matchesAtStart - 1);
  s = step(s, LIGHT.matchBurnSeconds + 0.1);
  assert.equal(s.matchTime, 0);
  s = step(strikeMatch(s), 0.1, { movement: 'sprint' });
  assert.equal(s.matchTime, 0);
});

test('holding calm lowers panic; moving cancels it', () => {
  const scared = scare(newRun(1, 0), 1);
  const calmed = step(scared, 3, { calming: true });
  assert.ok(calmed.panic < 0.1);
  const walking = step(scared, 3, { calming: true, movement: 'walk' });
  assert.ok(walking.panic > 0.8);
});

test('air pockets refill air', () => {
  const s = { ...newRun(1, 0), air: 100 };
  assert.ok(step(s, 5, { inAirPocket: true }).air > 100);
});

test('layout is reproducible and always ends at the ledger alcove', () => {
  const a = generateLayout(42, []);
  const b = generateLayout(42, []);
  assert.deepEqual(a, b);
  assert.equal(a.rooms.length, 4);
  assert.equal(a.rooms.at(-1)?.name, 'The ledger alcove');
  assert.ok(a.rooms.at(-1)?.interactables.some((i) => i.type === 'exit'));
  const survivors = a.rooms.flatMap((r) => r.interactables).filter((i) => i.type === 'survivor');
  assert.ok(survivors.length >= 1 && survivors.length <= 2);
});

test('different seeds give different crypts', () => {
  const names = new Set([1, 2, 3, 4, 5, 6].map((s) => generateLayout(s, []).rooms.map((r) => r.name).join('|')));
  assert.ok(names.size > 2);
});

test('found clues are not spawned again', () => {
  const first = generateLayout(7, []).rooms.flatMap((r) => r.interactables).filter((i) => i.type === 'clue');
  assert.ok(first.length > 0);
  const found = first.map((c) => (c as { clueId: string }).clueId);
  const again = generateLayout(7, found).rooms.flatMap((r) => r.interactables).filter((i) => i.type === 'clue');
  for (const c of again) assert.ok(!found.includes((c as { clueId: string }).clueId));
});

test('the ledger keeps victims and clues across runs', () => {
  let m = emptyMeta();
  m = recordRun(m, { name: victimName(1), year: 1891, fate: 'suffocated', layer: 2, saved: 0 }, ['a', 'b'], []);
  m = recordRun(m, { name: victimName(2), year: 1902, fate: 'suffocated', layer: 2, saved: 1 }, ['b', 'c', 'd', 'e'], ['x']);
  assert.equal(m.runs, 2);
  assert.deepEqual(m.clues, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(unlocks(m).extraMatch, true);
  assert.equal(unlocks(m).betterBattery, false);
});

test('no room ever blocks the walkway between doors', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const room of generateLayout(seed, []).rooms) {
      assert.ok(walkwayClear(room), `${room.name} blocks the walkway (seed ${seed})`);
    }
  }
});

test('every catacomb cell is reachable and the bone stair is the far row\'s deepest cell', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { maze } = generateCatacombs(seed, []);
    const dist = distances(maze, maze.entrance);
    assert.equal(dist.size, maze.cells.length, `seed ${seed} has unreachable cells`);
    assert.equal(maze.exit.cy, maze.rows - 1);
    const farRow = maze.cells.filter((c) => c.cy === maze.rows - 1).map((c) => dist.get(c)!);
    assert.equal(dist.get(maze.exit), Math.max(...farRow));
    assert.ok(dist.get(maze.exit)! >= maze.rows - 1);
  }
});

test('catacomb layouts are reproducible and carry an exit, air and clues', () => {
  const a = generateCatacombs(9, []);
  assert.deepEqual(JSON.stringify(a), JSON.stringify(generateCatacombs(9, [])));
  assert.ok(a.interactables.some((i) => i.type === 'exit' && i.to === 4));
  assert.ok(a.interactables.some((i) => i.type === 'clue'));
  for (let seed = 1; seed <= 100; seed++) assert.equal(generateCatacombs(seed, []).airPockets.length, 2, `seed ${seed}`);
  assert.notEqual(a.listenerStart, a.maze.entrance);
});

test('pathfinding always steps closer to the target', () => {
  const { maze } = generateCatacombs(3, []);
  for (const from of maze.cells) {
    const dist = distances(maze, maze.exit);
    const next = nextToward(maze, from, maze.exit);
    if (from !== maze.exit) assert.equal(dist.get(next), dist.get(from)! - 1);
  }
});

test('noise: holding your breath is silent, sprinting is loudest', () => {
  const base = { holdingBreath: false, exerting: false, panic: 0 };
  assert.equal(noiseRadius({ ...base, movement: 'still', holdingBreath: true }), 0);
  assert.ok(noiseRadius({ ...base, movement: 'still' }) < noiseRadius({ ...base, movement: 'walk' }));
  assert.ok(noiseRadius({ ...base, movement: 'walk' }) < noiseRadius({ ...base, movement: 'sprint' }));
  assert.ok(noiseRadius({ ...base, movement: 'still', exerting: true }) > noiseRadius({ ...base, movement: 'walk' }));
});

test('the Listener ignores silence but hunts down a noise', () => {
  const { maze, listenerStart } = generateCatacombs(5, []);
  const rng = createRng(1);
  const player = cellCentre(maze, maze.entrance);
  // silent player: it never comes for you on purpose
  let s = spawnListener(maze, listenerStart);
  let caughtSilent = false, hunted = false;
  for (let t = 0; t < 60; t += 0.1) {
    const r = stepListener(maze, s, 0.1, { ...player, noise: 0 }, rng);
    s = r.state; caughtSilent ||= r.caught; hunted ||= r.state.mode === 'hunt';
  }
  assert.equal(hunted, false);
  // a player making noise right next to it is caught
  s = spawnListener(maze, listenerStart);
  const near = neighbours(maze, listenerStart)[0];
  const p = cellCentre(maze, near);
  let caught = false;
  for (let t = 0; t < 20 && !caught; t += 0.1) {
    const r = stepListener(maze, s, 0.1, { ...p, noise: 13 }, rng);
    s = r.state; caught = r.caught;
  }
  assert.equal(caught, true);
  void caughtSilent;
});

test('catacomb clues only appear in the catacombs, crypt clues only in the crypt', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const crypt = generateLayout(seed, []).rooms.flatMap((r) => r.interactables).filter((i) => i.type === 'clue');
    assert.ok(crypt.every((c) => !(c as { clueId: string }).clueId.startsWith('cat-')), `seed ${seed}`);
    const cat = generateCatacombs(seed, []).interactables.filter((i) => i.type === 'clue');
    assert.ok(cat.every((c) => (c as { clueId: string }).clueId.startsWith('cat-')), `seed ${seed}`);
  }
});

import { generateNecropolis, sightBlocked, HALL_DEPTH } from './necropolis.ts';
import { canSee, spawnHushman, stepHushman, HUSHMAN } from './hushman.ts';

test('necropolis layouts are reproducible, keep the central aisle clear and lead to the chapel', () => {
  const a = generateNecropolis(4, []);
  assert.equal(JSON.stringify(a), JSON.stringify(generateNecropolis(4, [])));
  for (let seed = 1; seed <= 100; seed++) {
    const L = generateNecropolis(seed, []);
    assert.ok(L.tombs.every((t) => Math.abs(t.x) - t.w / 2 > 1.0), `seed ${seed}: a tomb blocks the central aisle`);
    const exit = L.interactables.find((i) => i.type === 'exit');
    assert.ok(exit && exit.type === 'exit' && exit.to === 5 && exit.z < -HALL_DEPTH, `seed ${seed}: no way up from the chapel`);
    assert.ok(L.interactables.filter((i) => i.type === 'clue').every((c) => (c as { clueId: string }).clueId.startsWith('nec-')));
  }
});

test('the final ledger page waits in the chapel only once the story reaches act 3', () => {
  const early = generateNecropolis(5, []).interactables.some((i) => i.type === 'clue' && i.clueId === 'ledger-page-final');
  const many = Array.from({ length: 15 }, (_, k) => `found-${k}`);
  const late = generateNecropolis(5, many).interactables.some((i) => i.type === 'clue' && i.clueId === 'ledger-page-final');
  assert.equal(early, false);
  assert.equal(late, true);
});

test('tall tombs block sight, low sarcophagi do not', () => {
  const wall = [{ kind: 'mausoleum' as const, x: 0, z: -5, w: 2, d: 2, h: 2.6, rotY: 0 }];
  const low = [{ kind: 'sarcophagus' as const, x: 0, z: -5, w: 1, d: 2, h: 0.95, rotY: 0 }];
  assert.equal(sightBlocked({ x: 0, z: 0 }, { x: 0, z: -10 }, wall), true);
  assert.equal(sightBlocked({ x: 0, z: 0 }, { x: 0, z: -10 }, low), false);
  assert.equal(sightBlocked({ x: 3, z: 0 }, { x: 3, z: -10 }, wall), false);
});

test('a Hushman sees ahead within the lantern beam, and sees a lit match from behind', () => {
  const h = spawnHushman([{ x: 0, z: 0 }, { x: 0, z: -10 }]); // facing -z
  const dark = { noise: 0, lit: false, moving: false };
  assert.equal(canSee(h, { x: 0, z: -5, ...dark }, []), true);
  assert.equal(canSee(h, { x: 0, z: 5, ...dark }, []), false); // behind him
  assert.equal(canSee(h, { x: 0, z: 5, ...dark, lit: true }, []), true); // your light gives you away
  assert.equal(canSee(h, { x: 0, z: -(HUSHMAN.sight + 2), ...dark }, []), false);
});

test('seen for long enough starts a chase, and a chase that reaches you catches you', () => {
  let h = spawnHushman([{ x: 0, z: 0 }, { x: 0, z: -20 }]);
  const player = { x: 0, z: -6, noise: 5, lit: false, moving: true };
  let chased = false, caught = false;
  for (let t = 0; t < 20 && !caught; t += 0.05) {
    const r = stepHushman(h, 0.05, player, []);
    h = r.state; chased ||= r.startedChase; caught = r.caught;
  }
  assert.equal(chased, true);
  assert.equal(caught, true);
});

test('hidden behind a mausoleum, a Hushman patrols on and loses interest', () => {
  let h = spawnHushman([{ x: 0, z: 0 }, { x: 0, z: -3 }]);
  const wall = [{ kind: 'mausoleum' as const, x: 0, z: -6, w: 3, d: 2, h: 2.6, rotY: 0 }];
  const hidden = { x: 0, z: -8, noise: 0, lit: false, moving: false };
  let chased = false;
  for (let t = 0; t < 30; t += 0.05) { const r = stepHushman(h, 0.05, hidden, wall); h = r.state; chased ||= r.startedChase; }
  assert.equal(chased, false);
  assert.equal(h.mode, 'patrol');
});

const clearOf = (p: { x: number; z: number }, tombs: { x: number; z: number; w: number; d: number }[], r = 0.4) =>
  tombs.every((t) => Math.abs(p.x - t.x) > t.w / 2 + r || Math.abs(p.z - t.z) > t.d / 2 + r);

test('surface keeps the spawn, lectern and patrol waypoints clear', () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = generateSurface(seed);
    assert.ok(clearOf(s.spawn, s.tombs));
    assert.ok(clearOf(LECTERN, s.tombs));
    for (const route of s.routes) for (const p of route) assert.ok(clearOf(p, s.tombs));
    assert.ok(s.tombs.some((t) => t.h >= 1.6), 'something tall to hide behind');
  }
});

test('surface is deterministic per seed', () => {
  assert.equal(JSON.stringify(generateSurface(7)), JSON.stringify(generateSurface(7)));
});

test('the ending choice needs the final ledger page', () => {
  assert.deepEqual(endingChoices([]), ['rain']);
  assert.deepEqual(endingChoices(['ledger-page-final']), ['bells', 'undertaker']);
});
