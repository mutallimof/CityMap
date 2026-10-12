import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Toy landmark models from simple primitives (original shapes, no copied models), in metres:
 * x across the footprint, y along its long side, z up, origin at the footprint centre on the ground.
 * Each model is one vertex-coloured geometry. Colours come from the theme's landmark palette.
 */
export interface ModelPalette {
  stone: string;
  stoneDark: string;
  pink: string;
  dome: string;
  roof: string;
  white: string;
  gold: string;
  window: string;
  rock: string;
}

class Parts {
  list: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0): this {
    g.translate(x, y, z);
    const geom = g.index ? g.toNonIndexed() : g;
    geom.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const n = geom.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(col, i * 3);
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geom.computeVertexNormals();
    this.list.push(geom);
    return this;
  }
  /** Box from z0 to z1. */
  box(w: number, l: number, z0: number, z1: number, color: string, x = 0, y = 0): this {
    return this.add(new THREE.BoxGeometry(w, l, z1 - z0), color, x, y, (z0 + z1) / 2);
  }
  /** Upright cylinder / truncated cone from z0 to z1. */
  cyl(r0: number, r1: number, z0: number, z1: number, color: string, x = 0, y = 0, seg = 16): this {
    const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg, 1);
    g.rotateX(Math.PI / 2);
    return this.add(g, color, x, y, (z0 + z1) / 2);
  }
  /** Dome: upper half of a (squashed) sphere sitting at z0. */
  dome(r: number, z0: number, color: string, x = 0, y = 0, squash = 1, seg = 18): this {
    const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    g.scale(1, 1, squash);
    return this.add(g, color, x, y, z0);
  }
  /** Half dome opening towards ±y (semi-dome against a wall). */
  halfDome(r: number, z0: number, color: string, x: number, y: number, towardsY: 1 | -1): this {
    const g = new THREE.SphereGeometry(r, 14, 6, 0, Math.PI, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    g.rotateZ(towardsY > 0 ? 0 : Math.PI);
    return this.add(g, color, x, y, z0);
  }
  /** Minaret: slim shaft, a balcony, a pointed cap. */
  minaret(x: number, y: number, h: number, p: ModelPalette): this {
    const r = Math.max(1.6, h * 0.03);
    this.cyl(r * 1.2, r * 1.2, 0, h * 0.12, p.stone, x, y, 10);
    this.cyl(r, r * 0.9, h * 0.12, h * 0.8, p.white, x, y, 10);
    this.cyl(r * 1.6, r * 1.6, h * 0.62, h * 0.65, p.stone, x, y, 10);
    this.cyl(r * 0.9, r * 0.85, h * 0.8, h * 0.86, p.white, x, y, 10);
    this.cyl(r * 1.0, 0, h * 0.86, h, p.dome, x, y, 10);
    return this;
  }
  build(): THREE.BufferGeometry {
    return mergeGeometries(this.list);
  }
}

export type ModelKind = 'galata' | 'maiden' | 'hagia-sophia' | 'blue-mosque' | 'suleymaniye' | 'dolmabahce';

/** Small heroes are drawn bigger than life so they read among the blocks (a toy-map liberty). */
export const MODEL_BOOST: Partial<Record<ModelKind, number>> = { galata: 1.35, maiden: 2.2 };

/** Natural footprint (m) each model is drawn at; the layer scales it to the OSM footprint (clamped). */
export const MODEL_SIZE: Record<ModelKind, [number, number]> = {
  galata: [17, 17],
  maiden: [18, 9],
  'hagia-sophia': [96, 82],
  'blue-mosque': [120, 66],
  suleymaniye: [116, 66],
  dolmabahce: [98, 48],
};

export function buildModel(kind: ModelKind, p: ModelPalette): THREE.BufferGeometry {
  const m = new Parts();
  switch (kind) {
    case 'galata':
      m.cyl(8.6, 8.2, 0, 46, p.stone);
      for (const z of [14, 24, 34]) m.cyl(8.5, 8.5, z, z + 0.9, p.stoneDark);
      m.cyl(9.8, 9.8, 46, 47.4, p.white, 0, 0, 20);
      m.cyl(8, 8, 47.4, 52, p.stone);
      m.cyl(8.05, 8.05, 48.4, 51, p.window);
      m.cyl(9, 0.2, 52, 64, p.roof, 0, 0, 16);
      m.add(new THREE.SphereGeometry(0.9, 8, 6), p.gold, 0, 0, 64.4);
      break;
    case 'maiden':
      m.cyl(15, 17, -1.5, 2.2, p.rock, 0, 0, 14);
      m.box(9, 18, 2.2, 9, p.white, 0, -1);
      m.box(9.6, 18.6, 9, 9.8, p.roof, 0, -1);
      m.cyl(3.4, 3.4, 9, 21, p.white, 0, 5.5, 12);
      m.cyl(3.6, 3.6, 21, 22, p.stoneDark, 0, 5.5, 12);
      m.cyl(3.0, 3.0, 22, 25, p.window, 0, 5.5, 12);
      m.cyl(3.4, 0.2, 25, 31, p.roof, 0, 5.5, 12);
      m.add(new THREE.SphereGeometry(0.6, 8, 6), p.gold, 0, 5.5, 31.3);
      break;
    case 'hagia-sophia':
      m.box(70, 76, 0, 22, p.pink);
      m.box(80, 56, 0, 16, p.pink);
      for (const [x, y] of [[-33, -36], [33, -36], [-33, 36], [33, 36]]) m.box(10, 10, 0, 26, p.pink, x, y);
      m.cyl(17.5, 17.5, 22, 30, p.pink, 0, 0, 24);
      m.cyl(17.6, 17.6, 25, 28, p.window, 0, 0, 24);
      m.dome(17, 30, p.dome, 0, 0, 0.62, 24);
      m.halfDome(14, 22, p.dome, 0, 12, 1);
      m.halfDome(14, 22, p.dome, 0, -12, -1);
      for (const [x, y] of [[-42, -44], [42, -44], [-42, 44], [42, 44]]) m.minaret(x, y, 58, p);
      break;
    case 'blue-mosque':
    case 'suleymaniye': {
      const blue = kind === 'blue-mosque';
      // Prayer hall at +y, courtyard at −y.
      m.box(62, 62, 0, 18, p.stone, 0, 26);
      m.cyl(13, 13, 18, 26, p.stone, 0, 26, 24);
      m.cyl(13.1, 13.1, 20, 23, p.window, 0, 26, 24);
      m.dome(12.5, 26, p.dome, 0, 26, 0.75, 24);
      for (const [x, y] of [[0, 14], [0, 38], [-12, 26], [12, 26]]) m.dome(blue ? 9 : 7, 18, p.dome, x, y, 0.6, 16);
      for (const [x, y] of [[-21, 5], [21, 5], [-21, 47], [21, 47]]) m.dome(5.5, 18, p.dome, x, y, 0.7, 12);
      // Courtyard: low arcade ring with small domes.
      m.box(58, 5, 0, 9, p.stone, 0, -32);
      m.box(5, 50, 0, 9, p.stone, -27, -10);
      m.box(5, 50, 0, 9, p.stone, 27, -10);
      for (let i = -2; i <= 2; i++) m.dome(2.6, 9, p.dome, i * 11, -32, 0.8, 10);
      for (let j = -2; j <= 2; j++) {
        m.dome(2.6, 9, p.dome, -27, -10 + j * 10, 0.8, 10);
        m.dome(2.6, 9, p.dome, 27, -10 + j * 10, 0.8, 10);
      }
      const mins = blue
        ? [[-33, 59], [33, 59], [-33, -6], [33, -6], [-30, -36], [30, -36]]
        : [[-31, -3], [31, -3], [-30, -36], [30, -36]];
      for (const [x, y] of mins) m.minaret(x, y, blue ? 62 : 66, p);
      break;
    }
    case 'dolmabahce':
      m.box(30, 98, 0, 17, p.white);
      m.box(31, 99, 17, 18.2, p.roof);
      m.box(40, 30, 0, 21, p.white);
      m.box(41, 31, 21, 22.4, p.roof);
      m.cyl(8, 8, 22.4, 25, p.white, 0, 0, 20);
      m.dome(7.6, 25, p.dome, 0, 0, 0.7, 18);
      for (let i = -4; i <= 4; i++) if (Math.abs(i) > 1) m.box(31.4, 1.2, 2, 15, p.stoneDark, 0, i * 10.5);
      m.box(4, 60, 0, 1.2, p.stone, 18, 0);
      break;
  }
  return m.build();
}

/** Suspension bridge tower: two legs and cross beams (x across the deck). */
export function bridgeTower(height: number, deckW: number, p: ModelPalette): THREE.BufferGeometry {
  const m = new Parts();
  const leg = Math.max(4, height * 0.035);
  for (const x of [-deckW / 2, deckW / 2]) m.box(leg, leg * 1.4, 0, height, p.white, x, 0);
  for (const z of [height * 0.42, height * 0.72, height * 0.97]) m.box(deckW + leg, leg * 0.8, z - leg * 0.5, z + leg * 0.5, p.white);
  return m.build();
}

/** A unit slab (1 × 1 × 1, centred, z 0..1) for bridge decks / cables, coloured. */
export function slab(color: string): THREE.BufferGeometry {
  return new Parts().box(1, 1, 0, 1, color).build();
}
