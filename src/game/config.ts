// Tuning values from the design doc. Change numbers here, not in the systems.

export const AIR = {
  /** seconds of air at calm breathing */
  start: 360,
  /** drain multipliers; panic multiplies, the rest pick the movement rate */
  still: 1.0,
  walk: 1.2,
  sprint: 2.5,
  panicMultiplier: 2.0,
  matchExtra: 0.5,
  exertion: 3.0, // digging, prying, shouting
  /** air pockets refill this many seconds of air per second while you stand in them */
  pocketRefill: 6,
  /** below this fraction of air the screen starts closing in */
  lowAirFraction: 0.3,
};

export const LIGHT = {
  matchesAtStart: 4,
  matchBurnSeconds: 20,
  /** phone battery lasts this many seconds of flashlight use */
  phoneBatterySeconds: 240,
};

export const PANIC = {
  /** panic added by a scare, 0..1 */
  scare: 0.6,
  /** panic lost per second while holding calm */
  calmRate: 1 / 3,
  /** panic lost per second on its own */
  decay: 0.02,
};

export const PLAYER = {
  walkSpeed: 1.25, // m/s
  sprintSpeed: 2.6,
  crawlSpeed: 0.55,
  radius: 0.25,
  eyeHeight: 1.55,
  lookSensitivity: 0.0045, // radians per screen point
  interactRange: 1.6, // metres
};

export const DIG = {
  /** exertion seconds of pushing needed to break the coffin lid */
  coffinLid: 4,
  /** exertion seconds to dig out a buried survivor */
  survivor: 18,
};

export const RENDER = {
  /** internal render scale, upscaled by the post pass; keeps mid-range Android at 30 fps */
  scale: 0.66,
  /** never render narrower than this many pixels, so small GL buffers (some Android phones) stay sharp */
  minInternalWidth: 1280,
  /** dynamic resolution never drops the internal render below this fraction of the screen */
  minScale: 0.4,
  /** dynamic resolution aims to stay above this many frames per second */
  targetFps: 30,
  fogDensity: 0.22,
};
