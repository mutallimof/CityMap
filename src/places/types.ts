export type PlaceCategory = 'food' | 'culture' | 'shopping' | 'view';

export interface PlaceProps {
  id: string;
  name: string;
  nameEn: string | null;
  category: PlaceCategory;
  kind: string;
  osm: string;
  district: string | null;
  hours: string | null;
  cuisine: string | null;
}

export interface Place extends PlaceProps {
  lngLat: [number, number];
}

export type PostType = 'event' | 'offer' | 'news';

/** As stored in data/posts.json (relative timing; DEMO content). */
export interface RawPost {
  id: string;
  placeId: string;
  type: PostType;
  title: { tr: string; en: string };
  body: { tr: string; en: string };
  /** "HH:MM" or "@sunset±MM". */
  start?: string;
  durationMin?: number;
  dayOffset?: number;
  validDays?: number;
  postedHoursAgo: number;
  demo: true;
}

/** A post resolved against the current simulated time. */
export interface Post extends RawPost {
  postedAt: number; // epoch ms
  startsAt?: number;
  endsAt?: number;
  validUntil?: number;
}
