/**
 * Place sheet: name, kind, hours / website / phone (Nominatim lookup on open), Story, upcoming events,
 * favourite and "Add to plan".
 */
import { useEffect, useState } from 'react';
import { formatHHMM } from '../../sim/time';
import { useTicker } from '../../ui/hooks';
import { kindLabel, useT } from '../../ui/i18n';
import { services } from '../../ui/services';
import { useUi } from '../../ui/store';
import { isIslet } from '../../plan/islets';
import { cleanName, formatCuisine, phoneList, telHref } from '../format';
import { PlaceIcon } from './PlaceIcon';
import { PierHint } from './Extras';
import { StorySection } from '../../stories/StorySection';
import { EventsSection } from '../../events/EventsSection';
import { placeLink, places, share } from './context';
import { AddPlaceToPlan } from '../../plan/ui';

function useStoreVersion(): void {
  const [, setV] = useState(0);
  useEffect(() => places().onChange(() => setV((x) => x + 1)), []);
}

export function PlaceHeader({ id }: { id: string }) {
  const lang = useUi((s) => s.lang);
  useStoreVersion();
  const p = places().byId.get(id);
  if (!p) return null;
  const name = cleanName(lang === 'en' && p.nameEn ? p.nameEn : p.name, lang);
  return (
    <div className="sheet__title">
      <PlaceIcon kind={p.kind} category={p.category} size={44} />
      <div>
        <h2>{name}</h2>
        <small className="muted">
          {kindLabel(p.kind, lang)}
          {p.district ? ` · ${cleanName(p.district.replace(/ Mahallesi$/i, ''), lang)}` : ''}
        </small>
      </div>
    </div>
  );
}

const domain = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

/**
 * Place: everything shown comes from OpenStreetMap — opening hours with open-now, website, phone,
 * cuisine — and fields OSM doesn't have are simply not shown. Plus the nearest pier + next ferry.
 */
export function PlaceBody({ id }: { id: string }) {
  useTicker(15_000);
  useStoreVersion();
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [toast, setToast] = useState('');
  const store = places();
  const p = store.byId.get(id);
  useEffect(() => {
    void store.loadDetails(id);
  }, [id, store]);
  if (!p) return null;
  const now = services().clock.now();
  const open = store.open(id, now);
  const fav = store.favourites.has(id);
  const loading = store.details.get(id) === 'loading';
  const phones = phoneList(p.phone);

  const onShare = async () => {
    const r = await share(p.name, placeLink(id));
    if (r === 'copied') {
      setToast(t('copied'));
      setTimeout(() => setToast(''), 1800);
    }
  };

  return (
    <div className="place">
      <div className="place__actions">
        <button className={`pill ${fav ? 'pill--fav' : ''}`} onClick={() => store.toggleFavourite(id)} aria-pressed={fav}>
          {fav ? `♥ ${t('savedOne')}` : `♡ ${t('save')}`}
        </button>
        <AddPlaceToPlan id={id} />
        <button className="pill" onClick={onShare}>
          ↗ {t('share')}
        </button>
        {phones[0] && (
          <a className="pill" href={telHref(phones[0])}>
            ☎ {t('call')}
          </a>
        )}
        {toast && <span className="toast">{toast}</span>}
      </div>

      {p.hours && (
        <div className="place__hours">
          {open.state !== 'unknown' && (
            <span className={`openbadge openbadge--${open.state}`}>
              {open.state === 'open' ? t('openNow') : t('closedNow')}
              {open.until !== undefined && ` · ${open.state === 'open' ? t('closes') : t('opens')} ${formatHHMM(open.until * 60)}`}
            </span>
          )}
          <small className="muted">
            {t('hours')}: {p.hours}
          </small>
        </div>
      )}

      {(p.website || p.phone || p.cuisine || p.address) && (
        <dl className="facts">
          {p.address && (
            <>
              <dt>{t('address')}</dt>
              <dd>{p.address}</dd>
            </>
          )}
          {p.website && (
            <>
              <dt>{t('website')}</dt>
              <dd>
                <a href={p.website} target="_blank" rel="noopener noreferrer">
                  {domain(p.website)}
                </a>
              </dd>
            </>
          )}
          {phones.length > 0 && (
            <>
              <dt>☎</dt>
              <dd>
                {phones.map((n, i) => (
                  <span key={n}>
                    {i > 0 && ', '}
                    <a href={telHref(n)}>{n}</a>
                  </span>
                ))}
              </dd>
            </>
          )}
          {p.cuisine && (
            <>
              <dt>{t('cuisine')}</dt>
              <dd>{formatCuisine(p.cuisine, lang)}</dd>
            </>
          )}
        </dl>
      )}
      {loading && <small className="muted">{t('checkingOsm')}</small>}

      <EventsSection placeId={id} />

      <StorySection osm={p.osm} />

      {!isIslet(p) && <PierHint lngLat={p.lngLat} />}

      <p className="place__credit muted">
        © OpenStreetMap
        {p.osm && (
          <>
            {' · '}
            <a href={`https://www.openstreetmap.org/${p.osm}`} target="_blank" rel="noopener noreferrer">
              {t('viewOnOsm')}
            </a>
          </>
        )}
      </p>
    </div>
  );
}
