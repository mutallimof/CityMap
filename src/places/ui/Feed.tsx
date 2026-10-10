import { useEffect, useState } from 'react';
import { useTicker } from '../../ui/hooks';
import { useT } from '../../ui/i18n';
import { services } from '../../ui/services';
import { ui, useUi } from '../../ui/store';
import { NearestPierButton, SunsetCard } from './Extras';
import { openPlace, places } from './context';
import { PostCard } from './PostCard';

function useStoreVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => places().onChange(() => setV((x) => x + 1)), []);
  return v;
}

export function FeedHeader() {
  const t = useT();
  useStoreVersion();
  const tonight = useUi((s) => s.tonight);
  const cats = useUi((s) => s.categories);
  const now = services().clock.now();
  const n = places().feed(now, { categories: cats, tonight, saved: false }).length;
  return (
    <div className="feedhead">
      <div>
        <h2>
          {tonight ? `✦ ${t('tonight')}` : t('feedTitle')} <span className="feedhead__count">{n}</span>
        </h2>
        <small className="muted">{t('demoNote')}</small>
      </div>
      <span className="demo-tag demo-tag--lg">{t('demo')}</span>
    </div>
  );
}

/** The feed: sunset card, nearest-pier action, Saved toggle, then posts (filtered by chips). */
export function FeedBody() {
  useTicker(15_000);
  useStoreVersion();
  const t = useT();
  const tonight = useUi((s) => s.tonight);
  const cats = useUi((s) => s.categories);
  const [saved, setSaved] = useState(false);
  const store = places();
  const now = services().clock.now();
  const list = store.feed(now, { categories: cats, tonight, saved });
  return (
    <div className="feed">
      <div className="feed__actions">
        <NearestPierButton />
        <div className="seg seg--sm" role="group">
          <button className={!saved ? 'on' : ''} onClick={() => setSaved(false)}>
            {t('all')}
          </button>
          <button className={saved ? 'on' : ''} onClick={() => setSaved(true)}>
            ♥ {t('saved')}
          </button>
        </div>
      </div>
      {!saved && <SunsetCard />}
      {list.length === 0 && <p className="muted feed__empty">{t('noMatches')}</p>}
      {list.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          place={store.byId.get(p.placeId)}
          now={now}
          onPlace={() => {
            ui.set({ sheetSnap: 'half' });
            openPlace(p.placeId);
          }}
        />
      ))}
    </div>
  );
}
