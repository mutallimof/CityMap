/**
 * Planner UI: top-bar button, "Add to plan" buttons, the plan sheet (kind, days, stops, connections,
 * warnings, start / end points) and the share dialog. Logic lives in model.ts / timeline.ts.
 */
import { useEffect, useMemo, useState } from 'react';
import './plan.css';
import { events as eventStore } from '../events/events';
import { flyTo, places, share } from '../places/ui/context';
import { useTicker } from '../ui/hooks';
import { stopsText, useT } from '../ui/i18n';
import { services } from '../ui/services';
import { ui, useUi } from '../ui/store';
import { TimetableBadge } from '../ferries/ui/timetable';
import { fmtMin, hasPlace, isoDay, moveStop, planDays, removeStop, setDuration, setStart, type Plan, type PlanKind } from './model';
import { fitPlan, showPlanOnMap, timelineOf } from './runtime';
import { DayEnds, EndsEditor } from './points';
import { encodePlan, hasEnds, planLink } from './share';
import { addEventToPlan, addPlaceToPlan, copyShared, deletePlan, newPlan, planById, planStore, savePlan, setActive, usePlans } from './store';
import { arrivalOf, hhmm, type Connection, type DayTimeline, type Warning } from './timeline';

function openPlans(): void {
  ui.set({ selection: { kind: 'plan', id: 'list' }, follow: false, hint: false, sheetSnap: 'half' });
}

export function openPlan(id: string): void {
  if (id !== 'shared') setActive(id);
  ui.set({ selection: { kind: 'plan', id }, follow: false, hint: false, sheetSnap: 'half' });
  const p = planById(id);
  if (p) fitPlan(timelineOf(p));
}

/** Top-bar button. */
export function PlanButton() {
  const t = useT();
  return (
    <button className="iconbtn" onClick={openPlans} aria-label={t('plan')}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <rect x="4.5" y="4" width="15" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M8.5 9h7M8.5 13h7M8.5 17h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function useAdded(): [string, (msg: string) => void] {
  const [toast, setToast] = useState('');
  return [
    toast,
    (msg) => {
      setToast(msg);
      setTimeout(() => setToast(''), 2600);
    },
  ];
}

/** "Add to plan" on a place sheet; "✓ In plan" when the active plan already has the place. */
export function AddPlaceToPlan({ id }: { id: string }) {
  const t = useT();
  const { plans, active } = usePlans((s) => s);
  const current = plans.find((x) => x.id === active);
  const inPlan = !!current && hasPlace(current, id);
  const [toast, show] = useAdded();
  const p = places().byId.get(id);
  if (!p) return null;
  const add = () => {
    addPlaceToPlan(services().clock.now(), p.id, p.name, p.category, p.source === 'osm' ? p.lngLat : undefined);
    show(t('addedToPlan'));
  };
  return (
    <>
      {inPlan ? (
        <button className="pill" onClick={() => openPlan(active ?? 'list')}>
          ✓ {t('inPlan')}
        </button>
      ) : (
        <button className="pill" onClick={add}>
          ＋ {t('addToPlan')}
        </button>
      )}
      {toast && (
        <button className="toast toast--link" onClick={() => openPlan(planStore.get().active ?? 'list')}>
          {toast} · {t('openPlan')} ›
        </button>
      )}
    </>
  );
}

/** "Add to plan" on an event row. */
export function AddEventToPlan({ eventId }: { eventId: string }) {
  const t = useT();
  const [toast, show] = useAdded();
  const e = eventStore.all.find((x) => x.id === eventId);
  if (!e) return null;
  return (
    <>
      <button
        className="linkbtn"
        onClick={() => {
          addEventToPlan(services().clock.now(), e);
          show(t('addedToPlan'));
        }}
      >
        ＋ {t('plan')}
      </button>
      {toast && (
        <button className="toast toast--link" onClick={() => openPlan(planStore.get().active ?? 'list')}>
          {toast} · {t('openPlan')} ›
        </button>
      )}
    </>
  );
}

const fmtDay = (day: string, lang: 'tr' | 'en') => new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function planTitle(p: Plan, t: ReturnType<typeof useT>, lang: 'tr' | 'en'): string {
  const kind = t(p.kind === 'evening' ? 'planEvening' : p.kind === 'day' ? 'planDay' : 'planDays');
  return p.from === p.to ? `${kind} · ${fmtDay(p.from, lang)}` : `${kind} · ${fmtDay(p.from, lang)} – ${fmtDay(p.to, lang)}`;
}

export function PlanHeader({ id }: { id: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  usePlans((s) => s);
  const p = id === 'list' ? null : planById(id);
  return (
    <div className="sheet__title">
      <span className="swatch swatch--plan">🗓</span>
      <div>
        <h2>{p ? planTitle(p, t, lang) : id === 'list' ? t('myPlans') : t('plan')}</h2>
        <small className="muted">{id === 'shared' ? t('sharedPlan') : p ? stopsText(p.stops.length, lang) : t('plan')}</small>
      </div>
    </div>
  );
}

export function PlanBody({ id }: { id: string }) {
  if (id === 'list') return <PlanList />;
  return <PlanView id={id} />;
}

function PlanList() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { plans, active } = usePlans((s) => s);
  const today = isoDay(services().clock.now());
  const [kind, setKind] = useState<PlanKind>('evening');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const create = (
    <>
      <h3 className="section">{t('newPlan')}</h3>
      <div className="plans__kinds" role="radiogroup">
        {(['evening', 'day', 'days'] as const).map((k) => (
          <button key={k} className={`chip ${kind === k ? 'chip--on' : ''}`} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
            {t(k === 'evening' ? 'planEvening' : k === 'day' ? 'planDay' : 'planDays')}
          </button>
        ))}
      </div>
      <div className="plans__dates">
        <label>
          <small className="muted">{kind === 'days' ? t('planFrom') : t('planDate')}</small>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value || today)} />
        </label>
        {kind === 'days' && (
          <label>
            <small className="muted">{t('planTo')}</small>
            <input type="date" value={to < from ? from : to} min={from} onChange={(e) => setTo(e.target.value || from)} />
          </label>
        )}
        <button className="pill pill--accent" onClick={() => openPlan(newPlan(kind, from, kind === 'days' ? (to < from ? from : to) : from).id)}>
          {t('create')}
        </button>
      </div>
    </>
  );
  const mine = (
    <>
      <h3 className="section">{t('myPlans')}</h3>
      {!plans.length && <p className="muted">{t('noPlans')}</p>}
      <ul className="plans__list">
        {plans.map((p) => (
          <li key={p.id}>
            <button onClick={() => openPlan(p.id)}>
              <b>{planTitle(p, t, lang)}</b>
              <small className="muted">
                {stopsText(p.stops.length, lang)}
                {p.id === active ? ` · ${t('activePlan')}` : ''}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
  // "My plans" first once there is one; "New plan" below it.
  return (
    <div className="plans">
      {plans.length > 0 && mine}
      {create}
      {!plans.length && mine}
    </div>
  );
}

function WarningLine({ w }: { w: Warning }) {
  const t = useT();
  const text =
    w.kind === 'closed'
      ? w.until
        ? `${t('wClosesAt')} ${w.until}`
        : t('wClosed')
      : w.kind === 'hoursUnknown'
        ? t('wHoursUnknown')
        : w.kind === 'overlap'
          ? `${t('wOverlap')} ${w.with}`
          : w.kind === 'late'
            ? `${t('wLate')} ${hhmm(w.arrive)}`
            : w.kind === 'gone'
              ? t('wGone')
              : t('wOutside');
  return <div className={`planw ${w.kind === 'hoursUnknown' ? 'planw--info' : ''}`}>{w.kind === 'hoursUnknown' ? 'ⓘ' : '⚠'} {text}</div>;
}

function ConnectionRow({ c }: { c: Connection }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { lineById, pierById } = services();
  if (c.mode === 'walk') return <div className="plancon">🚶 {c.minutes} {t('min')} · {t('walkApprox')}</div>;
  if (c.mode === 'none') return <div className="plancon plancon--none">— {t('noTransport')}</div>;
  const name = (id: string) => pierById.get(id)?.[lang === 'tr' ? 'name' : 'nameEn'] ?? id;
  const line = lineById.get(c.lineId);
  return (
    <div className="plancon plancon--ferry">
      <div>
        <span className="swatch swatch--sm" style={{ background: line?.color }} /> ⛴ <b>{hhmm(c.dep)}</b> {name(c.fromPier)} → {name(c.toPier)} · {Math.round((c.arr - c.dep) / 60_000)} {t('min')}{' '}
        {!c.real && <TimetableBadge real={false} lineId={c.lineId} />}
      </div>
      <small className="muted">
        {line?.name[lang]} · {t('walkToPier')} {c.walkToMin} {t('min')} · {t('walkFromPier')} {c.walkFromMin} {t('min')}
      </small>
    </div>
  );
}

/** The day's start / end point in the timeline (its own ring marker, like on the map). */
function EndRow({ kind, name, at }: { kind: 'start' | 'end'; name: string; at: number | null }) {
  const t = useT();
  return (
    <div className="planstop planstop--end">
      <span className={`ptrow__mark ptrow__mark--${kind}`} aria-hidden />
      <div className="planstop__main">
        <b>{name}</b>
        <small className="muted">
          {kind === 'start' ? t('startPoint') : t('endPoint')}
          {at !== null && ` · ${kind === 'start' ? t('leaveAt') : '≈'} ${hhmm(at)}`}
        </small>
      </div>
    </div>
  );
}

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240];

function PlanView({ id }: { id: string }) {
  useTicker(60_000);
  const t = useT();
  const lang = useUi((s) => s.lang);
  usePlans((s) => s);
  const [, force] = useState(0);
  useEffect(() => eventStore.onChange(() => force((n) => n + 1)), []);
  const [msg, setMsg] = useState('');
  const [sharing, setSharing] = useState(false);
  // Start / end points are private: off by default every time the dialog opens.
  const [shareEnds, setShareEnds] = useState(false);
  // Escape closes the share dialog first (before the global handler closes the sheet).
  useEffect(() => {
    if (!sharing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setSharing(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [sharing]);
  const p = planById(id);
  const readOnly = id === 'shared';
  const days: DayTimeline[] = useMemo(() => (p ? timelineOf(p) : []), [p, eventStore.all.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    showPlanOnMap(days);
  }, [days]);
  if (!p)
    return (
      <div className="planv">
        <p className="muted">{planStore.get().sharedBroken && id === 'shared' ? t('brokenLink') : '—'}</p>
        <button className="pill" onClick={openPlans}>
          ☰ {t('myPlans')}
        </button>
      </div>
    );
  const edit = (next: Plan) => savePlan(next);
  const onShare = async () => {
    const payload = encodePlan(p, { ends: shareEnds });
    if (!payload) return setMsg(t('tooLongToShare'));
    setSharing(false);
    const r = await share(planTitle(p, t, lang), planLink(payload));
    if (r === 'copied') setMsg(t('linkCopied'));
    setTimeout(() => setMsg(''), 2400);
  };
  const toInput = (min: number) => fmtMin(min).slice(0, 5);
  const fromInput = (v: string) => {
    const [h, m] = v.split(':').map(Number);
    const min = h * 60 + m;
    return p.kind === 'evening' && min < 6 * 60 ? min + 1440 : min;
  };
  const allDays = planDays(p);
  return (
    <div className="planv">
      <div className="place__actions">
        {readOnly ? (
          <button
            className="pill pill--accent"
            onClick={() => {
              const c = copyShared();
              if (c) openPlan(c.id);
            }}
          >
            ⧉ {t('copyToMine')}
          </button>
        ) : (
          <>
            <button
              className="pill"
              onClick={() => {
                setShareEnds(false);
                setSharing(!sharing);
              }}
            >
              ↗ {t('sharePlan')}
            </button>
            <button className="pill" onClick={openPlans}>
              ☰ {t('myPlans')}
            </button>
            <button
              className="pill"
              onClick={() => {
                deletePlan(p.id);
                openPlans();
              }}
            >
              🗑 {t('deletePlan')}
            </button>
          </>
        )}
        {msg && <span className="toast">{msg}</span>}
      </div>
      {sharing && !readOnly && (
        <div className="plshare" role="dialog" aria-label={t('sharePlan')}>
          <label className="plshare__toggle">
            <input type="checkbox" checked={shareEnds} disabled={!hasEnds(p)} onChange={(e) => setShareEnds(e.target.checked)} />
            <span>
              {t('includeEnds')}
              <small className="muted">{t('includeEndsHint')}</small>
            </span>
          </label>
          <div className="place__actions">
            <button className="pill pill--accent" onClick={onShare}>
              ↗ {t('shareLink')}
            </button>
            <button className="pill" onClick={() => setSharing(false)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
      {(!readOnly || hasEnds(p)) && (
        <section className="planday">
          <h3 className="section">{t('startEnd')}</h3>
          {!readOnly && <small className="muted">{t('startEndHint')}</small>}
          <EndsEditor plan={p} readOnly={readOnly} />
        </section>
      )}
      {!p.stops.length && <p className="muted">{t('emptyPlan')}</p>}
      {days.map((d) => (
        <section key={d.day} className="planday">
          {(allDays.length > 1 || d.day !== p.from) && <h3 className="section">{fmtDay(d.day, lang)}</h3>}
          {allDays.length > 1 && <DayEnds plan={p} day={d.day} readOnly={readOnly} />}
          {d.start && (
            <>
              <EndRow kind="start" name={d.start.point.name} at={d.start.leave} />
              <ConnectionRow c={d.start.conn} />
            </>
          )}
          {d.simulatedFerries && d.stops.length > 1 && <div className="planw planw--info">ⓘ {t('simFerries')}</div>}
          <ol className="planstops">
            {d.stops.map((s, i) => (
              <li key={s.stop.id}>
                <div className="planstop">
                  <span className="guide__n">{s.n}</span>
                  <div className="planstop__main">
                    <button className="planstop__name" onClick={() => s.lngLat && flyTo(s.lngLat, 16)}>
                      <b>{lang === 'en' ? s.nameEn : s.name}</b>
                    </button>
                    <div className="planstop__time">
                      {s.stop.kind === 'event' || readOnly ? (
                        <span>
                          {hhmm(s.start)}–{hhmm(s.end)}
                        </span>
                      ) : (
                        <>
                          <input type="time" value={toInput(s.stop.start)} onChange={(e) => e.target.value && edit(setStart(p, s.stop.id, fromInput(e.target.value)))} aria-label={t('time')} />
                          <select value={s.stop.dur} onChange={(e) => edit(setDuration(p, s.stop.id, Number(e.target.value)))} aria-label={t('durationLabel')}>
                            {[...new Set([...DURATIONS, s.stop.dur])].sort((a, b) => a - b).map((m) => (
                              <option key={m} value={m}>
                                {m < 60 ? `${m} ${t('min')}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ${lang === 'tr' ? 'sa' : 'h'}`}
                              </option>
                            ))}
                          </select>
                          {allDays.length > 1 && (
                            <select value={s.stop.day} onChange={(e) => edit(setStart(p, s.stop.id, s.stop.start, e.target.value))} aria-label={t('planDate')}>
                              {allDays.map((day) => (
                                <option key={day} value={day}>
                                  {fmtDay(day, lang)}
                                </option>
                              ))}
                            </select>
                          )}
                        </>
                      )}
                    </div>
                    {s.warnings.map((w, k) => (
                      <WarningLine key={k} w={w} />
                    ))}
                  </div>
                  {!readOnly && (
                    <div className="planstop__ctl">
                      <button onClick={() => edit(moveStop(p, s.stop.id, -1))} disabled={s.stop.kind === 'event'} aria-label={t('moveEarlier')}>
                        ↑
                      </button>
                      <button onClick={() => edit(moveStop(p, s.stop.id, 1))} disabled={s.stop.kind === 'event'} aria-label={t('moveLater')}>
                        ↓
                      </button>
                      <button onClick={() => edit(removeStop(p, s.stop.id))} aria-label={t('remove')}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                {i < d.connections.length && <ConnectionRow c={d.connections[i]} />}
              </li>
            ))}
          </ol>
          {d.end && (
            <>
              <ConnectionRow c={d.end.conn} />
              <EndRow kind="end" name={d.end.point.name} at={arrivalOf(d.end.conn, d.stops[d.stops.length - 1].end)} />
            </>
          )}
        </section>
      ))}
      <small className="muted">{t('planNote')}</small>
    </div>
  );
}

/** Draws the open plan on the map and lets the rest step back (like guides). */
export function bindPlanSelection(): void {
  let shown = '';
  const saved = new Map<string, unknown>();
  const apply = () => {
    const s = ui.get().selection;
    const id = s?.kind === 'plan' && s.id !== 'list' ? s.id : '';
    const p = id ? planById(id) : null;
    if (!id || !p) showPlanOnMap(null);
    if (id === shown) return;
    shown = id;
    const map = services().map;
    for (const l of ['featured', 'poi', 'landmark-icons']) {
      if (!map.getLayer(l)) continue;
      if (!saved.has(l)) saved.set(l, map.getPaintProperty(l, 'icon-opacity') ?? 1);
      map.setPaintProperty(l, 'icon-opacity', (id ? 0.3 : saved.get(l)) as number);
    }
  };
  ui.subscribe(apply);
  planStore.subscribe(apply);
}
