import { formatHHMM, toIstanbul } from '../../sim/time';
import { formatWait, useT } from '../../ui/i18n';
import { useUi } from '../../ui/store';
import { CATEGORY_ICON, KIND_ICON } from '../pins';
import { isLive, isNew } from '../posts';
import type { Place, Post } from '../types';

function ago(ms: number, lang: 'tr' | 'en'): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return lang === 'tr' ? `${m} dk` : `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === 'tr' ? `${h} sa` : `${h}h`;
  return lang === 'tr' ? `${Math.round(h / 24)} gün` : `${Math.round(h / 24)}d`;
}

/** One post: type tag + timing, title, body, DEMO label; optional place line (feed). */
export function PostCard({ post, place, now, onPlace }: { post: Post; place?: Place; now: number; onPlace?: () => void }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const live = isLive(post, now);
  let when = '';
  if (post.type === 'event' && post.startsAt !== undefined) {
    if (live) when = t('liveNow');
    else if (post.startsAt - now < 3 * 3_600_000) when = `${t('startsIn')} ${formatWait((post.startsAt - now) / 1000, lang)}`;
    else {
      const d = toIstanbul(post.startsAt).day - toIstanbul(now).day;
      when = `${d === 0 ? (lang === 'tr' ? 'Bugün' : 'Today') : d === 1 ? (lang === 'tr' ? 'Yarın' : 'Tomorrow') : ''} ${formatHHMM(toIstanbul(post.startsAt).seconds)}`;
    }
  } else if (post.type === 'offer' && post.validUntil) {
    const d = Math.max(0, toIstanbul(post.validUntil - 1).day - toIstanbul(now).day);
    when = d === 0 ? (lang === 'tr' ? 'Bugün son' : 'Ends today') : lang === 'tr' ? `${d} gün daha` : `${d} more day${d > 1 ? 's' : ''}`;
  }
  const Tag = onPlace ? 'button' : 'div';
  return (
    <article className={`post post--${post.type} ${live ? 'post--live' : ''}`}>
      {place && (
        <Tag className="post__place" onClick={onPlace}>
          <span className={`post__icon post__icon--${place.category}`}>{KIND_ICON[place.kind] ?? CATEGORY_ICON[place.category]}</span>
          <span className="post__placename">{place.name}</span>
          {place.district && <span className="muted post__district"> · {place.district.replace(/ Mahallesi$/, '')}</span>}
          {isNew(post, now) && <span className="post__dot" aria-label="new" />}
        </Tag>
      )}
      <div className="post__meta">
        <span className={`post__type post__type--${post.type}`}>{t(post.type)}</span>
        {when && <span className="post__when">{when}</span>}
        <span className="muted post__ago">
          {ago(now - post.postedAt, lang)} {t('ago')}
        </span>
        <span className="demo-tag" title={t('demoNote')}>
          {t('demo')}
        </span>
      </div>
      <h3 className="post__title">{post.title[lang]}</h3>
      <p className="post__body">{post.body[lang]}</p>
    </article>
  );
}
