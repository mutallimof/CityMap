/**
 * Guides UI: the card row in the feed and the guide sheet (stops in order, notes, the way between them).
 */
import { useEffect } from 'react';
import { CONFIG } from '../config';
import { distanceM } from '../places/store';
import { flyTo } from '../places/ui/context';
import { useT } from '../ui/i18n';
import { services } from '../ui/services';
import { ui, useUi } from '../ui/store';
import type { ResolvedGuide } from './guides';
import { showGuide } from './layer';

let all: ResolvedGuide[] = [];
export function setGuides(g: ResolvedGuide[]): void {
  all = g;
}
const byId = (id: string) => all.find((g) => g.spec.id === id);

export function openGuide(id: string): void {
  const g = byId(id);
  if (!g) return;
  ui.set({ selection: { kind: 'guide', id }, follow: false, hint: false, sheetSnap: 'half' });
  const { map } = services();
  showGuide(map, g);
  map.fitBounds(g.bbox, { padding: { top: 150, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 60 }, pitch: 40, duration: 1400, maxZoom: 15.5 });
}

/** Clears the route when the guide sheet closes. */
const saved = new Map<string, unknown>();
export function bindGuideSelection(): void {
  let shown = '';
  ui.subscribe(() => {
    const s = ui.get().selection;
    const id = s?.kind === 'guide' ? s.id : '';
    if (id === shown) return;
    shown = id;
    showGuide(services().map, id ? byId(id) ?? null : null);
    // Let the route breathe: place icons step back while a guide is open.
    const map = services().map;
    for (const l of ['featured', 'poi', 'landmark-icons']) {
      if (!map.getLayer(l)) continue;
      if (!saved.has(l)) saved.set(l, map.getPaintProperty(l, 'icon-opacity') ?? 1);
      map.setPaintProperty(l, 'icon-opacity', (id ? 0.25 : saved.get(l)) as number);
      map.setPaintProperty(l, 'text-opacity', id ? 0 : 1);
    }
  });
}

/** Horizontal row of guide cards (feed). */
export function GuidesRow() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  if (!all.length) return null;
  return (
    <section className="guides">
      <h3 className="section">{t('guides')}</h3>
      <div className="guides__row">
        {all.map((g) => (
          <button key={g.spec.id} className="guidecard" onClick={() => openGuide(g.spec.id)}>
            <span className="guidecard__icon" aria-hidden>
              {g.spec.icon}
            </span>
            <b>{g.spec.title[lang]}</b>
            <small className="muted">
              ≈ {g.spec.hours} {t('hoursShort')} · {g.stops.length} {t('stops')}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function GuideHeader({ id }: { id: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const g = byId(id);
  if (!g) return null;
  return (
    <div className="sheet__title">
      <span className="swatch swatch--place">{g.spec.icon}</span>
      <div>
        <h2>{g.spec.title[lang]}</h2>
        <small className="muted">
          {t('guide')} · ≈ {g.spec.hours} {t('hoursShort')} · {g.stops.length} {t('stops')}
        </small>
      </div>
    </div>
  );
}

/** Stops in order with notes and how to get to the next one; tap a stop to fly there. */
export function GuideBody({ id }: { id: string }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const g = byId(id);
  useEffect(() => {
    if (g) showGuide(services().map, g);
  }, [g]);
  if (!g) return null;
  return (
    <div className="guide">
      <p className="guide__summary">{g.spec.summary[lang]}</p>
      <ol className="guide__stops">
        {g.stops.map((s, i) => {
          const leg = g.legs[i];
          const next = g.spec.stops[i].next ?? 'walk';
          const line = next.startsWith('ferry:') ? services().lineById.get(next.slice(6)) : undefined;
          const walkMin = leg?.mode === 'walk' ? Math.max(1, Math.round(distanceM(leg.coords[0], leg.coords[1]) / CONFIG.places.walkMPerMin)) : 0;
          return (
            <li key={i}>
              <button onClick={() => flyTo(s.lngLat, 16)}>
                <span className="guide__n">{s.n}</span>
                <span className="guide__txt">
                  <b>{s.name[lang]}</b>
                  <small className="muted">{s.note[lang]}</small>
                </span>
              </button>
              {leg && (
                <div className="guide__leg muted">
                  {line ? `⛴ ${line.name[lang]}` : `🚶 ~${walkMin} ${t('min')}`}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <small className="muted">{t('guideNote')}</small>
    </div>
  );
}
