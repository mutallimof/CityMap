import * as THREE from 'three';

/** One point of a vessel's recent track (hull centre), in local metres. */
export interface TrailSample {
  x: number;
  y: number;
  /** Unit vector of travel direction. */
  fx: number;
  fy: number;
  /** 0..1 speed relative to cruise. */
  speed: number;
}

/**
 * A vessel's wake source: its current pose plus cached past samples (newest first). Each sample
 * is shifted by (ox, oy) and moved forward half a hull length so the wake starts at the bow.
 */
export interface Trail {
  head: TrailSample;
  past: readonly TrailSample[];
  ox: number;
  oy: number;
}

export interface WakeParams {
  /** Exaggerated hull length / beam (m). */
  hullLength: number;
  beam: number;
  /** Half-width growth per metre of track behind the bow (V opening, ~tan of half-angle). */
  spread: number;
  /** Max half-width as a multiple of the beam. */
  maxWidthBeams: number;
  color: THREE.Color;
  opacity: number;
}

const VS = /* glsl */ `
  attribute vec4 wake; // x: across (-1..1), y: age 0..1, z: speed 0..1, w: metres behind the bow
  varying vec4 vWake;
  varying vec2 vPos;
  void main() {
    vWake = wake;
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FS = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uHull;
  varying vec4 vWake;
  varying vec2 vPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    float u = abs(vWake.x);
    float age = vWake.y;
    float speed = vWake.z;
    float s = vWake.w;
    // V arms: bright band near the edges of the ribbon.
    float arms = smoothstep(0.5, 0.9, u) * (1.0 - smoothstep(0.9, 1.0, u));
    // Prop wash: soft centre band starting at the stern.
    float wash = (1.0 - smoothstep(0.0, 0.5, u)) * smoothstep(uHull * 0.8, uHull * 1.15, s) * 0.8;
    // Bow foam: bright along the hull's forward sides.
    float bow = (1.0 - smoothstep(0.0, uHull * 0.35, s)) * smoothstep(0.55, 0.95, u) * 0.6;
    float n = noise(vPos * 0.045 + vec2(uTime * 0.35, -uTime * 0.2)) * 0.6 + noise(vPos * 0.13 - uTime * 0.5) * 0.4;
    float fade = pow(1.0 - age, 1.7);
    float a = (arms + wash + bow) * speed * fade * mix(0.45, 1.0, n) * uOpacity;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

/**
 * All wakes in one dynamic ribbon mesh (one draw call). Each trail sample contributes three
 * vertices across the wake (port edge, centre, starboard edge).
 */
export class WakeMesh {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private wake: Float32Array;
  private material: THREE.ShaderMaterial;

  constructor(
    private maxTrails: number,
    private maxSamples: number,
  ) {
    const verts = maxTrails * maxSamples * 3;
    this.pos = new Float32Array(verts * 3);
    this.wake = new Float32Array(verts * 4);
    const index: number[] = [];
    for (let t = 0; t < maxTrails; t++) {
      for (let k = 0; k < maxSamples - 1; k++) {
        const a = (t * maxSamples + k) * 3;
        const b = a + 3;
        // two quads: port→centre, centre→starboard
        index.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('wake', new THREE.BufferAttribute(this.wake, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(index);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 }, uTime: { value: 0 }, uHull: { value: 100 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Rebuild every wake. Each runs from the current bow back in time. */
  update(trails: Trail[], p: WakeParams, timeS: number): void {
    const u = this.material.uniforms;
    u.uColor.value.copy(p.color);
    u.uOpacity.value = p.opacity;
    u.uTime.value = timeS;
    u.uHull.value = p.hullLength;
    const n = Math.min(trails.length, this.maxTrails);
    const half0 = p.beam * 0.42;
    const maxHalf = p.beam * p.maxWidthBeams;
    const halfL = p.hullLength / 2;
    for (let t = 0; t < n; t++) {
      const tr = trails[t];
      const m = Math.min(tr.past.length + 1, this.maxSamples);
      let s = 0;
      let lx = 0;
      let ly = 0;
      for (let k = 0; k < this.maxSamples; k++) {
        const kk = Math.min(k, m - 1);
        const smp = kk === 0 ? tr.head : tr.past[kk - 1];
        const off = kk === 0 ? 0 : 1; // past samples get the current berth offset
        const bx = smp.x + tr.ox * off + smp.fx * halfL;
        const by = smp.y + tr.oy * off + smp.fy * halfL;
        if (k > 0 && k < m) s += Math.hypot(bx - lx, by - ly);
        lx = bx;
        ly = by;
        const half = Math.min(maxHalf, half0 + s * p.spread);
        const age = m > 1 ? kk / (m - 1) : 1;
        // Samples past the trail's end collapse onto its last point with zero speed (invisible).
        const speed = k < m ? smp.speed : 0;
        const px = -smp.fy;
        const py = smp.fx;
        const base = (t * this.maxSamples + k) * 3;
        for (let j = 0; j < 3; j++) {
          const across = j - 1; // -1 port, 0 centre, 1 starboard
          const v = base + j;
          this.pos[v * 3] = bx + px * half * across;
          this.pos[v * 3 + 1] = by + py * half * across;
          this.pos[v * 3 + 2] = 0.3;
          this.wake[v * 4] = across;
          this.wake[v * 4 + 1] = age;
          this.wake[v * 4 + 2] = speed;
          this.wake[v * 4 + 3] = s;
        }
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.wake.needsUpdate = true;
    g.setDrawRange(0, n * (this.maxSamples - 1) * 12);
  }
}
