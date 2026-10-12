import * as THREE from 'three';
import { MercatorCoordinate, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl';
import { CONFIG } from '../config';

const renderers = new WeakMap<MlMap, THREE.WebGLRenderer>();

/** One three.js renderer per map, shared by every custom layer (one GL state cache). */
export function sharedRenderer(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): THREE.WebGLRenderer {
  let r = renderers.get(map);
  if (!r) {
    r = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    r.autoClear = false;
    renderers.set(map, r);
  }
  return r;
}

/**
 * Local metric frame around `camera.center`: x east, y north, z up, in metres. Scenes are built
 * in this frame; `projection()` folds the frame → mercator → clip transform into one float64
 * matrix on the CPU, so the GPU never sees large coordinates (no jitter at high zoom).
 */
export class LocalFrame {
  readonly origin = MercatorCoordinate.fromLngLat(CONFIG.camera.center, 0);
  readonly metre = this.origin.meterInMercatorCoordinateUnits();

  local(lngLat: readonly [number, number]): [number, number] {
    const mc = MercatorCoordinate.fromLngLat(lngLat as [number, number], 0);
    return [(mc.x - this.origin.x) / this.metre, -(mc.y - this.origin.y) / this.metre];
  }

  lngLat([x, y]: readonly [number, number]): [number, number] {
    const mc = new MercatorCoordinate(this.origin.x + x * this.metre, this.origin.y - y * this.metre, 0);
    const ll = mc.toLngLat();
    return [ll.lng, ll.lat];
  }

  private readonly localM = new THREE.Matrix4().makeTranslation(this.origin.x, this.origin.y, this.origin.z).scale(new THREE.Vector3(this.metre, -this.metre, this.metre));

  /**
   * Local frame → clip space for this frame. Returns a new matrix per call site that assigns it to a camera
   * (`camera.projectionMatrix = …`): pass `out` to reuse one (no per-frame allocation).
   */
  projection(args: CustomRenderMethodInput, out = new THREE.Matrix4()): THREE.Matrix4 {
    return out.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(this.localM);
  }
}

export const sharedFrame = new LocalFrame();
