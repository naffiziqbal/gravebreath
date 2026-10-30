// Layer 4 in 3D: the necropolis hall, its tombs and low fog, the flooded chapel, and the Hushmen.
import * as THREE from 'three';
import type { Assets } from '../engine/assets';
import { materialFrom } from '../engine/renderer';
import { DECALS } from '../engine/media';
import { CHAPEL, HALL_DEPTH, HALL_HEIGHT, HALL_WIDTH, type NecropolisLayout } from '../sim/necropolis';
import { buildInteractable, darkScene, fitFootprint, moundGeometry, plane, type Area, type Box, type Level, type LitPoint, type LiveInteractable } from './builder';
import { buildHushmanRig, type HushmanRig } from './hushmanRig';

export type Necropolis = Level & { layout: NecropolisLayout; hushmen: HushmanRig[]; fog: THREE.Mesh[]; water: THREE.Mesh };

export async function buildNecropolis(assets: Assets, layout: NecropolisLayout): Promise<Necropolis> {
  const scene = darkScene();
  scene.fog = new THREE.FogExp2(0x05070a, 0.085);
  // faint cold light from the cracks in the vault, so tomb silhouettes read against the dark
  scene.add(new THREE.HemisphereLight(0x2c3a58, 0x070605, 0.38));
  const [floorMaps, wallMaps, stoneMaps, rockMaps] = await Promise.all([
    assets.materialMaps('necropolis_floor'), assets.materialMaps('necropolis_wall'), assets.materialMaps('tomb_stone'), assets.materialMaps('catacomb_rock'),
  ]);
  const colliders: Box[] = [];
  const lit: LitPoint[] = [];
  const airPockets: Level['airPockets'] = [];
  const dust: THREE.Points[] = [];
  const interactables: LiveInteractable[] = [];
  const hw = HALL_WIDTH / 2, D = HALL_DEPTH, Hh = HALL_HEIGHT;

  const wall = (w: number, h: number, x: number, y: number, z: number, rotY: number, maps = wallMaps) => {
    const m = plane(w, h, materialFrom(maps, w / 2.5, h / 2.5, { tint: 0x9a9088 }));
    m.position.set(x, y, z); m.rotation.y = rotY; scene.add(m);
  };
  const box = (minX: number, maxX: number, minZ: number, maxZ: number) => colliders.push({ minX, maxX, minZ, maxZ });

  // floor, vault, side walls with buttresses
  const floor = plane(HALL_WIDTH, D, materialFrom(floorMaps, HALL_WIDTH / 2, D / 2, { tint: 0xb0a89c }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -D / 2); scene.add(floor);
  const vault = plane(HALL_WIDTH, D, materialFrom(rockMaps, HALL_WIDTH / 3, D / 3, { tint: 0x55504a }));
  vault.rotation.x = Math.PI / 2; vault.position.set(0, Hh, -D / 2); scene.add(vault);
  wall(D, Hh, -hw, Hh / 2, -D / 2, Math.PI / 2);
  wall(D, Hh, hw, Hh / 2, -D / 2, -Math.PI / 2);
  box(-hw - 0.3, -hw, -D, 0); box(hw, hw + 0.3, -D, 0);
  const buttress = new THREE.BoxGeometry(0.8, Hh, 0.7);
  const buttressMat = materialFrom(wallMaps, 0.4, 3, { tint: 0x8a8278 });
  for (let z = -3; z > -D; z -= 4) {
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(buttress, buttressMat);
      b.position.set(s * (hw - 0.4), Hh / 2, z); scene.add(b);
      box(s * (hw - 0.4) - 0.4, s * (hw - 0.4) + 0.4, z - 0.35, z + 0.35);
    }
  }
  // south wall: the bone stair comes up behind you, through a breach now choked with rubble
  wall(HALL_WIDTH, Hh, 0, Hh / 2, 0, Math.PI);
  box(-hw, hw, 0, 0.3);
  const rubble = new THREE.Mesh(moundGeometry(1.1, 0.6, 31), materialFrom(stoneMaps, 1, 1, { tint: 0x7a7068 }));
  rubble.position.set(0, 0, -0.2); rubble.scale.set(1.3, 1, 0.5); scene.add(rubble);
  // north wall, with the gate into the chapel
  const gate = CHAPEL.gate, seg = (HALL_WIDTH - gate) / 2;
  wall(seg, Hh, -(gate / 2 + seg / 2), Hh / 2, -D, 0);
  wall(seg, Hh, gate / 2 + seg / 2, Hh / 2, -D, 0);
  wall(gate, Hh - 3.2, 0, 3.2 + (Hh - 3.2) / 2, -D, 0);
  box(-hw, -gate / 2, -D - 0.3, -D); box(gate / 2, hw, -D - 0.3, -D);

  // tombs: low sarcophagi you can be seen over, tall mausoleums you can hide behind
  const stone = materialFrom(stoneMaps, 1, 1, { tint: 0xa49c92 });
  const sarco = layout.tombs.filter((t) => t.kind === 'sarcophagus');
  const maus = layout.tombs.filter((t) => t.kind === 'mausoleum');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, sarco.length);
  const lid = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, sarco.length);
  sarco.forEach((t, i) => {
    q.setFromEuler(e.set(0, t.rotY, 0));
    body.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, (t.h - 0.12) / 2, t.z), q, new THREE.Vector3(t.w, t.h - 0.12, t.d)));
    lid.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.h - 0.06, t.z), q, new THREE.Vector3(t.w + 0.12, 0.12, t.d + 0.12)));
  });
  const mBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, maus.length);
  const roof = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1, 4), stone, maus.length);
  const door = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.8, 1.5), new THREE.MeshBasicMaterial({ color: 0x020202 }), maus.length);
  maus.forEach((t, i) => {
    mBody.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.h / 2, t.z), q.identity(), new THREE.Vector3(t.w, t.h, t.d)));
    roof.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x, t.h + 0.45, t.z), q.setFromEuler(e.set(0, Math.PI / 4, 0)), new THREE.Vector3(t.w * 0.95, 0.9, t.d * 0.95)));
    const facing = t.x < 0 ? 1 : -1; // doors face the central aisle
    door.setMatrixAt(i, m4.compose(new THREE.Vector3(t.x + facing * (t.w / 2 + 0.01), 0.75, t.z), q.setFromEuler(e.set(0, facing * Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)));
  });
  scene.add(body, lid, mBody, roof, door);
  for (const t of layout.tombs) box(t.x - t.w / 2 - 0.05, t.x + t.w / 2 + 0.05, t.z - t.d / 2 - 0.05, t.z + t.d / 2 + 0.05);
  // a few mourning statues on the mausoleum steps
  for (const t of maus.slice(0, 3)) {
    const statue = await assets.model('gothic_statue');
    fitFootprint(statue, 0.8);
    const facing = t.x < 0 ? 1 : -1;
    statue.position.x += t.x + facing * (t.w / 2 + 0.45); statue.position.z += t.z + 0.6;
    statue.rotation.y = facing > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(statue);
    box(t.x + facing * (t.w / 2 + 0.45) - 0.35, t.x + facing * (t.w / 2 + 0.45) + 0.35, t.z + 0.25, t.z + 0.95);
  }
  // candles guttering on the lids
  for (const c of layout.candles) {
    const candle = await assets.model('brass_candleholders');
    fitFootprint(candle, 0.35);
    candle.position.x += c.x; candle.position.z += c.z; candle.position.y += 0.95;
    scene.add(candle);
    lit.push({ pos: new THREE.Vector3(c.x, 1.7, c.z), color: 0xff9447, intensity: 1.0, flicker: true });
  }

  // cracks in the vault: air, and a thin fall of moonlight
  for (const ap of layout.airPockets) {
    airPockets.push({ pos: new THREE.Vector3(ap.x, 0, ap.z), radius: ap.radius });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, ap.radius, Hh, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9fb8ff, transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    shaft.position.set(ap.x, Hh / 2, ap.z); scene.add(shaft);
    lit.push({ pos: new THREE.Vector3(ap.x, 3.2, ap.z), color: 0x8faaff, intensity: 0.9, flicker: false });
    const count = 120, pts = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * ap.radius * 0.8;
      pts[k * 3] = ap.x + Math.cos(a) * r; pts[k * 3 + 1] = Math.random() * Hh; pts[k * 3 + 2] = ap.z + Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const d = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc0d0ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
    scene.add(d); dust.push(d);
  }

  // low fog drifting between the tombs
  const fogTex = await assets.texture(DECALS.fog, true);
  const fog: THREE.Mesh[] = [];
  for (const [y, op, rep] of [[0.25, 0.32, 3], [0.6, 0.22, 2.2], [1.0, 0.1, 1.6]] as const) {
    const t = fogTex.clone(); t.repeat.set(rep, rep);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(HALL_WIDTH, D + CHAPEL.depth), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: op, depthWrite: false, color: 0x8a96a8 }));
    f.rotation.x = -Math.PI / 2; f.position.set(0, y, -(D + CHAPEL.depth) / 2); f.renderOrder = 2;
    scene.add(f); fog.push(f);
  }

  // the flooded chapel: black water over the floor, an altar, and steps up toward the bells
  const cz = -D - CHAPEL.depth / 2, cw = CHAPEL.width / 2;
  const cfloor = plane(CHAPEL.width, CHAPEL.depth, materialFrom(floorMaps, 3, 2.5, { tint: 0x6a645c }));
  cfloor.rotation.x = -Math.PI / 2; cfloor.position.set(0, -0.01, cz); scene.add(cfloor);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CHAPEL.width, CHAPEL.depth - 1.2),
    new THREE.MeshStandardMaterial({ color: 0x06080a, roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.88 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.14, cz + 0.6); scene.add(water);
  const cvault = plane(CHAPEL.width, CHAPEL.depth, materialFrom(rockMaps, 3, 3, { tint: 0x55504a }));
  cvault.rotation.x = Math.PI / 2; cvault.position.set(0, 5, cz); scene.add(cvault);
  wall(CHAPEL.depth, 5, -cw, 2.5, cz, Math.PI / 2); wall(CHAPEL.depth, 5, cw, 2.5, cz, -Math.PI / 2);
  wall(CHAPEL.width, 5, 0, 2.5, -D - CHAPEL.depth, 0);
  wall(cw - gate / 2, 5, -(gate / 2 + (cw - gate / 2) / 2), 2.5, -D - 0.01, Math.PI);
  wall(cw - gate / 2, 5, gate / 2 + (cw - gate / 2) / 2, 2.5, -D - 0.01, Math.PI);
  box(-cw - 0.3, -cw, -D - CHAPEL.depth, -D); box(cw, cw + 0.3, -D - CHAPEL.depth, -D);
  box(-cw, cw, -D - CHAPEL.depth - 0.3, -D - CHAPEL.depth + 0.05);
  const altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.9), stone);
  altar.position.set(0, 0.5, -D - CHAPEL.depth + 2.0); scene.add(altar);
  box(-1.1, 1.1, -D - CHAPEL.depth + 1.55, -D - CHAPEL.depth + 2.45);
  // steps climbing against the back wall, each one shallower than the last
  for (let k = 0; k < 6; k++) {
    const depth = 1.1 - k * 0.16;
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, depth), stone);
    st.position.set(0, 0.1 + k * 0.2, -D - CHAPEL.depth + depth / 2);
    scene.add(st);
  }
  const ironGate = await assets.model('large_iron_gate');
  fitFootprint(ironGate, gate * 0.55);
  ironGate.position.x += -gate / 2 + 0.2; ironGate.position.z += -D - 0.6; ironGate.rotation.y = -1.1; // swung open
  scene.add(ironGate);
  lit.push({ pos: new THREE.Vector3(0, 4.2, -D - CHAPEL.depth + 0.8), color: 0x86a2ff, intensity: 1.6, flicker: false });
  lit.push({ pos: new THREE.Vector3(-0.8, 1.3, -D - CHAPEL.depth + 2.0), color: 0xff9447, intensity: 1.1, flicker: true });

  for (const it of layout.interactables) {
    if (it.type === 'exit') {
      interactables.push({ def: it, pos: new THREE.Vector3(it.x, 0, it.z), object: new THREE.Group(), label: 'Climb toward the bells', done: false, progress: 0, roomIndex: 0 });
      continue;
    }
    const room = { width: 2, height: HALL_HEIGHT } as Parameters<typeof buildInteractable>[4];
    interactables.push(await buildInteractable(assets, scene, it, 0, room, { woodMaps: rockMaps, stoneMaps, wallMaps }, lit, colliders));
  }

  const hushmen: HushmanRig[] = [];
  for (const route of layout.routes) {
    const rig = await buildHushmanRig(assets);
    rig.group.position.set(route[0].x, 0, route[0].z);
    scene.add(rig.group);
    hushmen.push(rig);
  }

  const areas: Area[] = [
    { name: 'The flooded chapel', landmark: true, arrival: 'The flooded chapel. Black water. Steps rise behind the altar.', contains: (_x, z) => z < -D },
    { name: 'The necropolis', landmark: false, contains: () => true },
  ];
  return {
    layer: 4, scene, colliders, lit, interactables, airPockets, dust, areas, layout, hushmen, fog, water,
    spawn: { pos: new THREE.Vector3(layout.spawn.x, 0, layout.spawn.z), yaw: 0 },
  };
}
