// three.js renderer on an expo-gl context, rendering at a reduced internal resolution, then a single
// post pass that does all the horror look: suffocation vignette, blur, colour drain, grain, fades.
import * as THREE from 'three';
import { Platform } from 'react-native';
import { RENDER } from '../config';
import type { GL } from './assets';

export type PostParams = { air: number; panic: number; pulse: number; fade: number; flash: number; shake: number };

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uAir, uPanic, uPulse, uFade, uFlash, uTime;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float suffocate = clamp(1.0 - uAir / 0.35, 0.0, 1.0);   // 0 until air drops below 35%
  vec2 c = vUv - 0.5;
  float d = length(c * vec2(uRes.x / uRes.y, 1.0));
  // chromatic split and blur creep in as air runs out
  vec2 ca = c * (0.004 + 0.012 * suffocate * suffocate);
  vec3 col = vec3(texture2D(tScene, vUv + ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - ca).b);
  if (suffocate > 0.0) {
    float r = 0.004 * suffocate;
    vec3 blur = texture2D(tScene, vUv + vec2(r, 0.0)).rgb + texture2D(tScene, vUv - vec2(r, 0.0)).rgb
              + texture2D(tScene, vUv + vec2(0.0, r)).rgb + texture2D(tScene, vUv - vec2(0.0, r)).rgb;
    col = mix(col, blur * 0.25, suffocate * 0.7);
  }
  // colour drains with the air
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(luma), 0.15 + 0.55 * suffocate);
  // the vignette closes in and pulses with the heartbeat
  float edge = 0.95 - 0.45 * suffocate - 0.08 * uPanic - 0.06 * uPulse * suffocate;
  float vig = smoothstep(edge, edge - 0.55, d);
  col *= vig;
  col += vec3(0.25, 0.0, 0.0) * uPulse * suffocate * (1.0 - vig) * 0.6;
  col += uFlash;
  // film grain
  col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * 0.045;
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Renderer {
  readonly three: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private post: THREE.ShaderMaterial;
  readonly width: number;
  readonly height: number;
  readonly scale: number;

  constructor(readonly gl: GL) {
    this.width = gl.drawingBufferWidth;
    this.height = gl.drawingBufferHeight;
    if (Platform.OS !== 'web') patchExpoGL(gl);
    const canvas = {
      width: this.width, height: this.height, style: {}, clientWidth: this.width, clientHeight: this.height,
      addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
    } as unknown as HTMLCanvasElement;
    // three reads gl.canvas when resetting state; expo-gl contexts don't have one
    if (!(gl as { canvas?: unknown }).canvas) Object.defineProperty(gl, 'canvas', { value: canvas, configurable: true });
    this.three = createThreeRenderer(canvas, gl);
    this.three.setPixelRatio(1);
    this.three.setSize(this.width, this.height, false);
    this.three.toneMapping = THREE.ACESFilmicToneMapping;
    this.three.toneMappingExposure = 1.15;
    this.three.outputColorSpace = THREE.SRGBColorSpace;

    const canFloat = !!gl.getExtension('EXT_color_buffer_float');
    // render below screen resolution for speed, but never so low that it turns blocky
    this.scale = Math.min(1, Math.max(RENDER.scale, RENDER.minInternalWidth / this.width));
    this.target = new THREE.WebGLRenderTarget(Math.round(this.width * this.scale), Math.round(this.height * this.scale), {
      type: canFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      colorSpace: canFloat ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace,
      depthBuffer: true,
    });
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        uRes: { value: new THREE.Vector2(this.width, this.height) },
        uAir: { value: 1 }, uPanic: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 }, uFlash: { value: 0 }, uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
  }

  render(scene: THREE.Scene, camera: THREE.Camera, p: PostParams, time: number, overlay?: { scene: THREE.Scene; camera: THREE.Camera }) {
    const u = this.post.uniforms;
    u.uAir.value = p.air; u.uPanic.value = p.panic; u.uPulse.value = p.pulse;
    u.uFade.value = p.fade; u.uFlash.value = p.flash; u.uTime.value = time;
    this.three.setRenderTarget(this.target);
    this.three.render(scene, camera);
    if (overlay) {
      // first-person hands: drawn over the world with fresh depth, so they never sink into walls
      this.three.autoClear = false;
      this.three.clearDepth();
      this.three.render(overlay.scene, overlay.camera);
      this.three.autoClear = true;
    }
    this.three.setRenderTarget(null);
    this.three.render(this.postScene, this.postCam);
    this.gl.endFrameEXP?.();
  }

  dispose() {
    this.target.dispose();
    this.post.dispose();
    this.three.dispose();
  }
}

/**
 * expo-gl's WebGL2 context also passes `instanceof WebGLRenderingContext`, which three (r163+) reads as
 * WebGL 1 and refuses. When the context really is WebGL 2, hide the WebGL 1 class during construction.
 */
function createThreeRenderer(canvas: HTMLCanvasElement, gl: GL): THREE.WebGLRenderer {
  const version = String(gl.getParameter(gl.VERSION) ?? '');
  const isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) || /WebGL 2|OpenGL ES 3/.test(version);
  if (!isWebGL2) throw new Error(`This device only supports WebGL 1 (${version}); Gravebreath needs OpenGL ES 3.`);
  const g = globalThis as { WebGLRenderingContext?: unknown };
  const saved = g.WebGLRenderingContext;
  g.WebGLRenderingContext = undefined;
  try {
    return new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, powerPreference: 'high-performance' });
  } finally {
    g.WebGLRenderingContext = saved;
  }
}

/** expo-gl logs a warning for every browser-only pixelStorei flag three sets; drop those calls. */
function patchExpoGL(gl: GL) {
  const orig = gl.pixelStorei.bind(gl);
  const browserOnly = new Set<number>([gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_COLORSPACE_CONVERSION_WEBGL]);
  gl.pixelStorei = ((pname: number, param: number | boolean) => {
    if (!browserOnly.has(pname)) orig(pname as never, param as number);
  }) as typeof gl.pixelStorei;
  if (!gl.getContextAttributes || !gl.getContextAttributes()) {
    gl.getContextAttributes = () => ({ alpha: true, antialias: false, depth: true, stencil: true, premultipliedAlpha: true, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false, powerPreference: 'default', desynchronized: false, xrCompatible: false });
  }
}

export function materialFrom(maps: { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }, repeatX: number, repeatY: number, opts: { tint?: number; normalScale?: number } = {}) {
  const tile = (t: THREE.Texture) => {
    const c = t.clone();
    c.repeat.set(repeatX, repeatY);
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: tile(maps.map),
    normalMap: tile(maps.normalMap),
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    roughnessMap: tile(maps.arm),
    aoMap: tile(maps.arm),
    aoMapIntensity: 1,
    metalness: 0,
    color: opts.tint ?? 0xffffff,
  });
}
