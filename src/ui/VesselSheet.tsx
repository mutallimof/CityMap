import { useTicker } from './hooks';
import { formatCountdown, useT } from './i18n';
import { services } from './services';
import { ui, useUi } from './store';

/** Content for a selected vessel: line, from → to, next stop + ETA countdown, progress, Follow. */
export function VesselSheet({ id }: { id: string }) {
  useTicker(250);
  const t = useT();
  const lang = useUi((s) => s.lang);
  const follow = useUi((s) => s.follow);
  const { ferries, lineById, pierById } = services();
  const drawn = ferries.drawn.get(id);
  if (!drawn) return <p className="muted">—</p>;
  const s = drawn.pose.state;
  const line = lineById.get(s.lineId)!;
  const stops = line.stops;
  const name = (pid: string) => pierById.get(pid)?.[lang === 'tr' ? 'name' : 'nameEn'] ?? pid;
  const from = s.direction === 'out' ? stops[0] : stops[stops.length - 1];
  const to = s.direction === 'out' ? stops[stops.length - 1] : stops[0];
  // At the terminus a 'back' dock means it's about to head back to the origin.
  const docked = s.phase === 'docked';
  const here = docked ? name(stops[s.stopIndex!]) : null;

  return (
    <div className="vessel">
      <div className="vessel__route">
        <b>{name(from)}</b> <span className="muted">{t('to')}</span> <b>{name(to)}</b>
      </div>
      <div className="vessel__status">
        {docked ? (
          <>
            <span className="tag">{t('at')} {here}</span>
            <span className="vessel__eta">
              {t('departsIn')} <b>{formatCountdown(s.phaseRemaining)}</b>
            </span>
          </>
        ) : (
          <>
            <span className="tag tag--live">
              {t('next')}: {name(stops[s.nextStopIndex])}
            </span>
            <span className="vessel__eta">
              {t('arrivesIn')} <b>{formatCountdown(s.eta)}</b>
            </span>
          </>
        )}
      </div>
      <div className="progress" aria-label={t('progress')}>
        <div className="progress__bar" style={{ width: `${Math.round(s.tripProgress * 100)}%`, background: line.color }} />
      </div>
      <ol className="stops">
        {(s.direction === 'out' ? stops : [...stops].reverse()).map((pid) => (
          <li key={pid} className={pid === stops[s.nextStopIndex] ? 'stops__next' : ''}>
            {name(pid)}
          </li>
        ))}
      </ol>
      <button className={`pill ${follow ? 'pill--accent' : ''}`} onClick={() => ui.set({ follow: !follow })}>
        {follow ? `◉ ${t('following')}` : `◎ ${t('follow')}`}
      </button>
    </div>
  );
}

export function VesselHeader({ id }: { id: string }) {
  const lang = useUi((s) => s.lang);
  const { ferries, lineById } = services();
  const d = ferries.drawn.get(id);
  const line = d && lineById.get(d.pose.state.lineId);
  if (!line) return null;
  return (
    <div className="sheet__title">
      <span className="swatch" style={{ background: line.color }} />
      <div>
        <h2>{line.name[lang]}</h2>
        <small className="muted">Vapur · {id.split('#')[1] ? `#${id.split('#')[1]}` : ''}</small>
      </div>
    </div>
  );
}
