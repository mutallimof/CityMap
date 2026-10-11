import { useEffect, useState } from 'react';
import { useTicker } from '../ui/hooks';
import { useT, type StringKey } from '../ui/i18n';
import { services } from '../ui/services';
import { useUi } from '../ui/store';
import { dayOf, events, isLongRun, isNow, startMs, endMs, type CityEvent } from './events';
import { AddEventToPlan } from '../plan/ui';

const fmtTime = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(11, 16);
function fmtDay(ms: number, now: number, lang: 'tr' | 'en'): string {
  const d = dayOf(ms) - dayOf(now);
  if (d === 0) return lang === 'tr' ? 'Bugün' : 'Today';
  if (d === 1) return lang === 'tr' ? 'Yarın' : 'Tomorrow';
  return new Date(ms).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' });
}

/** Upcoming events at a venue, each linking to its original page (and ticket page when listed). */
export function EventsSection({ placeId }: { placeId: string }) {
  useTicker(30_000);
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [, force] = useState(0);
  useEffect(() => events.onChange(() => force((n) => n + 1)), []);
  const now = services().clock.now();
  const list = events.upcoming(placeId, now);
  if (!list.length) return null;
  return (
    <section className="events">
      <h3 className="section">{t('upcomingEvents')}</h3>
      <ul className="evlist">
        {list.map((e: CityEvent) => {
          const s = startMs(e);
          const live = isNow(e, now);
          const when = isLongRun(e)
            ? `${s <= now ? (lang === 'tr' ? 'Devam ediyor' : 'On now') : fmtDay(s, now, lang)} → ${new Date(endMs(e)).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' })}`
            : `${fmtDay(s, now, lang)}${e.allDay ? '' : ` · ${fmtTime(s)}`}`;
          return (
            <li key={e.id} className={live ? 'evlist__item evlist__item--live' : 'evlist__item'}>
              <div className="evlist__when">
                {live && <span className="evlist__live">{t('liveNow')}</span>}
                {when}
              </div>
              <a className="evlist__title" href={e.url} target="_blank" rel="noopener noreferrer">
                {e.title}
              </a>
              <div className="evlist__meta">
                <span className={`evtag evtag--${e.category}`}>{t(`ev_${e.category}` as StringKey)}</span>
                {e.free ? <span className="evtag evtag--free">{t('free')}</span> : e.price ? <span className="muted">{e.price}</span> : null}
                <a href={e.url} target="_blank" rel="noopener noreferrer">
                  {t('details')} ↗
                </a>
                {e.tickets && (
                  <a href={e.tickets} target="_blank" rel="noopener noreferrer">
                    {t('tickets')} ↗
                  </a>
                )}
                {!isLongRun(e) && <AddEventToPlan eventId={e.id} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
