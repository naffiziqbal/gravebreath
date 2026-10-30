// The Listener's body (tools/make_listener.py) and its procedural animation: a hunched, wrong walk,
// the head twitching to listen, the jaw working, and a lunge when it reaches you.
import * as THREE from 'three';
import type { Assets } from '../engine/assets';
import { buildSkinned } from '../engine/skinned';
import type { ListenerMode } from '../sim/listener';

export type ListenerRig = { group: THREE.Group; bones: Record<string, THREE.Bone>; twitch: number; twitchAt: number; tilt: number; hipsY: number };

export async function buildListenerRig(assets: Assets): Promise<ListenerRig> {
  const [data, rock] = await Promise.all([assets.skinnedData('listener'), assets.materialMaps('catacomb_rock')]);
  // mottled grey skin from the vertex colours; the rock normals give it a dry, cracked surface
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x857a70, roughness: 0.9, normalMap: rock.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
  const { mesh, byName } = buildSkinned(data, skin);
  const group = new THREE.Group();
  group.add(mesh);
  return { group, bones: byName, twitch: 0, twitchAt: 0, tilt: 0.4, hipsY: byName.hips.position.y };
}

export type ListenerPose = { time: number; dt: number; mode: ListenerMode; moving: boolean; lunge: number /* 0..1 */ };

/** Pose the body for this frame. Rest pose is upright; everything here is rotation on top of it. */
export function animateListener(rig: ListenerRig, p: ListenerPose) {
  const b = rig.bones;
  const hunting = p.mode === 'hunt';
  const speed = hunting ? 6.5 : 3.6;
  const gait = p.moving ? Math.sin(p.time * speed) : 0;
  const gait2 = p.moving ? Math.sin(p.time * speed * 2) : 0;

  // every so often the head snaps to a new angle, listening, then holds it
  if (p.time > rig.twitchAt) {
    rig.twitchAt = p.time + (hunting ? 0.25 + Math.random() * 0.4 : 0.8 + Math.random() * 2.2);
    rig.twitch = 1;
    rig.tilt = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35);
  }
  rig.twitch = Math.max(0, rig.twitch - p.dt * 8);
  const jitter = rig.twitch * (Math.random() - 0.5) * 0.25;

  const l = p.lunge;
  // hunched far forward, the neck craning so the blind face points ahead
  b.spine.rotation.set(-0.22 - 0.1 * l, gait * 0.05, 0);
  b.chest.rotation.set(-0.3 - 0.25 * l + gait2 * 0.03, gait * 0.08, 0);
  // when it lunges the neck straightens and the face comes up level with yours
  b.neck.rotation.set(-0.35 + 0.25 * l, 0, 0);
  b.head.rotation.set(0.75 + 0.75 * l + jitter, jitter * 0.6, rig.tilt * (1 - l) + jitter);
  // the jaw hangs open and works; it gapes when hunting and when it lunges
  b.jaw.rotation.x = -(0.18 + (hunting ? 0.2 : 0.06) + 0.06 * Math.sin(p.time * 9) + 0.35 * l);
  b.hips.position.y = rig.hipsY + Math.abs(gait) * 0.025 - 0.04 * l; // bob on top of the rest height
  b.hips.rotation.set(0, gait * 0.06, gait * 0.04);

  for (const [side, s] of [['L', 1], ['R', -1]] as const) {
    const swing = gait * s;
    // arms: hang straight down despite the hunch, swing loosely; reach forward when hunting or lunging
    const reach = hunting ? 0.55 : 0;
    b[`upperArm${side}`].rotation.set(0.5 + reach + swing * 0.35 + l * 0.9, 0, s * (0.08 + 0.1 * l));
    b[`forearm${side}`].rotation.set(0.25 + (hunting ? 0.3 : 0) + l * 0.2, 0, 0);
    b[`hand${side}`].rotation.set(0.1, 0, 0);
    // fingers curl like claws, twitching
    b[`fingers${side}`].rotation.set(0.45 + Math.sin(p.time * 7 + s) * 0.08 - l * 0.4, 0, 0);
    // legs: a stiff, dragging stride; the knee only bends on the back swing
    b[`thigh${side}`].rotation.set(-swing * 0.42, 0, s * 0.02);
    const kneeBend = Math.max(0, swing) * 0.85 + 0.12;
    b[`shin${side}`].rotation.set(kneeBend, 0, 0);
    b[`foot${side}`].rotation.set(-(kneeBend - swing * 0.42) * 0.6, 0, 0);
  }
}

if (__DEV__) (globalThis as { __animateListener?: typeof animateListener }).__animateListener = animateListener; // pose tuning from the console
