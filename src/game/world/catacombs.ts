// Layer 3 in 3D: tunnels carved from the maze, walls stacked with bones and skulls, and the Listener.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Assets } from '../engine/assets';
import { materialFrom } from '../engine/renderer';
import { CELL, DIRS, TUNNEL, TUNNEL_HEIGHT, cellCentre, cellOf, type CatacombLayout, type Cell, type Dir } from '../sim/catacombs';
import { buildListenerRig, type ListenerRig } from './listenerRig';
import { buildInteractable, darkScene, fitFootprint, moundGeometry, plane, type Area, type Box, type Level, type LitPoint, type LiveInteractable } from './builder';

/** `bones` are the instanced bone and skull batches, one per maze cell, hidden by Game when fog hides them. */
export type Catacombs = Level & { layout: CatacombLayout; listener: THREE.Group; listenerRig: ListenerRig; bones: THREE.InstancedMesh[] };

const BONE = new THREE.Color(0.82, 0.74, 0.58);
const SOCKET = new THREE.Color(0.04, 0.025, 0.02);

function painted(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}

/** A skull facing +z: cranium, cheekbones, dark eye sockets and nose, a row of teeth. ~170 triangles. */
function skullGeometry() {
  const cranium = new THREE.SphereGeometry(0.075, 8, 6);
  cranium.scale(0.86, 0.95, 1.05);
  const face = new THREE.BoxGeometry(0.1, 0.05, 0.06);
  face.translate(0, -0.055, 0.04);
  const teeth = new THREE.BoxGeometry(0.07, 0.016, 0.02);
  teeth.translate(0, -0.08, 0.06);
  const eyeL = new THREE.IcosahedronGeometry(0.021, 0); eyeL.scale(1, 0.9, 0.7); eyeL.translate(-0.028, -0.01, 0.066);
  const eyeR = new THREE.IcosahedronGeometry(0.021, 0); eyeR.scale(1, 0.9, 0.7); eyeR.translate(0.028, -0.01, 0.066);
  const nose = new THREE.IcosahedronGeometry(0.011, 0); nose.scale(0.8, 1.3, 1); nose.translate(0, -0.042, 0.07);
  return mergeGeometries([painted(cranium, BONE), painted(face, BONE), painted(teeth, BONE), painted(eyeL, SOCKET), painted(eyeR, SOCKET), painted(nose, SOCKET)])!;
}

/** The knobbed end of a long bone, as stacked in an ossuary wall, facing +z. */
function boneEndGeometry() {
  // 6x4 sphere: round enough in the dark at a fraction of the triangles
  const knob = new THREE.SphereGeometry(0.03, 6, 4);
  knob.scale(1.45, 1.0, 0.9);
  return painted(knob, BONE);
}

type Wall = { a: THREE.Vector2; b: THREE.Vector2; normal: THREE.Vector2 }; // a→b along the wall, normal into the tunnel

/** A box behind the wall line that also covers the bones stacked in front of it (they stick out ~8 cm). */
function wallCollider(w: Wall): Box {
  const behind = 0.2, front = 0.1;
  const minX = Math.min(w.a.x, w.b.x), maxX = Math.max(w.a.x, w.b.x), minZ = Math.min(w.a.y, w.b.y), maxZ = Math.max(w.a.y, w.b.y);
  if (w.normal.x !== 0) {
    const x = w.a.x;
    return w.normal.x > 0 ? { minX: x - behind, maxX: x + front, minZ, maxZ } : { minX: x - front, maxX: x + behind, minZ, maxZ };
  }
  const z = w.a.y;
  return w.normal.y > 0 ? { minX, maxX, minZ: z - behind, maxZ: z + front } : { minX, maxX, minZ: z - front, maxZ: z + behind };
}

export async function buildCatacombs(assets: Assets, layout: CatacombLayout): Promise<Catacombs> {
  const { maze } = layout;
  const scene = darkScene();
  scene.fog = new THREE.FogExp2(0x000000, 0.3);
  const [rock, dirt, stone] = await Promise.all([assets.materialMaps('catacomb_rock'), assets.materialMaps('grave_dirt'), assets.materialMaps('tomb_stone')]);
  const colliders: Box[] = [];
  const lit: LitPoint[] = [];
  const airPockets: Level['airPockets'] = [];
  const dust: THREE.Points[] = [];
  const interactables: LiveInteractable[] = [];
  const boneMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stone.map, normalMap: stone.normalMap, roughness: 0.85 });
  const skullGeo = skullGeometry();
  const boneGeo = boneEndGeometry();
  let seed = layout.seed;
  const rand = () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);

  const half = TUNNEL / 2;
  const walls: Wall[] = [];
  const addRect = (cx: number, cz: number, w: number, d: number) => {
    const f = plane(w, d, materialFrom(dirt, w / 1.4, d / 1.4, { tint: 0x8c7c6c }));
    f.rotation.x = -Math.PI / 2; f.position.set(cx, 0, cz); scene.add(f);
    const c = plane(w, d, materialFrom(rock, w / 1.6, d / 1.6, { tint: 0x6b625a }));
    c.rotation.x = Math.PI / 2; c.position.set(cx, TUNNEL_HEIGHT, cz); scene.add(c);
  };
  const addWall = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
    walls.push({ a: new THREE.Vector2(ax, az), b: new THREE.Vector2(bx, bz), normal: new THREE.Vector2(nx, nz) });
  };

  // each cell is a square of tunnel; open sides join a corridor to the neighbour (built once, from the n/e side)
  for (const c of maze.cells) {
    const p = cellCentre(maze, c);
    addRect(p.x, p.z, TUNNEL, TUNNEL);
    const sides: Record<Dir, [number, number, number, number, number, number]> = {
      n: [p.x - half, p.z - half, p.x + half, p.z - half, 0, 1],
      s: [p.x + half, p.z + half, p.x - half, p.z + half, 0, -1],
      e: [p.x + half, p.z - half, p.x + half, p.z + half, -1, 0],
      w: [p.x - half, p.z + half, p.x - half, p.z - half, 1, 0],
    };
    for (const d of DIRS) {
      // the entrance opens south to the crypt stairs and the exit opens north to the bone stair
      const doorway = (c === maze.entrance && d === 's') || (c === maze.exit && d === 'n');
      if (!c.open[d] && !doorway) addWall(...sides[d]);
    }
    const gap = CELL - TUNNEL;
    if (c.open.n) {
      const z0 = p.z - half, z1 = z0 - gap;
      addRect(p.x, (z0 + z1) / 2, TUNNEL, gap);
      addWall(p.x - half, z0, p.x - half, z1, 1, 0);
      addWall(p.x + half, z1, p.x + half, z0, -1, 0);
    }
    if (c.open.e) {
      const x0 = p.x + half, x1 = x0 + gap;
      addRect((x0 + x1) / 2, p.z, gap, TUNNEL);
      addWall(x0, p.z - half, x1, p.z - half, 0, 1);
      addWall(x1, p.z + half, x0, p.z + half, 0, -1);
    }
  }

  // the way back down to the crypt is sealed behind you
  const entry = cellCentre(maze, maze.entrance);
  addRect(entry.x, entry.z + half + 0.6, TUNNEL, 1.2);
  addWall(entry.x - half, entry.z + half, entry.x - half, entry.z + half + 1.2, 1, 0);
  addWall(entry.x + half, entry.z + half + 1.2, entry.x + half, entry.z + half, -1, 0);
  addWall(entry.x + half, entry.z + half + 1.2, entry.x - half, entry.z + half + 1.2, 0, -1);
  const rubble = new THREE.Mesh(moundGeometry(0.8, 0.5, 21), materialFrom(stone, 1, 1, { tint: 0x7a7068 }));
  rubble.position.set(entry.x, 0, entry.z + half + 1.1);
  scene.add(rubble);

  // rock behind every wall; bones and skulls stacked against most of them
  const skulls: THREE.Matrix4[] = [];
  const bones: THREE.Matrix4[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  for (const w of walls) {
    const len = w.a.distanceTo(w.b);
    if (len < 0.05) continue;
    const mid = w.a.clone().add(w.b).multiplyScalar(0.5);
    const yaw = Math.atan2(w.normal.x, w.normal.y);
    const wall = plane(len, TUNNEL_HEIGHT, materialFrom(rock, len / 1.6, TUNNEL_HEIGHT / 1.6, { tint: 0x8a8076 }));
    wall.position.set(mid.x, TUNNEL_HEIGHT / 2, mid.y);
    wall.rotation.y = yaw;
    scene.add(wall);
    colliders.push(wallCollider(w));
    if (rand() < 0.35) continue; // some stretches are bare rock
    const along = w.b.clone().sub(w.a).normalize();
    // a dark packed-earth backing, so the gaps between bones read as depth, not lit wall
    const back = plane(len, TUNNEL_HEIGHT - 0.5, new THREE.MeshBasicMaterial({ color: 0x050302 }));
    back.position.set(mid.x + w.normal.x * 0.004, (TUNNEL_HEIGHT - 0.5) / 2, mid.y + w.normal.y * 0.004);
    back.rotation.y = yaw;
    scene.add(back);
    // Paris-catacomb pattern: tight, staggered bands of bone ends broken by rows of skulls
    let row = 0;
    for (let y = 0.08; y < TUNNEL_HEIGHT - 0.55; row++) { // bones to shoulder height, bare rock above
      const skullRow = Math.abs(y - 0.8) < 0.04 || Math.abs(y - 1.55) < 0.04;
      const step = skullRow ? 0.16 : 0.088;
      const stagger = skullRow ? 0 : (row % 2) * step * 0.5;
      for (let s = step / 2 + stagger; s < len - step / 3; s += step * (0.92 + rand() * 0.16)) {
        if (rand() < 0.04) continue; // a gap where a bone fell out
        const out = 0.035 + rand() * 0.02;
        const px = w.a.x + along.x * s + w.normal.x * out, pz = w.a.y + along.y * s + w.normal.y * out;
        e.set((rand() - 0.5) * 0.5, yaw + (rand() - 0.5) * 0.6, (rand() - 0.5) * 1.2);
        m.compose(new THREE.Vector3(px, y + (rand() - 0.5) * 0.015, pz), q.setFromEuler(e), one.clone().multiplyScalar(skullRow ? 0.8 + rand() * 0.15 : 0.85 + rand() * 0.3));
        (skullRow ? skulls : bones).push(m.clone());
      }
      y += skullRow ? 0.16 : 0.058;
      if (Math.abs(y - 0.8) < 0.03) y = 0.8;
      if (Math.abs(y - 1.55) < 0.03) y = 1.55;
    }
  }
  // one instanced batch per kind and per maze cell, so phones can cull what's behind you or lost in the fog
  const batches: THREE.InstancedMesh[] = [];
  const batch = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[]) => {
    const regions = new Map<Cell | undefined, THREE.Matrix4[]>();
    const v = new THREE.Vector3();
    for (const mt of mats) {
      v.setFromMatrixPosition(mt);
      const key = cellOf(maze, v.x, v.z); // the nearest cell; Game draws only the cells you could see
      (regions.get(key) ?? regions.set(key, []).get(key)!).push(mt);
    }
    for (const [cell, list] of regions) {
      const im = new THREE.InstancedMesh(geo, boneMat, list.length);
      im.userData.cell = cell;
      const tint = new THREE.Color();
      list.forEach((mt, i) => {
        im.setMatrixAt(i, mt);
        const k = 0.55 + rand() * 0.5;
        im.setColorAt(i, tint.setRGB(k, k * (0.9 + rand() * 0.08), k * (0.78 + rand() * 0.12)));
      });
      im.computeBoundingSphere();
      scene.add(im);
      batches.push(im);
    }
  };
  batch(boneGeo, bones);
  batch(skullGeo, skulls);
  if (__DEV__) {
    const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
    console.log(`[game] catacombs: ${bones.length} bones x ${tris(boneGeo)} tris, ${skulls.length} skulls x ${tris(skullGeo)} tris = ${Math.round((bones.length * tris(boneGeo) + skulls.length * tris(skullGeo)) / 1000)}k triangles`);
  }

  // candles guttering at junctions
  for (const c of layout.candles) {
    const model = await assets.model('wooden_candlestick');
    fitFootprint(model);
    model.position.x += c.x; model.position.z += c.z;
    scene.add(model);
    lit.push({ pos: new THREE.Vector3(c.x, 0.3, c.z), color: 0xff9447, intensity: 1.1, flicker: true });
  }

  for (const ap of layout.airPockets) {
    airPockets.push({ pos: new THREE.Vector3(ap.x, 0, ap.z), radius: ap.radius });
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, ap.radius, TUNNEL_HEIGHT, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    shaft.position.set(ap.x, TUNNEL_HEIGHT / 2, ap.z);
    scene.add(shaft);
    lit.push({ pos: new THREE.Vector3(ap.x, TUNNEL_HEIGHT - 0.1, ap.z), color: 0x9fbaff, intensity: 0.8, flicker: false });
    const count = 90, pts = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const a = rand() * Math.PI * 2, rad = Math.sqrt(rand()) * ap.radius * 0.8;
      pts[k * 3] = ap.x + Math.cos(a) * rad; pts[k * 3 + 1] = rand() * TUNNEL_HEIGHT; pts[k * 3 + 2] = ap.z + Math.sin(a) * rad;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const d = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb8c8ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.6, depthWrite: false }));
    scene.add(d);
    dust.push(d);
  }

  // the bone stair: steps climbing north out of the last cell, flanked by skulls
  const exit = cellCentre(maze, maze.exit);
  const stairZ = exit.z - half;
  const stepMat = materialFrom(stone, 0.6, 0.2, { tint: 0xb8aa94 });
  for (let k = 0; k < 7; k++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(TUNNEL, 0.18, 0.3), stepMat);
    st.position.set(exit.x, 0.09 + k * 0.18, stairZ - 0.15 - k * 0.3);
    scene.add(st);
  }
  addRect(exit.x, stairZ - 1.05, TUNNEL, 2.1);
  const stairWalls: Wall[] = [
    { a: new THREE.Vector2(exit.x - half, stairZ), b: new THREE.Vector2(exit.x - half, stairZ - 2.1), normal: new THREE.Vector2(1, 0) },
    { a: new THREE.Vector2(exit.x + half, stairZ - 2.1), b: new THREE.Vector2(exit.x + half, stairZ), normal: new THREE.Vector2(-1, 0) },
  ];
  for (const w of stairWalls) {
    const len = 2.1, mid = w.a.clone().add(w.b).multiplyScalar(0.5);
    const wall = plane(len, TUNNEL_HEIGHT + 1.3, materialFrom(rock, 1.3, 2, { tint: 0x8a8076 }));
    wall.position.set(mid.x, (TUNNEL_HEIGHT + 1.3) / 2, mid.y);
    wall.rotation.y = Math.atan2(w.normal.x, w.normal.y);
    scene.add(wall);
    colliders.push({ minX: Math.min(w.a.x, w.b.x) - 0.1, maxX: Math.max(w.a.x, w.b.x) + 0.1, minZ: stairZ - 2.1, maxZ: stairZ });
  }
  const stairSkulls = new THREE.InstancedMesh(skullGeo, boneMat, 24);
  for (let k = 0; k < 24; k++) {
    const side = k % 2 ? 1 : -1, row = Math.floor(k / 2);
    e.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    stairSkulls.setMatrixAt(k, m.compose(new THREE.Vector3(exit.x + side * (half - 0.08), 0.3 + row * 0.16, stairZ - 0.2 - row * 0.15), q.setFromEuler(e), one));
  }
  scene.add(stairSkulls);
  colliders.push({ minX: exit.x - half, maxX: exit.x + half, minZ: stairZ - 2.3, maxZ: stairZ - 1.9 });
  lit.push({ pos: new THREE.Vector3(exit.x, 2.6, stairZ - 1.8), color: 0x86a2ff, intensity: 1.6, flicker: false });

  for (const it of layout.interactables) {
    if (it.type === 'exit') {
      // the bone stair above is the exit; nothing extra to build
      interactables.push({ def: it, pos: new THREE.Vector3(it.x, 0, it.z), object: new THREE.Group(), label: 'Climb the bone stair', done: false, progress: 0, roomIndex: 0 });
      continue;
    }
    const room = { width: TUNNEL, height: TUNNEL_HEIGHT } as Parameters<typeof buildInteractable>[4];
    interactables.push(await buildInteractable(assets, scene, it, 0, room, { woodMaps: dirt, stoneMaps: stone, wallMaps: stone }, lit, colliders));
  }

  const listenerRig = await buildListenerRig(assets);
  const listener = listenerRig.group;
  const start = cellCentre(maze, layout.listenerStart);
  listener.position.set(start.x, 0, start.z);
  scene.add(listener);

  const exitCell: Cell = maze.exit;
  const areas: Area[] = [
    { name: 'The bone stair', landmark: true, arrival: 'The bone stair. Cold air falls from above.', contains: (x, z) => { const p = cellCentre(maze, exitCell); return Math.abs(x - p.x) < CELL / 2 && z < p.z + CELL / 2 && z > p.z - CELL; } },
    { name: 'The catacombs', landmark: false, contains: () => true },
  ];
  return {
    layer: 3, scene, colliders, lit, interactables, airPockets, dust, areas, layout, listener, listenerRig, bones: batches,
    spawn: { pos: new THREE.Vector3(entry.x, 0, entry.z + 0.2), yaw: maze.entrance.open.n ? 0 : maze.entrance.open.e ? -Math.PI / 2 : Math.PI / 2 },
  };
}

