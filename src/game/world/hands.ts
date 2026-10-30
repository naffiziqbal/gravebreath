// First-person hands, drawn in their own pass on top of the world so they never clip into walls.
// Camera space: x right, y up, the view looks down -z. Each hand is a jointed rig whose fingers curl.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Assets } from '../engine/assets';
import { materialFrom } from '../engine/renderer';
import { clodGeometry } from './builder';

export type HandsInput = {
  phase: string;
  moving: number; // 0..1
  bob: number; // the head-bob phase, so the hands sway in step
  matchLit: boolean;
  matchLife: number; // 1 fresh .. 0 burnt out
  phoneOn: boolean;
  pushing: boolean;
  digging: boolean;
  holdingBreath: boolean;
  calming: boolean;
  panic: number;
};

export type PickupKind = 'paper' | 'watch' | 'matches';

type Pose = { pos: THREE.Vector3; rot: THREE.Euler; curl: number };
/** Palm toward your face, fingers pointing across: the hand clamped over your mouth. */
const MOUTH = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0)), 'YXZ');
const pose = (x: number, y: number, z: number, rx: number, ry: number, rz: number, curl: number): Pose =>
  ({ pos: new THREE.Vector3(x, y, z), rot: new THREE.Euler(rx, ry, rz, 'YXZ'), curl });

export type HandData = { buffer: ArrayBuffer; bones: { name: string; parent: number; pos: number[] }[] };

/** One hand: a single sculpted, skinned mesh (tools/make_hand.py) on a 16-bone skeleton, plus a forearm in a shroud sleeve. Right-handed; mirrored for the left. */
class HandRig {
  readonly root = new THREE.Group();
  private joints: THREE.Bone[][] = [];
  private thumb: THREE.Bone[] = [];
  readonly grip = new THREE.Group(); // where held things go: between thumb and fingers
  private cur: Pose = pose(0, -0.4, -0.3, 0, 0, 0, 0.4);

  constructor(data: HandData, skin: THREE.Material, armSkin: THREE.Material, sleeve: THREE.Material, mirror: boolean) {
    const wrist = new THREE.Group();
    this.root.add(wrist);
    this.root.scale.setScalar(0.9);
    if (mirror) this.root.scale.x = -0.9;

    // bones: rest pose has no rotation, each bone sits at its joint
    const bones = data.bones.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
    data.bones.forEach((b, i) => {
      const p = b.parent >= 0 ? data.bones[b.parent].pos : [0, 0, 0];
      bones[i].position.set(b.pos[0] - p[0], b.pos[1] - p[1], b.pos[2] - p[2]);
      if (b.parent >= 0) bones[b.parent].add(bones[i]);
    });
    for (const f of ['index', 'middle', 'ring', 'pinky']) this.joints.push([0, 1, 2].map((k) => bones.find((b) => b.name === `${f}${k}`)!));
    this.thumb = [0, 1, 2].map((k) => bones.find((b) => b.name === `thumb${k}`)!);

    const geo = readHandGeometry(data.buffer);
    const mesh = new THREE.SkinnedMesh(geo, skin);
    mesh.add(bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false;
    wrist.add(mesh);

    this.grip.position.set(-0.04, -0.022, -0.112);
    bones[0].add(this.grip);
    // forearm and a frayed shroud sleeve, on their own joint so the wrist can bend (see aimArm)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0235, 0.2, 4, 12), armSkin);
    arm.scale.set(1, 0.78, 1);
    arm.rotation.x = Math.PI / 2; arm.position.set(0, 0, 0.11);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.047, 0.3, 14, 1, true), sleeve);
    cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 0, 0.21);
    this.forearm.add(arm, cuff);
    wrist.add(this.forearm);
  }

  private forearm = new THREE.Group();
  private static readonly back = new THREE.Vector3(0, 0, 1);

  /** The forearm always runs from the wrist back and down out of view, whatever angle the hand is at. */
  private aimArm() {
    this.root.updateMatrixWorld(true);
    const p = this.cur.pos;
    const dir = new THREE.Vector3(p.x * 0.6, -0.75 - p.y, 0.9).normalize(); // toward the bottom edge of the view
    // into the hand's own frame (undoing its rotation, and the mirror for the left hand)
    const inv = new THREE.Quaternion();
    this.root.getWorldQuaternion(inv).invert();
    dir.applyQuaternion(inv);
    if (this.root.scale.x < 0) dir.x = -dir.x;
    this.forearm.quaternion.setFromUnitVectors(HandRig.back, dir);
  }

  /** World position of a fingertip: the end of a finger's last bone. */
  tip(finger: 'index' | 'thumb', out: THREE.Vector3) {
    const last = finger === 'thumb' ? this.thumb[2] : this.joints[0][2];
    const prev = finger === 'thumb' ? this.thumb[1] : this.joints[0][1];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    prev.getWorldPosition(a); last.getWorldPosition(b);
    return out.copy(b).addScaledVector(b.clone().sub(a).normalize(), (finger === 'thumb' ? 0.019 : 0.017) * 0.9);
  }

  /** Spring the hand toward a pose. */
  drive(target: Pose, dt: number, stiffness = 10) {
    const k = 1 - Math.exp(-stiffness * dt);
    this.cur.pos.lerp(target.pos, k);
    this.cur.rot.set(
      this.cur.rot.x + (target.rot.x - this.cur.rot.x) * k,
      this.cur.rot.y + (target.rot.y - this.cur.rot.y) * k,
      this.cur.rot.z + (target.rot.z - this.cur.rot.z) * k,
    );
    this.cur.curl += (target.curl - this.cur.curl) * k;
    this.root.position.copy(this.cur.pos);
    this.root.rotation.copy(this.cur.rot);
    const c = this.cur.curl;
    this.joints.forEach((chain, i) => {
      const spread = (i - 1.5) * 0.07 * (1 - c);
      const ci = Math.min(1, c * (0.82 + i * 0.09) + 0.06 * i); // a relaxed hand is never perfectly flat
      chain[0].rotation.set(-ci * 1.25, spread, 0);
      chain[1].rotation.x = -ci * 1.5 - 0.08;
      chain[2].rotation.x = -ci * 0.95 - 0.05;
    });
    this.thumb[1].rotation.x = -c * 0.6;
    this.thumb[2].rotation.x = -c * 0.7;
    this.aimArm();
  }

  get position() { return this.cur.pos; }
}

/** hand.bin: V, F, then positions, normals, uvs, colours (f32), skin indices (u16 x4), skin weights (f32 x4), triangles (u32). */
function readHandGeometry(buf: ArrayBuffer) {
  const head = new Uint32Array(buf, 0, 2);
  const V = head[0], F = head[1];
  let o = 8;
  const f32 = (n: number) => { const a = new Float32Array(buf.slice(o, o + n * 4)); o += n * 4; return a; };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(f32(V * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(f32(V * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(f32(V * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(f32(V * 3), 3));
  const si = new Uint16Array(buf.slice(o, o + V * 8)); o += V * 8;
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(f32(V * 4), 4));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf.slice(o, o + F * 12)), 1));
  return g;
}

export class Hands {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private right!: HandRig;
  private left!: HandRig;
  private match = new THREE.Group();
  private flame!: THREE.Mesh;
  private phone = new THREE.Group();
  private screen!: THREE.MeshBasicMaterial;
  private held: Record<PickupKind, THREE.Object3D> = {} as never;
  private matchLight = new THREE.PointLight(0xffa25a, 0, 0, 2);
  private phoneLight = new THREE.PointLight(0xbfd6ff, 0, 0, 2);
  private clods!: THREE.InstancedMesh;
  private spray: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; life: number }[] = [];
  private time = 0;
  private digPhase = 0;
  private pushPhase = 0;
  private pickup: { t: number; target: THREE.Vector3; kind: PickupKind; grabbed: boolean; onGrab(): void; onDone(): void } | null = null;
  onDigStroke: (hand: 'left' | 'right') => void = () => {};
  onPushStroke: () => void = () => {};

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(66, aspect, 0.01, 5);
    this.scene.add(this.camera, new THREE.HemisphereLight(0x3a3440, 0x0a0806, 0.35), this.matchLight, this.phoneLight);
  }

  async init(assets: Assets) {
    const [dirt, linen, hand] = await Promise.all([assets.materialMaps('grave_dirt'), assets.materialMaps('coffin_linen'), assets.handData()]);
    // flesh, with grime painted into the creases and nails (vertex colours) and only a faint pore/dirt relief
    const skinOpts = { color: 0xc08f78, roughness: 0.62, normalMap: dirt.normalMap, normalScale: new THREE.Vector2(0.18, 0.18) };
    const skin = new THREE.MeshStandardMaterial({ ...skinOpts, vertexColors: true });
    const armSkin = new THREE.MeshStandardMaterial({ ...skinOpts, color: 0xb88a74 });
    const sleeve = materialFrom(linen, 2, 2, { tint: 0x6f665c });
    sleeve.side = THREE.DoubleSide;
    this.right = new HandRig(hand, skin, armSkin, sleeve, false);
    this.left = new HandRig(hand, skin, armSkin, sleeve, true);
    this.scene.add(this.right.root, this.left.root);

    // the match: a thin stick pinched in the right hand, flame at the tip
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.05, 6), new THREE.MeshStandardMaterial({ color: 0xe0c08a, roughness: 0.8, emissive: 0x2a1406 }));
    stick.position.y = 0.022;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a1410 }));
    head.position.y = 0.047;
    this.flame = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.4), transparent: true, opacity: 0.95 }));
    this.flame.scale.set(0.7, 1.6, 0.7);
    this.flame.position.y = 0.058;
    this.match.add(stick, head, this.flame);
    this.scene.add(this.match); // placed in the thumb-index pinch every frame (see update)

    // the phone: dark slab, the screen lit and blank
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.068, 0.006, 0.14, 2, 0.003), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.3 }));
    this.screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.7, 0.95) });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.128), this.screen);
    glass.rotation.x = -Math.PI / 2; glass.position.y = 0.0032;
    this.phone.add(body, glass);
    this.phone.position.set(0.012, 0.02, 0.02);
    this.right.grip.add(this.phone);

    // things you pick up, shown in the left hand
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.095), new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 0.95, side: THREE.DoubleSide }));
    paper.rotation.set(-Math.PI / 2 + 0.3, 0, 0.2);
    const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 18), new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.9, roughness: 0.35 }));
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.016, 0.034, 2, 0.003), new THREE.MeshStandardMaterial({ color: 0x6e2016, roughness: 0.8 }));
    this.held = { paper, watch, matches: box };
    for (const o of Object.values(this.held)) { o.visible = false; this.left.grip.add(o); }

    this.clods = new THREE.InstancedMesh(clodGeometry(0.009, 4), materialFrom(dirt, 0.6, 0.6, { tint: 0x9a8270 }), 40);
    this.clods.count = 0;
    this.clods.frustumCulled = false;
    this.scene.add(this.clods);
  }

  setAspect(a: number) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  /** Reach out and take something; `target` is in camera space. */
  startPickup(kind: PickupKind, target: THREE.Vector3, onGrab: () => void, onDone: () => void) {
    const t = target.clone();
    t.x = Math.max(-0.1, Math.min(0.08, t.x)); t.y = Math.max(-0.15, Math.min(-0.05, t.y)); t.z = Math.max(-0.38, Math.min(-0.27, t.z));
    this.pickup = { t: 0, target: t, kind, grabbed: false, onGrab, onDone };
  }

  get busy() { return !!this.pickup; }

  update(dt: number, s: HandsInput, matchFlicker: number) {
    if (__DEV__) s = { ...s, ...(globalThis as { __handsState?: Partial<HandsInput> }).__handsState }; // live testing from the console
    this.time += dt;
    const t = this.time;
    const sway = Math.sin(s.bob) * 0.012 * s.moving, swayX = Math.cos(s.bob * 0.5) * 0.008 * s.moving;
    const breathe = Math.sin(t * (1.3 + s.panic * 2.5)) * 0.004 + (Math.random() - 0.5) * 0.0015 * s.panic; // trembling when afraid
    const walkingPhase = s.phase === 'crypt' || s.phase === 'catacombs';

    // ---------------- right hand: the light, or pushing / digging
    let R: Pose, L: Pose;
    const rest = pose(0.2, -0.36, -0.3, -0.5, 0.2, 0.15, 0.45);
    const restL = pose(-0.2, -0.36, -0.3, -0.5, -0.2, -0.15, 0.45);
    if (s.pushing) {
      // both palms flat on the lid, straining in rhythm
      this.pushPhase += dt * 2.2;
      const strain = Math.max(0, Math.sin(this.pushPhase * Math.PI));
      if (Math.floor(this.pushPhase) !== Math.floor(this.pushPhase - dt * 2.2)) this.onPushStroke();
      const shake = (Math.random() - 0.5) * 0.004 * (0.4 + strain);
      R = pose(0.085 + shake, -0.11, -0.265 - strain * 0.018, 1.4, -0.2, -0.12, 0.18);
      L = pose(-0.095 - shake, -0.125, -0.265 - strain * 0.018, 1.4, 0.2, 0.12, 0.18);
    } else if (s.digging) {
      // alternate claws: reach into the soil, drag it back, throw it aside
      const prev = this.digPhase;
      this.digPhase += dt * 1.25;
      const claw = (ph: number, side: number): Pose => {
        const c = ph % 1;
        // reach: fingers spread, raking forward into the soil
        if (c < 0.4) { const k = c / 0.4; return pose(side * 0.075, -0.05 - k * 0.05, -0.27 - k * 0.1, -0.3 - k * 0.3, side * 0.18, side * 0.1, 0.2 + k * 0.15); }
        // drag: fingers hooked, pulling the earth back toward you
        if (c < 0.75) { const k = (c - 0.4) / 0.35; return pose(side * (0.075 + k * 0.03), -0.1 + k * 0.01, -0.37 + k * 0.14, -0.6 + k * 0.35, side * 0.18, side * 0.1, 0.35 + k * 0.45); }
        // throw it aside and come back up
        const k = (c - 0.75) / 0.25; return pose(side * (0.105 + k * 0.05), -0.09 + k * 0.04, -0.23 - k * 0.04, -0.25 - k * 0.05, side * (0.18 + k * 0.3), side * 0.1, 0.8 - k * 0.6);
      };
      R = claw(this.digPhase, 1); L = claw(this.digPhase + 0.5, -1);
      for (const [ph, side, name] of [[this.digPhase, 1, 'right'], [this.digPhase + 0.5, -1, 'left']] as const) {
        const before = (prev + (ph - this.digPhase)) % 1, now = ph % 1;
        if (before < 0.75 && now >= 0.75) { this.onDigStroke(name); this.throwSoil(side === 1 ? this.right.position : this.left.position, side); }
      }
    } else {
      if (s.matchLit) R = pose(0.08 + swayX, -0.15 + sway + breathe, -0.25, 0.15, 0.55, -1.15, 0.55);
      else if (s.phoneOn) R = pose(0.11 + swayX, -0.2 + sway + breathe, -0.29, -0.55, 0.2, -0.15, 0.62);
      else R = rest;
      // calming: the free hand settles on the chest; holding breath: it clamps over the mouth
      if (s.holdingBreath) L = { pos: new THREE.Vector3(-0.05, -0.17, -0.13), rot: MOUTH.clone(), curl: 0.2 };
      else if (s.calming) L = pose(-0.09, -0.27 + breathe * 2, -0.2, -0.9, -0.2, 0.4, 0.3);
      else L = walkingPhase && s.moving > 0.1 ? pose(-0.17 - swayX, -0.3 - sway, -0.28, -0.6, -0.25, -0.2, 0.5) : restL;
    }

    // dev only: poses can be tuned live from the browser console via globalThis.__pose
    const dbg = __DEV__ ? (globalThis as { __pose?: { R?: number[]; L?: number[]; grip?: number[] } }).__pose : undefined;
    if (dbg?.R) R = pose(...(dbg.R as [number, number, number, number, number, number, number]));
    if (dbg?.L) L = pose(...(dbg.L as [number, number, number, number, number, number, number]));
    if (dbg?.grip) this.right.grip.position.set(dbg.grip[0], dbg.grip[1], dbg.grip[2]);

    // ---------------- left hand: picking things up overrides everything except pushing and digging
    const p = this.pickup;
    if (p && !s.pushing && !s.digging) {
      p.t += dt / 1.15;
      const show = pose(-0.04, -0.1, -0.22, -0.2, 0.25, 0.55, 0.75); // bring it up to look at it
      if (p.t < 0.42) {
        const k = p.t / 0.42;
        L = pose(p.target.x, p.target.y + 0.03 * (1 - k), p.target.z, -0.9, 0, 0, 0.1);
      } else if (p.t < 0.55) {
        L = pose(p.target.x, p.target.y, p.target.z, -0.9, 0, 0, 0.8);
        if (!p.grabbed) { p.grabbed = true; this.held[p.kind].visible = true; p.onGrab(); }
      } else if (p.t < 0.9) {
        L = show;
      } else {
        L = restL;
        if (p.t >= 1) { this.held[p.kind].visible = false; this.pickup = null; p.onDone(); }
      }
      this.left.drive(L, dt, p.t < 0.55 ? 9 : 7);
    } else {
      this.left.drive(L, dt, s.holdingBreath ? 14 : 8);
    }
    this.right.drive(R, dt, s.pushing || s.digging ? 16 : 9);

    // ---------------- held light: the match stays upright and the phone screen faces you, whatever the wrist does
    this.right.root.updateMatrixWorld(true);
    const grip = new THREE.Quaternion();
    this.right.grip.getWorldQuaternion(grip).invert();
    // the match: pinched between thumb tip and index fingertip, held upright, a few millimetres of stick below the fingers
    const it = new THREE.Vector3(), th = new THREE.Vector3();
    this.right.tip('index', it); this.right.tip('thumb', th);
    this.match.position.copy(it).lerp(th, 0.45).add(new THREE.Vector3(0, -0.008, 0));
    this.match.quaternion.setFromEuler(new THREE.Euler(0.1, 0, -0.22));
    this.phone.quaternion.copy(grip).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(1.15, 0.1, 0.12)));
    this.match.visible = s.matchLit && !s.pushing && !s.digging;
    this.phone.visible = !this.match.visible && s.phoneOn && !s.pushing && !s.digging;
    this.flame.scale.set(0.7 * matchFlicker, 1.6 * matchFlicker * (0.6 + 0.4 * s.matchLife), 0.7 * matchFlicker);
    const fp = new THREE.Vector3();
    this.flame.getWorldPosition(fp);
    this.matchLight.position.copy(fp);
    if (!this.match.visible && s.matchLit) this.matchLight.position.set(0.04, -0.02, -0.12); // dropped beside you, still burning
    this.matchLight.intensity = s.matchLit ? (this.match.visible ? 0.07 : 0.05) * matchFlicker * (0.4 + 0.6 * s.matchLife) : 0;
    this.phone.getWorldPosition(fp);
    this.phoneLight.position.copy(fp).add(new THREE.Vector3(0, 0.03, 0));
    this.phoneLight.intensity = this.phone.visible ? 0.05 : 0;

    // ---------------- soil thrown while digging
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    this.spray = this.spray.filter((c) => (c.life -= dt) > 0);
    this.spray.forEach((c, i) => {
      c.v.y -= 2.5 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += dt * 6; c.r.z += dt * 4;
      this.clods.setMatrixAt(i, m.compose(c.p, q.setFromEuler(c.r), one));
    });
    this.clods.count = this.spray.length;
    this.clods.instanceMatrix.needsUpdate = true;
  }

  private throwSoil(from: THREE.Vector3, side: number) {
    for (let k = 0; k < 6 && this.spray.length < 40; k++) {
      this.spray.push({
        p: from.clone().add(new THREE.Vector3(0, 0, -0.06)),
        v: new THREE.Vector3(side * (0.25 + Math.random() * 0.3), 0.15 + Math.random() * 0.25, 0.1 + Math.random() * 0.2),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        life: 0.55 + Math.random() * 0.3,
      });
    }
  }

  /** Where the match flame is, in camera space, so the world light can sit at the same spot. */
  flameOffset(out: THREE.Vector3) {
    return this.flame.getWorldPosition(out);
  }
}
