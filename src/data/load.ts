import type { FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson';
import type { RouteProps } from '../sim/network';
import type { LineSpec } from '../sim/types';
import landUrl from '../../data/land.geojson?url';
import piersUrl from '../../data/piers.geojson?url';
import districtsUrl from '../../data/districts.geojson?url';
import routesUrl from '../../data/routes.geojson?url';
import linesUrl from '../../data/lines.json?url';

export interface BerthProps {
  id: string;
  name: string;
  osm: string;
  lngLat: [number, number];
  alongBearing: number;
  seawardBearing: number;
}

export interface PierProps {
  id: string;
  name: string;
  nameEn: string;
  osm: string;
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
