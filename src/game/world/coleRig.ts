// Cole: the man who brought you to Vael, at the graveyard gate. His own sculpted body (tools/make_cole.py), posed with a
// lantern hanging from his fist by its handle. He only breathes, watches you, and lets the lantern sway.
import * as THREE from 'three';
import type { Assets } from '../engine/assets';
import { buildSkinned } from '../engine/skinned';
import { hangLantern } from './hushmanRig';

export type ColeRig = { group: THREE.Group; bones: Record<string, THREE.Bone>; lamp: THREE.PointLight };

export async function buildColeRig(assets: Assets): Promise<ColeRig> {
  const data = await assets.skinnedData('cole');
  const { mesh, byName } = buildSkinned(data, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  const group = new THREE.Group();
  group.add(mesh);
  const lamp = await hangLantern(assets, byName.handR, 0.7);
  lamp.intensity = 0.8;
  return { group, bones: byName, lamp };
}

export function animateCole(rig: ColeRig, time: number, flicker: number) {
  const b = rig.bones;
  b.chest.rotation.x = Math.sin(time * 1.1) * 0.012; // breathing
  b.head.rotation.set(0.05 + Math.sin(time * 0.4) * 0.015, Math.sin(time * 0.27) * 0.05, 0);
  b.handR.rotation.z = Math.sin(time * 1.3) * 0.025; // the lantern swings a little on its handle
  rig.lamp.intensity = 0.8 * flicker;
}
