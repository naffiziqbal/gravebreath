// Turns layout data into three.js scenes: the coffin you wake in, and the crypt rooms of layer 2.
import * as THREE from 'three';
import type { Assets } from '../engine/assets';
import { materialFrom } from '../engine/renderer';
import type { ModelName } from '../engine/manifest';
import { BLOCKING, FOOTPRINT, type Interactable, type Layout, type PropKind, type Room } from '../sim/layout';
import { CLUES } from '../data/clues';
import { RENDER } from '../config';

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

export type LitPoint = { pos: THREE.Vector3; color: number; intensity: number; flicker: boolean };

export type LiveInteractable = {
  def: Interactable;
  pos: THREE.Vector3;
  object: THREE.Object3D;
  label: string;
  done: boolean;
  progress: number; // 0..1 for things you dig
  roomIndex: number;
};

/** A named part of a level, shown on the HUD; landmarks are the fixed places players learn. */
export type Area = { name: string; landmark: boolean; arrival?: string; contains(x: number, z: number): boolean };

/** Anything you walk around in: the crypt (layer 2), the catacombs (layer 3). */
export type Level = {
  layer: number;
  scene: THREE.Scene;
  colliders: Box[];
  lit: LitPoint[];
  interactables: LiveInteractable[];
  airPockets: { pos: THREE.Vector3; radius: number }[];
  dust: THREE.Points[];
  spawn: { pos: THREE.Vector3; yaw: number };
  /** checked in order; the first match names where you are */
  areas: Area[];
};

export type Crypt = Level & { rooms: Room[] };

export type Coffin = {
  scene: THREE.Scene;
  cracks: THREE.MeshBasicMaterial;
  lid: THREE.Mesh;
  dirt: THREE.Points;
  clods: THREE.InstancedMesh;
  chestMound: THREE.Mesh;
  /** coffin interior bounds in the upright frame (see buildCoffin) */
  bounds: { halfWidth: number; top: number; bottom: number; lid: number };
};

/** A lumpy low-poly lump of earth: an icosphere with its vertices pushed in and out. */
export function clodGeometry(radius: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  let a = seed;
  const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const v = new THREE.Vector3();
  // displace each unique position the same way so the surface stays closed
  const seen = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    let k = seen.get(key);
    if (k === undefined) { k = 0.65 + rand() * 0.6; seen.set(key, k); }
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y * 0.8, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A heap of loose soil: a flattened dome with a lumpy surface. */
export function moundGeometry(radius: number, height: number, seed: number) {
  const g = new THREE.SphereGeometry(radius, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  let a = seed;
  const rand = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const bumps = Array.from({ length: 9 }, () => ({ x: (rand() - 0.5) * radius * 1.6, z: (rand() - 0.5) * radius * 1.6, r: radius * (0.15 + rand() * 0.25), h: 0.15 + rand() * 0.3 }));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let lift = 0;
    for (const b of bumps) lift += b.h * Math.exp(-((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r));
    const t = y / radius; // 0 at the rim, 1 at the top
    pos.setY(i, (t * (1 + lift * 0.6) + (rand() - 0.5) * 0.05 * t) * height);
  }
  g.computeVertexNormals();
  return g;
}

const PROP_MODEL: Record<PropKind, ModelName> = {
  candlestick: 'wooden_candlestick', candleholders: 'brass_candleholders', lantern: 'Lantern_01',
  oilLamp: 'vintage_oil_lamp', crowbar: 'crowbar_01', spade: 'rusted_spade_01', roots: 'root_cluster_01',
  statue: 'gothic_statue', bust: 'marble_bust_01', lionHead: 'lion_head', crate: 'old_military_crate',
  bucket: 'wooden_bucket_01', rocks: 'rock_moss_set_01', boulder: 'boulder_01', books: 'book_encyclopedia_set_01',
};
// props that block movement
const SOLID = BLOCKING;


const DOOR_W = 1.2;
const DOOR_H = 2.1;

/** Scale a model down to a floor footprint, centre it on its origin and stand it on y = 0. */
export function fitFootprint(model: THREE.Object3D, maxFootprint?: number, extraScale = 1) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = (maxFootprint ? Math.min(1, maxFootprint / Math.max(size.x, size.z)) : 1) * extraScale;
  model.scale.multiplyScalar(k);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  model.userData.height = size.y * k;
}

export function plane(w: number, h: number, mat: THREE.Material) {
  const geo = new THREE.PlaneGeometry(w, h);
  geo.setAttribute('uv1', geo.attributes.uv); // aoMap reads uv channel 0 in three r15x+, keep both for safety
  return new THREE.Mesh(geo, mat);
}

export function darkScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, RENDER.fogDensity);
  scene.add(new THREE.HemisphereLight(0x23293a, 0x060404, 0.12));
  return scene;
}

// ------------------------------------------------------------------ coffin
export async function buildCoffin(assets: Assets, decals: { scratches: number; cracks: number }): Promise<Coffin> {
  const scene = darkScene();
  scene.fog = new THREE.FogExp2(0x000000, 0.05);
  const wood = await assets.materialMaps('coffin_wood');
  const linen = await assets.materialMaps('coffin_linen');
  // upright frame: the camera sits at the origin looking at the lid along -z; your feet point down -y
  const W = 0.62, TOP = 0.34, BOTTOM = -1.7, LID = -0.32, BACK = 0.16;
  const len = TOP - BOTTOM, depth = BACK - LID;

  const lidMat = materialFrom(wood, 0.6, 1.8, { normalScale: 1.4 });
  const lid = plane(W, len, lidMat);
  lid.position.set(0, (TOP + BOTTOM) / 2, LID);
  scene.add(lid);
  const side = materialFrom(wood, depth / 0.8, len / 0.8, { tint: 0x9a8a7a });
  for (const sx of [-1, 1]) {
    const m = plane(depth, len, side);
    m.rotation.y = -sx * Math.PI / 2;
    m.position.set(sx * W / 2, (TOP + BOTTOM) / 2, (LID + BACK) / 2);
    scene.add(m);
  }
  const head = plane(W, depth, side);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, TOP, (LID + BACK) / 2);
  scene.add(head);
  const feet = plane(W, depth, side);
  feet.rotation.x = -Math.PI / 2;
  feet.position.set(0, BOTTOM, (LID + BACK) / 2);
  scene.add(feet);
  const lining = plane(W, len, materialFrom(linen, 1, 3, { tint: 0x8c7f70 }));
  lining.rotation.y = Math.PI;
  lining.position.set(0, (TOP + BOTTOM) / 2, BACK);
  scene.add(lining);

  // decals are lit like the wood under them, so the warning only shows when you have light
  const scratchMat = new THREE.MeshStandardMaterial({ map: await assets.texture(decals.scratches, true), transparent: true, depthWrite: false, roughness: 0.9 });
  const scratches = plane(W * 0.9, W * 1.8, scratchMat);
  scratches.position.set(0, -0.12, LID + 0.002);
  scratches.name = 'scratches';
  scene.add(scratches);
  const cracks = new THREE.MeshBasicMaterial({ map: await assets.texture(decals.cracks, true), transparent: true, opacity: 0, depthWrite: false });
  const crackMesh = plane(W * 0.95, W * 1.9, cracks);
  crackMesh.position.set(0, -0.1, LID + 0.003);
  scene.add(crackMesh);

  // 3D clods of earth that break through the cracks and land on you
  const dirtMaps = await assets.materialMaps('grave_dirt');
  const soilMat = materialFrom(dirtMaps, 0.6, 0.6, { tint: 0x9a8270 });
  const clods = new THREE.InstancedMesh(clodGeometry(0.011, 7), soilMat, 90);
  clods.count = 0;
  clods.frustumCulled = false;
  scene.add(clods);
  // the heap that builds up on your chest, just below your line of sight
  const chestMound = new THREE.Mesh(moundGeometry(0.2, 0.09, 11), materialFrom(dirtMaps, 1.2, 1.2, { tint: 0x8a7462 }));
  chestMound.rotation.x = -Math.PI / 2; // the dome rises toward the lid (-z in this frame)
  chestMound.position.set(0, -0.4, -0.03);
  chestMound.scale.setScalar(0.001);
  scene.add(chestMound);

  // fine dust that trickles with the clods
  const n = 300;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * W * 0.8;
    pos[i * 3 + 1] = -0.1 + (Math.random() - 0.5) * 0.9;
    pos[i * 3 + 2] = LID + 0.01;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // fixed pixel size: perspective-sized points balloon into squares when they fall close to the lens
  const dirt = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x2a1d12, size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(dirt);
  return { scene, cracks, lid, dirt, clods, chestMound, bounds: { halfWidth: W / 2, top: TOP, bottom: BOTTOM, lid: LID } };
}

// ------------------------------------------------------------------ crypt
export async function buildCrypt(assets: Assets, layout: Layout): Promise<Crypt> {
  const scene = darkScene();
  const [wallMaps, floorMaps, rockMaps, woodMaps, stoneMaps] = await Promise.all([
    assets.materialMaps('crypt_wall'), assets.materialMaps('crypt_floor'), assets.materialMaps('catacomb_rock'),
    assets.materialMaps('coffin_wood'), assets.materialMaps('tomb_stone'),
  ]);
  const colliders: Box[] = [];
  const lit: LitPoint[] = [];
  const interactables: LiveInteractable[] = [];
  const airPockets: Crypt['airPockets'] = [];
  const dust: THREE.Points[] = [];
  const coffinEndMat = materialFrom(woodMaps, 0.5, 0.4, { tint: 0x8a7766 });
  const frameMat = materialFrom(stoneMaps, 0.6, 0.3);

  const wall = (w: number, h: number, x: number, y: number, z: number, rotY: number, maps = wallMaps) => {
    const m = plane(w, h, materialFrom(maps, w / 2, h / 2));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
  };
  const floor = (w: number, d: number, x: number, z: number, y = 0, ceiling = false) => {
    const m = plane(w, d, materialFrom(ceiling ? rockMaps : floorMaps, w / 1.6, d / 1.6, { tint: ceiling ? 0x6a6560 : 0xffffff }));
    m.rotation.x = ceiling ? Math.PI / 2 : -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
  };
  // a wall across x at depth z, with an optional doorway in the middle
  const crossWall = (width: number, height: number, z: number, facing: 1 | -1, door: boolean) => {
    const rot = facing === 1 ? 0 : Math.PI;
    if (!door) {
      wall(width, height, 0, height / 2, z, rot);
      colliders.push({ minX: -width / 2, maxX: width / 2, minZ: z - 0.1, maxZ: z + 0.1 });
      return;
    }
    const seg = (width - DOOR_W) / 2;
    wall(seg, height, -(DOOR_W / 2 + seg / 2), height / 2, z, rot);
    wall(seg, height, DOOR_W / 2 + seg / 2, height / 2, z, rot);
    wall(DOOR_W, height - DOOR_H, 0, DOOR_H + (height - DOOR_H) / 2, z, rot);
    colliders.push({ minX: -width / 2, maxX: -DOOR_W / 2, minZ: z - 0.1, maxZ: z + 0.1 });
    colliders.push({ minX: DOOR_W / 2, maxX: width / 2, minZ: z - 0.1, maxZ: z + 0.1 });
  };

  const rooms = layout.rooms;
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    const back = r.z + r.depth / 2, front = r.z - r.depth / 2;
    floor(r.width, r.depth, 0, r.z);
    floor(r.width, r.depth, 0, r.z, r.height, true);
    wall(r.depth, r.height, -r.width / 2, r.height / 2, r.z, Math.PI / 2);
    wall(r.depth, r.height, r.width / 2, r.height / 2, r.z, -Math.PI / 2);
    colliders.push({ minX: -r.width / 2 - 0.2, maxX: -r.width / 2, minZ: front, maxZ: back });
    colliders.push({ minX: r.width / 2, maxX: r.width / 2 + 0.2, minZ: front, maxZ: back });
    crossWall(r.width, r.height, back, 1, i > 0);
    crossWall(r.width, r.height, front, -1, true);

    // coffin ends in the wall niches, two tiers
    for (const n of r.niches) {
      const sx = n.side === 'left' ? -1 : 1;
      for (const y of [0.75, 1.55]) {
        const end = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.68), coffinEndMat);
        end.position.set(sx * (r.width / 2 - 0.08), y, r.z + n.along);
        scene.add(end);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.66, 0.84), frameMat);
        frame.position.set(sx * (r.width / 2 - 0.02), y, r.z + n.along);
        scene.add(frame);
      }
    }

    // props from the room kit
    for (const p of r.props) {
      const model = await assets.model(PROP_MODEL[p.kind]);
      model.rotation.y = p.rotY;
      fitFootprint(model, FOOTPRINT[p.kind], p.scale);
      model.position.x += p.x;
      model.position.z += p.z;
      if (p.kind === 'lionHead') model.position.y += 1.8;
      if (p.kind === 'lionHead') model.position.x = Math.sign(p.x) * (r.width / 2 - 0.15);
      if (p.kind === 'roots') {
        // roots push down through the ceiling
        model.rotation.x = Math.PI;
        model.position.y = r.height + (model.userData.height as number) * 0.15;
      }
      scene.add(model);
      if (SOLID.includes(p.kind)) {
        const b = new THREE.Box3().setFromObject(model);
        colliders.push({ minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z });
      }
      if (p.lit) {
        const b = new THREE.Box3().setFromObject(model);
        lit.push({ pos: new THREE.Vector3(p.x, b.max.y + 0.05, p.z), color: 0xff9a4a, intensity: 1.6, flicker: true });
      }
    }

    if (r.airPocket) {
      const ap = r.airPocket;
      airPockets.push({ pos: new THREE.Vector3(ap.x, 0, ap.z), radius: ap.radius });
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, ap.radius, r.height, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      shaft.position.set(ap.x, r.height / 2, ap.z);
      scene.add(shaft);
      lit.push({ pos: new THREE.Vector3(ap.x, r.height - 0.1, ap.z), color: 0x9fbaff, intensity: 0.9, flicker: false });
      const count = 120;
      const pts = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * ap.radius * 0.8;
        pts[k * 3] = ap.x + Math.cos(a) * rad; pts[k * 3 + 1] = Math.random() * r.height; pts[k * 3 + 2] = ap.z + Math.sin(a) * rad;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const d = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb8c8ff, size: 0.015, transparent: true, opacity: 0.6, depthWrite: false }));
      scene.add(d);
      dust.push(d);
    }

    for (const it of r.interactables) interactables.push(await buildInteractable(assets, scene, it, i, r, { woodMaps, stoneMaps, wallMaps }, lit, colliders));

    // passage to the next room
    if (i < rooms.length - 1) {
      const next = rooms[i + 1];
      const z0 = front, z1 = next.z + next.depth / 2;
      const len = z0 - z1, mid = (z0 + z1) / 2;
      floor(DOOR_W, len, 0, mid);
      floor(DOOR_W, len, 0, mid, DOOR_H, true);
      wall(len, DOOR_H, -DOOR_W / 2, DOOR_H / 2, mid, Math.PI / 2);
      wall(len, DOOR_H, DOOR_W / 2, DOOR_H / 2, mid, -Math.PI / 2);
      colliders.push({ minX: -DOOR_W / 2 - 0.2, maxX: -DOOR_W / 2, minZ: z1, maxZ: z0 });
      colliders.push({ minX: DOOR_W / 2, maxX: DOOR_W / 2 + 0.2, minZ: z1, maxZ: z0 });
    }
  }

  // the broken niche you crawl out of, behind the spawn point in the first room
  const first = rooms[0];
  const spawnZ = first.z + first.depth / 2 - 0.7;
  const hole = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.05), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.position.set(0, 0.55, first.z + first.depth / 2 - 0.03);
  scene.add(hole);
  // the soil you dragged out with you, spilled under the niche
  const spillMaps = await assets.materialMaps('grave_dirt');
  const spill = new THREE.Mesh(moundGeometry(0.75, 0.32, 5), materialFrom(spillMaps, 1.5, 1.5, { tint: 0x9a8270 }));
  spill.position.set(0, 0, first.z + first.depth / 2 - 0.2);
  spill.scale.set(1.1, 1, 0.6);
  scene.add(spill);
  const loose = new THREE.InstancedMesh(clodGeometry(0.05, 3), materialFrom(spillMaps, 0.5, 0.5, { tint: 0x8a7462 }), 40);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let k = 0; k < loose.count; k++) {
    const a = Math.random() * Math.PI * 2, d = 0.4 + Math.random() * 0.9;
    e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    m.compose(new THREE.Vector3(Math.cos(a) * d, 0.02, first.z + first.depth / 2 - 0.2 - Math.abs(Math.sin(a)) * d * 0.7), q.setFromEuler(e), new THREE.Vector3().setScalar(0.5 + Math.random()));
    loose.setMatrixAt(k, m);
  }
  scene.add(loose);
  const areas: Area[] = rooms.map((r) => ({
    name: r.name, landmark: r.landmark,
    arrival: r.landmark ? 'The ledger alcove. Stairs lead up into colder dark.' : undefined,
    contains: (_x: number, z: number) => Math.abs(z - r.z) < r.depth / 2,
  }));
  return { layer: 2, scene, colliders, lit, interactables, airPockets, dust, spawn: { pos: new THREE.Vector3(0, 0, spawnZ), yaw: 0 }, areas, rooms };
}

export async function buildInteractable(
  assets: Assets, scene: THREE.Scene, it: Interactable, roomIndex: number, r: Room,
  maps: { woodMaps: Awaited<ReturnType<Assets['materialMaps']>>; stoneMaps: Awaited<ReturnType<Assets['materialMaps']>>; wallMaps: Awaited<ReturnType<Assets['materialMaps']>> },
  lit: LitPoint[],
  colliders: Box[],
): Promise<LiveInteractable> {
  let object: THREE.Object3D;
  let label = '';
  const pos = new THREE.Vector3(it.x, 0, it.z);
  if (it.type === 'clue') {
    const clue = CLUES.find((c) => c.id === it.clueId);
    label = `Examine ${clue ? clue.title.toLowerCase() : 'it'}`;
    if (it.item === 'stone') {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.12), materialFrom(maps.stoneMaps, 0.5, 0.8));
      slab.position.y = 0.42;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.12, 20, 1, false, 0, Math.PI), materialFrom(maps.stoneMaps, 0.5, 0.3));
      top.rotation.x = Math.PI / 2; top.rotation.z = Math.PI / 2; top.rotation.y = Math.PI / 2;
      top.position.y = 0.85;
      g.add(slab, top);
      g.rotation.z = 0.08;
      object = g;
    } else {
      object = await assets.model(it.item === 'watch' ? 'vintage_pocket_watch' : 'postcard_set_01');
      object.position.y = 0.02;
    }
  } else if (it.type === 'survivor') {
    label = 'Dig toward the knocking';
    const sx = it.side === 'left' ? -1 : 1;
    const g = new THREE.Group();
    // fresh soil heaped at a lower-tier niche
    const soil = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), materialFrom(await assets.materialMaps('grave_dirt'), 1, 1));
    soil.scale.set(1, 0.5, 1.2);
    soil.position.set(sx * -0.1, 0, 0);
    g.add(soil);
    object = g;
    pos.x = sx * (r.width / 2 - 0.5);
  } else if (it.type === 'matches') {
    label = `Take matches (${it.count})`;
    object = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: 0x6e2016, roughness: 0.8 }));
    object.position.y = 0.015;
  } else {
    label = 'Climb the stairs';
    const g = new THREE.Group();
    const stepMat = materialFrom(maps.wallMaps, 0.6, 0.2);
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 0.3), stepMat);
      s.position.set(0, 0.1 + k * 0.2, -k * 0.3 - 0.4);
      g.add(s);
    }
    object = g;
    lit.push({ pos: new THREE.Vector3(it.x, 2.4, it.z - 2), color: 0x7f9cff, intensity: 1.2, flicker: false });
    // nothing past the stairs yet: the climb ends the slice
    colliders.push({ minX: -1, maxX: 1, minZ: it.z - 1.6, maxZ: it.z - 1.2 });
  }
  object.position.x += pos.x;
  object.position.z += pos.z;
  scene.add(object);
  return { def: it, pos, object, label, done: false, progress: 0, roomIndex };
}
