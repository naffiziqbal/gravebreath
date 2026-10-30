// The Hushmen: lantern-bearers of the Order who patrol the necropolis. Unlike the Listener they see.
// Their lantern beam is their sight; tall tombs block it; your own light gives you away from far off.
// Pure simulation, no rendering.
import { sightBlocked, type Point, type Tomb } from './necropolis.ts';

export const HUSHMAN = {
  patrolSpeed: 0.85,
  searchSpeed: 1.1,
  chaseSpeed: 1.65, // faster than walking: you have to break their line of sight, not outrun them
  sight: 9, // metres along the lantern beam
  halfAngle: 0.62, // radians either side of where they face
  lightSight: 14, // a lit match or phone is seen from this far, from any direction, if nothing tall is in the way
  catchDistance: 0.9,
  forgetAfter: 4, // seconds without seeing you before giving up the chase
  searchTime: 5,
  radius: 0.35,
};

export type HushmanMode = 'patrol' | 'search' | 'chase';

export type HushmanState = {
  x: number;
  z: number;
  heading: number; // radians; 0 faces -z, like the player's yaw
  route: Point[];
  waypoint: number;
  mode: HushmanMode;
  suspicion: number; // 0..1; reaching 1 starts a chase
  lastSeen: Point | null;
  lostFor: number;
  searchLeft: number;
};

export type PlayerSeen = { x: number; z: number; noise: number; lit: boolean; moving: boolean };

export function spawnHushman(route: Point[], startAt = 0): HushmanState {
  const p = route[startAt % route.length];
  return { x: p.x, z: p.z, heading: 0, route, waypoint: (startAt + 1) % route.length, mode: 'patrol', suspicion: 0, lastSeen: null, lostFor: 0, searchLeft: 0 };
}

/** Can this Hushman see the player right now? */
export function canSee(h: HushmanState, p: PlayerSeen, tombs: readonly Tomb[]): boolean {
  const dx = p.x - h.x, dz = p.z - h.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return true;
  const blocked = () => sightBlocked(h, p, tombs);
  // your own light: visible from any direction within lightSight
  if (p.lit && d < HUSHMAN.lightSight && !blocked()) return true;
  if (d > HUSHMAN.sight) return false;
  const facing = { x: -Math.sin(h.heading), z: -Math.cos(h.heading) };
  const cos = (dx * facing.x + dz * facing.z) / d;
  if (cos < Math.cos(HUSHMAN.halfAngle)) return false;
  return !blocked();
}

export type HushmanStep = { state: HushmanState; sees: boolean; startedChase: boolean; caught: boolean };

export function stepHushman(prev: HushmanState, dt: number, p: PlayerSeen, tombs: readonly Tomb[]): HushmanStep {
  const s: HushmanState = { ...prev };
  const d = Math.hypot(p.x - s.x, p.z - s.z);
  const sees = canSee(s, p, tombs);
  const heard = d < p.noise * 0.6; // they listen too, but not as keenly as the thing below

  if (sees) {
    const closeness = Math.max(0.15, 1 - d / HUSHMAN.sight);
    s.suspicion = Math.min(1, s.suspicion + dt * (p.lit ? 1.6 : 0.9) * closeness * (p.moving ? 1.4 : 1));
    s.lastSeen = { x: p.x, z: p.z };
    s.lostFor = 0;
  } else {
    s.suspicion = Math.max(0, s.suspicion - dt * (s.mode === 'chase' ? 0.08 : 0.22));
    if (s.mode === 'chase') s.lostFor += dt;
  }
  if (heard && s.mode === 'patrol') {
    s.mode = 'search'; s.lastSeen = { x: p.x, z: p.z }; s.searchLeft = HUSHMAN.searchTime;
    s.suspicion = Math.max(s.suspicion, 0.35);
  }

  let startedChase = false;
  if (s.suspicion >= 1 && s.mode !== 'chase') { s.mode = 'chase'; startedChase = true; }
  if (s.mode === 'chase' && s.lostFor > HUSHMAN.forgetAfter) {
    // lost you: go and look where you were last seen
    s.mode = 'search'; s.searchLeft = HUSHMAN.searchTime; s.suspicion = 0.6;
  }
  if (s.mode === 'search' && s.suspicion < 0.15 && s.searchLeft <= 0) { s.mode = 'patrol'; s.lastSeen = null; }

  // where to walk
  let goal: Point;
  let speed: number;
  if (s.mode === 'chase') {
    goal = sees ? { x: p.x, z: p.z } : s.lastSeen ?? { x: p.x, z: p.z };
    speed = HUSHMAN.chaseSpeed;
  } else if (s.mode === 'search' && s.lastSeen) {
    goal = s.lastSeen;
    speed = HUSHMAN.searchSpeed;
    if (Math.hypot(goal.x - s.x, goal.z - s.z) < 0.4) {
      // stand and sweep the lantern around
      s.searchLeft -= dt;
      s.heading += dt * 1.6 * Math.sin(s.searchLeft * 1.3);
      speed = 0;
    }
  } else {
    goal = s.route[s.waypoint];
    speed = HUSHMAN.patrolSpeed;
    if (Math.hypot(goal.x - s.x, goal.z - s.z) < 0.3) s.waypoint = (s.waypoint + 1) % s.route.length;
  }
  const gx = goal.x - s.x, gz = goal.z - s.z;
  const gd = Math.hypot(gx, gz);
  if (speed > 0 && gd > 1e-4) {
    const k = Math.min(1, (speed * dt) / gd);
    s.x += gx * k; s.z += gz * k;
    pushOutOfTombs(s, tombs);
    // turn smoothly toward where they walk
    const want = Math.atan2(-gx, -gz);
    const diff = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
    s.heading += diff * Math.min(1, dt * 5);
  }
  const caught = Math.hypot(p.x - s.x, p.z - s.z) < HUSHMAN.catchDistance;
  return { state: s, sees, startedChase, caught };
}

/** Keep them from walking through tombs when they cut across the hall chasing you. */
function pushOutOfTombs(s: HushmanState, tombs: readonly Tomb[]) {
  const r = HUSHMAN.radius;
  for (const t of tombs) {
    const cx = Math.max(t.x - t.w / 2, Math.min(s.x, t.x + t.w / 2));
    const cz = Math.max(t.z - t.d / 2, Math.min(s.z, t.z + t.d / 2));
    const dx = s.x - cx, dz = s.z - cz;
    const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d > 1e-6) { s.x = cx + (dx / d) * r; s.z = cz + (dz / d) * r; }
    else s.x += r; // dead centre: step out sideways
  }
}
