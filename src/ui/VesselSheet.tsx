import { useTicker } from './hooks';
import { formatCountdown, useT } from './i18n';
import { services } from './services';
import { ui, useUi } from './store';
import { isReal, TimetableBadge, TimetableCredit } from './timetable';

/** Content for a selected vessel: its trip from → to, next stop + ETA countdown, progress, Follow. */
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
  const name = (i: number) => {
    const pid = line.stops[i];
    return pierById.get(pid)?.[lang === 'tr' ? 'name' : 'nameEn'] ?? pid;
  };
  // The trip it's on (or about to start); a retiring vessel just shows where it is.
  const stops = s.trip?.stops ?? [s.stopIndex ?? s.nextStopIndex];
  const docked = s.phase === 'docked';
  const real = s.trip?.real ?? isReal(line.id);

  return (
    <div className="vessel">
      <div className="vessel__route">
        <b>{name(stops[0])}</b> <span className="muted">{t('to')}</span> <b>{name(stops[stops.length - 1])}</b>
      </div>
      <div className="vessel__status">
        {docked ? (
          <>
            <span className="tag">
              {t('at')} {name(s.stopIndex!)}
            </span>
            {s.depart && (
              <span className="vessel__eta">
                {t('departsIn')} <b>{formatCountdown(s.phaseRemaining)}</b>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="tag tag--live">
              {t('next')}: {name(s.nextStopIndex)}
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
        {stops.map((i) => (
          <li key={i} className={i === s.nextStopIndex ? 'stops__next' : ''}>
            {name(i)}
          </li>
        ))}
      </ol>
      <button className={`pill ${follow ? 'pill--accent' : ''}`} onClick={() => ui.set({ follow: !follow })}>
        {follow ? `◉ ${t('following')}` : `◎ ${t('follow')}`}
      </button>
      {real && <TimetableCredit />}
    </div>
  );
}

export function VesselHeader({ id }: { id: string }) {
  const lang = useUi((s) => s.lang);
  const { ferries, lineById } = services();
  const d = ferries.drawn.get(id);
  const line = d && lineById.get(d.pose.state.lineId);
  if (!line) return null;
  const n = /#(\d+)/.exec(id)?.[1];
  const real = d.pose.state.trip?.real ?? isReal(line.id);
  return (
    <div className="sheet__title">
      <span className="swatch" style={{ background: line.color }} />
      <div>
        <h2>{line.name[lang]}</h2>
        <small className="muted">
          Vapur{n ? ` · #${n}` : ''} · <TimetableBadge real={real} />
        </small>
      </div>
    </div>
  );
}
