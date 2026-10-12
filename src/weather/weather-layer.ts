import { look } from '../themes';
import * as THREE from 'three';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { sharedFrame, sharedRenderer } from '../three/context';

/**
 * Weather drawn over the whole map in one custom layer (top of the stack):
 *  - fog banks: a ground sheet of drifting noise, thicker towards the horizon — ferries sailing
 *    through it fade in and out because the sheet is drawn over them;
 *  - rain streaks / snowflakes: screen-space instanced quads, animated entirely in the vertex shader;
 *  - lightning: a brief full-screen flash during storms.
 * Everything is a function of real time and uniforms; nothing per-particle on the CPU.
 */

const FOG_VS = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = (modelMatrix * vec4(position, 1.0)).xy;   // local metres
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FOG_FS = /* glsl */ `
  uniform float uFog;
  uniform float uTime;
  uniform float uCellM;
  uniform vec2 uDrift;
  uniform vec2 uCentre;
  uniform vec2 uFwd;
  uniform float uViewR;
  uniform float uAlpha;
  uniform vec3 uColor;
  varying vec2 vPos;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 p = (vPos - uDrift * uTime) / uCellM;
    float n = noise(p) * 0.55 + noise(p * 2.3 + 4.1) * 0.3 + noise(p * 5.1 - 2.7) * 0.15;
    float banks = smoothstep(0.30, 0.70, n);
    vec2 v = vPos - uCentre;
    float ahead = dot(v, uFwd) / uViewR;            // > 0 towards the horizon
    float dist = smoothstep(-0.4, 1.1, ahead);
    float a = uFog * uAlpha * clamp(0.12 + banks * 0.8 + dist * 0.5, 0.0, 1.0);
    // Fade the sheet's edge so it never shows as a square.
    a *= 1.0 - smoothstep(uViewR * 2.2, uViewR * 3.0, length(v));
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

const PRECIP_VS = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform vec2 uRes;
  uniform float uLen;
  uniform float uWidth;
  uniform float uSpeed;
  uniform float uSlant;
  uniform float uSnow;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = position.xy + vec2(0.5, 0.0);
    float speed = uSpeed * (0.75 + aSeed.z * 0.5);
    float sway = uSnow * sin(uTime * (0.6 + aSeed.z) + aSeed.x * 40.0) * 0.015;
    vec2 head = vec2(fract(aSeed.x + uTime * uSlant * speed * 0.5 + sway), fract(aSeed.y - uTime * speed));
    head = head * 2.2 - 1.1;
    vec2 dir = normalize(vec2(uSlant, -1.0));        // fall direction, pixels (y up)
    vec2 perp = vec2(-dir.y, dir.x);
    float size = mix(uLen * (0.6 + aSeed.z * 0.8), uWidth * (0.5 + aSeed.z), uSnow);
    float w = mix(uWidth, size, uSnow);
    vec2 px = -dir * position.y * size + perp * position.x * w;   // tail trails behind the head
    vFade = 0.55 + 0.45 * aSeed.z;
    gl_Position = vec4(head + px * 2.0 / uRes, 0.0, 1.0);
  }
`;

const PRECIP_FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uSnow;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    // Rain: streak brightest at the head, fading to the tail. Snow: soft round flake.
    float streak = (1.0 - vUv.y) * (1.0 - abs(vUv.x - 0.5) * 2.0);
    vec2 c = vec2(vUv.x - 0.5, vUv.y - 0.5) * 2.0;
    float flake = smoothstep(1.0, 0.35, length(c));
    float a = mix(streak, flake, uSnow) * uAlpha * vFade;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

const FLASH_VS = /* glsl */ `void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`;
const FLASH_FS = /* glsl */ `uniform float uA; void main() { gl_FragColor = vec4(0.9, 0.93, 1.0, uA); }`;

export interface WeatherVisuals {
  rain: number;
  snow: number;
  fog: number;
  thunder: number;
  /** Bearing (°) the wind blows towards and its speed (m/s). */
  windToward: number;
  windMs: number;
  night: number;
}

export class WeatherLayer implements CustomLayerInterface {
  readonly id = 'weather';
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;

  /** 0–1 particle budget (adaptive quality); reduce-motion freezes motion and disables flashes. */
  quality = 1;
  reduceMotion = false;
  private v: WeatherVisuals = { rain: 0, snow: 0, fog: 0, thunder: 0, windToward: 215, windMs: 2, night: 0 };
  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private camera = new THREE.Camera();
  private worldScene = new THREE.Scene();
  private screenScene = new THREE.Scene();
  private fogMat!: THREE.ShaderMaterial;
  private fogMesh!: THREE.Mesh;
  private rainMat!: THREE.ShaderMaterial;
  private snowMat!: THREE.ShaderMaterial;
  private rain!: THREE.Mesh<THREE.InstancedBufferGeometry>;
  private snow!: THREE.Mesh<THREE.InstancedBufferGeometry>;
  private flashMat!: THREE.ShaderMaterial;
  private flash!: THREE.Mesh;
  private ident = new THREE.Camera();
  private nextFlash = 0;
  private flashAt = -10;
  private start = performance.now();

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = sharedRenderer(map, gl);
    const w = CONFIG.weather;
    const common = { transparent: true, depthTest: false, depthWrite: false };

    this.fogMat = new THREE.ShaderMaterial({
      vertexShader: FOG_VS,
      fragmentShader: FOG_FS,
      uniforms: {
        uFog: { value: 0 },
        uTime: { value: 0 },
        uCellM: { value: w.fogCellM },
        uDrift: { value: new THREE.Vector2() },
        uCentre: { value: new THREE.Vector2() },
        uFwd: { value: new THREE.Vector2(0, 1) },
        uViewR: { value: 5000 },
        uAlpha: { value: look().weather.fogAlpha },
        uColor: { value: new THREE.Color(look().weather.fogColor) },
      },
      ...common,
    });
    this.fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fogMat);
    this.fogMesh.frustumCulled = false;
    this.worldScene.add(this.fogMesh);

    const precip = (count: number, snow: boolean) => {
      const g = new THREE.InstancedBufferGeometry();
      // Quad: x across (−0.5…0.5), y along the fall (0 head … 1 tail).
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const seeds = new Float32Array(count * 3);
      for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
      g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
      g.instanceCount = 0;
      const mat = new THREE.ShaderMaterial({
        vertexShader: PRECIP_VS,
        fragmentShader: PRECIP_FS,
        uniforms: {
          uTime: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uLen: { value: snow ? w.snowSizePx : w.rainLengthPx },
          uWidth: { value: snow ? w.snowSizePx : w.rainWidthPx },
          uSpeed: { value: snow ? w.snowSpeed : w.rainSpeed },
          uSlant: { value: 0 },
          uSnow: { value: snow ? 1 : 0 },
          uColor: { value: new THREE.Color(snow ? '#ffffff' : look().weather.rainColor) },
          uAlpha: { value: snow ? 0.9 : look().weather.rainAlpha },
        },
        ...common,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      this.screenScene.add(mesh);
      return [mesh, mat] as const;
    };
    [this.rain, this.rainMat] = precip(w.rainDrops, false);
    [this.snow, this.snowMat] = precip(w.snowFlakes, true);

    this.flashMat = new THREE.ShaderMaterial({ vertexShader: FLASH_VS, fragmentShader: FLASH_FS, uniforms: { uA: { value: 0 } }, ...common });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flashMat);
    this.flash.frustumCulled = false;
    this.screenScene.add(this.flash);
  }

  private fogDay = new THREE.Color(look().weather.fogColor);
  private fogNight = new THREE.Color(look().weather.fogNight);

  /** Theme switch: fog and rain colours. */
  retheme(): void {
    const w = look().weather;
    this.fogDay.set(w.fogColor);
    this.fogNight.set(w.fogNight);
    this.rainMat?.uniforms.uColor.value.set(w.rainColor);
  }

  set(v: WeatherVisuals): void {
    this.v = v;
  }

  /** True when something is falling / drifting and the map should keep repainting. */
  get active(): boolean {
    return this.v.rain > 0.01 || this.v.snow > 0.01 || this.v.fog > 0.01;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const v = this.v;
    if (!this.active && v.thunder < 0.01) return;
    const w = CONFIG.weather;
    const t = this.reduceMotion ? 0 : (performance.now() - this.start) / 1000;
    this.renderer.resetState();

    // Wind blows towards `windToward`: on screen that's relative to the map bearing.
    const rel = ((v.windToward - this.map.getBearing()) * Math.PI) / 180;
    const [wx, wy] = [Math.sin((v.windToward * Math.PI) / 180), Math.cos((v.windToward * Math.PI) / 180)];

    if (v.fog > 0.01) {
      const u = this.fogMat.uniforms;
      const c = this.map.getCenter();
      const [cx, cy] = sharedFrame.local([c.lng, c.lat]);
      const R = 40_000 / 2 ** (this.map.getZoom() - 10);
      const b = (this.map.getBearing() * Math.PI) / 180;
      u.uFog.value = v.fog;
      u.uTime.value = t;
      u.uDrift.value.set(wx * w.fogDriftMs * Math.max(0.4, v.windMs / 3), wy * w.fogDriftMs * Math.max(0.4, v.windMs / 3));
      u.uCentre.value.set(cx, cy);
      u.uFwd.value.set(Math.sin(b), Math.cos(b));
      u.uViewR.value = R;
      u.uColor.value.copy(this.fogDay).lerp(this.fogNight, v.night);
      u.uAlpha.value = look().weather.fogAlpha * (1 - v.night * 0.25);
      this.fogMesh.position.set(cx, cy, 0);
      this.fogMesh.scale.set(R * 6, R * 6, 1);
      this.camera.projectionMatrix = sharedFrame.projection(args);
      this.renderer.render(this.worldScene, this.camera);
    }

    const canvas = this.map.getCanvas();
    const ratio = canvas.width / canvas.clientWidth || 1;
    const res = [canvas.width / ratio, canvas.height / ratio] as const;
    const slant = Math.max(-0.6, Math.min(0.6, Math.sin(rel) * v.windMs * 0.05));
    const setP = (mesh: THREE.Mesh<THREE.InstancedBufferGeometry>, mat: THREE.ShaderMaterial, amount: number, max: number) => {
      const count = Math.round(max * amount * this.quality);
      mesh.geometry.instanceCount = count;
      mesh.visible = count > 0;
      const u = mat.uniforms;
      u.uTime.value = t;
      u.uRes.value.set(res[0], res[1]);
      u.uSlant.value = slant;
    };
    setP(this.rain, this.rainMat, v.rain, w.rainDrops);
    setP(this.snow, this.snowMat, v.snow, w.snowFlakes);
    this.rainMat.uniforms.uAlpha.value = look().weather.rainAlpha * (1 - v.night * 0.4);

    // Lightning: random double flicker, mean `lightningEveryS` apart.
    let flash = 0;
    if (v.thunder > 0.5 && !this.reduceMotion) {
      if (t > this.nextFlash) {
        this.flashAt = t;
        this.nextFlash = t + w.lightningEveryS * (0.4 + Math.random() * 1.2);
      }
      const ft = t - this.flashAt;
      if (ft < 0.6) flash = Math.max(0, Math.exp(-ft * 9) * 0.55 + (ft > 0.18 ? Math.exp(-(ft - 0.18) * 7) * 0.4 : 0));
    }
    this.flashMat.uniforms.uA.value = flash;
    this.flash.visible = flash > 0.01;
    if (this.rain.visible || this.snow.visible || this.flash.visible) this.renderer.render(this.screenScene, this.ident);
  }
}
