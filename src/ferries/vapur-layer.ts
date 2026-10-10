import * as THREE from 'three';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { sharedFrame, sharedRenderer } from '../three/context';
import { CONFIG } from '../config';
import { vesselPose, type DockingParams, type VesselPose } from '../sim/fleet';
import type { LinePath } from '../sim/path';
import { HeadingSmoother, interpolateStops } from './headings';
import { buildVapur } from './model';
import { WakeMesh, type Trail } from './wake';
import { TrailCache } from './trail-cache';
import { PointSprites } from './points';
import { Gulls, type GullTarget } from './gulls';

const MAX_VESSELS = 128;
const DEG = Math.PI / 180;

export interface VapurLayerOptions {
  /** Called once per frame; every vessel's pose for the current sim time. */
  poses: () => VesselPose[];
  paths: Map<string, LinePath>;
  docking: DockingParams;
  lineColor: (lineId: string) => string;
}

/** Stable 0..1 hash of a vessel id (per-ship bob phase). */
function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function shadowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const unitFromBearing = (deg: number): [number, number] => [Math.sin(deg * DEG), Math.cos(deg * DEG)];

/** Long soft streak for night light reflections: an elongated radial glow, brightest near the ship. */
function streakTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 32; x++) {
      const u = (x + 0.5) / 16 - 1; // −1..1 across
      const v = (y + 0.5) / 128; // 0 at the far end … 1 at the ship
      const across = Math.max(0, 1 - u * u) ** 2;
      const along = Math.sin(Math.PI * v) ** 0.7 * (0.35 + 0.65 * v);
      const shimmer = 0.75 + 0.25 * Math.sin(y * 0.9) * Math.sin(y * 0.37);
      const a = Math.round(255 * across * along * shimmer);
      const i = (y * 32 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

/**
 * The vapur fleet in a MapLibre custom layer: instanced procedural hulls (body + line-colour
 * stripe), soft hull shadows and one wake mesh. Everything lives in local metres around
 * `camera.center`; the float64 view matrix is composed on the CPU.
 */
export class VapurLayer implements CustomLayerInterface {
  readonly id = 'ferries';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  /** Content in local metres (x east, y north, z up); the y flip to mercator is in the camera matrix. */
  private root = new THREE.Group();
  private camera = new THREE.Camera();
  private body!: THREE.InstancedMesh;
  private accent!: THREE.InstancedMesh;
  private shadow!: THREE.InstancedMesh;
  private windows!: THREE.InstancedMesh;
  private windowMat!: THREE.MeshBasicMaterial;
  private reflect!: THREE.InstancedMesh;
  private reflectMat!: THREE.MeshBasicMaterial;
  private lights = new PointSprites(MAX_VESSELS * 3, { additive: true, core: 1, minPx: 3, maxPx: 22 });
  private smoke = new PointSprites(MAX_VESSELS * CONFIG.smoke.puffs, { additive: false, core: 0, minPx: 1, maxPx: 120 });
  private gulls = new Gulls();
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private anchors!: ReturnType<typeof buildVapur>['anchors'];
  /** 0 = day, 1 = night (window glow, nav lights, reflections). Set by the day/night controller. */
  night = 0;
  /** Reduce-motion: no bob/bump/gulls, calmer smoke. */
  reduceMotion = false;
  /** Wind for the funnel smoke (bearing it blows towards, m/s); live weather overrides config. */
  /** 0–1 wind-driven sea state: more rocking. Set by the day/night + weather controller. */
  sea = 0;
  /** 0–1 fog: dims nav lights and reflections (the fog sheet covers the hulls). */
  fog = 0;
  wind = { toward: CONFIG.smoke.windToward as number, ms: CONFIG.smoke.windMs as number };
  /** User location (from "nearest pier"), unused by rendering for now. */
  userLocation: [number, number] | null = null;
  /** Selected vessel (ring + others dimmed), set by the UI. */
  selectedId: string | null = null;
  private wake = new WakeMesh(MAX_VESSELS, CONFIG.wake.maxSamples);
  private trails = new TrailCache(CONFIG.wake.seconds / (CONFIG.wake.samples - 1));
  private headings = new HeadingSmoother(CONFIG.ferries.headingTau);
  private lastPhase = new Map<string, string>();
  private bumpAt = new Map<string, number>();
  private lastFrame = performance.now();
  private o = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'ZXY'), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() };
  /** Last rendered poses. */
  visible: VesselPose[] = [];
  /** Where each vessel was actually drawn (local metres, incl. berth offsets) — for taps / follow. */
  drawn = new Map<string, { x: number; y: number; pose: VesselPose }>();
  private ring!: THREE.Mesh;
  private ringMat!: THREE.MeshBasicMaterial;
  private dim = new THREE.Color(CONFIG.selection.dimColor);
  private white = new THREE.Color('#ffffff');

  constructor(private opts: VapurLayerOptions) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = sharedRenderer(map, gl);

    const geo = buildVapur();
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.body = new THREE.InstancedMesh(geo.body, bodyMat, MAX_VESSELS);
    this.accent = new THREE.InstancedMesh(geo.accent, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), MAX_VESSELS);
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(CONFIG.ferries.shadowColor),
      alphaMap: shadowTexture(),
      transparent: true,
      opacity: CONFIG.ferries.shadowOpacity,
      depthWrite: false,
    });
    this.shadow = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_VESSELS);
    this.anchors = geo.anchors;
    this.windowMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.vapur.windows });
    this.windows = new THREE.InstancedMesh(geo.windows, this.windowMat, MAX_VESSELS);
    this.reflectMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(CONFIG.nightLights.reflection),
      alphaMap: streakTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.reflect = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.reflectMat, MAX_VESSELS);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), this.ringMat);
    this.ring.renderOrder = 1;
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    this.body.setColorAt(0, this.white); // allocates instanceColor (used to dim unselected ships)
    for (const m of [this.body, this.accent, this.shadow, this.windows, this.reflect]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
    }
    this.shadow.renderOrder = 0;
    this.body.renderOrder = 2;
    this.accent.renderOrder = 2;
    this.windows.renderOrder = 2;
    this.reflect.renderOrder = 1;
    this.smoke.points.renderOrder = 3;
    this.lights.points.renderOrder = 4;
    this.root.add(this.ring, this.shadow, this.reflect, this.wake.mesh, this.body, this.accent, this.windows, this.gulls.mesh, this.smoke.points, this.lights.points);
    this.scene.add(this.root);

    const l = CONFIG.light;
    this.hemi = new THREE.HemisphereLight(l.sky, l.ground, l.hemiIntensity);
    this.hemi.position.set(0, 0, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(l.sun, l.sunIntensity);
    this.setLighting({ sunAzimuth: l.sunAzimuth, sunElevation: l.sunElevation, sunColor: l.sun, sunIntensity: l.sunIntensity, sky: l.sky, ground: l.ground, hemiIntensity: l.hemiIntensity, night: 0 });
    this.scene.add(this.sun);
  }

  /** Light the fleet for the current sun/moon (called by the day/night controller). */
  setLighting(l: { sunAzimuth: number; sunElevation: number; sunColor: string; sunIntensity: number; sky: string; ground: string; hemiIntensity: number; night: number }): void {
    if (!this.sun) return;
    const [sx, sy] = unitFromBearing(l.sunAzimuth);
    const el = Math.max(8, l.sunElevation) * DEG; // keep some modelling light even at night (moon)
    this.sun.position.set(sx * Math.cos(el), sy * Math.cos(el), Math.sin(el));
    this.sun.color.set(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.hemi.color.set(l.sky);
    this.hemi.groundColor.set(l.ground);
    this.hemi.intensity = l.hemiIntensity;
    this.night = l.night;
    const nl = CONFIG.nightLights;
    this.windowMat.color.set(CONFIG.colors.vapur.windows).lerp(new THREE.Color(nl.windowGlow), Math.min(1, l.night * 1.2));
    this.reflectMat.opacity = nl.reflectionOpacity * l.night ** 2;
  }

  /** Local metres (x east, y north) of a lng/lat. */
  private local(lngLat: [number, number]): [number, number] {
    return sharedFrame.local(lngLat);
  }

  /**
   * Seaward offset (local metres) near a pier: clears the quay for exaggerated hulls, and moors
   * vessels of lines sharing a berth abreast (slot 1, 2, … further out) — never onto land.
   */
  private berthOffset(v: VesselPose, exag: number): [number, number] {
    const b = v.berth;
    if (!b || b.weight <= 0) return [0, 0];
    const f = CONFIG.ferries;
    const [sx, sy] = unitFromBearing(b.seaward);
    const beam = f.beamM * exag;
    const quay = Math.max(0, (beam / 2) * (1 + f.quayClearance) - f.berthOffsetM);
    const d = (quay + b.slot * beam * f.slotSpacing) * b.weight;
    return [sx * d, sy * d];
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const tReal = now / 1000;
    const f = CONFIG.ferries;
    const exag = interpolateStops(f.exaggeration, this.map.getZoom());
    const L = f.lengthM * exag;
    const B = f.beamM * exag;

    const poses = this.opts.poses();
    // Ground direction from the view centre towards the viewer (for night reflections).
    const viewBack = (this.map.getBearing() + 180) % 360;
    const [vbx, vby] = unitFromBearing(viewBack);
    const canvas = this.map.getCanvas();
    this.lights.begin(canvas.width, canvas.height);
    this.smoke.begin(canvas.width, canvas.height);
    const gullTargets: GullTarget[] = [];
    this.visible = poses;
    const { m, q, e, p, s, c } = this.o;
    const ids = new Set<string>();
    const trails: Trail[] = [];
    let n = 0;
    for (const v of poses) {
      if (n >= MAX_VESSELS) break;
      const id = v.state.vesselId;
      ids.add(id);
      const heading = this.headings.update(id, v.bearing, dt);
      const [ox, oy] = this.berthOffset(v, exag);
      const [x, y] = this.local(v.lngLat);
      const px = x + ox;
      const py = y + oy;

      // Settle bump: a damped surge/pitch when a vessel comes to rest at a pier (real time).
      const prev = this.lastPhase.get(id);
      if (prev === 'underway' && v.state.phase === 'docked') this.bumpAt.set(id, tReal);
      this.lastPhase.set(id, v.state.phase);
      const bt = tReal - (this.bumpAt.get(id) ?? -1e9);
      const bump = bt < 6 && !this.reduceMotion ? Math.exp(-bt / f.bump.decayS) * Math.sin((2 * Math.PI * bt) / f.bump.periodS) : 0;

      // Bob: gentle roll/pitch, per-ship phase, calmer when docked.
      const ph = hash01(id) * Math.PI * 2;
      const calm = (this.reduceMotion ? 0 : v.state.phase === 'docked' ? f.bob.dockedFactor : 1) * (1 + this.sea * f.bob.windFactor);
      const roll = f.bob.rollDeg * calm * Math.sin((2 * Math.PI * tReal) / f.bob.rollPeriodS + ph);
      const pitch = f.bob.pitchDeg * calm * Math.sin((2 * Math.PI * tReal) / f.bob.pitchPeriodS + ph * 1.7) + f.bump.pitchDeg * bump;
      const [fx, fy] = unitFromBearing(heading);
      const surge = f.bump.surgeM * exag * bump;

      const appear = Math.min(1, Math.min(v.state.serviceElapsed, v.state.serviceRemaining) / f.appearSeconds);
      const grow = appear * appear * (3 - 2 * appear);

      e.set(pitch * DEG, roll * DEG, -heading * DEG);
      q.setFromEuler(e);
      p.set(px + fx * surge, py + fy * surge, f.bob.heaveM * calm * Math.sin(tReal * 1.3 + ph) * exag);
      s.setScalar(exag * grow);
      m.compose(p, q, s);
      this.body.setMatrixAt(n, m);
      this.body.setColorAt(n, this.selectedId && this.selectedId !== id ? this.dim : this.white);
      this.drawn.set(id, { x: px, y: py, pose: v });
      if (id === this.selectedId) {
        const sel = CONFIG.selection;
        const pulse = this.reduceMotion ? 0.5 : (Math.sin(tReal * sel.pulseHz * Math.PI * 2) + 1) / 2;
        const r = L * sel.ringScale * (1 + pulse * 0.12);
        this.ring.position.set(px, py, 0.4);
        this.ring.scale.set(r, r, 1);
        this.ringMat.color.set(this.opts.lineColor(v.state.lineId));
        this.ringMat.opacity = 0.55 + 0.35 * (1 - pulse);
      }
      this.accent.setMatrixAt(n, m);
      this.windows.setMatrixAt(n, m);
      if (this.night > 0.02) this.pushLights(m, grow);
      this.pushSmoke(v, px, py, fx, fy, exag, grow, tReal);
      this.accent.setColorAt(n, c.set(this.opts.lineColor(v.state.lineId)));

      q.setFromAxisAngle(this.zAxis, -heading * DEG);
      p.set(px, py, 0.15);
      s.set(B * f.shadowScale[0] * grow, L * f.shadowScale[1] * grow, 1);
      m.compose(p, q, s);
      this.shadow.setMatrixAt(n, m);

      // Night: a warm light streak on the water, stretching towards the viewer.
      const nl = CONFIG.nightLights;
      q.setFromAxisAngle(this.zAxis, -viewBack * DEG);
      p.set(px + vbx * L * nl.reflectionLength * 0.5, py + vby * L * nl.reflectionLength * 0.5, 0.2);
      s.set(B * nl.reflectionWidth * grow, L * nl.reflectionLength * grow, 1);
      m.compose(p, q, s);
      this.reflect.setMatrixAt(n, m);

      if (v.state.speed > 0.05 || v.state.phase === 'underway') trails.push(this.trail(v, px, py, fx, fy, exag));
      if (v.state.phase === 'underway' && v.state.speed > 2) gullTargets.push({ id, x: px, y: py, fx, fy });
      n++;
    }
    for (const id of this.drawn.keys()) if (!ids.has(id)) this.drawn.delete(id);
    this.ring.visible = !!this.selectedId && ids.has(this.selectedId);
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    for (const id of this.lastPhase.keys()) if (!ids.has(id)) (this.lastPhase.delete(id), this.bumpAt.delete(id));
    this.headings.retain(ids);
    this.trails.retain(ids);
    for (const mesh of [this.body, this.accent, this.shadow, this.windows, this.reflect]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.reflect.visible = this.night > 0.02;
    this.lights.end();
    this.smoke.end();
    // Gulls follow the ferries nearest the view centre, only when zoomed in enough to see them.
    const mc = this.map.getCenter();
    const [ccx, ccy] = this.local([mc.lng, mc.lat]);
    gullTargets.sort((a, b) => Math.hypot(a.x - ccx, a.y - ccy) - Math.hypot(b.x - ccx, b.y - ccy));
    this.gulls.update(gullTargets, tReal, dt, exag, !this.reduceMotion && this.map.getZoom() >= CONFIG.gulls.minZoom && this.night < 0.8);
    if (this.accent.instanceColor) this.accent.instanceColor.needsUpdate = true;

    const w = CONFIG.wake;
    this.wake.update(trails, { hullLength: L, beam: B, spread: w.spread, maxWidthBeams: w.maxWidthBeams, color: c.set(w.color), opacity: w.opacity }, tReal);

    this.camera.projectionMatrix = sharedFrame.projection(args);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }

  private zAxis = new THREE.Vector3(0, 0, 1);
  private tmpV = new THREE.Vector3();
  private cRed = new THREE.Color(CONFIG.nightLights.port);
  private cGreen = new THREE.Color(CONFIG.nightLights.starboard);
  private cWhite = new THREE.Color(CONFIG.nightLights.masthead);
  private cSmoke = new THREE.Color();

  /** Port (red), starboard (green) and masthead (white) lights, from the hull's model matrix. */
  private pushLights(m: THREE.Matrix4, grow: number): void {
    const a = this.anchors;
    const alpha = this.night * grow * (1 - this.fog * 0.5);
    const size = CONFIG.nightLights.sizeM;
    for (const [anchor, col] of [
      [a.port, this.cRed],
      [a.starboard, this.cGreen],
      [a.mastTop, this.cWhite],
    ] as const) {
      const w = this.tmpV.copy(anchor).applyMatrix4(m);
      this.lights.push(w.x, w.y, w.z, col, alpha, size);
    }
  }

  /**
   * Funnel smoke: puffs leave the funnel, trail astern as the ship moves and drift downwind,
   * growing and fading. Each puff's age is a function of real time, so there's no particle state.
   */
  private pushSmoke(v: VesselPose, px: number, py: number, fx: number, fy: number, exag: number, grow: number, tReal: number): void {
    const sm = CONFIG.smoke;
    const k = CONFIG.ferries.lengthM / 70;
    const funnelBack = CONFIG.ferries.lengthM * 0.06 * exag;
    const fz = 14.6 * k * exag;
    const [wx, wy] = unitFromBearing(this.wind.toward);
    const speed = v.state.speed; // m/s real; the visual trail scales with exaggeration
    const seed = hash01(v.state.vesselId) * sm.lifeS;
    const life = this.reduceMotion ? sm.lifeS * 1.6 : sm.lifeS;
    const base = (v.state.phase === 'docked' ? sm.dockedAlpha : sm.alpha) * grow * (1 - this.night * 0.55);
    this.cSmoke.set(sm.color).lerp(new THREE.Color(sm.nightColor), this.night);
    for (let i = 0; i < sm.puffs; i++) {
      const age = (((tReal + seed) / life + i / sm.puffs) % 1) * life;
      const u = age / life;
      const back = speed * age * sm.sternDrift * exag;
      const drift = this.wind.ms * age * exag;
      const x = px - fx * (funnelBack + back) + wx * drift;
      const y = py - fy * (funnelBack + back) + wy * drift;
      const z = fz + sm.riseMs * age * exag;
      const a = base * Math.min(1, u * 8) * (1 - u) ** 1.6;
      this.smoke.push(x, y, z, this.cSmoke, a, (sm.sizeM + sm.growM * age) * exag);
    }
  }

  /**
   * Wake source for a vessel: current pose plus cached grid samples of its pure pose function at
   * earlier sim times. Longer when hulls are exaggerated so it stays in proportion.
   */
  private trail(v: VesselPose, px: number, py: number, fx: number, fy: number, exag: number): Trail {
    const w = CONFIG.wake;
    const path = this.opts.paths.get(v.state.lineId)!;
    const count = Math.min(w.maxSamples - 1, Math.round((w.samples - 1) * (1 + (exag - 1) * w.exagFactor)));
    const cruise = w.cruiseMs;
    // Past samples are stored unshifted; apply the current berth offset so they line up with the hull.
    const [x0, y0] = this.local(v.lngLat);
    const past = this.trails.get(v.state.vesselId, v.t, count, (time) => {
      const pp = vesselPose(v.vessel, path, time, this.opts.docking);
      if (!pp) return null;
      const [x, y] = this.local(pp.lngLat);
      const [bx, by] = unitFromBearing(pp.bearing);
      return { x, y, fx: bx, fy: by, speed: Math.min(1, pp.state.speed / cruise) };
    });
    return { head: { x: px, y: py, fx, fy, speed: Math.min(1, v.state.speed / cruise) }, past, ox: px - x0, oy: py - y0 };
  }
}
