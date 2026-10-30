// Dev-only: plays a whole run like a person would, for recording a gameplay video in the browser.
// Opened with /play?autoplay=1&seed=N on web. It drives the game only through the same controls a
// player has (move, look, match, phone, hold breath, the action button), except for staging where the
// Listener walks so the encounter is guaranteed to happen on camera.
import { Platform } from 'react-native';
import type { Game } from '../Game';
import type { Level, LiveInteractable } from '../world/builder';
import type { Catacombs } from '../world/catacombs';
import type { ListenerState } from '../sim/listener';
import { cellCentre, distances, neighbours, nextToward, type Cell, type Maze } from '../sim/catacombs';
import { PLAYER } from '../config';
import { useGame } from '../store';
import { startRecording, type Recording } from './recorder';

// the parts of the game the director reads; they are private on Game, so it is cast to this shape
type Internals = {
  phase: string; yaw: number; pitch: number; pos: { x: number; z: number };
  run: { matches: number; matchTime: number; phoneOn: boolean; battery: number; air: number; airMax: number };
  level: Level | null; catacombs: Catacombs | null; listener: ListenerState | null; focus: LiveInteractable | null; listenerDeaf: boolean;
  sound: { play(n: string, v?: number): void; loopVolume: Map<string, number>; rates: Map<string, number> };
};

const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export async function runDirector(game: Game) {
  const g = game as unknown as Internals;
  const rec = Platform.OS === 'web' ? await startRecording(game) : null;
  const d = new Director(game, g, rec);
  try {
    await d.play();
  } catch (e) {
    console.error('[director] stopped', e);
  }
  await new Promise((r) => setTimeout(r, 7000)); // hold on the end screen
  await rec?.stop();
}

class Director {
  private last = performance.now();
  private pitchGoal = -0.08;
  // between staged moments the Listener is held where it was left, so it can't blunder into the camera
  private leash: { maze: Maze; cell: Cell } | null = null;
  constructor(private game: Game, private g: Internals, private rec: Recording | null) {}

  private log(kind: string, data: Record<string, unknown> = {}) { this.rec?.event(kind, data); }

  // ------------------------------------------------------------- primitives
  private async tick(): Promise<number> {
    await frame();
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // ease the head toward the goal pitch, like a thumb dragging on the right side of the screen
    const dp = wrap(this.pitchGoal - this.g.pitch);
    if (Math.abs(dp) > 0.002) this.look(0, Math.max(-1.2 * dt, Math.min(1.2 * dt, dp)));
    this.keepLight();
    if (this.leash && this.g.listener) park(this.g, this.leash.maze, this.leash.cell);
    this.g.listenerDeaf = !!this.leash;
    return dt;
  }

  private look(dyaw: number, dpitch: number) {
    const s = PLAYER.lookSensitivity;
    this.game.look(-dyaw / s, -dpitch / s);
    if (Math.abs(dyaw) + Math.abs(dpitch) > 1e-4) this.log('look', { dx: -dyaw / s, dy: -dpitch / s });
  }

  private async wait(seconds: number) {
    const end = performance.now() + seconds * 1000;
    while (performance.now() < end) await this.tick();
  }

  private async until(cond: () => boolean, timeout = 30) {
    const end = performance.now() + timeout * 1000;
    while (!cond() && performance.now() < end) await this.tick();
    return cond();
  }

  /** Turn to face a point, at a natural speed. */
  private async face(x: number, z: number, pitch = -0.08) {
    this.pitchGoal = pitch;
    for (;;) {
      const dt = await this.tick();
      const want = Math.atan2(-(x - this.g.pos.x), -(z - this.g.pos.z));
      const dy = wrap(want - this.g.yaw);
      if (Math.abs(dy) < 0.03) return;
      this.look(Math.max(-2.2 * dt, Math.min(2.2 * dt, dy)), 0);
    }
  }

  /** Walk to a point, steering as you go; gives up if stuck against something. */
  private async walkTo(x: number, z: number, tol = 0.25, pace = 0.72) {
    let stuckFor = 0, lastD = Infinity;
    this.pitchGoal = -0.08;
    for (;;) {
      const dt = await this.tick();
      if (!this.walking()) break;
      const dx = x - this.g.pos.x, dz = z - this.g.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < tol) break;
      const want = Math.atan2(-dx, -dz);
      const dy = wrap(want - this.g.yaw);
      this.look(Math.max(-2.4 * dt, Math.min(2.4 * dt, dy)), 0);
      const go = Math.abs(dy) < 0.6 ? pace : 0;
      this.move(0, go);
      stuckFor = dist > lastD - 0.002 && go > 0 ? stuckFor + dt : 0;
      lastD = dist;
      if (stuckFor > 2.5) break;
    }
    this.move(0, 0);
  }

  private move(x: number, y: number) {
    this.game.setInput({ moveX: x, moveY: y });
    this.log('move', { x, y });
  }

  private async tap() {
    this.game.setInput({ interact: true }); this.log('press', { down: true });
    await this.tick(); await this.tick();
    this.game.setInput({ interact: false }); this.log('press', { down: false });
  }

  private async hold(cond: () => boolean, timeout = 30) {
    this.game.setInput({ interact: true }); this.log('press', { down: true });
    await this.until(cond, timeout);
    this.game.setInput({ interact: false }); this.log('press', { down: false });
  }

  private walking() { return this.g.phase === 'crypt' || this.g.phase === 'catacombs'; }

  /** Keep some light: a match when one is spare, otherwise the phone. */
  private lightMode: 'match' | 'phone' | 'none' = 'none';
  private keepLight() {
    if (!this.walking() || this.lightMode === 'none') return;
    const r = this.g.run;
    if (this.lightMode === 'match' && r.matchTime <= 0 && r.matches > 1) { this.game.lightMatch(); this.log('button', { name: 'match' }); }
    if (this.lightMode === 'phone' && !r.phoneOn && r.battery > 0) { this.game.usePhone(); this.log('button', { name: 'phone' }); }
  }

  private async readClueIfShown() {
    if (await this.until(() => !!useGame.getState().clue, 3)) { // the hand has to bring it back first
      await this.wait(4.5);
      this.log('button', { name: 'keep' });
      useGame.getState().showClue(null);
      this.last = performance.now();
    }
  }

  // ------------------------------------------------------------- the run
  async play() {
    await this.until(() => this.g.phase === 'coffin', 30);
    this.log('phase', { phase: 'coffin' });
    // wake, breathe, listen to the earth landing on the lid
    await this.wait(4.5);
    this.game.lightMatch(); this.log('button', { name: 'match' });
    await this.wait(1.5);
    // read the lid, look around the coffin
    await this.turnBy(-0.45, 0.25); await this.wait(0.8);
    await this.turnBy(0.8, -0.1); await this.wait(0.8);
    await this.turnBy(-0.35, -0.05); await this.wait(1.2);
    await this.hold(() => this.g.phase !== 'coffin', 12);
    await this.until(() => this.g.phase === 'crypt', 10);
    this.log('phase', { phase: 'crypt' });
    await this.crypt();
    await this.until(() => this.g.phase === 'catacombs', 30);
    this.log('phase', { phase: 'catacombs' });
    await this.catacombs();
  }

  private async turnBy(dyaw: number, dpitch: number) {
    this.pitchGoal = this.g.pitch + dpitch;
    const target = this.g.yaw + dyaw;
    for (;;) {
      const dt = await this.tick();
      const dy = wrap(target - this.g.yaw);
      if (Math.abs(dy) < 0.02) return;
      this.look(Math.max(-1.4 * dt, Math.min(1.4 * dt, dy)), 0);
    }
  }

  private async crypt() {
    const level = this.g.level!;
    await this.wait(2.5);
    // look back at the broken niche you crawled out of, then light a match
    await this.turnBy(Math.PI * 0.9, -0.25); await this.wait(1.6);
    this.lightMode = 'match';
    await this.turnBy(-Math.PI * 0.9, 0.25); await this.wait(0.6);
    const rooms = (level as Level & { rooms: { z: number; depth: number }[] }).rooms;
    let dugOne = false;
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      const items = level.interactables.filter((it) => it.roomIndex === i && it.def.type !== 'exit').sort((a, b) => b.pos.z - a.pos.z);
      for (const it of items) {
        if (it.done) continue;
        if (it.def.type === 'survivor' && dugOne) continue; // walk past the second one: leave them to their fate
        await this.walkTo(0, it.pos.z + 0.4);
        const sx = it.def.type === 'survivor' ? it.pos.x * 0.55 : it.pos.x * 0.5;
        await this.walkTo(sx, it.pos.z + 0.6, 0.3);
        await this.face(it.pos.x, it.pos.z, it.def.type === 'survivor' ? -0.35 : -0.6);
        await this.wait(0.6);
        if (this.g.focus !== it) { await this.walkTo(it.pos.x * 0.8, it.pos.z + 0.35, 0.25); await this.face(it.pos.x, it.pos.z, -0.6); }
        if (it.def.type === 'survivor') {
          await this.hold(() => it.done, 25);
          dugOne = true;
          await this.readClueIfShown();
          await this.wait(2.5);
        } else {
          await this.tap();
          if (it.def.type === 'clue') await this.readClueIfShown(); else await this.wait(1.2);
        }
      }
      const pocket = level.airPockets.find((a) => Math.abs(a.pos.z - room.z) < room.depth / 2);
      if (pocket) {
        await this.walkTo(pocket.pos.x * 0.7, pocket.pos.z + 0.6);
        await this.walkTo(pocket.pos.x, pocket.pos.z, 0.25);
        this.pitchGoal = 0.5; // look up into the light falling from the crack
        await this.wait(2.5);
        this.game.setInput({ calming: true }); this.log('hold', { calm: true });
        await this.until(() => this.g.run.air >= this.g.run.airMax * 0.97, 25);
        this.game.setInput({ calming: false }); this.log('hold', { calm: false });
        this.pitchGoal = -0.08;
      }
      const front = room.z - room.depth / 2;
      await this.walkTo(0, room.z);
      if (i < rooms.length - 1) {
        await this.walkTo(0, front + 0.3);
        await this.walkTo(0, front - 0.9);
      }
    }
    const exit = level.interactables.find((it) => it.def.type === 'exit')!;
    await this.walkTo(0, exit.pos.z + 0.9);
    await this.face(exit.pos.x, exit.pos.z - 1, 0.15);
    await this.wait(1.5);
    await this.tap();
  }

  private async catacombs() {
    const c = this.g.catacombs!;
    const maze = c.layout.maze;
    // keep the Listener idle in a far corner until the encounter is staged
    const far = farthestFrom(maze, maze.entrance, maze.exit);
    park(this.g, maze, far);
    this.leash = { maze, cell: far };
    await this.wait(3);
    this.lightMode = 'phone';
    await this.wait(1.5);

    // route: entrance → (a clue on the way, if any) → bone stair
    const clue = c.interactables.find((it) => it.def.type === 'clue');
    const clueCell = clue ? cellNear(maze, clue.pos.x, clue.pos.z) : null;
    const route = [...path(maze, maze.entrance, clueCell ?? maze.exit), ...(clueCell ? path(maze, clueCell, maze.exit).slice(1) : [])];
    // the encounter: a junction on the route with a side tunnel for the Listener to come out of
    let ambush = -1;
    for (let k = 2; k < route.length - 2; k++) {
      if (neighbours(maze, route[k]).some((n) => !route.includes(n))) { ambush = k; break; }
    }
    for (let k = 1; k < route.length; k++) {
      const cell = route[k];
      if (k === ambush) await this.encounter(maze, route, k);
      const p = cellCentre(maze, cell);
      await this.walkTo(p.x, p.z, 0.3);
      if (clueCell && cell === clueCell && clue && !clue.done) {
        await this.walkTo(clue.pos.x, clue.pos.z + 0.3, 0.35);
        await this.face(clue.pos.x, clue.pos.z, -0.6);
        await this.wait(0.4);
        await this.tap();
        await this.readClueIfShown();
      }
    }
    // the bone stair: you reach it, and it comes for you from behind as you climb
    const exit = c.interactables.find((it) => it.def.type === 'exit')!;
    await this.walkTo(exit.pos.x, exit.pos.z + 0.6, 0.3);
    await this.face(exit.pos.x, exit.pos.z - 1.5, 0.3);
    await this.wait(1.2);
    const behind = route.at(-3) ?? route[0];
    const bp = cellCentre(maze, behind);
    this.leash = null;
    Object.assign(this.g.listener!, { x: bp.x, z: bp.z, cell: behind, next: behind, mode: 'hunt', target: maze.exit, searchLeft: 6 });
    this.g.sound.play('listener_shriek', 0.9);
    this.log('stage', { what: 'chase' });
    await this.wait(1.6); // you hear it coming
    await this.until(() => this.g.focus === exit, 3);
    await this.tap();
  }

  /** Stop before a junction, hold your breath, and let the Listener cross in front of you. */
  private async encounter(maze: Maze, route: Cell[], k: number) {
    const junction = route[k];
    const side = neighbours(maze, junction).find((n) => !route.includes(n))!;
    const deeper = neighbours(maze, side).find((n) => n !== junction) ?? side;
    const before = cellCentre(maze, route[k - 1]);
    await this.walkTo(before.x, before.z, 0.3);
    const jp = cellCentre(maze, junction);
    await this.face(jp.x, jp.z, 0);
    // it comes out of the side tunnel and stops at the junction to listen
    this.leash = null;
    park(this.g, maze, deeper);
    Object.assign(this.g.listener!, { mode: 'search', target: junction, next: side, searchLeft: 4.5 });
    this.log('stage', { what: 'listener-approaches' });
    const lis = () => this.g.listener!; // the game replaces this object every frame: always read it fresh
    await this.until(() => Math.hypot(lis().x - jp.x, lis().z - jp.z) < 2.8, 15);
    this.game.setInput({ holdingBreath: true }); this.log('hold', { breath: true });
    await this.until(() => lis().cell === junction, 12);
    await this.wait(4.5);
    // then it shuffles back down its own tunnel, away from your route
    const back = deepestBeyond(maze, junction, side);
    Object.assign(lis(), { mode: 'search', target: back, searchLeft: 1e9 });
    await this.until(() => Math.hypot(lis().x - this.g.pos.x, lis().z - this.g.pos.z) > 7.5, 20);
    await this.until(() => lis().cell === back, 15);
    this.leash = { maze, cell: back };
    this.game.setInput({ holdingBreath: false }); this.log('hold', { breath: false });
    await this.wait(1.2);
  }
}

/** The farthest cell reached from `junction` by going through `side` first (never back along the route). */
function deepestBeyond(m: Maze, junction: Cell, side: Cell): Cell {
  const fromJ = distances(m, junction), fromS = distances(m, side);
  return [...fromS.entries()].filter(([c]) => fromJ.get(c) === (fromS.get(c) ?? 0) + 1).sort((a, b) => b[1] - a[1])[0]?.[0] ?? side;
}

function path(m: Maze, from: Cell, to: Cell): Cell[] {
  const out = [from];
  let c = from;
  for (let guard = 0; c !== to && guard < 100; guard++) { c = nextToward(m, c, to); out.push(c); }
  return out;
}

function cellNear(m: Maze, x: number, z: number): Cell {
  return m.cells.reduce((best, c) => {
    const p = cellCentre(m, c), q = cellCentre(m, best);
    return Math.hypot(p.x - x, p.z - z) < Math.hypot(q.x - x, q.z - z) ? c : best;
  });
}

/** The cell farthest from `a` that isn't `avoid` (or on a route to keep clear). */
function farthestFrom(m: Maze, a: Cell, avoid: Cell, keepClear: Cell[] = []): Cell {
  const d = distances(m, a);
  return [...d.entries()].filter(([c]) => c !== avoid && !keepClear.includes(c)).sort((x, y) => y[1] - x[1])[0][0];
}

/** Put the Listener in a cell and keep it there, listening. */
function park(g: Internals, m: Maze, at: Cell) {
  const p = cellCentre(m, at);
  Object.assign(g.listener!, { x: p.x, z: p.z, cell: at, next: at, target: at, mode: 'search', searchLeft: 1e9, came: null });
}
