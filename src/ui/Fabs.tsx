import { useState } from 'react';
import { CONFIG } from '../config';
import { distanceM } from '../places/store';
import { weatherIcon } from '../weather/icon';
import { searchData } from '../search/SearchPanel';
import { shareImage, snapshot } from '../share/snapshot';
import { formatHHMM, toIstanbul } from '../sim/time';
import { useT } from './i18n';
import { services } from './services';
import { useUi } from './store';

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

/** Camera button (bottom-left, above the sheet). Search lives in the top bar. */
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
      <button className="fab" onClick={shoot} aria-label={t('snapshot')} disabled={busy}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.7l1.3-2h5l1.3 2h1.7A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="12.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {toast && <span className="fab__toast">{toast}</span>}
    </div>
  );
}
