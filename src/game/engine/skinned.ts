// Skinned meshes sculpted by tools/make_hand.py and tools/make_listener.py.
// Binary layout: V, F (u32), positions, normals, uvs, colours (f32), skin indices (u16 x4), skin weights (f32 x4), triangles (u32).
import * as THREE from 'three';

export type SkinnedData = { buffer: ArrayBuffer; bones: { name: string; parent: number; pos: number[] }[] };

export function readSkinnedGeometry(buf: ArrayBuffer) {
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

/** Bones at their rest positions (no rotation), bound to the mesh. */
export function buildSkinned(data: SkinnedData, material: THREE.Material) {
  const bones = data.bones.map((b) => { const bone = new THREE.Bone(); bone.name = b.name; return bone; });
  data.bones.forEach((b, i) => {
    const p = b.parent >= 0 ? data.bones[b.parent].pos : [0, 0, 0];
    bones[i].position.set(b.pos[0] - p[0], b.pos[1] - p[1], b.pos[2] - p[2]);
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  const mesh = new THREE.SkinnedMesh(readSkinnedGeometry(data.buffer), material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false;
  const byName = Object.fromEntries(bones.map((b) => [b.name, b])) as Record<string, THREE.Bone>;
  return { mesh, bones, byName };
}
