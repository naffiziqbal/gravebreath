// The Listener: a blind thing in the catacombs that hunts by sound. Pure simulation, no rendering.
import { cellCentre, cellOf, neighbours, nextToward, type Cell, type Maze } from './catacombs.ts';
import type { Movement } from './run.ts';
import type { Rng } from './rng.ts';

export const LISTENER = {
  wanderSpeed: 0.55,
  searchSpeed: 0.85,
  huntSpeed: 1.15, // slower than walking (1.25): you can always walk away, but you can't stand still near it
  catchDistance: 0.85,
  /** seconds it keeps searching where it last heard you */
  searchTime: 5,
};

export type ListenerMode = 'wander' | 'search' | 'hunt';

export type ListenerState = {
  x: number;
  z: number;
  cell: Cell; // the cell it is standing in
  next: Cell; // the cell it is walking toward
  target: Cell | null; // where it last heard you
  mode: ListenerMode;
  searchLeft: number;
  came: Cell | null; // the cell it came from, so wandering doesn't turn straight back
};

/** How far away (metres) the Listener can hear you, given what you are doing. */
export function noiseRadius(p: { movement: Movement; holdingBreath: boolean; exerting: boolean; panic: number }): number {
  if (p.holdingBreath && p.movement === 'still' && !p.exerting) return 0;
  let r = p.exerting ? 10 : p.movement === 'sprint' ? 13 : p.movement === 'walk' ? 5 : 1.5;
  if (p.panic > 0.6 && !p.holdingBreath) r += 2; // ragged, panicked breathing carries
  return r;
}

export function spawnListener(m: Maze, at: Cell): ListenerState {
  const p = cellCentre(m, at);
  return { x: p.x, z: p.z, cell: at, next: at, target: null, mode: 'wander', searchLeft: 0, came: null };
}

export type ListenerStep = { state: ListenerState; heard: boolean; startedHunting: boolean; caught: boolean };

export function stepListener(m: Maze, prev: ListenerState, dt: number, player: { x: number; z: number; noise: number }, rng: Rng): ListenerStep {
  const s: ListenerState = { ...prev };
  const dx = player.x - s.x, dz = player.z - s.z;
  const d = Math.hypot(dx, dz);
  const heard = d < player.noise;
  const playerCell = cellOf(m, player.x, player.z);
  let startedHunting = false;
  if (heard && playerCell) {
    startedHunting = s.mode !== 'hunt';
    s.mode = 'hunt';
    s.target = playerCell;
    s.searchLeft = LISTENER.searchTime;
  }

  // arrived at the cell it was heading for: choose the next one
  const nc = cellCentre(m, s.next);
  if (Math.hypot(nc.x - s.x, nc.z - s.z) < 0.05) {
    s.came = s.cell === s.next ? s.came : s.cell;
    s.cell = s.next;
    if (s.target && s.cell !== s.target) {
      s.next = nextToward(m, s.cell, s.target);
    } else {
      if (s.target && s.cell === s.target) {
        // reached where the sound was: linger, listening, then give up
        if (s.mode === 'hunt') s.mode = 'search';
        s.searchLeft -= dt;
        if (s.searchLeft <= 0) { s.mode = 'wander'; s.target = null; }
      }
      if (!s.target) {
        const options = neighbours(m, s.cell);
        const forward = options.filter((n) => n !== s.came);
        s.next = rng.pick(forward.length ? forward : options);
      }
    }
  }

  const speed = s.mode === 'hunt' ? LISTENER.huntSpeed : s.mode === 'search' ? LISTENER.searchSpeed : LISTENER.wanderSpeed;
  // in the player's own cell it stops following the grid and goes straight for them
  const sameCell = playerCell === s.cell && s.mode === 'hunt';
  const goal = sameCell ? { x: player.x, z: player.z } : cellCentre(m, s.next);
  const gx = goal.x - s.x, gz = goal.z - s.z;
  const gd = Math.hypot(gx, gz);
  if (gd > 1e-6) {
    const k = Math.min(1, (speed * dt) / gd);
    s.x += gx * k;
    s.z += gz * k;
  }
  const caught = Math.hypot(player.x - s.x, player.z - s.z) < LISTENER.catchDistance;
  return { state: s, heard, startedHunting, caught };
}

/** Rough check used by tests and the HUD: is the Listener within earshot range in metres? */
export function distanceTo(s: ListenerState, x: number, z: number) {
  return Math.hypot(x - s.x, z - s.z);
}

