import * as THREE from 'three';
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import { vesselPose, type DockingParams, type VesselPose } from '../sim/fleet';
import type { LinePath } from '../sim/path';
import { HeadingSmoother, interpolateStops } from './headings';
import { buildVapur } from './model';
import { WakeMesh, type Trail } from './wake';
import { TrailCache } from './trail-cache';

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
  private wake = new WakeMesh(MAX_VESSELS, CONFIG.wake.maxSamples);
  private trails = new TrailCache(CONFIG.wake.seconds / (CONFIG.wake.samples - 1));
  private origin = MercatorCoordinate.fromLngLat(CONFIG.camera.center, 0);
  private metre = this.origin.meterInMercatorCoordinateUnits();
  private headings = new HeadingSmoother(CONFIG.ferries.headingTau);
  private lastPhase = new Map<string, string>();
  private bumpAt = new Map<string, number>();
  private lastFrame = performance.now();
  private o = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'ZXY'), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() };
  /** Last rendered poses with their on-screen-ready local positions (hit-testing in step 5). */
  visible: VesselPose[] = [];

  constructor(private opts: VapurLayerOptions) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;

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
    for (const m of [this.body, this.accent, this.shadow]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
    }
    this.shadow.renderOrder = 0;
    this.body.renderOrder = 2;
    this.accent.renderOrder = 2;
    this.root.add(this.shadow, this.wake.mesh, this.body, this.accent);
    this.scene.add(this.root);

    const l = CONFIG.light;
    const hemi = new THREE.HemisphereLight(l.sky, l.ground, l.hemiIntensity);
    hemi.position.set(0, 0, 1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(l.sun, l.sunIntensity);
    const [sx, sy] = unitFromBearing(l.sunAzimuth);
    sun.position.set(sx * Math.cos(l.sunElevation * DEG), sy * Math.cos(l.sunElevation * DEG), Math.sin(l.sunElevation * DEG));
    this.scene.add(sun);
  }

  /** Local metres (x east, y north) of a lng/lat. */
  private local(lngLat: [number, number]): [number, number] {
    const mc = MercatorCoordinate.fromLngLat(lngLat, 0);
    return [(mc.x - this.origin.x) / this.metre, -(mc.y - this.origin.y) / this.metre];
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
      const bump = bt < 6 ? Math.exp(-bt / f.bump.decayS) * Math.sin((2 * Math.PI * bt) / f.bump.periodS) : 0;

      // Bob: gentle roll/pitch, per-ship phase, calmer when docked.
      const ph = hash01(id) * Math.PI * 2;
      const calm = v.state.phase === 'docked' ? f.bob.dockedFactor : 1;
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
      this.accent.setMatrixAt(n, m);
      this.accent.setColorAt(n, c.set(this.opts.lineColor(v.state.lineId)));

      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -heading * DEG);
      p.set(px, py, 0.15);
      s.set(B * f.shadowScale[0] * grow, L * f.shadowScale[1] * grow, 1);
      m.compose(p, q, s);
      this.shadow.setMatrixAt(n, m);

      if (v.state.speed > 0.05 || v.state.phase === 'underway') trails.push(this.trail(v, px, py, fx, fy, exag));
      n++;
    }
    for (const id of this.lastPhase.keys()) if (!ids.has(id)) (this.lastPhase.delete(id), this.bumpAt.delete(id));
    this.headings.retain(ids);
    this.trails.retain(ids);
    for (const mesh of [this.body, this.accent, this.shadow]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.accent.instanceColor) this.accent.instanceColor.needsUpdate = true;

    const w = CONFIG.wake;
    this.wake.update(trails, { hullLength: L, beam: B, spread: w.spread, maxWidthBeams: w.maxWidthBeams, color: c.set(w.color), opacity: w.opacity }, tReal);

    const proj = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    const local = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(this.metre, -this.metre, this.metre));
    this.camera.projectionMatrix = proj.multiply(local);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
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
