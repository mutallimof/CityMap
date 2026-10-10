import * as THREE from 'three';
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';
import type { VesselPose } from '../sim/fleet';
import { HeadingSmoother, interpolateStops } from './headings';

const MAX_VESSELS = 128;

export interface ArrowsLayerOptions {
  /** Called once per frame; returns every vessel's pose for the current sim time. */
  poses: () => VesselPose[];
  lineColor: (lineId: string) => string;
}

/** Flat chevron pointing +Y (north), unit length, centred on its middle. */
function arrowGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.lineTo(0.32, -0.5);
  s.lineTo(0, -0.28);
  s.lineTo(-0.32, -0.5);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
  return g;
}

/**
 * Step 2 stand-in for the vapur: one InstancedMesh of arrows in a MapLibre custom layer.
 * Geometry is in local metres around a fixed origin; the float64 matrix maths happens on the
 * CPU so there's no float32 jitter on the GPU at high zoom.
 */
export class ArrowsLayer implements CustomLayerInterface {
  readonly id = 'ferries';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private mesh!: THREE.InstancedMesh;
  private origin = MercatorCoordinate.fromLngLat(CONFIG.camera.center, 0);
  private metre = this.origin.meterInMercatorCoordinateUnits();
  private headings = new HeadingSmoother(CONFIG.ferries.headingTau);
  private lastFrame = performance.now();
  private tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() };
  private z = new THREE.Vector3(0, 0, 1);
  /** Last rendered poses (for hit-testing later). */
  visible: VesselPose[] = [];

  constructor(private opts: ArrowsLayerOptions) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(arrowGeometry(), mat, MAX_VESSELS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.scene.add(this.mesh);
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    const poses = this.opts.poses();
    this.visible = poses;
    const exag = interpolateStops(CONFIG.ferries.exaggeration, this.map.getZoom());
    const len = CONFIG.ferries.lengthM * exag;
    const { m, q, p, s, c } = this.tmp;
    const ids = new Set<string>();
    let n = 0;
    for (const v of poses) {
      if (n >= MAX_VESSELS) break;
      const id = v.state.vesselId;
      ids.add(id);
      const bearing = this.headings.update(id, v.bearing, dt);
      const mc = MercatorCoordinate.fromLngLat(v.lngLat, 0);
      // Local metres: x east, y north (mercator y grows south).
      p.set((mc.x - this.origin.x) / this.metre, -(mc.y - this.origin.y) / this.metre, 1);
      q.setFromAxisAngle(this.z, (-bearing * Math.PI) / 180);
      const appear = Math.min(1, Math.min(v.state.serviceElapsed, v.state.serviceRemaining) / CONFIG.ferries.appearSeconds);
      const k = len * appear * appear * (3 - 2 * appear);
      s.set(k, k, k);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(n, m);
      this.mesh.setColorAt(n, c.set(this.opts.lineColor(v.state.lineId)));
      n++;
    }
    this.headings.retain(ids);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    const proj = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    const local = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(this.metre, -this.metre, this.metre));
    this.camera.projectionMatrix = proj.multiply(local);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}
