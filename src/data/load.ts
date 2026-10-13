/**
 * Fetchers for the processed data in `data/` (bundled as hashed asset URLs) and the shapes of their properties.
 */
import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import type { RouteProps } from '../sim/network';
import type { LineSpec } from '../sim/types';
import type { HolidayFile, TimetableFile } from '../sim/timetable-data';
import landUrl from '../../data/land.geojson?url';
import piersUrl from '../../data/piers.geojson?url';
import districtsUrl from '../../data/districts.geojson?url';
import routesUrl from '../../data/routes.geojson?url';
import linesUrl from '../../data/lines.json?url';
import timetablesUrl from '../../data/timetables.json?url';
import turyolUrl from '../../data/timetables-turyol.json?url';
import denturUrl from '../../data/timetables-dentur.json?url';
import holidaysUrl from '../../data/catalog/holidays.json?url';
import placesUrl from '../../data/places.geojson?url';
import venuePlacesUrl from '../../data/venue-places.geojson?url';
import eventVenuesUrl from '../../data/event-venues.geojson?url';
import placesAutoUrl from '../../data/places-auto.geojson?url';
import landmarksUrl from '../../data/landmarks.geojson?url';
import type { PlaceProps } from '../places/types';

export interface BerthProps {
  id: string;
  name: string;
  osm: string;
  lngLat: [number, number];
  alongBearing: number;
  seawardBearing: number;
  /** Private operators' berths: how their boats keep clear of the nearest Şehir Hatları berth (build-piers.ts). */
  spread?: [number, number, number, number, number, number, number];
}

export interface PierProps {
  id: string;
  name: string;
  nameEn: string;
  osm: string;
  /** A private operator's own pier (data/catalog/operators.json id); absent = Şehir Hatları / public. */
  operator?: string;
  berths: BerthProps[];
}

export interface DistrictProps {
  id: string;
  name: string;
  nameEn: string;
  osm: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export const loadLand = () => getJson<FeatureCollection<Polygon | MultiPolygon>>(landUrl);
export const loadPiers = () => getJson<FeatureCollection<Point, PierProps>>(piersUrl);
export const loadDistricts = () => getJson<FeatureCollection<Point, DistrictProps>>(districtsUrl);
export const loadRoutes = () => getJson<FeatureCollection<LineString, RouteProps>>(routesUrl);
export const loadLines = async () => (await getJson<{ lines: LineSpec[] }>(linesUrl)).lines;
/** Real timetables / holiday calendar; null (→ simulated schedule) if missing or unreadable. */
const orNull = <T>(p: Promise<T>) =>
  p.catch((e: unknown) => {
    console.warn(e);
    return null;
  });
/**
 * Şehir Hatları (PDF, scripts/timetables) + the private operators' published timetables (scripts/operators).
 * A file that fails to load is left out: its lines run on the simulated schedule.
 */
export const loadTimetables = async (): Promise<TimetableFile[]> =>
  (await Promise.all([timetablesUrl, turyolUrl, denturUrl].map((u) => orNull(getJson<TimetableFile>(u))))).filter((f): f is TimetableFile => !!f);
export const loadHolidays = () => orNull(getJson<HolidayFile>(holidaysUrl));
/** Featured places + event venues (OSM via scripts/build-venues.ts; geocoded by the event scraper). */
export async function loadPlaces(): Promise<FeatureCollection<Point, PlaceProps>> {
  const [places, ...venues] = await Promise.all(
    [placesUrl, venuePlacesUrl, eventVenuesUrl, placesAutoUrl].map((u) => getJson<FeatureCollection<Point, PlaceProps>>(u)),
  );
  const ids = new Set(places.features.map((f) => f.properties.id));
  const extra = venues.flatMap((v) => v.features).filter((f) => !ids.has(f.properties.id) && (ids.add(f.properties.id), true));
  return { ...places, features: [...places.features, ...extra] };
}

export interface LandmarkProps {
  id: string;
  name?: string;
  nameEn?: string;
  kind: 'tower' | 'bridge' | 'tulips' | 'bridge-line';
  osm?: string;
  building?: number | null;
  landcover?: number | null;
}
export const loadLandmarks = () => getJson<FeatureCollection<Point | MultiLineString, LandmarkProps>>(landmarksUrl);
