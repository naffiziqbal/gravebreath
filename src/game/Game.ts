// The game loop: runs the simulation, moves the player, drives lights, sound and the post effects.
import * as THREE from 'three';
import { Assets, type GL } from './engine/assets';
import { Renderer } from './engine/renderer';
import { DECALS } from './engine/media';
import { Sound } from './audio/sound';
import { buildCoffin, buildCrypt, type Box, type Coffin, type Crypt, type Level, type LiveInteractable } from './world/builder';
import { buildCatacombs, type Catacombs } from './world/catacombs';
import { buildNecropolis, type Necropolis } from './world/necropolis';
import { animateHushman } from './world/hushmanRig';
import { Hands, type PickupKind } from './world/hands';
import { animateListener } from './world/listenerRig';
import { generateLayout, type Layout } from './sim/layout';
import { generateCatacombs, neighbours } from './sim/catacombs';
import { generateNecropolis, HALL_DEPTH } from './sim/necropolis';
import { spawnHushman, stepHushman, type HushmanState } from './sim/hushman';
import { noiseRadius, spawnListener, stepListener, type ListenerState } from './sim/listener';
import { createRng, type Rng } from './sim/rng';
import { airFraction, newRun, scare, step, strikeMatch, togglePhone, type Movement, type RunState } from './sim/run';
import { recordRun, unlocks, victimName, type Meta } from './sim/meta';
import { CLUES, type Clue } from './data/clues';
import { DIG, PLAYER } from './config';
import type { Hud, RunEnd } from './store';

export type GameEvents = {
  hud(h: Hud): void;
  say(text: string | null): void;
  clue(c: Clue): void;
  haptic(kind: 'light' | 'heavy' | 'heartbeat'): void;
  end(e: RunEnd, meta: Meta): void;
};

/** Dev-only shortcuts for testing a layer directly (set from the play screen's URL in dev builds). */
export type DebugStart = { layer?: number; match?: boolean; phone?: boolean; yaw?: number; listenerNear?: boolean; seed?: number; autoplay?: boolean };

export type Input = { moveX: number; moveY: number; calming: boolean; holdingBreath: boolean; interact: boolean };

type Phase = 'loading' | 'coffin' | 'crypt' | 'catacombs' | 'necropolis' | 'over';

const POOL = 3; // world point lights, fixed count so shaders never recompile mid-run
const LOUDEST = 13; // metres; the noise meter is full at this hearing radius

export class Game {
  private renderer: Renderer;
  private assets: Assets;
  private sound = new Sound();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.03, 60);
  private match = new THREE.PointLight(0xffa25a, 0, 0, 2);
  private flame = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 1.4), fog: false }));
  private phone = new THREE.SpotLight(0xd6e6ff, 0, 14, 0.42, 0.65, 2);
  private pool: THREE.PointLight[] = [];
  private coffin!: Coffin;
  private crypt!: Crypt;
  private catacombs: Catacombs | null = null;
  private catacombsReady: Promise<Catacombs> | null = null;
  private necropolis: Necropolis | null = null;
  private necropolisReady: Promise<Necropolis> | null = null;
  private hushmen: HushmanState[] = [];
  private chantTimer = 0;
  private level: Level | null = null; // where you are walking now
  private scene!: THREE.Scene; // what is being drawn
  private layout: Layout;
  private run: RunState;
  private phase: Phase = 'loading';
  private paused = false;
  private input: Input = { moveX: 0, moveY: 0, calming: false, holdingBreath: false, interact: false };
  private lookDX = 0;
  private lookDY = 0;
  private yaw = 0;
  private pitch = 0;
  private pos = new THREE.Vector3();
  private time = 0;
  private last = 0;
  private frame = 0;
  private hudTimer = 0;
  private flick = 1;
  private fade = 1;
  private fadeTarget = 0;
  private flash = 0;
  private shake = 0;
  private bob = 0;
  private heart = 0;
  private lidProgress = 0;
  private crackTimer = 0;
  private knockTimer = 3;
  private creakTimer = 6;
  private poolTimer = 0;
  private focus: LiveInteractable | null = null;
  private interactWas = false;
  private foundClues: string[] = [];
  private saved = 0;
  private visitedAreas = new Set<string>();
  private ended = false;
  private noise = 0;
  private listener: ListenerState | null = null;
  private listenerRng: Rng;
  private shriekCooldown = 0;
  private dragTimer = 0;
  private lunge = 0; // seconds since the Listener caught you
  private listenerDeaf = false;
  private hushmenBlind = false; // dev only, like listenerDeaf // dev only: the gameplay recorder holds it aside between staged moments
  private fpsAt = 0;
  private fpsFrames = 0;
  private fpsShown = 0;
  private soil: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; spin: THREE.Vector3; s: number; landed: boolean }[] = [];
  private soilSpawn = 0;
  private hands: Hands;

  constructor(gl: GL, private meta: Meta, private events: GameEvents, private debug: DebugStart = {}) {
    this.renderer = new Renderer(gl);
    this.assets = new Assets(this.renderer.three, gl);
    this.camera.aspect = this.renderer.width / this.renderer.height;
    this.camera.updateProjectionMatrix();
    this.camera.rotation.order = 'YXZ';
    const seed = __DEV__ && debug.seed !== undefined ? debug.seed : (Date.now() ^ (meta.runs * 2654435761)) >>> 0;
    const u = unlocks(meta);
    this.run = newRun(seed, meta.victims.length, u.extraMatch ? 1 : 0);
    this.layout = generateLayout(seed, meta.clues);
    this.listenerRng = createRng(seed ^ 0x51f15e);
    // the player's hand: match light and its flame sit low and to the right of the view
    this.match.position.set(0.09, -0.1, -0.22);
    this.flame.position.copy(this.match.position).add(new THREE.Vector3(0, 0.012, 0));
    this.flame.visible = false;
    this.camera.add(this.match, this.flame, this.phone, this.phone.target);
    this.phone.position.set(-0.05, -0.06, 0);
    this.phone.target.position.set(0, 0, -1);
    for (let i = 0; i < POOL; i++) this.pool.push(new THREE.PointLight(0xff9a4a, 0, 9, 2));
    this.hands = new Hands(this.camera.aspect);
    this.hands.onDigStroke = () => { this.sound.playVariant('dig', 0.85); this.events.haptic('light'); };
    this.hands.onPushStroke = () => { this.sound.playVariant('lid_creak', 0.7); this.events.haptic('light'); };
    if (__DEV__) (globalThis as { __game?: Game }).__game = this; // inspect from a debugger console
  }

  async init() {
    const t0 = Date.now();
    const mark = (what: string) => { if (__DEV__) console.log(`[game] ${what} at ${Date.now() - t0} ms`); };
    await this.sound.init();
    await this.hands.init(this.assets);
    mark('sound and hands ready');
    const [coffin, crypt] = await Promise.all([buildCoffin(this.assets, DECALS), buildCrypt(this.assets, this.layout)]);
    this.coffin = coffin;
    this.crypt = crypt;
    mark('world built');
    // warm up shaders for both scenes so the break-out has no hitch
    this.attach(this.crypt.scene);
    this.renderer.three.compile(this.crypt.scene, this.camera);
    this.attach(this.coffin.scene);
    this.renderer.three.compile(this.coffin.scene, this.camera);
    mark('shaders compiled');
    if (__DEV__ && this.debug.layer === 4) {
      this.lidProgress = 1;
      this.necropolisReady = buildNecropolis(this.assets, generateNecropolis(this.run.seed, this.meta.clues));
      this.goToNecropolis();
      setTimeout(() => { if (this.debug.match) this.lightMatch(); if (this.debug.phone) this.usePhone(); }, 2500);
      mark('debug start in the necropolis');
      return;
    }
    if (__DEV__ && this.debug.layer === 3) {
      this.lidProgress = 1;
      this.catacombsReady = buildCatacombs(this.assets, generateCatacombs(this.run.seed, this.meta.clues));
      this.goToCatacombs();
      setTimeout(() => {
        if (this.debug.match) this.lightMatch();
        if (this.debug.phone) this.usePhone();
        if (this.debug.yaw !== undefined) this.yaw = this.debug.yaw;
      }, 2500);
      mark('debug start in the catacombs');
      return;
    }
    this.enterCoffin();
  }

  start() {
    this.last = Date.now();
    this.sound.startLoops();
    const loop = () => {
      if (this.ended && this.fade >= 0.999) return;
      this.frame = requestAnimationFrame(loop);
      const now = Date.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.tick(dt);
    };
    this.frame = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.sound.stopLoops();
    this.sound.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- controls from the UI
  setInput(i: Partial<Input>) { this.input = { ...this.input, ...i }; }
  look(dx: number, dy: number) { this.lookDX += dx; this.lookDY += dy; }
  setPaused(p: boolean) { this.paused = p; if (!p) this.last = Date.now(); }

  lightMatch() {
    const before = this.run;
    this.run = strikeMatch(this.run);
    if (this.run !== before) { this.sound.play('match_strike', 0.9); this.flash = 0.12; }
  }

  usePhone() {
    this.run = togglePhone(this.run);
    this.sound.play('phone_click', 0.6);
  }

  // ---------------------------------------------------------------- phases
  private get walking() { return this.phase === 'crypt' || this.phase === 'catacombs' || this.phase === 'necropolis'; }
  private get alive() { return this.phase === 'coffin' || this.walking; }

  /** The camera (with your match and phone) and the shared light pool can only be in one scene at a time. */
  private attach(scene: THREE.Scene) {
    scene.add(this.camera, ...this.pool);
    this.scene = scene;
  }

  private enterCoffin() {
    this.phase = 'coffin';
    this.attach(this.coffin.scene);
    this.yaw = 0; this.pitch = 0;
    this.fade = 1; this.fadeTarget = 0;
    this.sound.play('gasp', 0.9);
    this.sound.play('ghost_swell', 0.6);
    this.events.say('You wake up in the dark.');
    setTimeout(() => { this.sound.play('thud', 0.8); this.shake = 0.5; }, 2200);
    setTimeout(() => { this.sound.play('thud', 0.7); this.shake = 0.4; this.events.haptic('heavy'); }, 3000);
    setTimeout(() => this.events.say('Light a match. Push the lid.'), 6000);
    setTimeout(() => this.events.say(null), 11000);
  }

  private enterLevel(level: Level, phase: 'crypt' | 'catacombs' | 'necropolis', line: string) {
    this.phase = phase;
    this.level = level;
    this.attach(level.scene);
    this.pos.copy(level.spawn.pos);
    this.yaw = level.spawn.yaw; this.pitch = 0;
    this.fadeTarget = 0;
    this.events.say(line);
    setTimeout(() => this.events.say(null), 4500);
  }

  private enterCrypt() {
    this.enterLevel(this.crypt, 'crypt', 'You claw through the soil into the crypt.');
    // build the catacombs in the background while you explore the crypt
    this.catacombsReady = buildCatacombs(this.assets, generateCatacombs(this.run.seed, [...this.meta.clues, ...this.foundClues]));
  }

  private goToCatacombs() {
    this.phase = 'over'; // limbo while the screen goes black
    this.fadeTarget = 1;
    this.focus = null;
    this.sound.playVariant('step_stone', 0.6);
    const ready = this.catacombsReady ?? buildCatacombs(this.assets, generateCatacombs(this.run.seed, this.meta.clues));
    Promise.all([ready, new Promise((r) => setTimeout(r, 1600))]).then(([c]) => {
      if (this.run.dead || this.ended) return;
      this.catacombs = c;
      this.attach(c.scene);
      this.renderer.three.compile(c.scene, this.camera); // hidden by the black screen
      const start = __DEV__ && this.debug.listenerNear ? neighbours(c.layout.maze, c.layout.maze.entrance)[0] ?? c.layout.listenerStart : c.layout.listenerStart;
      this.listener = spawnListener(c.layout.maze, start);
      this.sound.play('ghost_swell', 0.8);
      this.enterLevel(c, 'catacombs', 'The catacombs. Bones line every wall. Something down here is breathing.');
      this.necropolisReady = buildNecropolis(this.assets, generateNecropolis(this.run.seed, [...this.meta.clues, ...this.foundClues]));
    }).catch((e) => console.error('catacombs failed to load', e));
  }

  private goToNecropolis() {
    this.phase = 'over';
    this.fadeTarget = 1;
    this.focus = null;
    this.sound.play('step_stone_0', 0.6);
    const ready = this.necropolisReady ?? buildNecropolis(this.assets, generateNecropolis(this.run.seed, this.meta.clues));
    Promise.all([ready, new Promise((r) => setTimeout(r, 1600))]).then(([n]) => {
      if (this.run.dead || this.ended) return;
      this.necropolis = n;
      this.attach(n.scene);
      this.renderer.three.compile(n.scene, this.camera);
      this.hushmen = n.layout.routes.map((route, i) => spawnHushman(route, i * 2));
      this.sound.play('ghost_swell', 0.8);
      this.enterLevel(n, 'necropolis', 'The necropolis. Lanterns move between the tombs. Keep to the dark.');
    }).catch((e) => console.error('necropolis failed to load', e));
  }

  private endRun(fate: RunEnd['fate'], layer: number) {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'over';
    this.fadeTarget = 1;
    this.sound.play(fate === 'escaped' ? 'ghost_swell' : fate === 'taken' ? 'listener_shriek' : 'gasp', 0.9);
    const abandoned = this.crypt.interactables.filter((i) => i.def.type === 'survivor' && !i.done && !(i.def as { trap: boolean }).trap);
    const victim = victimName(this.run.seed);
    const meta = recordRun(this.meta, { name: victim, year: 1880 + this.meta.victims.length * 3, fate, layer, saved: this.saved },
      this.foundClues, abandoned.map((a) => `${this.run.seed}-${a.roomIndex}`));
    setTimeout(() => {
      this.sound.stopLoops();
      this.events.end({ fate, victim, layer, newClues: this.foundClues, saved: this.saved, abandoned: abandoned.length }, meta);
    }, 3200);
  }

  // ---------------------------------------------------------------- frame
  private tick(dt: number) {
    this.time += dt;
    const inp = this.input;
    const mag = Math.min(1, Math.hypot(inp.moveX, inp.moveY));
    const movement: Movement = !this.walking || mag < 0.15 ? 'still' : mag > 0.92 ? 'sprint' : 'walk';
    const pushing = this.phase === 'coffin' && inp.interact;
    const digging = this.walking && inp.interact && this.focus?.def.type === 'survivor' && !this.focus.done;
    const inPocket = this.walking && !!this.level?.airPockets.some((a) => Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < a.radius);

    const prev = this.run;
    if (this.alive) {
      this.run = step(this.run, dt, { movement, exerting: pushing || digging, calming: inp.calming, holdingBreath: inp.holdingBreath, inAirPocket: inPocket });
      if (prev.matchTime > 0 && this.run.matchTime === 0) this.sound.play('match_out', 0.6);
      if (prev.phoneOn && !this.run.phoneOn && this.run.battery === 0) this.events.say('The phone dies.');
      if (this.run.dead) this.endRun('suffocated', this.phase === 'coffin' ? 1 : this.level?.layer ?? 2);
    }
    this.noise = this.alive ? noiseRadius({ movement, holdingBreath: inp.holdingBreath, exerting: pushing || !!digging, panic: this.run.panic }) : 0;

    this.updateLook();
    if (this.phase === 'coffin') this.updateCoffin(dt, pushing);
    if (this.walking) this.updateWalk(dt, movement, mag);
    if (this.phase === 'catacombs') this.updateListener(dt);
    if (this.phase === 'necropolis') this.updateHushmen(dt);
    this.updateLights(dt);
    this.updateAudio(dt, inPocket, pushing || !!digging);

    // fades, flashes, shake
    this.fade += (this.fadeTarget - this.fade) * Math.min(1, dt * (this.fadeTarget > this.fade ? 1.2 : 0.6));
    this.flash = Math.max(0, this.flash - dt * 0.6);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.02, sy = (Math.random() - 0.5) * this.shake * 0.02;
    this.camera.rotation.z = sx * 2 + Math.sin(this.time * 0.9) * 0.004 * (1 + this.run.panic);
    this.camera.rotation.x += sy;

    // heartbeat drives the vignette pulse
    const bpm = 60 + this.run.panic * 70 + (1 - airFraction(this.run)) * 40;
    this.heart += dt * bpm / 60;
    if (this.heart >= 1) {
      this.heart -= 1;
      if (airFraction(this.run) < 0.3 || this.run.panic > 0.6) this.events.haptic('heartbeat');
    }
    const pulse = Math.exp(-this.heart * 6);
    this.sound.setRate('heartbeat', bpm / 60);

    this.hands.update(dt, {
      phase: this.phase, moving: this.walking ? Math.min(1, mag) : 0, bob: this.bob, matchLit: this.run.matchTime > 0,
      matchLife: Math.min(1, this.run.matchTime / 4), phoneOn: this.run.phoneOn, pushing, digging: !!digging,
      holdingBreath: inp.holdingBreath && this.alive, calming: inp.calming && this.alive, panic: this.run.panic,
    }, this.flick);
    this.renderer.render(this.scene, this.camera, { air: airFraction(this.run), panic: this.run.panic, pulse, fade: this.fade, flash: this.flash, shake: this.shake }, this.time,
      this.alive ? this.hands : undefined);

    if (__DEV__) {
      this.fpsFrames++;
      if (this.time - this.fpsAt > 2) { this.fpsShown = Math.round(this.fpsFrames / (this.time - this.fpsAt)); this.fpsAt = this.time; this.fpsFrames = 0; }
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.1; this.pushHud(); }
  }

  private updateLook() {
    const s = PLAYER.lookSensitivity;
    this.yaw -= this.lookDX * s;
    this.pitch -= this.lookDY * s;
    this.lookDX = 0; this.lookDY = 0;
    if (this.phase === 'coffin') {
      // lying on your back: you can only turn your head so far
      this.yaw = Math.max(-1.0, Math.min(1.0, this.yaw));
      this.pitch = Math.max(-0.9, Math.min(0.9, this.pitch));
    } else {
      this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch));
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private updateCoffin(dt: number, pushing: boolean) {
    this.camera.position.set(0, Math.sin(this.time * 1.4) * 0.004, 0);
    if (pushing && this.lidProgress < 1) {
      this.lidProgress = Math.min(1, this.lidProgress + dt / DIG.coffinLid);
      this.shake = Math.max(this.shake, 0.25);
      this.crackTimer -= dt;
      if (this.crackTimer <= 0) {
        this.crackTimer = 0.9 + Math.random() * 0.6;
        this.sound.play('wood_crack', 0.8);
        this.sound.play('dirt_fall', 0.5);
        this.events.haptic('light');
      }
    }
    this.coffin.cracks.opacity = Math.min(0.95, this.lidProgress * 1.1);
    this.updateSoil(dt, pushing);
    // fine dust sifts down with the clods
    const pts = this.coffin.dirt.geometry.attributes.position as THREE.BufferAttribute;
    const dm = this.coffin.dirt.material as THREE.PointsMaterial;
    dm.opacity = Math.min(0.6, this.lidProgress);
    if (this.lidProgress > 0) {
      for (let i = 0; i < pts.count; i++) {
        let z = pts.getZ(i) + dt * (0.2 + (i % 7) * 0.05) * (pushing ? 2 : 0.4);
        if (z > -0.16) z = -0.31; // respawn at the lid before reaching your face
        pts.setZ(i, z);
      }
      pts.needsUpdate = true;
    }
    this.creakTimer -= dt;
    if (this.creakTimer <= 0) {
      this.creakTimer = 7 + Math.random() * 8;
      this.sound.play((['creak_0', 'creak_1', 'creak_2'] as const)[Math.floor(Math.random() * 3)], 0.5);
    }
    if (this.lidProgress >= 1) {
      this.sound.play('lid_break', 1);
      this.flash = 0.25;
      this.shake = 1;
      this.events.haptic('heavy');
      this.phase = 'over'; // brief limbo while the screen goes black
      this.fadeTarget = 1;
      setTimeout(() => { if (!this.run.dead) this.enterCrypt(); }, 1800);
    }
  }

  /**
   * Clods of earth break off the cracked lid and fall toward you. In the coffin's upright frame gravity
   * points along +z (from the lid toward your back). Clods over your face roll off it; clods over your
   * body land and pile up, and the chest mound grows with them.
   */
  private updateSoil(dt: number, pushing: boolean) {
    const { clods, chestMound, bounds } = this.coffin;
    const rate = pushing ? 16 : this.lidProgress > 0 ? 1.2 : 0;
    this.soilSpawn += rate * dt;
    while (this.soilSpawn >= 1) {
      this.soilSpawn -= 1;
      const overBody = Math.random() < 0.5;
      const c = this.soil.length < clods.instanceMatrix.count ? { p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), spin: new THREE.Vector3(), s: 1, landed: false } : this.soil.shift()!;
      // mostly where you can see them; the rest fall on your body below the view
      c.p.set((Math.random() - 0.5) * bounds.halfWidth * 1.5, overBody ? -0.75 + Math.random() * 0.45 : -0.3 + Math.random() * 0.5, bounds.lid + 0.012);
      c.v.set((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, 0.05 + Math.random() * 0.1);
      c.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
      c.s = 0.5 + Math.random() * 1.1;
      c.landed = false;
      this.soil.push(c);
    }
    const g = 2.2; // slowed from 9.8 so the clods can be seen falling
    const heap = this.lidProgress > 0 ? 0.25 + this.lidProgress * 0.75 : 0.001;
    const pileTop = chestMound.position.z - 0.08 * heap; // land on the heap's surface as it grows
    for (const c of this.soil) {
      if (c.landed) continue;
      c.v.z += g * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.spin.x * dt; c.r.y += c.spin.y * dt; c.r.z += c.spin.z * dt;
      if (c.p.y > -0.3) {
        // over your face: it hits you and rolls down toward your chest
        if (c.p.z > -0.13) { c.p.z = -0.13; c.v.set(c.v.x, -0.9, 0); }
      } else if (c.p.z >= pileTop + Math.random() * 0.02) {
        c.p.z = pileTop; c.landed = true;
      }
      c.p.y = Math.max(bounds.bottom + 0.05, c.p.y);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    this.soil.forEach((c, i) => clods.setMatrixAt(i, m.compose(c.p, q.setFromEuler(c.r), sc.setScalar(c.s))));
    clods.count = this.soil.length;
    clods.instanceMatrix.needsUpdate = true;
    chestMound.scale.setScalar(heap);
  }

  private updateWalk(dt: number, movement: Movement, mag: number) {
    const level = this.level!;
    const speed = movement === 'sprint' ? PLAYER.sprintSpeed : movement === 'walk' ? PLAYER.walkSpeed * mag : 0;
    if (speed > 0) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const mx = (fx * this.input.moveY + rx * this.input.moveX) / Math.max(1, mag);
      const mz = (fz * this.input.moveY + rz * this.input.moveX) / Math.max(1, mag);
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      collide(this.pos, PLAYER.radius, level.colliders);
      const before = this.bob;
      this.bob += dt * speed * 3.2;
      // a footstep each time the head bob crosses a footfall: stone in the crypt, packed dirt in the catacombs
      if (Math.floor(before / Math.PI) !== Math.floor(this.bob / Math.PI)) this.sound.playVariant(level.layer === 4 && this.pos.z < -HALL_DEPTH ? 'water_step' : level.layer === 3 ? 'step_dirt' : 'step_stone', movement === 'sprint' ? 0.85 : 0.35 + 0.3 * mag);
    }
    const bobY = Math.sin(this.bob) * (movement === 'sprint' ? 0.045 : 0.025);
    const breathe = Math.sin(this.time * (1.2 + this.run.panic * 2)) * 0.006;
    this.camera.position.set(this.pos.x, PLAYER.eyeHeight + bobY + breathe, this.pos.z);

    // where are we: announce landmarks the first time, and a cold welcome in the crypt's second room
    const areaIndex = level.areas.findIndex((a) => a.contains(this.pos.x, this.pos.z));
    const key = `${level.layer}:${areaIndex}`;
    if (areaIndex >= 0 && !this.visitedAreas.has(key)) {
      this.visitedAreas.add(key);
      const area = level.areas[areaIndex];
      if (level.layer === 2 && areaIndex === 1) {
        this.sound.play('ghost_sting', 0.7);
        this.run = scare(this.run, 0.35);
      }
      if (area.arrival) { this.events.say(area.arrival); setTimeout(() => this.events.say(null), 4000); }
    }

    // knocking from graves you haven't dug out yet
    this.knockTimer -= dt;
    if (this.knockTimer <= 0) {
      this.knockTimer = 4 + Math.random() * 3;
      let loudest = 0;
      for (const it of level.interactables) {
        if (it.def.type !== 'survivor' || it.done) continue;
        const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
        loudest = Math.max(loudest, Math.max(0, 1 - d / 14));
      }
      if (loudest > 0.02) {
        this.sound.play('knock', loudest);
        if (loudest > 0.6) this.events.haptic('heavy');
      }
    }

    // dust drifting in the air-pocket shafts
    for (const d of level.dust) d.rotation.y += dt * 0.05;

    this.updateFocus();
    const it = this.focus;
    const pressed = this.input.interact && !this.interactWas;
    this.interactWas = this.input.interact;
    if (!it) return;
    const def = it.def;
    if (def.type === 'survivor' && this.input.interact) {
      it.progress = Math.min(1, it.progress + dt / DIG.survivor);
      it.object.scale.y = 1 - it.progress * 0.7;
      if (it.progress >= 1) this.freeSurvivor(it);
    } else if (pressed && def.type === 'clue' && !this.hands.busy) {
      const clue = CLUES.find((c) => c.id === def.clueId);
      const read = () => {
        if (!clue) return;
        if (!this.foundClues.includes(clue.id)) this.foundClues.push(clue.id);
        this.events.clue(clue);
      };
      it.done = true;
      if (def.item === 'stone') { this.sound.play('page', 0.4); read(); } // you read a gravestone where it stands
      else this.take(it, def.item === 'watch' ? 'watch' : 'paper', read);
    } else if (pressed && def.type === 'matches' && !this.hands.busy) {
      it.done = true;
      this.take(it, 'matches', () => {
        this.run = { ...this.run, matches: this.run.matches + def.count };
        this.events.say(`${def.count} match${def.count > 1 ? 'es' : ''}.`);
        setTimeout(() => this.events.say(null), 1800);
      });
    } else if (pressed && def.type === 'exit') {
      if (def.to === 3) this.goToCatacombs();
      else if (def.to === 4) this.goToNecropolis();
      else { this.run = { ...this.run, escaped: true }; this.endRun('escaped', def.to); }
    }
  }

  /** The Listener walks the maze toward the last sound it heard, and takes you if it reaches you. */
  private updateListener(dt: number) {
    const c = this.catacombs;
    if (!c || !this.listener) return;
    const before = { x: this.listener.x, z: this.listener.z };
    const r = stepListener(c.layout.maze, this.listener, dt, { x: this.pos.x, z: this.pos.z, noise: __DEV__ && this.listenerDeaf ? 0 : this.noise }, this.listenerRng);
    this.listener = r.state;
    const g = c.listener;
    const vx = r.state.x - before.x, vz = r.state.z - before.z;
    const moving = Math.hypot(vx, vz) > 1e-4;
    g.position.set(r.state.x, 0, r.state.z);
    // face where it walks; when it lunges, face you
    if (this.lunge > 0) g.rotation.y = Math.atan2(-(this.pos.x - r.state.x), -(this.pos.z - r.state.z));
    else if (moving) g.rotation.y = Math.atan2(-vx, -vz); // the model faces -z
    animateListener(c.listenerRig, { time: this.time, dt, mode: r.state.mode, moving, lunge: Math.min(1, this.lunge * 3) });

    const d = Math.hypot(this.pos.x - r.state.x, this.pos.z - r.state.z);
    const near = Math.max(0, 1 - d / 11);
    this.sound.setLoop('listener_breath_loop', Math.pow(near, 1.4) * 0.9, dt, 3);
    this.dragTimer -= dt;
    if (moving && this.dragTimer <= 0 && near > 0.05) {
      this.dragTimer = r.state.mode === 'hunt' ? 0.5 : 0.85;
      this.sound.playVariant('listener_step', near * 0.9);
      if (Math.random() < 0.3) this.sound.play('listener_drag', near * 0.5);
    }
    this.shriekCooldown -= dt;
    if (r.startedHunting && this.shriekCooldown <= 0) {
      this.shriekCooldown = 10;
      this.sound.play('listener_shriek', Math.max(0.5, near));
      this.run = scare(this.run, 0.5);
      this.events.haptic('heavy');
      this.events.say('It heard you.');
      setTimeout(() => this.events.say(null), 2500);
    }
    if (near > 0.75) this.run = { ...this.run, panic: Math.min(1, this.run.panic + dt * 0.15) };
    if (r.caught && this.lunge === 0) {
      // it lunges into your face before the screen cuts
      this.lunge = 0.0001;
      this.sound.play('listener_shriek', 1);
      this.events.haptic('heavy');
    }
    if (this.lunge > 0) {
      this.lunge += dt;
      const toward = new THREE.Vector3(this.pos.x - g.position.x, 0, this.pos.z - g.position.z);
      const dist = toward.length();
      if (dist > 0.55) g.position.addScaledVector(toward.normalize(), Math.min(dist - 0.55, dt * 3));
      this.shake = Math.max(this.shake, 0.6);
      if (this.lunge > 0.55) {
        this.flash = 0.35;
        this.shake = 1;
        this.endRun('taken', 3);
      }
    }
  }

  /** Reach out with the left hand, close it on the thing, bring it back up; `effect` runs once it is in hand. */
  private take(it: LiveInteractable, kind: PickupKind, effect: () => void) {
    const p = new THREE.Vector3();
    it.object.getWorldPosition(p);
    this.camera.worldToLocal(p);
    this.sound.play('reach', 0.6);
    this.hands.startPickup(kind, p.multiplyScalar(0.35), () => {
      it.object.visible = false;
      this.sound.play(kind === 'paper' ? 'take_paper' : kind === 'watch' ? 'take_metal' : 'take_matches', 0.8);
    }, effect);
  }

  /** The Hushmen walk their rounds, look with their lanterns, and come for you if they see you long enough. */
  private updateHushmen(dt: number) {
    const n = this.necropolis;
    if (!n) return;
    const player = { x: this.pos.x, z: this.pos.z, noise: this.noise, lit: this.run.matchTime > 0 || this.run.phoneOn, moving: Math.hypot(this.input.moveX, this.input.moveY) > 0.15 };
    if (__DEV__ && this.hushmenBlind) Object.assign(player, { x: 9999, z: 9999, noise: 0, lit: false }); // the recorder keeps them blind between staged moments
    let nearest = Infinity;
    let caught = false;
    this.hushmen = this.hushmen.map((h, i) => {
      const before = { x: h.x, z: h.z };
      const r = stepHushman(h, dt, player, n.layout.tombs);
      const rig = n.hushmen[i];
      const moving = Math.hypot(r.state.x - before.x, r.state.z - before.z) > 1e-4;
      rig.group.position.set(r.state.x, 0, r.state.z);
      rig.group.rotation.y = r.state.heading; // model and heading both face -z at 0
      animateHushman(rig, { time: this.time + i * 1.7, dt, mode: r.state.mode, moving, heading: r.state.heading, flicker: this.flick });
      const d = Math.hypot(this.pos.x - r.state.x, this.pos.z - r.state.z);
      nearest = Math.min(nearest, d);
      if (r.startedChase) {
        this.sound.play('hushman_alert', Math.max(0.6, 1 - d / 14));
        this.run = scare(this.run, 0.55);
        this.events.haptic('heavy');
        this.events.say(player.lit ? 'They saw your light.' : 'A lantern turns toward you.');
        setTimeout(() => this.events.say(null), 2500);
      }
      if (moving && Math.random() < dt * (r.state.mode === 'chase' ? 3 : 1.3) && d < 12) this.sound.playVariant('step_stone', Math.max(0, 1 - d / 12) * 0.5);
      caught ||= r.caught;
      return r.state;
    });
    this.sound.setLoop('hushman_chant_loop', Math.pow(Math.max(0, 1 - nearest / 13), 1.3) * 0.85, dt, 2);
    this.chantTimer -= dt;
    if (this.chantTimer <= 0 && nearest < 9) { this.chantTimer = 3 + Math.random() * 4; this.sound.play('lantern_creak', Math.max(0, 1 - nearest / 9) * 0.6); }
    // the fog drifts
    n.fog.forEach((f, k) => { const t = (f.material as THREE.MeshBasicMaterial).map!; t.offset.x += dt * 0.006 * (k + 1); t.offset.y += dt * 0.003 * (k % 2 ? -1 : 1); });
    if (caught && !this.ended) {
      this.flash = 0.35;
      this.shake = 1;
      this.events.haptic('heavy');
      this.endRun('taken', 4);
    }
  }

  private freeSurvivor(it: LiveInteractable) {
    it.done = true;
    const def = it.def as Extract<LiveInteractable['def'], { type: 'survivor' }>;
    if (def.trap) {
      this.sound.play('ghost_sting', 1);
      this.run = scare(this.run, 0.8);
      this.flash = 0.2;
      this.events.haptic('heavy');
      this.events.say('Empty. The knocking was never coming from in there.');
      setTimeout(() => this.events.say(null), 3500);
      return;
    }
    this.saved += 1;
    this.run = { ...this.run, matches: this.run.matches + 2 };
    this.sound.play('gasp', 0.7);
    const clue = def.clueId ? CLUES.find((c) => c.id === def.clueId) : undefined;
    if (clue) {
      if (!this.foundClues.includes(clue.id)) this.foundClues.push(clue.id);
      this.events.clue(clue);
    } else {
      this.events.say('A stranger gasps for air, presses two matches into your hand, and crawls away.');
      setTimeout(() => this.events.say(null), 4000);
    }
  }

  private updateFocus() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let best: LiveInteractable | null = null;
    let bestScore = Infinity;
    for (const it of this.level?.interactables ?? []) {
      if (it.done) continue;
      const dx = it.pos.x - this.pos.x, dz = it.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const range = it.def.type === 'exit' ? 2.2 : PLAYER.interactRange;
      if (d > range) continue;
      const facing = d < 0.5 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < 0.6) continue;
      if (d - facing < bestScore) { bestScore = d - facing; best = it; }
    }
    this.focus = best;
  }

  private updateLights(dt: number) {
    const r = this.run;
    const lit = r.matchTime > 0;
    const dying = Math.min(1, r.matchTime / 3);
    const flick = 1 + 0.18 * Math.sin(this.time * 23) + 0.1 * Math.sin(this.time * 37.3) + 0.06 * (Math.random() - 0.5);
    this.flick = flick;
    this.hands.flameOffset(this.match.position);
    // in the coffin the lid is a hand's width away: keep the light on your side of it
    if (this.phase === 'coffin') this.match.position.z = Math.max(this.match.position.z, -0.24);
    this.match.intensity = lit ? (this.phase === 'coffin' ? 2.2 : 9) * flick * (0.4 + 0.6 * dying) : 0;
    this.flame.visible = false; // the flame is drawn in the hand now
    this.flame.scale.setScalar(lit ? flick * (0.6 + 0.4 * dying) : 1);
    const low = r.battery < 0.15 && Math.random() < 0.08;
    this.phone.intensity = r.phoneOn && !low ? (this.phase === 'coffin' ? 3 : 26) * Math.min(1, 0.3 + r.battery * 3) : 0;

    const level = this.walking ? this.level : null;
    if (!level) { for (const l of this.pool) l.intensity = 0; return; }
    this.poolTimer -= dt;
    if (this.poolTimer <= 0) {
      // give the fixed light pool to the nearest lit props
      this.poolTimer = 0.4;
      const near = level.lit
        .map((p) => ({ p, d: Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, POOL);
      this.pool.forEach((l, i) => {
        const n = near[i];
        l.userData.src = n?.p;
        if (n) { l.position.copy(n.p.pos); l.color.setHex(n.p.color); }
      });
    }
    for (const l of this.pool) {
      const src = l.userData.src as Level['lit'][number] | undefined;
      l.intensity = src ? src.intensity * 6 * (src.flicker ? flick : 1) : 0;
    }
  }

  private updateAudio(dt: number, inPocket: boolean, exerting: boolean) {
    const r = this.run;
    const s = this.sound;
    const air = airFraction(r);
    s.setLoop('ambience_crypt_loop', this.walking ? 0.55 : 0.2, dt, 1);
    s.setLoop('breath_calm_loop', this.alive && !r.holdingBreath ? (1 - r.panic) * 0.55 : 0, dt);
    s.setLoop('breath_panic_loop', this.alive && !r.holdingBreath ? r.panic * 0.8 : 0, dt);
    s.setLoop('heartbeat', this.alive ? Math.min(1, Math.max(0, (0.45 - air) * 2) + r.panic * 0.35) : 0, dt);
    s.setLoop('match_burn_loop', r.matchTime > 0 ? 0.35 : 0, dt, 10);
    if (this.phase !== 'catacombs') s.setLoop('listener_breath_loop', 0, dt, 3);
    if (this.phase !== 'necropolis') s.setLoop('hushman_chant_loop', 0, dt, 2);
    let wind = inPocket ? 0.7 : 0;
    if (this.walking && this.level) {
      for (const a of this.level.airPockets) wind = Math.max(wind, 0.5 * Math.max(0, 1 - Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) / 6));
      const exit = this.level.interactables.find((i) => i.def.type === 'exit');
      if (exit) wind = Math.max(wind, 0.6 * Math.max(0, 1 - Math.hypot(exit.pos.x - this.pos.x, exit.pos.z - this.pos.z) / 8));
    }
    s.setLoop('wind_loop', wind, dt, 2);
    s.setLoop('dig_loop', 0, dt, 8); // digging is heard stroke by stroke now (see Hands.onDigStroke)
  }

  private pushHud() {
    const r = this.run;
    const f = this.walking ? this.focus : null;
    const prompt = this.phase === 'coffin' ? (this.lidProgress > 0 ? 'Push the lid' : 'Hold to push the lid') : f ? f.label : null;
    const action = this.phase === 'coffin' ? 'PUSH' : f ? actionVerb(f) : null;
    const holdAction = this.phase === 'coffin' || f?.def.type === 'survivor';
    const progress = this.phase === 'coffin' ? (this.lidProgress > 0 ? this.lidProgress : null) : f && f.def.type === 'survivor' && f.progress > 0 ? f.progress : null;
    const area = this.walking ? this.level?.areas.find((a) => a.contains(this.pos.x, this.pos.z)) : undefined;
    this.events.hud({
      phase: this.phase, air: airFraction(r), panic: r.panic, matches: r.matches, matchLit: r.matchTime > 0,
      battery: r.battery, phoneOn: r.phoneOn, prompt, action, holdAction, progress, room: area?.name ?? null,
      noise: this.phase === 'catacombs' || this.phase === 'necropolis' ? Math.min(1, this.noise / LOUDEST) : null,
      hunted: (this.phase === 'catacombs' && this.listener?.mode === 'hunt') || (this.phase === 'necropolis' && this.hushmen.some((h) => h.mode === 'chase')),
      seen: this.phase === 'necropolis' ? Math.max(0, ...this.hushmen.map((h) => h.suspicion)) : null,
      debug: __DEV__ ? `${this.renderer.width}x${this.renderer.height} → ${Math.round(this.renderer.width * this.renderer.scale)}x${Math.round(this.renderer.height * this.renderer.scale)} · ${this.fpsShown} fps` : null,
    });
  }
}

/** The verb on the action button for the thing in front of you. */
function actionVerb(it: LiveInteractable): string {
  const d = it.def;
  switch (d.type) {
    case 'survivor': return 'DIG';
    case 'matches': return 'TAKE';
    case 'exit': return 'CLIMB';
    case 'clue': return d.item === 'page' || d.item === 'stone' ? 'READ' : 'PICK UP';
  }
}

/** Push a circle out of axis-aligned boxes on the floor plane. */
function collide(p: THREE.Vector3, radius: number, boxes: Box[]) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * radius;
        p.z = cz + (dz / d) * radius;
      } else {
        // centre inside the box: leave by the nearest face
        const out = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
        const m = out.indexOf(Math.min(...out));
        if (m === 0) p.x = b.minX - radius; else if (m === 1) p.x = b.maxX + radius;
        else if (m === 2) p.z = b.minZ - radius; else p.z = b.maxZ + radius;
      }
    }
  }
}
