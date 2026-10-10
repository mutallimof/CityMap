import * as THREE from 'three';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { CONFIG } from '../config';
import { sharedFrame, sharedRenderer } from '../three/context';
import { coastField } from './distance-field';

const VS = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vPos;
  void main() {
    vUv = uv;
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FS = /* glsl */ `
  uniform sampler2D uDist;
  uniform float uTime;
  uniform float uNight;
  uniform float uSparkle;
  uniform float uMotion;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSunColor;
  uniform vec3 uCityLight;
  uniform vec2 uSunDir;   // ground direction towards the sun (local xy, unit)
  uniform vec2 uCentre;   // view centre in local metres
  uniform float uViewR;   // rough view radius (m)
  uniform float uRain;    // 0–1 rain-drop rings
  uniform float uChop;    // 0–1 wind-driven roughness
  varying vec2 vUv;
  varying vec2 vPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    float d = texture2D(uDist, vUv).r;            // 0 at the coast → 1 far out
    float t = uTime * uMotion;
    // Lighter near shores, darker mid-strait.
    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.85, d));
    // Slow ripples: two drifting noise octaves modulate brightness.
    vec2 p = vPos * 0.0035;
    float tc = t * (1.0 + uChop * 2.5);
    float r1 = noise(p * 2.0 + vec2(tc * 0.020, tc * 0.012));
    float r2 = noise(p * 5.3 - vec2(tc * 0.031, -tc * 0.018));
    float r3 = noise(p * 13.0 + vec2(tc * 0.07, tc * 0.05));
    float ripple = r1 * 0.6 + r2 * 0.4;
    float amp = 0.14 + uChop * 0.22;
    col *= 1.0 - amp * 0.5 + (ripple * (1.0 - uChop * 0.4) + r3 * uChop * 0.4) * amp;
    // Wind: whitecaps on the open water.
    float caps = smoothstep(0.80, 0.9, r3 * 0.55 + r2 * 0.45) * uChop * smoothstep(0.1, 0.4, d);
    col = mix(col, vec3(0.93, 0.97, 0.98) * (1.0 - uNight * 0.7), caps * 0.55);
    // Sparkle: small glints at a constant on-screen size. The noise scale follows metres-per-pixel
    // in octaves, blending neighbours so glints neither grow into blobs nor pop when zooming.
    float mpp = max(length(fwidth(vPos)), 0.05);
    float lod = log2(mpp);
    float l0 = floor(lod);
    float fr = lod - l0;
    vec2 drift = vec2(t * 0.35, -t * 0.27);
    float s0 = exp2(-l0) / 5.0;
    float s1 = exp2(-l0 - 1.0) / 5.0;
    float g0 = noise(vPos * s0 + drift) * noise(vPos * s0 * 1.7 - drift.yx * 1.3);
    float g1 = noise(vPos * s1 + drift) * noise(vPos * s1 * 1.7 - drift.yx * 1.3);
    float g = mix(g0, g1, fr);
    float sunSide = 0.35 + 0.65 * smoothstep(-0.6, 1.0, dot(normalize(vPos - uCentre + 1e-3), uSunDir) * clamp(length(vPos - uCentre) / uViewR, 0.0, 1.0) * 2.0);
    col += uSunColor * smoothstep(0.6, 0.72, g) * uSparkle * sunSide * smoothstep(0.02, 0.15, d);
    // Rain: drop rings at a constant on-screen size (same octave trick as the glints).
    if (uRain > 0.001) {
      float rings = 0.0;
      for (int k = 0; k < 2; k++) {
        float cell = exp2(l0 + float(k)) * 20.0;
        vec2 q = vPos / cell;
        vec2 id = floor(q);
        vec2 f = fract(q) - 0.5;
        float h = hash(id);
        vec2 off = vec2(hash(id + 7.3), hash(id + 1.9)) - 0.5;
        float ph = fract(t * (0.9 + h * 0.6) + h * 7.0);
        float rad = ph * 0.42;
        float dd = length(f - off * 0.3);
        float ring = smoothstep(0.05, 0.0, abs(dd - rad)) * (1.0 - ph) * step(h, uRain * 0.9);
        rings += ring * (k == 0 ? 1.0 - fr : fr);
      }
      col += vec3(0.75, 0.85, 0.9) * rings * 0.26 * (1.0 - uNight * 0.5);
      col *= 1.0 - uRain * 0.12;
    }
    // Night: warm city lights reflected along the shore, gently flickering.
    // Thin and patchy: lit quays and windows, not a continuous band.
    float shore = 1.0 - smoothstep(0.0, 0.045, d);
    float patches = smoothstep(0.35, 0.8, noise(vPos * 0.006 + 3.1));
    float flick = noise(vPos * 0.03 + vec2(0.0, t * 0.3));
    col += uCityLight * shore * shore * uNight * patches * (0.12 + 0.5 * flick);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface WaterUniforms {
  deep: string;
  shallow: string;
  night: number;
  sparkle: number;
  sunColor: string;
  sunAzimuth: number;
  rain?: number;
  chop?: number;
}

/**
 * Animated water under the land (MapLibre draws land on top). A lon/lat grid mesh over the data
 * bounds carries the distance-to-coast texture so the gradient lines up with the coastline.
 */
export class WaterLayer implements CustomLayerInterface {
  readonly id = 'water-shader';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private material!: THREE.ShaderMaterial;
  private start = performance.now();
  /** Animation speed multiplier (0 freezes ripples — reduce-motion). */
  motion = 1;

  constructor(private land: FeatureCollection<Polygon | MultiPolygon>) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = sharedRenderer(map, gl);
    const w = CONFIG.water;
    const field = coastField(this.land, CONFIG.bounds, w.fieldWidth, w.fieldMaxM);
    const tex = new THREE.DataTexture(field.data, field.width, field.height, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uDist: { value: tex },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uSparkle: { value: 1 },
        uMotion: { value: 1 },
        uDeep: { value: new THREE.Color(CONFIG.colors.day.water) },
        uShallow: { value: new THREE.Color(CONFIG.colors.day.waterShallow) },
        uSunColor: { value: new THREE.Color('#ffffff') },
        uCityLight: { value: new THREE.Color(w.cityLight) },
        uSunDir: { value: new THREE.Vector2(0, -1) },
        uCentre: { value: new THREE.Vector2() },
        uViewR: { value: 5000 },
        uRain: { value: 0 },
        uChop: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Lon/lat grid → local metres, uv = position in the lon/lat box (matches the texture).
    const [W, S, E, N] = CONFIG.bounds;
    const seg = 48;
    const g = new THREE.PlaneGeometry(1, 1, seg, seg);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const [x, y] = sharedFrame.local([W + (E - W) * u, S + (N - S) * v]);
      pos.setXYZ(i, x, y, 0);
    }
    pos.needsUpdate = true;
    const mesh = new THREE.Mesh(g, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  set(u: WaterUniforms): void {
    if (!this.material) return;
    const m = this.material.uniforms;
    m.uDeep.value.set(u.deep);
    m.uShallow.value.set(u.shallow);
    m.uNight.value = u.night;
    m.uSparkle.value = u.sparkle;
    m.uSunColor.value.set(u.sunColor);
    const a = (u.sunAzimuth * Math.PI) / 180;
    m.uSunDir.value.set(Math.sin(a), Math.cos(a));
    m.uRain.value = u.rain ?? 0;
    m.uChop.value = u.chop ?? 0;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const m = this.material.uniforms;
    m.uTime.value = (performance.now() - this.start) / 1000;
    m.uMotion.value = this.motion;
    const c = this.map.getCenter();
    const [cx, cy] = sharedFrame.local([c.lng, c.lat]);
    m.uCentre.value.set(cx, cy);
    m.uViewR.value = 40_000 / 2 ** (this.map.getZoom() - 10);
    this.camera.projectionMatrix = sharedFrame.projection(args);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
