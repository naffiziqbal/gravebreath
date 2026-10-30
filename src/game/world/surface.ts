// Layer 5 in 3D: Vael's graveyard in the rain. A moonlit sky, gravestones, dead trees, an iron fence,
// the church of Vael with its bell tower, the ledger on a lectern in the porch, and the Hushmen guarding it.
import * as THREE from 'three';
import type { Assets } from '../engine/assets';
import { materialFrom } from '../engine/renderer';
import { DECALS } from '../engine/media';
import { LECTERN, YARD_DEPTH, YARD_WIDTH, type SurfaceLayout } from '../sim/surface';
import { buildInteractable, fitFootprint, plane, type Area, type Box, type Level, type LitPoint, type LiveInteractable } from './builder';
import { buildHushmanRig, type HushmanRig } from './hushmanRig';

export type Surface = Level & { layout: SurfaceLayout; hushmen: HushmanRig[]; fog: THREE.Mesh[]; rain: THREE.LineSegments; moon: THREE.DirectionalLight; sky: THREE.Mesh };

export const RAIN = { drops: 1400, box: 14, height: 11, speed: 13, length: 0.35 };
const FOG_COLOR = 0x0d1015;

export async function buildSurface(assets: Assets, layout: SurfaceLayout): Promise<Surface> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.042);
  scene.add(new THREE.HemisphereLight(0x3a4a6a, 0x0a0a08, 0.55));
  const moon = new THREE.DirectionalLight(0x9db4e0, 0.9);
  moon.position.set(-8, 20, -30); // the moon hangs low over the church
  moon.target.position.set(0, 0, -15);
  scene.add(moon, moon.target);

  const [groundMaps, stoneMaps, wallMaps, dirtMaps, skyTex, fogTex] = await Promise.all([
    assets.materialMaps('graveyard_ground'), assets.materialMaps('tomb_stone'), assets.materialMaps('necropolis_wall'), assets.materialMaps('grave_dirt'),
    assets.texture(DECALS.sky, true), assets.texture(DECALS.fog, true),
  ]);
  const colliders: Box[] = [];
  const lit: LitPoint[] = [];
  const interactables: LiveInteractable[] = [];
  const box = (minX: number, maxX: number, minZ: number, maxZ: number) => colliders.push({ minX, maxX, minZ, maxZ });
  const hw = YARD_WIDTH / 2, D = YARD_DEPTH;

  // the sky: a dome that ignores fog, the moon over the church (the image's moon sits near its centre column)
  const skyGeo = new THREE.SphereGeometry(50, 48, 24); // follows the camera (see Game), inside the far plane
  const uv = skyGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // textures load with flipY off
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.rotation.y = Math.PI * 0.5 + 0.35;
  sky.renderOrder = -1;
  scene.add(sky);

  // wet ground, wider than the yard so the fog eats its edge; a gravel path up the middle
  const ground = plane(120, 120, materialFrom(groundMaps, 40, 40, { tint: 0x8a8f86 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -D / 2); scene.add(ground);
  const path = plane(2.4, D, materialFrom(dirtMaps, 1, D / 2.4, { tint: 0x77736c }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.01, -D / 2); scene.add(path);

  // the mausoleum you climbed out of, behind you
  const stone = materialFrom(stoneMaps, 1, 1, { tint: 0x9a948c });
  const crypt = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 2.4), stone);
  crypt.position.set(0, 1.5, 1.5); scene.add(crypt);
  const cryptRoof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), stone);
  cryptRoof.position.set(0, 3.6, 1.5); cryptRoof.rotation.y = Math.PI / 4; scene.add(cryptRoof);
  const cryptDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2), new THREE.MeshBasicMaterial({ color: 0x010101 }));
  cryptDoor.position.set(0, 1, 0.29); scene.add(cryptDoor);
  box(-1.6, 1.6, 0.3, 2.7);

  // gravestones (low, leaning), mausoleums (tall), dead trees
  const graves = layout.tombs.filter((t) => t.kind === 'sarcophagus');
  const maus = layout.tombs.filter((t) => t.kind === 'mausoleum' && t.w > 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, graves.length);
  const top = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, false, 0, Math.PI), stone, graves.length);
  graves.forEach((t, i) => {
    const lean = Math.sin(t.x * 3.1 + t.z * 1.7) * 0.12;
    q.setFromEuler(e.set(lean, t.rotY, lean * 0.5));
    const body = t.h - t.w / 2;
    slab.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, body / 2, t.z), q, new THREE.Vector3(t.w, body, t.d)));
    // a rounded headstone top: a half disc standing on the slab
    const qt = new THREE.Quaternion().setFromEuler(e.set(lean, t.rotY, lean * 0.5)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2)));
    const up = new THREE.Vector3(0, body, 0).applyQuaternion(q);
    top.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x + up.x, up.y, t.z + up.z), qt, new THREE.Vector3(t.w, t.d, t.w)));
    box(t.x - t.w / 2, t.x + t.w / 2, t.z - t.d / 2 - 0.05, t.z + t.d / 2 + 0.05);
  });
  scene.add(slab, top);
  const mBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, maus.length);
  const mRoof = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1, 4), stone, maus.length);
  const mDoor = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.8, 1.5), new THREE.MeshBasicMaterial({ color: 0x020202 }), maus.length);
  maus.forEach((t, i) => {
    mBody.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.h / 2, t.z), q.identity(), new THREE.Vector3(t.w, t.h, t.d)));
    mRoof.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.h + 0.45, t.z), q.setFromEuler(e.set(0, Math.PI / 4, 0)), new THREE.Vector3(t.w * 0.95, 0.9, t.d * 0.95)));
    const facing = t.x < 0 ? 1 : -1; // doors face the path
    mDoor.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x + facing * (t.w / 2 + 0.01), 0.75, t.z), q.setFromEuler(e.set(0, facing * Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)));
    box(t.x - t.w / 2, t.x + t.w / 2, t.z - t.d / 2, t.z + t.d / 2);
  });
  scene.add(mBody, mRoof, mDoor);
  // dead trees: a leaning trunk and crooked bare branches, wearing the fallen log's bark
  const log = await assets.model('dead_tree_trunk');
  let bark: THREE.Material = stone;
  log.traverse((o) => { if ((o as THREE.Mesh).isMesh) bark = (o as THREE.Mesh).material as THREE.Material; });
  const limb = new THREE.CylinderGeometry(0.6, 1, 1, 7, 1);
  limb.translate(0, 0.5, 0); // grows up from its base
  for (const [k, p] of layout.trees.entries()) {
    const tree = new THREE.Group();
    const h = 4.2 + (k % 3) * 0.7;
    const trunk = new THREE.Mesh(limb, bark);
    trunk.scale.set(0.24, h, 0.24);
    tree.add(trunk);
    let seed = k * 977 + 13;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const branch = (parent: THREE.Object3D, at: number, len: number, thick: number, depth: number) => {
      const b = new THREE.Mesh(limb, bark);
      b.position.y = at;
      b.rotation.set((rand() - 0.5) * 0.6, rand() * Math.PI * 2, 0.5 + rand() * 0.6, 'YXZ');
      b.scale.set(thick, len, thick);
      // children are added to a wrapper so they don't inherit the non-uniform scale
      const w = new THREE.Group(); w.position.copy(b.position); w.rotation.copy(b.rotation); b.position.set(0, 0, 0); b.rotation.set(0, 0, 0);
      w.add(b); parent.add(w);
      if (depth > 0) for (let c = 0; c < 2; c++) branch(w, len * (0.5 + rand() * 0.4), len * 0.55, thick * 0.55, depth - 1);
    };
    for (let i = 0; i < 5; i++) branch(tree, h * (0.45 + i * 0.11), 1.2 + rand() * 1.1, 0.07, 1);
    tree.position.set(p.x, 0, p.z);
    tree.rotation.set((rand() - 0.5) * 0.12, rand() * 6, (rand() - 0.5) * 0.12);
    scene.add(tree);
    box(p.x - 0.3, p.x + 0.3, p.z - 0.3, p.z + 0.3);
  }

  // the iron fence around the yard
  const iron = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.5, metalness: 0.8 });
  const posts: THREE.Vector3[] = [];
  for (let x = -hw; x <= hw; x += 0.35) posts.push(new THREE.Vector3(x, 0, 0.6));
  for (let z = 0.6; z >= -D - 2; z -= 0.35) posts.push(new THREE.Vector3(-hw, 0, z), new THREE.Vector3(hw, 0, z));
  const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 1.8, 5), iron, posts.length);
  const spike = new THREE.InstancedMesh(new THREE.ConeGeometry(0.035, 0.12, 5), iron, posts.length);
  posts.forEach((p, i) => {
    post.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 0.9, p.z), q.identity(), new THREE.Vector3(1, 1, 1)));
    spike.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, 1.86, p.z), q, new THREE.Vector3(1, 1, 1)));
  });
  scene.add(post, spike);
  for (const [y, w, d, x, z] of [[1.6, YARD_WIDTH, 0.03, 0, 0.6], [0.3, YARD_WIDTH, 0.03, 0, 0.6], [1.6, 0.03, D + 2.6, -hw, -D / 2 - 0.7], [0.3, 0.03, D + 2.6, -hw, -D / 2 - 0.7], [1.6, 0.03, D + 2.6, hw, -D / 2 - 0.7], [0.3, 0.03, D + 2.6, hw, -D / 2 - 0.7]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), iron);
    rail.position.set(x, y, z); scene.add(rail);
  }
  box(-hw, hw, 0.55, 0.9); box(-hw - 0.3, -hw + 0.05, -D - 3, 0.9); box(hw - 0.05, hw + 0.3, -D - 3, 0.9);

  // the church of Vael: nave, bell tower with its spire, candlelit windows, and an open porch over the ledger
  const wall = materialFrom(wallMaps, 3, 2, { tint: 0x8e877e });
  const naveW = 12, naveD = 16, naveH = 8;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), wall);
  nave.position.set(0, naveH / 2, -D - naveD / 2); scene.add(nave);
  const roofGeo = new THREE.CylinderGeometry(0.01, naveW * 0.62, naveD, 3, 1);
  const roof = new THREE.Mesh(roofGeo, materialFrom(stoneMaps, 4, 4, { tint: 0x3c3a38 }));
  roof.rotation.set(Math.PI / 2, 0, 0); roof.scale.set(1, 1, 0.55); roof.position.set(0, naveH + 1.6, -D - naveD / 2); scene.add(roof);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 4), wall);
  tower.position.set(0, 9, -D - 2.5); scene.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 4), materialFrom(stoneMaps, 2, 2, { tint: 0x3c3a38 }));
  spire.position.set(0, 22, -D - 2.5); spire.rotation.y = Math.PI / 4; scene.add(spire);
  // the belfry: dark arches with the bell hanging in them
  const belfry = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ color: 0x030303 }));
  belfry.position.set(0, 15, -D - 0.49); scene.add(belfry);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 0.9, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x5a4a2a, metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide }));
  bell.position.set(0, 15, -D - 0.9); scene.add(bell);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.42, 0.12), fog: false });
  for (const x of [-4, 4]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4), glow);
    win.position.set(x, 3.6, -D + 0.01); scene.add(win);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12, 0, Math.PI), glow);
    arch.position.set(x, 4.8, -D + 0.01); scene.add(arch);
    lit.push({ pos: new THREE.Vector3(x, 3.4, -D + 1.2), color: 0xff9447, intensity: 0.8, flicker: true });
  }
  const door = await assets.model('large_castle_door');
  fitFootprint(door, 2.6);
  door.position.z += -D - 0.45; scene.add(door);
  box(-naveW / 2, naveW / 2, -D - naveD, -D - 0.5);
  // the porch: two columns and a roof over the lectern
  for (const x of [-1.8, 1.8]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3.4, 10), stone);
    col.position.set(x, 1.7, -D + 2.6); scene.add(col);
    box(x - 0.22, x + 0.22, -D + 2.38, -D + 2.82);
  }
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 3.2), stone);
  porchRoof.position.set(0, 3.55, -D + 1.1); scene.add(porchRoof);
  const step = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.15, 3.2), stone);
  step.position.set(0, 0.075, -D + 1.1); scene.add(step);
  // the lectern and the open ledger, a candle beside it
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.8 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), wood);
  stand.position.set(LECTERN.x, 0.6, LECTERN.z - 0.15); scene.add(stand);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.46), wood);
  desk.position.set(LECTERN.x, 1.15, LECTERN.z - 0.15); desk.rotation.x = 0.35; scene.add(desk);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.4), new THREE.MeshStandardMaterial({ color: 0xcdbf9e, roughness: 0.9 }));
  pages.position.set(LECTERN.x, 1.19, LECTERN.z - 0.14); pages.rotation.x = 0.35; scene.add(pages);
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.36), new THREE.MeshBasicMaterial({ color: 0x1a0d08 }));
  ink.position.set(LECTERN.x, 1.21, LECTERN.z - 0.135); ink.rotation.x = -Math.PI / 2 + 0.35; scene.add(ink); // the spine
  box(LECTERN.x - 0.32, LECTERN.x + 0.32, LECTERN.z - 0.4, LECTERN.z + 0.05);
  const candle = await assets.model('brass_candleholders');
  fitFootprint(candle, 0.3);
  candle.position.x += LECTERN.x + 0.55; candle.position.z += LECTERN.z - 0.2; scene.add(candle);
  lit.push({ pos: new THREE.Vector3(LECTERN.x + 0.5, 1.5, LECTERN.z), color: 0xff9447, intensity: 1.1, flicker: true });

  // ground mist drifting between the stones
  const fog: THREE.Mesh[] = [];
  for (const [y, op, rep] of [[0.2, 0.28, 3], [0.55, 0.16, 2]] as const) {
    const t = fogTex.clone(); t.repeat.set(rep, rep);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(YARD_WIDTH + 10, D + 10), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: op, depthWrite: false, color: 0x8a96a8 }));
    f.rotation.x = -Math.PI / 2; f.position.set(0, y, -D / 2); f.renderOrder = 2;
    scene.add(f); fog.push(f);
  }

  // rain: short streaks in a box that follows you (Game moves and wraps them)
  const pos = new Float32Array(RAIN.drops * 6);
  for (let i = 0; i < RAIN.drops; i++) {
    const x = (Math.random() - 0.5) * RAIN.box * 2, y = Math.random() * RAIN.height, z = (Math.random() - 0.5) * RAIN.box * 2;
    pos.set([x, y, z, x + 0.02, y + RAIN.length, z + 0.04], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0x9aa8c0, transparent: true, opacity: 0.35, depthWrite: false }));
  rain.frustumCulled = false;
  scene.add(rain);

  for (const it of layout.interactables) {
    if (it.type === 'exit') {
      interactables.push({ def: it, pos: new THREE.Vector3(it.x, 0, it.z), object: pages, label: 'Read the ledger', done: false, progress: 0, roomIndex: 0 });
      continue;
    }
    const room = { width: 2, height: 6 } as Parameters<typeof buildInteractable>[4];
    interactables.push(await buildInteractable(assets, scene, it, 0, room, { woodMaps: dirtMaps, stoneMaps, wallMaps }, lit, colliders));
  }

  const hushmen: HushmanRig[] = [];
  for (const route of layout.routes) {
    const rig = await buildHushmanRig(assets);
    rig.group.position.set(route[0].x, 0, route[0].z);
    scene.add(rig.group);
    hushmen.push(rig);
  }

  const areas: Area[] = [
    { name: 'The church of Vael', landmark: true, arrival: 'The church of Vael. The ledger lies open in the porch.', contains: (_x, z) => z < -D + 8 },
    { name: 'Vael graveyard', landmark: false, contains: () => true },
  ];
  return {
    layer: 5, scene, colliders, lit, interactables, airPockets: [], dust: [], areas, layout, hushmen, fog, rain, moon, sky,
    spawn: { pos: new THREE.Vector3(layout.spawn.x, 0, layout.spawn.z), yaw: 0 },
  };
}
