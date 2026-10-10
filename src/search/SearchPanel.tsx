import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, type Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import { CONFIG } from '../config';
import type { DistrictProps, LandmarkProps } from '../data/load';
import { CITY_SOURCE } from '../map/city';
import { nominatim } from '../osm/nominatim';
import { CATEGORY_ICON, KIND_ICON } from '../places/pins';
import { categoryOfClass, placeFromFeature } from '../places/poi-layer';
import { flyTo, openPier, openPlace, places } from '../places/ui/context';
import { kindLabel, useT } from '../ui/i18n';
import { services } from '../ui/services';
import { ui, useUi } from '../ui/store';
import { rankResults, score, type SearchResult } from './local';

export interface SearchData {
  districts: FeatureCollection<Point, DistrictProps>;
  landmarks: FeatureCollection<Point | MultiLineString, LandmarkProps>;
}

let data: SearchData | null = null;
export function setSearchData(d: SearchData): void {
  data = d;
}
export const searchData = () => data;

const LANDMARK_ICON: Record<string, string> = { tower: '🗼', bridge: '🌉', tulips: '🌷' };

/** POIs + street names from tiles already loaded (free, instant, offline-friendly). */
type Feat = Parameters<typeof placeFromFeature>[0];
function tileItems(map: MlMap, q: string): { items: SearchResult[]; feats: Map<string, Feat> } {
  const feats = new Map<string, Feat>();
  const items: SearchResult[] = [];
  if (!map.getSource(CITY_SOURCE)) return { items, feats };
  for (const f of map.querySourceFeatures(CITY_SOURCE, { sourceLayer: 'poi' })) {
    const name = f.properties?.name as string | undefined;
    if (!name || !categoryOfClass(String(f.properties.class)) || !score(name, q)) continue;
    const p = placeFromFeature(f);
    if (!p || feats.has(p.id)) continue;
    feats.set(p.id, f);
    items.push({ kind: 'poi', id: p.id, name, sub: '', icon: KIND_ICON[p.kind] ?? CATEGORY_ICON[p.category], lngLat: p.lngLat });
  }
  for (const f of map.querySourceFeatures(CITY_SOURCE, { sourceLayer: 'transportation_name' })) {
    const name = f.properties?.name as string | undefined;
    if (!name || !score(name, q) || f.geometry.type !== 'LineString') continue;
    const c = f.geometry.coordinates;
    items.push({ kind: 'street', id: `street:${name}`, name, sub: '', icon: '🛣', lngLat: c[Math.floor(c.length / 2)] as [number, number] });
  }
  return { items, feats };
}

interface NomResult {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  name: string;
  display_name: string;
  category: string;
  type: string;
  boundingbox: [string, string, string, string];
}

const PLACE_CATEGORIES = new Set(['amenity', 'shop', 'tourism', 'leisure', 'historic', 'craft']);

/**
 * Search: places, piers, districts, landmarks and loaded map POIs / streets as you type; the whole
 * of OpenStreetMap (Nominatim, bounded to our area) when you press Enter / tap "Search OSM".
 */
export function SearchPanel() {
  const open = useUi((s) => s.search);
  const lang = useUi((s) => s.lang);
  const t = useT();
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const feats = useRef(new Map<string, Feat>());

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
    else {
      setQ('');
      setOnline(null);
    }
  }, [open]);

  const local = useMemo(() => {
    if (!open || norm2(q).length < 2) return [];
    const { map, pierById } = services();
    const items: SearchResult[] = [];
    for (const p of places().byId.values())
      items.push({ kind: 'place', id: p.id, name: lang === 'en' && p.nameEn ? p.nameEn : p.name, sub: kindLabel(p.kind, lang), icon: KIND_ICON[p.kind] ?? CATEGORY_ICON[p.category], lngLat: p.lngLat });
    for (const [id, p] of pierById) items.push({ kind: 'pier', id, name: lang === 'en' ? p.nameEn : p.name, sub: t('pier'), icon: '⚓', lngLat: p.lngLat });
    for (const f of data?.districts.features ?? [])
      items.push({ kind: 'district', id: f.properties.id, name: lang === 'en' ? f.properties.nameEn : f.properties.name, sub: t('district'), icon: '🏘', lngLat: f.geometry.coordinates as [number, number] });
    for (const f of data?.landmarks.features ?? [])
      if (f.geometry.type === 'Point' && f.properties.name)
        items.push({ kind: 'landmark', id: f.properties.id, name: (lang === 'en' ? f.properties.nameEn : f.properties.name) ?? '', sub: t('landmark'), icon: LANDMARK_ICON[f.properties.kind] ?? '★', lngLat: f.geometry.coordinates as [number, number] });
    const tiles = tileItems(map, q);
    feats.current = tiles.feats;
    for (const r of tiles.items) r.sub = r.kind === 'street' ? t('street') : kindLabel(placeFromFeature(tiles.feats.get(r.id)!)?.kind ?? '', lang);
    return rankResults([...items, ...tiles.items], q, 10);
  }, [q, open, lang, t]);

  if (!open) return null;

  const close = () => ui.set({ search: false });

  const searchOsm = async () => {
    if (norm2(q).length < 3 || busy) return;
    setBusy(true);
    const [w, s, e, n] = CONFIG.bounds;
    const res = await nominatim<NomResult[]>('search', { q, viewbox: `${w},${n},${e},${s}`, bounded: '1', limit: '10', addressdetails: '0' });
    setBusy(false);
    // Long streets come back as several OSM ways — keep one per name.
    const seen = new Set<string>();
    const unique = (res ?? []).filter((r) => {
      const k = r.category === 'highway' ? `hw|${r.name}` : `${r.osm_type}/${r.osm_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    setOnline(
      unique.map((r) => ({
        kind: 'osm' as const,
        id: `osm:${r.osm_type}/${r.osm_id}`,
        name: r.name || r.display_name.split(',')[0],
        sub: r.display_name.split(',').slice(1, 3).join(',').trim(),
        icon: PLACE_CATEGORIES.has(r.category) ? KIND_ICON[r.type] ?? '📍' : r.category === 'highway' ? '🛣' : r.category === 'place' || r.category === 'boundary' ? '🏘' : '📍',
        lngLat: [Number(r.lon), Number(r.lat)] as [number, number],
        bbox: [Number(r.boundingbox[2]), Number(r.boundingbox[0]), Number(r.boundingbox[3]), Number(r.boundingbox[1])] as [number, number, number, number],
        _cat: r.category,
        _type: r.type,
      })),
    );
  };

  const pick = (r: SearchResult & { _cat?: string; _type?: string }) => {
    close();
    if (r.kind === 'place') return openPlace(r.id);
    if (r.kind === 'pier') return openPier(r.id);
    if (r.kind === 'poi') {
      const f = feats.current.get(r.id);
      const p = f && placeFromFeature(f);
      if (p) {
        places().add(p);
        return openPlace(p.id);
      }
    }
    if (r.kind === 'osm' && r._cat && PLACE_CATEGORIES.has(r._cat)) {
      const cls = r._type ?? '';
      places().add({
        id: r.id,
        name: r.name,
        nameEn: null,
        category: categoryOfClass(cls === 'clothes' ? 'clothing_store' : cls) ?? (r._cat === 'shop' ? 'shopping' : r._cat === 'leisure' ? 'park' : r._cat === 'amenity' ? 'food' : 'culture'),
        kind: cls,
        osm: r.id.slice(4),
        district: null,
        hours: null,
        cuisine: null,
        lngLat: r.lngLat,
        source: 'osm',
      });
      return openPlace(r.id);
    }
    ui.set({ selection: null, sheetSnap: 'peek' });
    showSpot(r.lngLat, r.name);
    const { map } = services();
    const big = r.bbox && (r.bbox[2] - r.bbox[0] > 0.004 || r.bbox[3] - r.bbox[1] > 0.004);
    if (big && r.bbox) map.fitBounds(r.bbox, { padding: { top: 140, bottom: 180, left: 30, right: 30 }, pitch: 45, maxZoom: 16, duration: 1400 });
    else flyTo(r.lngLat, r.kind === 'district' ? 14.2 : 16.2);
  };

  const list = online ?? local;
  return (
    <div className="search" role="dialog" aria-label={t('search')}>
      <form
        className="search__bar"
        onSubmit={(e) => {
          e.preventDefault();
          void searchOsm();
        }}
      >
        <span aria-hidden>🔍</span>
        <input
          ref={input}
          value={q}
          enterKeyHint="search"
          placeholder={t('searchPlaceholder')}
          onChange={(e) => {
            setQ(e.target.value);
            setOnline(null);
          }}
          onKeyDown={(e) => e.key === 'Escape' && close()}
        />
        <button type="button" className="search__close" onClick={close} aria-label={t('close')}>
          ×
        </button>
      </form>
      <div className="search__panel">
        <ul className="plist">
          {list.map((r) => (
            <li key={`${r.kind}:${r.id}`}>
              <button onClick={() => pick(r)}>
                <span className="picon">{r.icon}</span>
                <span className="plist__name">
                  <b>{r.name}</b>
                  {r.sub && <small className="muted">{r.sub}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {online && online.length === 0 && <p className="muted feed__empty">{t('noMatches')}</p>}
        {norm2(q).length >= 3 && !online && (
          <button className="pill search__osm" onClick={() => void searchOsm()} disabled={busy}>
            {busy ? t('searching') : `🌍 ${t('searchOsm')} “${q.trim()}”`}
          </button>
        )}
        <small className="muted search__credit">{t('searchCredit')}</small>
      </div>
    </div>
  );
}

const norm2 = (s: string) => s.trim();

let spot: Marker | null = null;
let spotTimer = 0;
/** A brief pulse where a street / neighbourhood result is. */
function showSpot(lngLat: [number, number], name: string): void {
  const { map } = services();
  spot?.remove();
  const el = document.createElement('div');
  el.className = 'spot';
  el.innerHTML = '<span class="spot__ring"></span><span class="spot__name"></span>';
  (el.querySelector('.spot__name') as HTMLElement).textContent = name;
  spot = new Marker({ element: el }).setLngLat(lngLat).addTo(map);
  clearTimeout(spotTimer);
  spotTimer = window.setTimeout(() => (spot?.remove(), (spot = null)), 8000);
}
