import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import landUrl from '../../data/land.geojson?url';
import piersUrl from '../../data/piers.geojson?url';
import districtsUrl from '../../data/districts.geojson?url';

export interface PierProps {
  id: string;
  name: string;
  nameEn: string;
  osm: string;
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
