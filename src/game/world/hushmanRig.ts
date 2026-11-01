// A Hushman: the sculpted robed body (tools/make_hushman.py), a painted porcelain mask (tools/make_mask.py),
// a lantern in the right hand whose light is also their sight, and their procedural walk.
import * as THREE from 'three';
import type { Assets } from '../engine/assets';
import { buildSkinned } from '../engine/skinned';
import { DECALS } from '../engine/media';
import type { HushmanMode } from '../sim/hushman';
import { HUSHMAN } from '../sim/hushman';

export type HushmanRig = {
  group: THREE.Group;
  bones: Record<string, THREE.Bone>;
  lamp: THREE.PointLight; // the warm glow around them
  beam: THREE.SpotLight; // the lantern beam: what they can see
  rootY: number;
  scan: number;
};

/** Hang a lantern from a hand by the top of its handle, as a real one hangs, with its light where the flame is. */
export async function hangLantern(assets: Assets, hand: THREE.Object3D, scale: number): Promise<THREE.PointLight> {
  const lantern = await assets.model('Lantern_01');
  lantern.scale.setScalar(scale);
  lantern.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(lantern);
  const centre = box.getCenter(new THREE.Vector3());
  lantern.position.set(-centre.x, -box.max.y + 0.006, -centre.z);
  hand.add(lantern);
  const lamp = new THREE.PointLight(0xffa04a, 2.2, 7, 2);
  lamp.position.set(0, -box.max.y + 0.006 + centre.y, 0);
  hand.add(lamp);
  return lamp;
}

export async function buildHushmanRig(assets: Assets): Promise<HushmanRig> {
  const [data, linen, maskTex] = await Promise.all([assets.skinnedData('hushman'), assets.materialMaps('coffin_linen'), assets.texture(DECALS.mask, true)]);
  const wool = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, normalMap: linen.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
  const { mesh, byName } = buildSkinned(data, wool);
  const group = new THREE.Group();
  group.add(mesh);

  // the mask: a shallow porcelain shell set into the hood, following the head
  const shell = new THREE.SphereGeometry(1, 24, 16, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.5 - 1.05, 2.1);
  // the porcelain faintly catches what little light there is, so the face hangs pale in the dark of the hood
  const mask = new THREE.Mesh(shell, new THREE.MeshStandardMaterial({ map: maskTex, roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: maskTex, emissiveIntensity: 0.22 }));
  mask.scale.set(0.072, 0.1, 0.05);
  mask.rotation.y = Math.PI; // the shell's open side faces +z; turn it to face out of the hood (-z)
  mask.position.set(0, 1.655 - 1.62, -0.112 + 0.02); // at the hood opening; the head bone sits at (0, 1.62, -0.02)
  byName.head.add(mask);

  // the lantern, hanging from the right hand
  const lamp = await hangLantern(assets, byName.handR, 0.8);
  const beam = new THREE.SpotLight(0xffb36a, 6, HUSHMAN.sight + 1, HUSHMAN.halfAngle, 0.5, 1.6);
  beam.position.set(0, -0.2, 0);
  group.add(beam, beam.target);
  return { group, bones: byName, lamp, beam, rootY: byName.root.position.y, scan: 0 };
}

export type HushmanPose = { time: number; dt: number; mode: HushmanMode; moving: boolean; heading: number; flicker: number };

export function animateHushman(rig: HushmanRig, p: HushmanPose) {
  const b = rig.bones;
  const chase = p.mode === 'chase';
  const search = p.mode === 'search';
  const step = p.moving ? Math.sin(p.time * (chase ? 7.5 : 4)) : 0;
  // the robe sways; they glide more than walk
  b.root.position.y = rig.rootY + Math.abs(step) * 0.018;
  b.root.rotation.set(0, step * 0.04, step * 0.03);
  b.spine.rotation.set(chase ? -0.25 : -0.08, 0, 0);
  b.chest.rotation.set(chase ? -0.1 : 0, 0, 0);
  // searching: the head turns slowly side to side; patrolling: it bows, listening to the chant
  rig.scan += p.dt * (search ? 1.4 : 0.6);
  b.head.rotation.set(chase ? 0.15 : search ? 0.05 : 0.22, search ? Math.sin(rig.scan) * 0.6 : Math.sin(rig.scan) * 0.12, 0);
  // right arm holds the lantern out in front (higher when chasing); the left hand rests on the chest, or reaches
  b.upperArmR.rotation.set(chase ? 1.35 : 1.05, 0, -0.05);
  b.forearmR.rotation.set(chase ? 0.2 : 0.5, 0, 0);
  b.handR.rotation.set(-(chase ? 1.45 : 1.35) + step * 0.05, 0, 0); // keep the lantern hanging straight down
  b.upperArmL.rotation.set(chase ? 1.4 : 0.6, 0, 0.12);
  b.forearmL.rotation.set(chase ? 0.1 : 1.3, 0, 0);
  b.handL.rotation.set(0, 0, 0);
  rig.lamp.intensity = 2.2 * p.flicker * (chase ? 1.3 : 1);
  // the beam points where they look
  rig.beam.intensity = (chase ? 9 : 6) * p.flicker;
  const lampWorld = new THREE.Vector3();
  rig.lamp.getWorldPosition(lampWorld);
  rig.group.worldToLocal(lampWorld);
  rig.beam.position.copy(lampWorld);
  const look = b.head.rotation.y;
  rig.beam.target.position.set(Math.sin(look) * -4, 0.2, -4 * Math.cos(look));
}

if (__DEV__) (globalThis as { __animateHushman?: typeof animateHushman }).__animateHushman = animateHushman; // pose tuning from the console
