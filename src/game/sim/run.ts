// The run simulation: air, light, panic and exertion. Pure functions, no rendering.
import { AIR, LIGHT, PANIC } from '../config.ts';

export type Movement = 'still' | 'walk' | 'sprint';

export type RunState = {
  seed: number;
  victim: number; // which victim of the ledger this run plays
  air: number; // seconds left
  airMax: number;
  panic: number; // 0..1
  matches: number;
  matchTime: number; // seconds left on the lit match, 0 = no match lit
  battery: number; // 0..1
  phoneOn: boolean;
  holdingBreath: boolean;
  calming: boolean;
  movement: Movement;
  exerting: boolean; // digging, prying, shouting
  inAirPocket: boolean;
  elapsed: number;
  dead: boolean;
  escaped: boolean;
};

export type RunInput = Partial<Pick<RunState, 'movement' | 'exerting' | 'calming' | 'holdingBreath' | 'inAirPocket'>>;

export function newRun(seed: number, victim: number, bonusMatches = 0): RunState {
  return {
    seed,
    victim,
    air: AIR.start,
    airMax: AIR.start,
    panic: 0.25, // you wake up already afraid
    matches: LIGHT.matchesAtStart + bonusMatches,
    matchTime: 0,
    battery: 1,
    phoneOn: false,
    holdingBreath: false,
    calming: false,
    movement: 'still',
    exerting: false,
    inAirPocket: false,
    elapsed: 0,
    dead: false,
    escaped: false,
  };
}

/** Seconds of air spent per real second in this state. */
export function airDrainRate(s: RunState): number {
  if (s.holdingBreath) return 0.35; // holding your breath barely uses air, but you can't recover
  let rate = s.exerting ? AIR.exertion : AIR[s.movement];
  if (s.matchTime > 0) rate += AIR.matchExtra;
  if (s.panic > 0.5) rate *= 1 + (AIR.panicMultiplier - 1) * ((s.panic - 0.5) / 0.5);
  return rate;
}

export function step(prev: RunState, dt: number, input: RunInput = {}): RunState {
  if (prev.dead || prev.escaped) return prev;
  const s: RunState = { ...prev, ...input, elapsed: prev.elapsed + dt };
  // you can't calm down while moving or straining
  if (s.movement !== 'still' || s.exerting) s.calming = false;

  s.air -= airDrainRate(s) * dt;
  if (s.inAirPocket && !s.holdingBreath) s.air = Math.min(s.airMax, s.air + AIR.pocketRefill * dt);

  if (s.matchTime > 0) {
    // running blows the match out
    s.matchTime = s.movement === 'sprint' ? 0 : Math.max(0, s.matchTime - dt);
  }
  if (s.phoneOn) {
    s.battery = Math.max(0, s.battery - dt / LIGHT.phoneBatterySeconds);
    if (s.battery === 0) s.phoneOn = false;
  }

  const calm = s.calming ? PANIC.calmRate : 0;
  // low air feeds panic
  const airFear = s.air / s.airMax < AIR.lowAirFraction ? 0.05 : 0;
  s.panic = clamp01(s.panic - (PANIC.decay + calm - airFear) * dt);

  if (s.air <= 0) {
    s.air = 0;
    s.dead = true;
  }
  return s;
}

export function strikeMatch(s: RunState): RunState {
  if (s.matches <= 0 || s.matchTime > 0 || s.dead) return s;
  return { ...s, matches: s.matches - 1, matchTime: LIGHT.matchBurnSeconds };
}

export function togglePhone(s: RunState): RunState {
  if (s.battery <= 0) return { ...s, phoneOn: false };
  return { ...s, phoneOn: !s.phoneOn };
}

export function scare(s: RunState, amount = PANIC.scare): RunState {
  return { ...s, panic: clamp01(s.panic + amount), calming: false };
}

export function airFraction(s: RunState): number {
  return s.air / s.airMax;
}

/** How bright the player's own light is right now, 0..1 (used by audio and post effects). */
export function lightLevel(s: RunState): number {
  return Math.max(s.matchTime > 0 ? 1 : 0, s.phoneOn ? 0.6 * Math.min(1, s.battery * 4) : 0);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
