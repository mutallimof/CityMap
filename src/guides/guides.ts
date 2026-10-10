import type { Feature, LineString } from 'geojson';

export interface Text {
  tr: string;
  en: string;
}

/** data/catalog/guides.json */
export interface GuideSpec {
  id: string;
  icon: string;
  title: Text;
  summary: Text;
  hours: number;
  stops: { ref: string; next?: string; note: Text }[];
}

export interface Located {
  name: Text;
  lngLat: [number, number];
  icon: string;
}

/** Lookups the resolver needs (all real OSM-derived data). */
export interface GuideDeps {
  place(id: string): Located | undefined;
  pier(id: string): Located | undefined;
  landmark(id: string): Located | undefined;
  /** A line's route geometry + the vertex index of each of its stops. */
  line(id: string): { coords: [number, number][]; stops: string[]; stopVertex: number[]; color: string } | undefined;
}

export interface GuideStop extends Located {
  ref: string;
  note: Text;
  n: number;
}

export interface GuideLeg {
  mode: 'walk' | 'ferry';
  color?: string;
  coords: [number, number][];
}

export interface ResolvedGuide {
  spec: GuideSpec;
  stops: GuideStop[];
  legs: GuideLeg[];
  bbox: [number, number, number, number];
}

function locate(ref: string, d: GuideDeps): Located | undefined {
  const [kind, id] = ref.split(':');
  if (kind === 'place') return d.place(id);
  if (kind === 'pier') return d.pier(id);
  if (kind === 'landmark') return d.landmark(id);
  return undefined;
}

/** Part of a line's route between two of its stops (either direction). */
export function ferryLeg(line: NonNullable<ReturnType<GuideDeps['line']>>, from: string, to: string): [number, number][] | null {
  const a = line.stops.indexOf(from);
  const b = line.stops.indexOf(to);
  if (a < 0 || b < 0 || a === b) return null;
  const [i, j] = [line.stopVertex[a], line.stopVertex[b]];
  const seg = line.coords.slice(Math.min(i, j), Math.max(i, j) + 1);
  return i <= j ? seg : seg.reverse();
}

/** Guide spec → stops with coordinates + drawable legs. Throws on a dangling reference. Pure. */
export function resolveGuide(spec: GuideSpec, d: GuideDeps): ResolvedGuide {
  const stops: GuideStop[] = spec.stops.map((s, i) => {
    const loc = locate(s.ref, d);
    if (!loc) throw new Error(`guide ${spec.id}: unknown stop ${s.ref}`);
    return { ...loc, ref: s.ref, note: s.note, n: i + 1 };
  });
  const legs: GuideLeg[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const next = spec.stops[i].next ?? 'walk';
    if (next.startsWith('ferry:')) {
      const line = d.line(next.slice(6));
      const from = stops[i].ref.replace(/^pier:/, '');
      const to = stops[i + 1].ref.replace(/^pier:/, '');
      const coords = line && ferryLeg(line, from, to);
      if (!line || !coords) throw new Error(`guide ${spec.id}: no ${next} leg ${from} → ${to}`);
      legs.push({ mode: 'ferry', color: line.color, coords });
    } else legs.push({ mode: 'walk', coords: [stops[i].lngLat, stops[i + 1].lngLat] });
  }
  const all = [...stops.map((s) => s.lngLat), ...legs.flatMap((l) => l.coords)];
  const xs = all.map((c) => c[0]);
  const ys = all.map((c) => c[1]);
  return { spec, stops, legs, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}

export function guideGeoJSON(g: ResolvedGuide): GeoJSON.FeatureCollection {
  const legs: Feature<LineString>[] = g.legs.map((l) => ({ type: 'Feature', properties: { mode: l.mode, color: l.color ?? '#E0A100' }, geometry: { type: 'LineString', coordinates: l.coords } }));
  const stops = g.stops.map((s) => ({ type: 'Feature' as const, properties: { n: String(s.n) }, geometry: { type: 'Point' as const, coordinates: s.lngLat } }));
  return { type: 'FeatureCollection', features: [...legs, ...stops] };
}
