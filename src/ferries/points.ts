import * as THREE from 'three';

const VS = /* glsl */ `
  attribute vec3 color;
  attribute float alpha;
  attribute float size;    // world metres
  uniform vec2 uViewport;  // drawing-buffer pixels
  uniform float uMinPx;
  uniform float uMaxPx;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 p0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 p1 = projectionMatrix * modelViewMatrix * vec4(position + vec3(size, 0.0, 0.0), 1.0);
    // Screen size of "size" metres at this depth (works with the map's perspective).
    float px = length((p1.xy / p1.w - p0.xy / p0.w) * uViewport * 0.5);
    gl_PointSize = clamp(px, uMinPx, uMaxPx);
    gl_Position = p0;
  }
`;

const FS = /* glsl */ `
  uniform float uCore;     // 0 = soft puff, 1 = bright light with a hot core, 2 = thin ring
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float a;
    if (uCore > 1.5) {
      a = vAlpha * smoothstep(0.55, 0.75, r) * (1.0 - smoothstep(0.86, 1.0, r));
    } else {
      // Puffs: a wide, gaussian-ish falloff reads as soft smoke rather than a disc.
      float soft = exp(-r * r * 3.2) * (1.0 - smoothstep(0.75, 1.0, r));
      float core = 1.0 - smoothstep(0.0, 0.35, r);
      a = vAlpha * mix(soft, soft * 0.55 + core, uCore);
    }
    gl_FragColor = vec4(vColor, a);
    #include <colorspace_fragment>
  }
`;

/**
 * A pool of camera-facing sprites whose size is given in world metres (min/max clamped in px).
 * Used for navigation lights (additive, hot core) and funnel smoke (soft, normal blending).
 */
export class PointSprites {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private alpha: Float32Array;
  private size: Float32Array;
  private n = 0;
  private material: THREE.ShaderMaterial;

  constructor(
    private capacity: number,
    opts: { additive: boolean; core: number; minPx: number; maxPx: number },
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: { uViewport: { value: new THREE.Vector2(1, 1) }, uMinPx: { value: opts.minPx }, uMaxPx: { value: opts.maxPx }, uCore: { value: opts.core } },
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
  }

  begin(viewportW: number, viewportH: number): void {
    this.n = 0;
    this.material.uniforms.uViewport.value.set(viewportW, viewportH);
  }

  push(x: number, y: number, z: number, color: THREE.Color, alpha: number, sizeM: number): void {
    if (this.n >= this.capacity || alpha <= 0.003) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.alpha[i] = alpha;
    this.size[i] = sizeM;
  }

  end(): void {
    const g = this.points.geometry;
    for (const name of ['position', 'color', 'alpha', 'size']) g.attributes[name].needsUpdate = true;
    g.setDrawRange(0, this.n);
  }
}
