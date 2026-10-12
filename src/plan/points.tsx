/**
 * Start / end points of a plan (hotel, home…): picked by search (local data as you type, OSM on
 * submit — same as the main search), by tapping the map, or from the device location (once, on tap).
 * They stay on the device; share links leave them out unless the sender turns them on.
 */
import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from '../config';
import { nominatim } from '../osm/nominatim';
import { PlaceIcon } from '../places/ui/PlaceIcon';
import type { IconKind } from '../places/icons';
import { localSearch } from '../search/SearchPanel';
import { osmSearch } from '../search/osm';
import type { SearchResult } from '../search/local';
import { useT } from '../ui/i18n';
import { setMapPick } from '../ui/map-interactions';
import { ui, useUi } from '../ui/store';
import { endsOf, resetDayEnds, setEnds, type Plan, type PlanEnds, type PlanPoint } from './model';
import { planById, savePlan } from './store';

const inArea = ([lng, lat]: [number, number]) => {
  const [w, s, e, n] = CONFIG.bounds;
  return lng >= w && lng <= e && lat >= s && lat <= n;
};

/** Search / map tap / my location → a point. */
function PointPicker({ onPick, onCancel }: { onPick: (p: PlanPoint) => void; onCancel: () => void }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [q, setQ] = useState('');
  const [online, setOnline] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [picking, setPicking] = useState(false);
  const local = useMemo(() => (q.trim().length >= 2 ? localSearch(q, lang, t).items : []), [q, lang, t]);
  useEffect(() => () => setMapPick(null), []);

  const fromMap = () => {
    setPicking(true);
    ui.set({ sheetSnap: 'peek' });
    setMapPick((ll) => {
      setPicking(false);
      ui.set({ sheetSnap: 'half' });
      if (!inArea(ll)) return setMsg(t('outsideArea'));
      onPick({ name: t('mapPoint'), ll });
      // A readable name for the tapped spot (one Nominatim request, on the visitor's tap).
      void nominatim<{ name?: string; display_name?: string }>('reverse', { lat: String(ll[1]), lon: String(ll[0]), zoom: '18' }).then((r) => {
        const name = r?.name || r?.display_name?.split(',')[0];
        if (name) onPick({ name, ll });
      });
    });
  };
  const here = () => {
    if (!navigator.geolocation) return setMsg(t('locationDenied'));
    setMsg(t('locating'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (!inArea(ll)) return setMsg(t('outsideArea'));
        setMsg('');
        onPick({ name: t('myLocation'), ll });
      },
      () => setMsg(t('locationDenied')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  };
  const submit = async () => {
    if (q.trim().length < 3 || busy) return;
    setBusy(true);
    const res = await osmSearch(q);
    setOnline(res);
    setMsg(res === null ? t('searchFailed') : '');
    setBusy(false);
  };
  const list = online ?? local;
  return (
    <div className="ptpick">
      <form
        className="ptpick__bar"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={q}
          autoFocus
          enterKeyHint="search"
          placeholder={t('pickSearch')}
          onChange={(e) => {
            setQ(e.target.value);
            setOnline(null);
          }}
        />
      </form>
      <div className="ptpick__ways">
        <button className="pill" onClick={here}>
          📍 {t('myLocation')}
        </button>
        <button className="pill" onClick={fromMap}>
          👆 {t('pickOnMap')}
        </button>
        <button className="pill" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
      {msg && <small className="muted">{msg}</small>}
      {picking && (
        <div className="ptpick__banner" role="status">
          👆 {t('pickMapHint')}
          <button
            className="linkbtn"
            onClick={() => {
              setMapPick(null);
              setPicking(false);
              ui.set({ sheetSnap: 'half' });
            }}
          >
            {t('cancel')}
          </button>
        </div>
      )}
      <ul className="plist">
        {list.map((r) => (
          <li key={`${r.kind}:${r.id}`}>
            <button onClick={() => onPick({ name: r.name, ll: r.lngLat })}>
              {r.icon.startsWith('k:') ? <PlaceIcon icon={r.icon.slice(2) as IconKind} /> : <span className="picon">{r.icon}</span>}
              <span className="plist__name">
                <b>{r.name}</b>
                {r.sub && <small className="muted">{r.sub}</small>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {online && !online.length && <p className="muted">{t('noResults')}</p>}
      {q.trim().length >= 3 && !online && (
        <button className="pill" onClick={() => void submit()} disabled={busy}>
          {busy ? t('searching') : `🌍 ${t('searchOsm')} “${q.trim()}”`}
        </button>
      )}
      <small className="muted search__credit">{t('searchCredit')}</small>
    </div>
  );
}

type Field = 'start' | 'end';

/**
 * Start and end rows: the plan's (every day), or one day's change when `day` is given. Read-only
 * plans just show them.
 */
export function EndsEditor({ plan, day, readOnly }: { plan: Plan; day?: string; readOnly?: boolean }) {
  const t = useT();
  const [picking, setPicking] = useState<Field | null>(null);
  const source: PlanEnds = (day ? plan.dayEnds?.[day] : plan.ends) ?? {};
  const eff = day ? endsOf(plan, day) : endsOf({ ends: plan.ends }, plan.from);
  // Saved against the latest copy of the plan (a map-tap name arrives later).
  const save = (patch: PlanEnds) => {
    const cur = planById(plan.id) ?? plan;
    savePlan(setEnds(cur, patch, day));
  };
  const pick = (field: Field) => (pt: PlanPoint) => {
    save({ [field]: pt });
    setPicking(null);
  };
  const endSame = (day && source.end === undefined ? (plan.ends?.end ?? 'start') : (source.end ?? 'start')) === 'start';
  const row = (field: Field) => {
    const pt = field === 'start' ? eff.start : eff.end;
    const label = field === 'start' ? t('startPoint') : t('endPoint');
    return (
      <div className="ptrow">
        <span className={`ptrow__mark ptrow__mark--${field}`} aria-hidden />
        <div className="ptrow__main">
          <small className="muted">{label}</small>
          <b>{field === 'end' && endSame && pt ? `${t('sameAsStart')} · ${pt.name}` : field === 'end' && endSame ? t('sameAsStart') : (pt?.name ?? t('noPoint'))}</b>
        </div>
        {!readOnly && (
          <div className="ptrow__ctl">
            <button className="linkbtn" onClick={() => setPicking(picking === field ? null : field)}>
              {pt ? t('changePoint') : t('setPoint')}
            </button>
            {field === 'end' && !endSame && (
              <button className="linkbtn" onClick={() => save({ end: 'start' })}>
                {t('sameAsStart')}
              </button>
            )}
            {pt && !(field === 'end' && endSame) && (
              <button className="linkbtn" onClick={() => save({ [field]: null })}>
                {t('clearPoint')}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };
  if (readOnly && !eff.start && !eff.end) return null;
  return (
    <div className="ptends">
      {row('start')}
      {picking === 'start' && <PointPicker onPick={pick('start')} onCancel={() => setPicking(null)} />}
      {row('end')}
      {picking === 'end' && <PointPicker onPick={pick('end')} onCancel={() => setPicking(null)} />}
    </div>
  );
}

/** One day of a several-day plan: its start / end (the plan's unless changed for this day). */
export function DayEnds({ plan, day, readOnly }: { plan: Plan; day: string; readOnly: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const e = endsOf(plan, day);
  if (!e.start && !e.end && readOnly) return null;
  const summary = [e.start && `⌂ ${e.start.name}`, e.end && e.end !== e.start && `→ ${e.end.name}`].filter(Boolean).join(' · ');
  return (
    <div className="ptday">
      <small className="muted">
        {summary || `${t('startEnd')}: ${t('noPoint')}`}
        {e.custom && ` · ${t('thisDay')}`}
      </small>
      {!readOnly && (
        <span className="ptday__ctl">
          <button className="linkbtn" onClick={() => setOpen(!open)}>
            {t('changeForDay')}
          </button>
          {e.custom && (
            <button className="linkbtn" onClick={() => savePlan(resetDayEnds(planById(plan.id) ?? plan, day))}>
              {t('useDefault')}
            </button>
          )}
        </span>
      )}
      {open && !readOnly && <EndsEditor plan={plan} day={day} />}
    </div>
  );
}
