import * as THREE from 'three';
import { CONFIG } from '../config';

/** A gull: two wing triangles meeting at the body; tips at z = 1 so z-scale flaps them. */
function gullGeometry(): THREE.BufferGeometry {
  const v = new Float32Array([
    // left wing
    0, 0.35, 0, -1, -0.15, 1, 0, -0.35, 0,
    // right wing
    0, 0.35, 0, 0, -0.35, 0, 1, -0.15, 1,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

interface Gull {
  /** Vessel the gull follows (sticky until it leaves service / view). */
  vesselId: string | null;
  /** Smoothed orbit centre, so switching vessels means flying over, not teleporting. */
  cx: number;
  cy: number;
  init: boolean;
  phase: number;
}

export interface GullTarget {
  id: string;
  x: number;
  y: number;
  fx: number;
  fy: number;
  /** Higher = more attractive (e.g. just left a pier). */
  priority?: number;
}

/**
 * 3–6 seagulls circling behind 2–3 ferries. Decorative, real-time animated (not part of the sim).
 */
export class Gulls {
  readonly mesh: THREE.InstancedMesh;
  private gulls: Gull[];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private z = new THREE.Vector3(0, 0, 1);

  constructor() {
    const g = CONFIG.gulls;
    this.mesh = new THREE.InstancedMesh(gullGeometry(), new THREE.MeshBasicMaterial({ color: g.color, side: THREE.DoubleSide }), g.count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.gulls = Array.from({ length: g.count }, (_, i) => ({ vesselId: null, cx: 0, cy: 0, init: false, phase: (i * 2.399) % (Math.PI * 2) }));
  }

  /** `targets`: candidate vessels (underway, near the view centre first). */
  update(targets: GullTarget[], tReal: number, dt: number, exag: number, visible: boolean): void {
    const cfg = CONFIG.gulls;
    if (!visible || targets.length === 0) {
      this.mesh.count = 0;
      return;
    }
    const byId = new Map(targets.map((t) => [t.id, t]));
    const followed = targets.slice(0, cfg.vessels);
    let n = 0;
    this.gulls.forEach((g, i) => {
      // Keep following the same vessel while it's a candidate; otherwise pick by index.
      if (!g.vesselId || !byId.has(g.vesselId)) g.vesselId = followed[i % followed.length].id;
      const t = byId.get(g.vesselId)!;
      // Orbit centre a little behind the stern.
      const ox = t.x - t.fx * CONFIG.ferries.lengthM * exag * 0.6;
      const oy = t.y - t.fy * CONFIG.ferries.lengthM * exag * 0.6;
      if (!g.init) {
        g.cx = ox;
        g.cy = oy;
        g.init = true;
      } else {
        const k = 1 - Math.exp(-dt / cfg.followTau);
        g.cx += (ox - g.cx) * k;
        g.cy += (oy - g.cy) * k;
      }
      const r = (cfg.orbitM + (i % 3) * 9) * exag;
      const w = cfg.orbitSpeed * (i % 2 ? 1 : -0.85);
      const a = tReal * w + g.phase;
      const x = g.cx + Math.cos(a) * r;
      const y = g.cy + Math.sin(a) * r * 0.75;
      const z = (cfg.altitudeM + (i % 3) * 4) * exag + Math.sin(tReal * 0.7 + g.phase) * 3 * exag;
      // Heading along the orbit tangent.
      const heading = Math.atan2(Math.cos(a) * r * 0.75 * w, -Math.sin(a) * r * w) - Math.PI / 2;
      const glide = 0.5 + 0.5 * Math.sin(tReal * 0.31 + g.phase * 3);
      const flap = Math.sin(tReal * cfg.flapHz * Math.PI * 2 + g.phase) * (glide > 0.6 ? 0.15 : 1);
      const span = cfg.spanM * exag;
      this.p.set(x, y, z);
      this.q.setFromAxisAngle(this.z, heading);
      this.s.set(span / 2, span * 0.45, span * 0.28 * flap);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
