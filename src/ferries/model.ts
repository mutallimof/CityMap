import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';

/**
 * Procedural low-poly classic İstanbul vapur, in metres: bow towards +Y, starboard +X, up +Z,
 * origin at the waterline amidships. Real size is CONFIG.ferries.lengthM × beamM; the render
 * layer scales it by the zoom exaggeration.
 *
 * Returns two geometries: `body` (vertex-coloured) and `accent` (the line-colour stripe,
 * coloured per instance).
 */
export interface VapurGeometry {
  body: THREE.BufferGeometry;
  accent: THREE.BufferGeometry;
  /** Window bands (separate so they can glow at night). */
  windows: THREE.BufferGeometry;
  /** Local positions (m) for lights / effects. */
  anchors: { bow: THREE.Vector3; stern: THREE.Vector3; funnelTop: THREE.Vector3; mastTop: THREE.Vector3; port: THREE.Vector3; starboard: THREE.Vector3 };
}

/** Deck outline: pointed bow, rounded stern. Scaled so length = 1, beam = beamRatio. */
function hullShape(len: number, beam: number, inset = 0): THREE.Shape {
  const h = len / 2 - inset;
  const w = beam / 2 - inset;
  const s = new THREE.Shape();
  s.moveTo(0, h); // bow tip
  s.bezierCurveTo(w * 0.55, h * 0.92, w, h * 0.55, w, h * 0.2);
  s.lineTo(w, -h * 0.62);
  s.bezierCurveTo(w, -h * 0.92, w * 0.55, -h, 0, -h);
  s.bezierCurveTo(-w * 0.55, -h, -w, -h * 0.92, -w, -h * 0.62);
  s.lineTo(-w, h * 0.2);
  s.bezierCurveTo(-w, h * 0.55, -w * 0.55, h * 0.92, 0, h);
  return s;
}

function roundedRect(len: number, wid: number, r: number): THREE.Shape {
  const x = wid / 2;
  const y = len / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

/** Extrude a shape from z0 to z1, shifted by dy along the hull, painted one colour. */
function slab(shape: THREE.Shape, z0: number, z1: number, color: string, dy = 0, segments = 6): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: segments });
  g.translate(0, dy, z0);
  return paint(g, color);
}

function paint(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const geom = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = geom.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.deleteAttribute('uv');
  geom.computeVertexNormals();
  return geom;
}

function cylinder(rTop: number, rBottom: number, z0: number, z1: number, color: string, y: number, radial = 10, sx = 1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, z1 - z0, radial, 1);
  g.rotateX(Math.PI / 2); // Y-up cylinder → Z-up
  g.scale(sx, 1, 1);
  g.translate(0, y, (z0 + z1) / 2);
  return paint(g, color);
}

export function buildVapur(): VapurGeometry {
  const { lengthM: L, beamM: B } = CONFIG.ferries;
  const c = CONFIG.colors.vapur;
  const k = L / 70; // proportions designed for a 70 m vessel

  const parts = [
    // Hull: dark lower band below the waterline region, white topsides, deck.
    slab(hullShape(L, B), -1.2 * k, 1.1 * k, c.hullBottom, 0, 8),
    slab(hullShape(L, B), 1.1 * k, 3.3 * k, c.hull, 0, 8),
    slab(hullShape(L * 0.985, B * 0.94), 3.3 * k, 3.45 * k, c.deck, 0, 8),
    // Main deck house with window band.
    slab(roundedRect(L * 0.66, B * 0.8, 2.2 * k), 3.45 * k, 4.3 * k, c.house, -L * 0.03),
    slab(roundedRect(L * 0.655, B * 0.79, 2.2 * k), 4.3 * k, 5.25 * k, c.house, -L * 0.03), // core behind the window band
    slab(roundedRect(L * 0.66, B * 0.8, 2.2 * k), 5.25 * k, 6.1 * k, c.house, -L * 0.03),
    slab(roundedRect(L * 0.7, B * 0.86, 2.4 * k), 6.1 * k, 6.35 * k, c.roof, -L * 0.03),
    // Upper deck house with window band.
    slab(roundedRect(L * 0.4, B * 0.62, 1.8 * k), 6.35 * k, 7.1 * k, c.house, -L * 0.05),
    slab(roundedRect(L * 0.4, B * 0.62, 1.8 * k), 7.9 * k, 8.5 * k, c.house, -L * 0.05),
    slab(roundedRect(L * 0.43, B * 0.66, 2 * k), 8.5 * k, 8.7 * k, c.roof, -L * 0.05),
    // Wheelhouse at the forward end of the upper deck.
    slab(roundedRect(L * 0.08, B * 0.5, 1 * k), 8.7 * k, 10.2 * k, c.house, L * 0.11),
    // Funnel: yellow with a black top band, slightly oval.
    cylinder(1.5 * k, 1.75 * k, 8.7 * k, 13.2 * k, c.funnel, -L * 0.06, 12, 0.85),
    cylinder(1.45 * k, 1.5 * k, 13.2 * k, 14.6 * k, c.funnelTop, -L * 0.06, 12, 0.85),
    // Mast forward.
    cylinder(0.18 * k, 0.25 * k, 8.7 * k, 16.5 * k, c.mast, L * 0.2, 6),
  ];
  const body = mergeGeometries(parts);
  const windows = mergeGeometries([
    slab(roundedRect(L * 0.665, B * 0.805, 2.2 * k), 4.3 * k, 5.25 * k, '#ffffff', -L * 0.03),
    slab(roundedRect(L * 0.405, B * 0.625, 1.8 * k), 7.1 * k, 7.9 * k, '#ffffff', -L * 0.05),
    slab(roundedRect(L * 0.082, B * 0.505, 1 * k), 9.4 * k, 10.0 * k, '#ffffff', L * 0.11),
  ]);
  // Line-colour stripe just under the deck edge, a hair proud of the hull so it never z-fights.
  const accent = slab(hullShape(L * 1.004, B * 1.02), 2.35 * k, 2.95 * k, '#ffffff', 0, 8);

  return {
    body,
    accent,
    windows,
    anchors: {
      port: new THREE.Vector3(-B * 0.42, L * 0.12, 8.9 * k),
      starboard: new THREE.Vector3(B * 0.42, L * 0.12, 8.9 * k),
      bow: new THREE.Vector3(0, L / 2, 2 * k),
      stern: new THREE.Vector3(0, -L / 2, 2 * k),
      funnelTop: new THREE.Vector3(0, -L * 0.06, 14.6 * k),
      mastTop: new THREE.Vector3(0, L * 0.2, 16.5 * k),
    },
  };
}
