/**
 * The planner wired to the app's real data: places (featured + tapped POIs), events, piers and the
 * ferry schedules (real timetables where valid, simulated otherwise — same as the map), plus the
 * plan drawn on the map: numbered stops, start / end points, walks as dotted lines, ferry legs along
 * their real lanes.
 */
import { look } from '../themes';
import type { FilterSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { events } from '../events/events';
import { openAt } from '../places/store';
import { places } from '../places/ui/context';
import { timetableStatus } from '../sim/real';
import { services } from '../ui/services';
import type { Plan } from './model';
import { buildTimeline, type Connection, type DayTimeline, type PlanDeps } from './timeline';

let eventById: Map<string, { title: string; start: string; place: string }> | null = null;
let eventsVersion = -1;
function eventLookup() {
  if (!eventById || eventsVersion !== events.all.length) {
    eventById = new Map(events.all.map((e) => [e.id, e]));
    eventsVersion = events.all.length;
  }
  return eventById;
}

function planDeps(): PlanDeps {
  const s = services();
  return {
    place: (id) => places().byId.get(id),
    event: (id) => eventLookup().get(id),
    openAt: (h, ms) => openAt(h, ms),
    piers: s.piers.features.map((f) => ({ id: f.properties.id, name: f.properties.name, nameEn: f.properties.nameEn, lngLat: f.geometry.coordinates as [number, number], ...(f.properties.operator ? { operator: f.properties.operator } : {}) })),
    getDay: s.getDay,
    // The Şehir Hatları file decides the day's note; each ferry leg also carries its own real / simulated label.
    timetableValid: (d) => timetableStatus(s.timetables.find((f) => !f.operator) ?? null, d) === 'valid',
    landOf: (p, snapM) => s.land.landOf(p, snapM),
  };
}

const lineStops = (id: string) => services().lineById.get(id)?.stops ?? [];

export function timelineOf(p: Plan): DayTimeline[] {
  return buildTimeline(p, planDeps(), lineStops);
}

/** Lane geometry for a ferry ride through piers `via` on a line (each hop its own lane). */
function rideCoords(lineId: string, via: string[]): [number, number][] {
  const { network } = services();
  const input = network.inputs.find((i) => i.line.id === lineId);
  const path = network.paths.get(lineId);
  if (!input || !path) return [];
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < via.length; k++) {
    const a = input.line.stops.indexOf(via[k]);
    const b = input.line.stops.indexOf(via[k + 1]);
    let i = input.legs.findIndex((l) => l.from === a && l.to === b);
    let coords = i >= 0 ? path.legs[i].coords : null;
    if (!coords) {
      i = input.legs.findIndex((l) => l.from === b && l.to === a);
      coords = i >= 0 ? [...path.legs[i].coords].reverse() : null;
    }
    if (coords) out.push(...(out.length ? coords.slice(1) : coords));
  }
  return out;
}

const SRC = 'plan';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Walk legs, and a ferry ride along its real lanes, for one connection from a to b. */
function connectionFeatures(c: Connection, a: [number, number], b: [number, number]): GeoJSON.Feature[] {
  const s = services();
  const pier = (id: string) => s.pierById.get(id)?.lngLat;
  const walkLine = (p: [number, number], q: [number, number]): GeoJSON.Feature => ({ type: 'Feature', properties: { mode: 'walk' }, geometry: { type: 'LineString', coordinates: [p, q] } });
  if (c.mode === 'walk') return [walkLine(a, b)];
  if (c.mode !== 'ferry') return [];
  const out: GeoJSON.Feature[] = [];
  const pa = pier(c.fromPier);
  const pb = pier(c.toPier);
  if (pa) out.push(walkLine(a, pa));
  if (pb) out.push(walkLine(pb, b));
  const coords = rideCoords(c.lineId, c.via);
  if (coords.length > 1) out.push({ type: 'Feature', properties: { mode: 'ferry', color: s.lineById.get(c.lineId)?.color ?? look().guides.stopColor }, geometry: { type: 'LineString', coordinates: coords } });
  return out;
}

function planGeoJSON(days: DayTimeline[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const ends = new Map<string, { ll: [number, number]; role: string }>();
  for (const d of days) {
    d.connections.forEach((c, i) => {
      const a = d.stops[i].lngLat;
      const b = d.stops[i + 1].lngLat;
      if (a && b) features.push(...connectionFeatures(c, a, b));
    });
    const first = d.stops[0]?.lngLat;
    const last = d.stops[d.stops.length - 1]?.lngLat;
    if (d.start && first) features.push(...connectionFeatures(d.start.conn, d.start.point.ll, first));
    if (d.end && last) features.push(...connectionFeatures(d.end.conn, last, d.end.point.ll));
    for (const [pt, role] of [
      [d.start?.point, 'start'],
      [d.end?.point, 'end'],
    ] as const) {
      if (!pt) continue;
      const k = pt.ll.join(',');
      const had = ends.get(k);
      ends.set(k, { ll: pt.ll, role: had && had.role !== role ? 'both' : role });
    }
    for (const st of d.stops) if (st.lngLat) features.push({ type: 'Feature', properties: { n: String(st.n) }, geometry: { type: 'Point', coordinates: st.lngLat } });
  }
  // Start / end points: their own marker, not numbered.
  for (const e of ends.values()) features.push({ type: 'Feature', properties: { end: e.role }, geometry: { type: 'Point', coordinates: e.ll } });
  return { type: 'FeatureCollection', features };
}

/** Plan layers (same look as guides: ferry legs in the line colour, dotted walks, numbered stops; start / end as rings). */
export function addPlanLayers(map: MlMap): void {
  map.addSource(SRC, { type: 'geojson', data: EMPTY });
  const before = map.getLayer('weather') ? 'weather' : undefined;
  map.addLayer({ id: 'plan-ferry', type: 'line', source: SRC, filter: ['==', ['get', 'mode'], 'ferry'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 16, 8], 'line-opacity': 0.95 } }, before);
  map.addLayer({ id: 'plan-walk', type: 'line', source: SRC, filter: ['==', ['get', 'mode'], 'walk'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': look().guides.walkColor, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 5], 'line-dasharray': ['literal', [0.2, 1.8]] } }, before);
  const isEnd: FilterSpecification = ['has', 'end'];
  map.addLayer({ id: 'plan-ends', type: 'circle', source: SRC, filter: isEnd, paint: { 'circle-radius': 10, 'circle-color': '#FFFFFF', 'circle-stroke-color': look().plan.endColor, 'circle-stroke-width': 4 } }, before);
  map.addLayer({ id: 'plan-ends-dot', type: 'circle', source: SRC, filter: isEnd, paint: { 'circle-radius': 3.5, 'circle-color': look().plan.endColor } }, before);
  map.addLayer({ id: 'plan-stops', type: 'circle', source: SRC, filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'n']], paint: { 'circle-radius': 12, 'circle-color': look().plan.stopColor, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 } }, before);
  map.addLayer({ id: 'plan-num', type: 'symbol', source: SRC, filter: ['all', ['==', ['geometry-type'], 'Point'], ['has', 'n']], layout: { 'text-field': ['get', 'n'], 'text-font': [...look().city.fontBold], 'text-size': 12.5, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#FFFFFF' } }, before);
}

export function showPlanOnMap(days: DayTimeline[] | null): void {
  (services().map.getSource(SRC) as GeoJSONSource | undefined)?.setData(days ? planGeoJSON(days) : EMPTY);
}

/** Fit the map to a plan's stops (above the sheet). */
export function fitPlan(days: DayTimeline[]): void {
  const pts = days.flatMap((d) => [...d.stops.map((s) => s.lngLat), d.start?.point.ll, d.end?.point.ll].filter((x): x is [number, number] => !!x));
  if (!pts.length) return;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  services().map.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], { padding: { top: 150, bottom: Math.round(window.innerHeight * 0.5), left: 50, right: 50 }, maxZoom: 15, duration: 1200 });
}

/** Theme-dependent paint of the plan layers (re-applied on a theme switch). */
export function planPaint(): [string, string, unknown][] {
  const t = look();
  return [
    ['plan-walk', 'line-color', t.guides.walkColor],
    ['plan-ends', 'circle-stroke-color', t.plan.endColor],
    ['plan-ends-dot', 'circle-color', t.plan.endColor],
    ['plan-stops', 'circle-color', t.plan.stopColor],
    ['plan-num', 'layout:text-font', [...t.city.fontBold]],
  ];
}
