import * as THREE from 'three';

/** Cel-shading ramp with `steps` bands (null = smooth Lambert). */
function toonRamp(steps: number): THREE.DataTexture | null {
  if (steps < 2) return null;
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(140 + (115 * i) / (steps - 1));
  const t = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/** Lambert (classic) or cel-shaded toon material with `steps` light bands (themes' style.toon). */
export function sceneryMaterial(steps: number, opts: THREE.MeshLambertMaterialParameters = {}): THREE.Material {
  const ramp = toonRamp(steps);
  if (!ramp) return new THREE.MeshLambertMaterial(opts);
  const { flatShading: _f, ...rest } = opts;
  return new THREE.MeshToonMaterial({ ...(rest as THREE.MeshToonMaterialParameters), gradientMap: ramp });
}
