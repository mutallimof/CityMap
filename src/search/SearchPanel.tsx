/**
 * Search: instant local results as you type (our data + loaded tile POIs / streets), OpenStreetMap
 * (Nominatim) only on submit.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, type Map as MlMap } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString, Point } from 'geojson';
import type { DistrictProps, LandmarkProps } from '../data/load';
import { CITY_SOURCE } from '../map/city';
import { kindOfPlace, type IconKind } from '../places/icons';
import { PlaceIcon } from '../places/ui/PlaceIcon';
import { categoryOfClass, iconKindOfPoi, placeFromFeature } from '../places/place-layers';
import { flyTo, openPier, openPlace, places } from '../places/ui/context';
import { cleanName } from '../places/format';
import { kindLabel, useT } from '../ui/i18n';
import { services } from '../ui/services';
import { ui, useUi } from '../ui/store';
import { landmarkPlace } from './landmark';
import { rankResults, score, type SearchResult } from './local';
import { osmSearch, PLACE_CATEGORIES, type OsmResult } from './osm';

export interface SearchData {
  districts: FeatureCollection<Point, DistrictProps>;
  landmarks: FeatureCollection<Point | MultiLineString, LandmarkProps>;
}

let data: SearchData | null = null;
export function setSearchData(d: SearchData): void {
  data = d;
}
export const searchData = () => data;


/** POIs + street names from tiles already loaded (free, instant, offline-friendly). */
type Feat = Parameters<typeof placeFromFeature>[0];
function tileItems(map: MlMap, q: string): { items: SearchResult[]; feats: Map<string, Feat> } {
  const feats = new Map<string, Feat>();
  const items: SearchResult[] = [];
  if (!map.getSource(CITY_SOURCE)) return { items, feats };
  for (const f of map.querySourceFeatures(CITY_SOURCE, { sourceLayer: 'poi' })) {
    const name = f.properties?.name as string | undefined;
    if (!name || !iconKindOfPoi(String(f.properties.class), String(f.properties.subclass)) || !score(name, q)) continue;
    const p = placeFromFeature(f);
    if (!p || feats.has(p.id)) continue;
    feats.set(p.id, f);
    items.push({ kind: 'poi', id: p.id, name, sub: '', icon: `k:${kindOfPlace(p.kind, p.category)}`, lngLat: p.lngLat });
  }
  for (const f of map.querySourceFeatures(CITY_SOURCE, { sourceLayer: 'transportation_name' })) {
    const name = f.properties?.name as string | undefined;
    if (!name || !score(name, q) || f.geometry.type !== 'LineString') continue;
    const c = f.geometry.coordinates;
    items.push({ kind: 'street', id: `street:${name}`, name, sub: '', icon: '🛣', lngLat: c[Math.floor(c.length / 2)] as [number, number] });
  }
  return { items, feats };
}

/** Local results as you type: places, piers, districts, landmarks, loaded map POIs / streets. */
export function localSearch(q: string, lang: 'tr' | 'en', t: ReturnType<typeof useT>): { items: SearchResult[]; feats: Map<string, Feat> } {
  const { map, pierById } = services();
  const items: SearchResult[] = [];
  for (const p of places().byId.values())
    items.push({ kind: 'place', id: p.id, name: cleanName(lang === 'en' && p.nameEn ? p.nameEn : p.name, lang), sub: kindLabel(p.kind, lang), icon: `k:${kindOfPlace(p.kind, p.category)}`, lngLat: p.lngLat });
  for (const [id, p] of pierById) items.push({ kind: 'pier', id, name: lang === 'en' ? p.nameEn : p.name, sub: t('pier'), icon: '⚓', lngLat: p.lngLat });
  for (const f of data?.districts.features ?? [])
    items.push({ kind: 'district', id: f.properties.id, name: lang === 'en' ? f.properties.nameEn : f.properties.name, sub: t('district'), icon: '🏘', lngLat: f.geometry.coordinates as [number, number] });
  for (const f of data?.landmarks.features ?? [])
    if (f.geometry.type === 'Point' && f.properties.name)
      items.push({ kind: 'landmark', id: f.properties.id, name: (lang === 'en' ? f.properties.nameEn : f.properties.name) ?? '', sub: t('landmark'), icon: f.properties.kind === 'bridge' ? '🌉' : 'k:landmark', lngLat: f.geometry.coordinates as [number, number] });
  const tiles = tileItems(map, q);
  for (const r of tiles.items) r.sub = r.kind === 'street' ? t('street') : kindLabel(placeFromFeature(tiles.feats.get(r.id)!)?.kind ?? '', lang);
  return { items: rankResults([...items, ...tiles.items], q, 10), feats: tiles.feats };
}

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
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const feats = useRef(new Map<string, Feat>());

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
    else {
      setQ('');
      setOnline(null);
      setFailed(false);
    }
  }, [open]);

  const local = useMemo(() => {
    if (!open || norm2(q).length < 2) return [];
    const r = localSearch(q, lang, t);
    feats.current = r.feats;
    return r.items;
  }, [q, open, lang, t]);

  if (!open) return null;

  const close = () => ui.set({ search: false });

  const searchOsm = async () => {
    if (norm2(q).length < 3 || busy) return;
    setBusy(true);
    const res = await osmSearch(q);
    setBusy(false);
    setFailed(res === null);
    setOnline(res);
  };

  const pick = (r: OsmResult) => {
    close();
    if (r.kind === 'place') return openPlace(r.id);
    if (r.kind === 'pier') return openPier(r.id);
    if (r.kind === 'landmark') {
      const f = data?.landmarks.features.find((x) => x.properties.id === r.id);
      const open = f && landmarkPlace(f.properties, r.lngLat, places().byId.values());
      if (open) {
        if ('add' in open) places().add(open.add);
        return openPlace('add' in open ? open.add.id : open.existing);
      }
    }
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
            setFailed(false);
          }}
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
                {r.icon.startsWith('k:') ? <PlaceIcon icon={r.icon.slice(2) as IconKind} /> : <span className="picon">{r.icon}</span>}
                <span className="plist__name">
                  <b>{r.name}</b>
                  {r.sub && <small className="muted">{r.sub}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {failed && (
          <p className="muted feed__empty" role="alert">
            {t('searchFailed')}
          </p>
        )}
        {online && online.length === 0 && <p className="muted feed__empty">{t('noResults')}</p>}
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
