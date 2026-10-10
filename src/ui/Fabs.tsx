import { useState } from 'react';
import { CONFIG } from '../config';
import { distanceM } from '../places/store';
import { weatherIcon } from '../places/weather';
import { searchData } from '../search/SearchPanel';
import { shareImage, snapshot } from '../share/snapshot';
import { formatHHMM, toIstanbul } from '../sim/time';
import { useT } from './i18n';
import { services } from './services';
import { ui, useUi } from './store';

/** "Kadıköy · 18:42 · 🌧 14°" for the current view. */
function caption(lang: 'tr' | 'en'): string {
  const { map, clock, weather, daylight } = services();
  const c = map.getCenter().toArray() as [number, number];
  let best = '';
  let bestD = Infinity;
  for (const f of searchData()?.districts.features ?? []) {
    const d = distanceM(c, f.geometry.coordinates as [number, number]);
    if (d < bestD) (bestD = d), (best = lang === 'en' ? f.properties.nameEn : f.properties.name);
  }
  const parts = [bestD < 6000 ? best : 'İstanbul', formatHHMM(toIstanbul(clock.now()).seconds)];
  if (weather.source !== 'offline') {
    const w = weather.target;
    parts.push(`${weatherIcon(w.code, daylight.theme.night > 0.5)}${w.tempC != null ? ` ${Math.round(w.tempC)}°` : ''}`);
  }
  return parts.join(' · ');
}

/** Round buttons on the right: search, snapshot. */
export function Fabs() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const shoot = async () => {
    if (busy) return;
    setBusy(true);
    document.documentElement.classList.add('flash');
    setTimeout(() => document.documentElement.classList.remove('flash'), 350);
    try {
      const blob = await snapshot(services().map, { mark: CONFIG.snapshot.appName, caption: caption(lang) });
      const r = await shareImage(blob, `istanbul-${Date.now()}.png`, CONFIG.snapshot.appName);
      if (r === 'downloaded') {
        setToast(t('snapshotSaved'));
        setTimeout(() => setToast(''), 2200);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fabs">
      <button className="fab" onClick={() => ui.set({ search: true })} aria-label={t('search')}>
        🔍
      </button>
      <button className="fab" onClick={shoot} aria-label={t('snapshot')} disabled={busy}>
        📷
      </button>
      {toast && <span className="fab__toast">{toast}</span>}
    </div>
  );
}
