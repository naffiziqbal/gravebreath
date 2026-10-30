// Loads bundled textures and models into three.js on both native (expo-gl) and web.
//
// Native: expo-gl can upload an image file straight from an Asset into a GL texture, so we create the
// GL texture ourselves and hand it to three as an ExternalTexture. This avoids three's image loaders,
// which need the browser's Image/Canvas APIs.
import './polyfills';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { MODELS, TEXTURES, type ModelName, type TextureName } from './manifest';
import type { SkinnedData } from './skinned';

export type GL = WebGL2RenderingContext & { endFrameEXP?: () => void };

export type MaterialMaps = { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture };

export class Assets {
  private textures = new Map<string, Promise<THREE.Texture>>();
  private models = new Map<ModelName, Promise<THREE.Group>>();

  constructor(private renderer: THREE.WebGLRenderer, private gl: GL) {}

  texture(module: number, srgb: boolean): Promise<THREE.Texture> {
    const key = `${module}:${srgb}`;
    let p = this.textures.get(key);
    if (!p) {
      p = this.loadTexture(module, srgb);
      this.textures.set(key, p);
    }
    return p;
  }

  async materialMaps(name: TextureName): Promise<MaterialMaps> {
    const t = TEXTURES[name];
    const [map, normalMap, arm] = await Promise.all([this.texture(t.diff, true), this.texture(t.nor, false), this.texture(t.arm, false)]);
    return { map, normalMap, arm };
  }

  /** A sculpted, skinned mesh: the first-person hand or the Listener (tools/make_hand.py, tools/make_listener.py). */
  async skinnedData(which: 'hand' | 'listener' | 'hushman'): Promise<SkinnedData> {
    const files = {
      hand: { bin: require('../../../assets/game/hand/hand.bin'), json: require('../../../assets/game/hand/hand.json') },
      listener: { bin: require('../../../assets/game/listener/listener.bin'), json: require('../../../assets/game/listener/listener.json') },
      hushman: { bin: require('../../../assets/game/hushman/hushman.bin'), json: require('../../../assets/game/hushman/hushman.json') },
    }[which];
    const asset = Asset.fromModule(files.bin);
    await asset.downloadAsync();
    const buffer = Platform.OS === 'web'
      ? await (await fetch(asset.localUri ?? asset.uri)).arrayBuffer()
      : await new File(asset.localUri ?? asset.uri).arrayBuffer();
    return { buffer, bones: (files.json as Pick<SkinnedData, 'bones'>).bones };
  }

  /** A fresh copy of a model (geometry and materials are shared between copies). */
  async model(name: ModelName): Promise<THREE.Group> {
    let p = this.models.get(name);
    if (!p) {
      p = this.loadModel(name);
      this.models.set(name, p);
    }
    return (await p).clone(true);
  }

  private async loadTexture(module: number, srgb: boolean): Promise<THREE.Texture> {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    let tex: THREE.Texture;
    if (Platform.OS === 'web') {
      tex = await new THREE.TextureLoader().loadAsync(asset.localUri ?? asset.uri);
      tex.flipY = false;
      tex.anisotropy = 4;
    } else {
      const gl = this.gl;
      const glTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, glTex);
      // expo-gl accepts an object with `localUri` as the pixel source and reads its size from the file
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as unknown as ImageData);
      if (srgb && gl.getError() !== gl.NO_ERROR) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as unknown as ImageData);
      }
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, null);
      tex = new THREE.ExternalTexture(glTex);
      this.renderer.resetState(); // we changed GL bindings behind three's back
    }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  }

  private async loadModel(name: ModelName): Promise<THREE.Group> {
    const m = MODELS[name];
    const asset = Asset.fromModule(m.glb);
    await asset.downloadAsync();
    const data = Platform.OS === 'web'
      ? await (await fetch(asset.localUri ?? asset.uri)).arrayBuffer()
      : await new File(asset.localUri ?? asset.uri).arrayBuffer();
    const images = m.images as Record<string, { src: number; srgb: boolean }>;
    const loader = new GLTFLoader();
    loader.register((parser) => ({
      name: 'gravebreath_bundled_textures',
      loadTexture: (index: number) => {
        const json = parser.json as { textures: { source: number }[]; images: { uri: string }[] };
        const img = images[json.images[json.textures[index].source].uri];
        return img ? this.texture(img.src, img.srgb) : null;
      },
    }) as never);
    const gltf = await loader.parseAsync(data, '');
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.transparent && mat.opacity === 1) mat.transparent = false;
      }
    });
    return gltf.scene;
  }
}
