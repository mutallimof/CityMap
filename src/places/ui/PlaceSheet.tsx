import { useEffect, useState } from 'react';
import { toIstanbul } from '../../sim/time';
import { formatHHMM } from '../../sim/time';
import { useTicker } from '../../ui/hooks';
import { useT, type StringKey } from '../../ui/i18n';
import { services } from '../../ui/services';
import { useUi } from '../../ui/store';
import { openStatus } from '../opening-hours';
import { CATEGORY_ICON, KIND_ICON } from '../pins';
import { PierHint } from './Extras';
import { placeLink, places, share } from './context';
import { PostCard } from './PostCard';

function useStoreVersion(): void {
  const [, setV] = useState(0);
  useEffect(() => places().onChange(() => setV((x) => x + 1)), []);
}

export function PlaceHeader({ id }: { id: string }) {
  const t = useT();
  useStoreVersion();
  const p = places().byId.get(id);
  if (!p) return null;
  return (
    <div className="sheet__title">
      <span className={`swatch swatch--place swatch--${p.category}`}>{KIND_ICON[p.kind] ?? CATEGORY_ICON[p.category]}</span>
      <div>
        <h2>{p.name}</h2>
        <small className="muted">
          {t(`kind_${p.kind}` as StringKey)}
          {p.district ? ` · ${p.district.replace(/ Mahallesi$/, '')}` : ''}
        </small>
      </div>
    </div>
  );
}

/** Place: save / share, opening hours (OSM) with open-now, nearest pier + next ferry, its posts. */
export function PlaceBody({ id }: { id: string }) {
  useTicker(15_000);
  useStoreVersion();
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [toast, setToast] = useState('');
  const store = places();
  const p = store.byId.get(id);
  if (!p) return null;
  const now = services().clock.now();
  const local = toIstanbul(now);
  const weekday = (new Date(local.day * 86_400_000).getUTCDay() + 6) % 7; // 0 = Monday
  const open = openStatus(p.hours ?? undefined, weekday, Math.floor(local.seconds / 60));
  const fav = store.favourites.has(id);
  const posts = store.state.get(id)?.posts ?? [];

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
        <button className="pill" onClick={onShare}>
          ↗ {t('share')}
        </button>
        {toast && <span className="toast">{toast}</span>}
      </div>

      <div className="place__hours">
        {open.state !== 'unknown' && (
          <span className={`openbadge openbadge--${open.state}`}>
            {open.state === 'open' ? t('openNow') : t('closedNow')}
            {open.until !== undefined && ` · ${open.state === 'open' ? t('closes') : t('opens')} ${formatHHMM(open.until * 60)}`}
          </span>
        )}
        <small className="muted">{p.hours ? `${t('hours')}: ${p.hours}` : t('hoursUnknown')}</small>
      </div>

      <PierHint lngLat={p.lngLat} />

      <h3 className="section">
        {t('posts')} <span className="demo-tag">{t('demo')}</span>
      </h3>
      {posts.length === 0 && <p className="muted">{t('noPosts')}</p>}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} now={now} />
      ))}
      <p className="place__credit muted">
        {t('location')}: © OpenStreetMap · {p.osm} {lang === 'tr' ? '· Paylaşımlar örnektir' : '· Posts are samples'}
      </p>
    </div>
  );
}
