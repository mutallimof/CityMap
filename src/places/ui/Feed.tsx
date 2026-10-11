import { placeVisible } from '../filters';
import { useEffect, useState, type ReactNode } from 'react';
import { CONFIG } from '../../config';
import { formatHHMM } from '../../sim/time';
import { useTicker } from '../../ui/hooks';
import { kindLabel, useT } from '../../ui/i18n';
import { services } from '../../ui/services';
import { useUi } from '../../ui/store';
import { PlaceIcon } from './PlaceIcon';
import { distanceM } from '../store';
import { NearestPierButton, SunsetCard } from './Extras';
import { openPlace, places } from './context';
import { canInstall, install, onInstallChange } from '../../app/pwa';

function useStoreVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => places().onChange(() => setV((x) => x + 1)), []);
  return v;
}

/** Re-render when the map stops moving (lists are sorted by distance from the view centre). */
function useMapCentre(): [number, number] {
  const { map } = services();
  const [c, setC] = useState<[number, number]>(() => map.getCenter().toArray() as [number, number]);
  useEffect(() => {
    const on = () => setC(map.getCenter().toArray() as [number, number]);
    map.on('moveend', on);
    return () => void map.off('moveend', on);
  }, [map]);
  return c;
}

/** "Add to home screen" when the browser offers it (Chrome / Android / desktop). */
function InstallButton() {
  const t = useT();
  const [, force] = useState(0);
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  if (!canInstall()) return null;
  return (
    <button className="pill" onClick={() => void install()}>
      ⬇ {t('install')}
    </button>
  );
}

export function FeedHeader() {
  const t = useT();
  const openNow = useUi((s) => s.openNow);
  return (
    <div className="feedhead">
      <div>
        <h2>
          {openNow && <span className="chip__open chip__open--h" aria-hidden />}
          {openNow ? t('openNowChip') : t('feedTitle')}
        </h2>
        <small className="muted">{openNow ? t('openNowNote') : t('feedNote')}</small>
      </div>
    </div>
  );
}

/**
 * The feed — real data only: nearest pier + next ferry, sunset, guides, then featured places
 * near the view centre (filtered by the category chips and "Open now"), or the saved ones.
 */
export function FeedBody({ extra }: { extra?: ReactNode }) {
  useTicker(15_000);
  useStoreVersion();
  const t = useT();
  const lang = useUi((s) => s.lang);
  const openNow = useUi((s) => s.openNow);
  const categories = useUi((s) => s.categories);
  const ev = useUi((s) => s.ev);
  const centre = useMapCentre();
  const [saved, setSaved] = useState(false);
  const store = places();
  const now = services().clock.now();
  const zoom = services().map.getZoom();
  const list = [...store.byId.values()]
    .filter((p) => (saved ? store.favourites.has(p.id) : p.source === 'featured' && placeVisible(store, p.id, { categories, openNow, ev }, now)))
    .map((p) => ({ p, d: distanceM(centre, p.lngLat), o: store.open(p.id, now) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 30);
  return (
    <div className="feed">
      <div className="feed__actions">
        <NearestPierButton />
        <InstallButton />
        <div className="seg seg--sm" role="group">
          <button className={!saved ? 'on' : ''} onClick={() => setSaved(false)}>
            {t('all')}
          </button>
          <button className={saved ? 'on' : ''} onClick={() => setSaved(true)}>
            ♥ {t('saved')}
          </button>
        </div>
      </div>
      {!saved && !openNow && <SunsetCard />}
      {!saved && extra}
      <h3 className="section">{saved ? t('saved') : openNow ? t('openPlaces') : t('featured')}</h3>
      {list.length === 0 && <p className="muted feed__empty">{t('noMatches')}</p>}
      <ul className="plist">
        {list.map(({ p, d, o }) => (
          <li key={p.id}>
            <button onClick={() => openPlace(p.id)}>
              <PlaceIcon kind={p.kind} category={p.category} />
              <span className="plist__name">
                <b>{lang === 'en' && p.nameEn ? p.nameEn : p.name}</b>
                <small className="muted">
                  {o.state === 'open' && <span className="dot-open" />}
                  {kindLabel(p.kind, lang)}
                  {o.state === 'open' && o.until !== undefined ? ` · ${t('closes')} ${formatHHMM(o.until * 60)}` : ''}
                </small>
              </span>
              <span className="muted">{d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`}</span>
            </button>
          </li>
        ))}
      </ul>
      {!saved && zoom < CONFIG.places.poiFrom && <p className="muted feed__empty">{t('zoomForMore')}</p>}
    </div>
  );
}
