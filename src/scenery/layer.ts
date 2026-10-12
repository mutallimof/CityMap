import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import { CONFIG } from '../config';
import { look } from '../themes';
import { sharedFrame, sharedRenderer } from '../three/context';
import { sceneryMaterial } from '../three/materials';
import { interpolateStops } from '../ferries/headings';
import type { CityPalette } from '../map/city-look';
import { mixHex } from '../time/theme';
import { isWater, type CoastField } from '../water/distance-field';
import { bridgeTower, buildModel, MODEL_BOOST, MODEL_SIZE, slab, type ModelKind } from './models';
import { scatterTrees, type TreeSpot } from './scatter';

export interface Hero {
  id: string;
  name: string;
  nameEn: string;
  model: ModelKind;
  osm: string;
  lngLat: [number, number];
  lengthM: number;
  widthM: number;
  bearing: number;
  heightM: number;
  place: string | null;
}

const MAX_TREES = 3200;
const DEG = Math.PI / 180;
const S = CONFIG.scenery;

/**
 * Toy scenery for themes that ask for it (style.trees3d / style.landmarks3d), in one three.js custom
 * layer: round "lollipop" trees scattered inside the real parks / woods of the loaded map tiles, hero
 * landmarks built from simple shapes at their OSM footprints, and 3D bridges along their OSM lines
 * (suspension towers where the deck meets the shore). Decorative only; tappable heroes open their place.
 */
export class SceneryLayer implements CustomLayerInterface {
  readonly id = 'scenery';
  readonly type = 'custom' as const;
  readonly renderingMode = '3d' as const;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private root = new THREE.Group();
  private hemi = new THREE.HemisphereLight('#ffffff', '#88aacc', 1.6);
  private sun = new THREE.DirectionalLight('#ffffff', 1.6);
  private crowns!: THREE.InstancedMesh;
  private trunks!: THREE.InstancedMesh;
  private trees: TreeSpot[] = [];
  private treeKey = '';
  private heroMeshes: { hero: Hero; mesh: THREE.Mesh; base: number; x: number; y: number }[] = [];
  private bridges = new THREE.Group();
  private lastZoom = -1;
  private crownColors: string[] = ['#7BD86E'];
  private o = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), z: new THREE.Vector3(0, 0, 1) };
  private timer = 0;

  constructor(
    private heroes: Hero[],
    private bridgeLines: FeatureCollection<Point | MultiLineString, { id: string; kind: string }>,
    private field: () => CoastField | null,
  ) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = sharedRenderer(map, gl);
    this.hemi.position.set(0, 0, 1);
    this.scene.add(this.hemi, this.sun, this.root);
    this.build();
    const refresh = () => {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.refreshTrees(), 350);
    };
    map.on('moveend', refresh);
    map.on('sourcedata', (e) => {
      if (e.sourceId === 'city' && e.isSourceLoaded) refresh();
    });
    refresh();
  }

  /** (Re)build meshes for the active look (models, colours, shading). */
  build(): void {
    this.root.clear();
    const st = look().style;
    const mp = st.models;
    const mat = () => sceneryMaterial(st.toon, { vertexColors: true });
    // Trees: a trunk and a round crown, instanced; crown colours per instance.
    const crown = new THREE.IcosahedronGeometry(1, 2);
    crown.translate(0, 0, 0);
    const trunk = new THREE.CylinderGeometry(0.16, 0.22, 1, 6);
    trunk.rotateX(Math.PI / 2);
    trunk.translate(0, 0, 0.5);
    this.crowns = new THREE.InstancedMesh(crown, sceneryMaterial(st.toon, { color: '#ffffff' }), MAX_TREES);
    this.trunks = new THREE.InstancedMesh(trunk, sceneryMaterial(st.toon, { color: mp.trunk }), MAX_TREES);
    for (const m of [this.crowns, this.trunks]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    this.crowns.setColorAt(0, this.o.c.set('#ffffff'));
    this.root.add(this.trunks, this.crowns);
    this.treeKey = '';
    this.lastZoom = -1;
    // Hero landmarks at their OSM footprints.
    this.heroMeshes = [];
    for (const h of this.heroes) {
      const mesh = new THREE.Mesh(buildModel(h.model, mp), mat());
      const [nl, nw] = MODEL_SIZE[h.model];
      const base = Math.min(1.35, Math.max(0.75, Math.min(h.lengthM / nl, h.widthM / nw))) * (MODEL_BOOST[h.model] ?? 1);
      const [x, y] = sharedFrame.local(h.lngLat);
      mesh.position.set(x, y, 0);
      mesh.rotation.z = -h.bearing * DEG;
      mesh.frustumCulled = false;
      this.heroMeshes.push({ hero: h, mesh, base, x, y });
      this.root.add(mesh);
    }
    // Bridges along their OSM lines.
    this.bridges = new THREE.Group();
    this.buildBridges();
    this.root.add(this.bridges);
  }

  private buildBridges(): void {
    const mp = look().style.models;
    const field = this.field();
    const deckMat = sceneryMaterial(look().style.toon, { vertexColors: true });
    const cableMat = new THREE.LineBasicMaterial({ color: mp.cable });
    for (const f of this.bridgeLines.features) {
      if (f.properties.kind !== 'bridge-line' || f.geometry.type !== 'MultiLineString') continue;
      const id = f.properties.id;
      const suspension = id === 'bosphorus-bridge' || id === 'fsm-bridge' || id === 'yss-bridge';
      // Centre line: the longest piece (pieces are the two carriageways and ramps).
      const piece = [...f.geometry.coordinates].sort((a, b) => b.length - a.length)[0] as [number, number][];
      const pts = piece.map((ll) => sharedFrame.local(ll));
      const len = (i: number) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      // Resample every 12 m with "over water" flags.
      const samples: { x: number; y: number; water: boolean }[] = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const n = Math.max(1, Math.ceil(len(i) / 12));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
          const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
          samples.push({ x, y, water: field ? isWater(field, CONFIG.bounds, ...sharedFrame.lngLat([x, y])) : false });
        }
      }
      const last = pts[pts.length - 1];
      samples.push({ x: last[0], y: last[1], water: false });
      if (samples.length < 3) continue;
      const first = samples.findIndex((s) => s.water);
      const lastW = samples.length - 1 - [...samples].reverse().findIndex((s) => s.water);
      const deckZ = suspension ? S.suspensionDeckM : S.lowDeckM;
      const width = suspension ? S.suspensionDeckWidthM : S.lowDeckWidthM;
      const z = (i: number) => {
        if (!suspension || first < 0) return deckZ;
        const ramp = 18;
        if (i < first) return deckZ - Math.max(0, Math.min(1, (first - i) / ramp)) * (deckZ - 20);
        if (i > lastW) return deckZ - Math.max(0, Math.min(1, (i - lastW) / ramp)) * (deckZ - 20);
        return deckZ;
      };
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i + 1 < samples.length; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l = Math.hypot(dx, dy);
        if (l < 0.5) continue;
        const za = z(i);
        const zb = z(i + 1);
        const g = slab(mp.deck);
        g.scale(width, l + 0.6, S.deckThickM);
        g.rotateX(Math.atan2(zb - za, l));
        g.rotateZ(Math.atan2(-dx, dy));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (za + zb) / 2 - S.deckThickM / 2);
        parts.push(g);
      }
      if (!parts.length) continue;
      this.bridges.add(new THREE.Mesh(mergeGeometries(parts), deckMat));
      if (!suspension || first < 0 || lastW <= first) continue;
      // Towers where the deck meets the shore; cables sag between them and run down to the ends.
      const towerH = S.suspensionTowerM;
      const ends = [samples[Math.max(0, first - 1)], samples[Math.min(samples.length - 1, lastW + 1)]];
      const dir = Math.atan2(-(ends[1].x - ends[0].x), ends[1].y - ends[0].y);
      for (const tp of ends) {
        const t = new THREE.Mesh(bridgeTower(towerH, width, look().style.models), deckMat);
        t.position.set(tp.x, tp.y, 0);
        t.rotation.z = dir;
        this.bridges.add(t);
      }
      const ux = Math.cos(dir);
      const uy = Math.sin(dir); // across the deck
      for (const side of [-1, 1]) {
        const ox = (ux * width * side) / 2;
        const oy = (uy * width * side) / 2;
        const cable: THREE.Vector3[] = [];
        const s0 = samples[0];
        cable.push(new THREE.Vector3(s0.x + ox, s0.y + oy, z(0) + 2));
        const [ta, tb] = ends;
        cable.push(new THREE.Vector3(ta.x + ox, ta.y + oy, towerH));
        for (let k = 1; k < 24; k++) {
          const t = k / 24;
          const sag = 4 * t * (1 - t);
          cable.push(new THREE.Vector3(ta.x + (tb.x - ta.x) * t + ox, ta.y + (tb.y - ta.y) * t + oy, towerH - sag * (towerH - deckZ - 4)));
        }
        cable.push(new THREE.Vector3(tb.x + ox, tb.y + oy, towerH));
        const sn = samples[samples.length - 1];
        cable.push(new THREE.Vector3(sn.x + ox, sn.y + oy, z(samples.length - 1) + 2));
        this.bridges.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cable), cableMat));
        // Hangers.
        const hang: THREE.Vector3[] = [];
        for (let k = 1; k < 24; k++) {
          const t = k / 24;
          const sag = 4 * t * (1 - t);
          const x = ta.x + (tb.x - ta.x) * t + ox;
          const y = ta.y + (tb.y - ta.y) * t + oy;
          hang.push(new THREE.Vector3(x, y, towerH - sag * (towerH - deckZ - 4)), new THREE.Vector3(x, y, deckZ));
        }
        this.bridges.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hang), cableMat));
      }
    }
  }

  /** Tree crown colours from the city palette of the moment (season, night, weather already applied). */
  setPalette(p: CityPalette, season: string, snow: number, night = 0): void {
    const greens = [p.park, p.wood, p.grass, mixHex(p.park, '#ffffff', 0.15), mixHex(p.wood, '#000000', 0.08)];
    const accents = season === 'spring' || season === 'autumn' ? p.blossom : [];
    const share = season === 'autumn' ? 0.4 : season === 'spring' ? 0.3 : 0;
    const out: string[] = [];
    for (let i = 0; i < 20; i++) out.push(accents.length && i / 20 < share ? accents[i % accents.length] : greens[i % greens.length]);
    // The palette is already darkened for the night and the night light darkens again: lift the crowns.
    const lifted = night > 0 ? out.map((c) => mixHex(c, '#9FB8E8', night * 0.35)) : out;
    const colors = snow > 0.3 ? lifted.map((c, i) => (i % 3 ? mixHex(c, '#ffffff', 0.75) : c)) : lifted;
    const key = colors.join();
    if (key === this.crownColors.join()) return;
    this.crownColors = colors;
    this.treeKey = '';
    this.lastZoom = -1;
  }

  setLighting(l: { sunAzimuth: number; sunElevation: number; sunColor: string; sunIntensity: number; sky: string; ground: string; hemiIntensity: number }): void {
    const az = l.sunAzimuth * DEG;
    const el = Math.max(8, l.sunElevation) * DEG;
    this.sun.position.set(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el));
    this.sun.color.set(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.hemi.color.set(l.sky);
    this.hemi.groundColor.set(l.ground);
    this.hemi.intensity = l.hemiIntensity;
  }

  /** Trees for the parks / woods in the loaded tiles around the view (debounced on moves and tile loads). */
  refreshTrees(): void {
    if (!this.map || !look().style.trees3d || this.map.getZoom() < S.treesFrom - 0.3) {
      if (this.trees.length) (this.trees = []), (this.treeKey = '');
      return;
    }
    const b = this.map.getBounds();
    const pad = 0.25;
    const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const [x0, y0] = sharedFrame.local([w - (e - w) * pad, s - (n - s) * pad]);
    const [x1, y1] = sharedFrame.local([e + (e - w) * pad, n + (n - s) * pad]);
    const box: [number, number, number, number] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    const feats = this.map.querySourceFeatures('city', { sourceLayer: 'landcover', filter: ['any', ['==', ['get', 'class'], 'wood'], ['in', ['get', 'subclass'], ['literal', ['park', 'garden']]]] });
    const seen = new Set<string>();
    const out: TreeSpot[] = [];
    for (const f of feats) {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      const local = polys.map((poly) => poly.map((ring) => ring.map((ll) => sharedFrame.local(ll as [number, number]))));
      scatterTrees(local, f.properties?.class === 'wood' ? S.woodSpacingM : S.parkSpacingM, box, seen, out, MAX_TREES);
      if (out.length >= MAX_TREES) break;
    }
    this.trees = out;
    this.treeKey = '';
    this.map.triggerRepaint();
  }

  /** Hero under a screen point (CSS px), if any. */
  at(pt: { x: number; y: number }): Hero | null {
    if (!look().style.landmarks3d || !this.map) return null;
    let best: Hero | null = null;
    let bestD = Infinity;
    const mpp = (40_075_016.7 * Math.cos((this.map.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
    for (const h of this.heroMeshes) {
      if (!h.mesh.visible) continue;
      const q = this.map.project(h.hero.lngLat);
      const r = Math.max(22, (h.hero.lengthM * h.mesh.scale.x * 0.55) / mpp);
      // Tall models: also accept taps a little above the foot (pitched views).
      const d = Math.min(Math.hypot(q.x - pt.x, q.y - pt.y), Math.hypot(q.x - pt.x, q.y - r * 0.6 - pt.y));
      if (d < r && d < bestD) (best = h.hero), (bestD = d);
    }
    return best;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const st = look().style;
    if (!st.trees3d && !st.landmarks3d) return;
    const zoom = this.map.getZoom();
    const heroesOn = st.landmarks3d && zoom >= S.heroesFrom;
    const exag = interpolateStops(S.heroExaggeration, zoom);
    const grow = Math.min(1, Math.max(0, (zoom - S.heroesFrom) / 0.4));
    for (const h of this.heroMeshes) {
      h.mesh.visible = heroesOn;
      const k = h.base * exag * (0.3 + 0.7 * grow);
      h.mesh.scale.set(k, k, k);
    }
    this.bridges.visible = st.landmarks3d && zoom >= S.bridgesFrom;
    const treesOn = st.trees3d && zoom >= S.treesFrom && this.trees.length > 0;
    this.crowns.visible = this.trunks.visible = treesOn;
    if (treesOn && (this.treeKey !== `${this.trees.length}` || Math.abs(zoom - this.lastZoom) > 0.05)) this.layoutTrees(zoom);
    this.camera.projectionMatrix = sharedFrame.projection(args);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  private layoutTrees(zoom: number): void {
    const { m, q, p, s, c } = this.o;
    const exag = interpolateStops(S.treeExaggeration, zoom);
    const grow = Math.min(1, Math.max(0, (zoom - S.treesFrom) / 0.5));
    q.identity();
    let n = 0;
    for (const t of this.trees) {
      const size = (0.75 + t.r * 0.5) * exag * grow;
      const crownR = S.crownM * size;
      const trunkH = S.trunkM * size;
      p.set(t.x, t.y, trunkH + crownR * 0.8);
      s.set(crownR, crownR, crownR * 1.05);
      m.compose(p, q, s);
      this.crowns.setMatrixAt(n, m);
      this.crowns.setColorAt(n, c.set(this.crownColors[Math.floor(t.r * 997) % this.crownColors.length]));
      p.set(t.x, t.y, 0);
      s.set(size, size, trunkH + crownR * 0.3);
      m.compose(p, q, s);
      this.trunks.setMatrixAt(n, m);
      n++;
    }
    this.crowns.count = this.trunks.count = n;
    this.crowns.instanceMatrix.needsUpdate = true;
    this.trunks.instanceMatrix.needsUpdate = true;
    if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true;
    this.treeKey = `${this.trees.length}`;
    this.lastZoom = zoom;
  }
}

