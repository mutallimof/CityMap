export type PlaceCategory = 'food' | 'culture' | 'shopping' | 'park' | 'view';

/** Featured places as stored in data/places.geojson (all fields from OpenStreetMap). */
export interface PlaceProps {
  id: string;
  name: string;
  nameEn: string | null;
  category: PlaceCategory;
  kind: string;
  /** "node/123" | "way/123" | "relation/123"; '' for an event venue placed from its official address. */
  osm: string;
  /** Official address (event venues geocoded from it). */
  address?: string | null;
  district: string | null;
  hours: string | null;
  cuisine: string | null;
  website?: string | null;
  phone?: string | null;
  /** Well known (Wikidata / high importance): visible when zoomed out. */
  major?: boolean;
  /** Picked automatically from OSM (data/places-auto.geojson), not hand-curated. */
  auto?: boolean;
}

export interface Place extends PlaceProps {
  lngLat: [number, number];
  /** 'featured' = curated pin; 'osm' = any map POI the visitor tapped. */
  source: 'featured' | 'osm';
}

/** Extra OSM tags fetched on demand (Nominatim lookup). */
export interface PlaceDetails {
  hours: string | null;
  website: string | null;
  phone: string | null;
  cuisine: string | null;
  district: string | null;
  nameEn: string | null;
}
