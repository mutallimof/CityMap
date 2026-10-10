import { useEffect, useState } from 'react';
import { CONFIG } from '../../config';
import { formatHHMM, toIstanbul } from '../../sim/time';
import { nextDepartures } from '../../sim/state';
import { sunTimes } from '../../time/sun';
import { useTicker } from '../../ui/hooks';
import { formatWait, useT } from '../../ui/i18n';
import { services } from '../../ui/services';
import { useUi } from '../../ui/store';
import { distanceM } from '../store';
import { weatherIcon } from '../weather';
import { CATEGORY_ICON, KIND_ICON } from '../pins';
import { flyTo, nearestPier, openPier, openPlace, places } from './context';

const SEASON_ICON = { spring: '🌷', summer: '☀️', autumn: '🍂', winter: '❄️' } as const;

/** Weather chip: live Open-Meteo conditions (or the ?weather= demo) + the season. Hidden if offline. */
export function WeatherChip() {
  const t = useT();
  useTicker(5000);
  const { weather, daylight } = services();
  const [, force] = useState(0);
  useEffect(() => weather.onChange(() => force((n) => n + 1)), [weather]);
  const season = weather.season();
  if (weather.source === 'offline' && !weather.demo.season) return null;
  const c = weather.target;
  const night = daylight.theme.night > 0.5;
  const title = `${t('weather')} · ${t(('season_' + season) as 'season_spring')}${weather.source === 'live' ? ` · ${Math.round(c.windMs * 3.6)} km/h` : ''}`;
  return (
    <span className="chip chip--weather" title={title}>
      {weather.source !== 'offline' && <span aria-hidden>{weatherIcon(c.code, night)}</span>}
      {weather.source === 'live' && c.tempC != null && <b>{Math.round(c.tempC)}°</b>}
      <span aria-hidden>{SEASON_ICON[season]}</span>
      {weather.source === 'demo' || weather.demo.season ? <small className="chip__demo">{t('demo')}</small> : null}
    </span>
  );
}

/** Sunset countdown + best sunset spots (viewpoints from OSM); glows during golden hour. */
export function SunsetCard() {
  useTicker(10_000);
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { clock, daylight } = services();
  const now = clock.now();
  const [lon, lat] = CONFIG.camera.center;
  const sun = sunTimes(now, lat, lon);
  if (!sun) return null;
  const done = now > sun.sunset + 20 * 60_000;
  const spots = places().places.filter((p) => p.category === 'view');
  const golden = daylight.theme.golden > 0.35 && daylight.theme.night < 0.5;
  return (
    <section className={`sunset ${golden ? 'sunset--golden' : ''}`}>
      <div className="sunset__head">
        <span className="sunset__sun" aria-hidden>
          ◐
        </span>
        <div>
          <b>
            {t('sunset')} {formatHHMM(toIstanbul(sun.sunset).seconds)}
          </b>
          <small className="muted">
            {done ? t('sunsetDone') : golden ? t('goldenHour') : `${formatWait((sun.sunset - now) / 1000, lang)} ${t('sunsetIn')}`}
          </small>
        </div>
      </div>
      <div className="sunset__spots" aria-label={t('bestSpots')}>
        {spots.map((p) => (
          <button key={p.id} className="pill" onClick={() => openPlace(p.id)}>
            🌅 {p.name}
          </button>
        ))}
      </div>
    </section>
  );
}

type GeoState = 'idle' | 'locating' | 'denied' | 'away';

/** "Next ferry from the nearest pier" — uses the device location once, on tap. */
export function NearestPierButton() {
  const t = useT();
  const [state, setState] = useState<GeoState>('idle');
  const go = () => {
    if (!navigator.geolocation) return setState('denied');
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const near = nearestPier(here);
        if (near.distance > 25_000) {
          setState('away');
          openPier('karakoy');
          return;
        }
        setState('idle');
        openPier(near.id);
        services().ferries.userLocation = here;
      },
      () => setState('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  };
  return (
    <div className="nearest">
      <button className="pill pill--accent" onClick={go} disabled={state === 'locating'}>
        📍 {state === 'locating' ? t('locating') : `${t('nextFerry')} · ${t('nearestPier')}`}
      </button>
      {state === 'denied' && <small className="muted">{t('locationDenied')}</small>}
      {state === 'away' && <small className="muted">{t('notInIstanbul')}</small>}
    </div>
  );
}

/** Places near a pier, with walking minutes (pier sheet). */
export function NearbyPlaces({ pierId }: { pierId: string }) {
  const t = useT();
  const pier = services().pierById.get(pierId);
  if (!pier) return null;
  const list = places()
    .places.map((p) => ({ p, d: distanceM(pier.lngLat, p.lngLat) }))
    .filter((x) => x.d < CONFIG.places.nearbyM)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  return (
    <>
      <h3 className="section">{t('nearby')}</h3>
      {list.length === 0 && <p className="muted">—</p>}
      <ul className="nearby">
        {list.map(({ p, d }) => (
          <li key={p.id}>
            <button onClick={() => openPlace(p.id)}>
              <span className={`picon picon--${p.category}`}>{KIND_ICON[p.kind] ?? CATEGORY_ICON[p.category]}</span>
              <span className="nearby__name">{p.name}</span>
              <span className="muted">
                🚶 {Math.max(1, Math.round(d / CONFIG.places.walkMPerMin))} {t('min')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Nearest pier to a place + its next departure (place sheet). */
export function PierHint({ lngLat }: { lngLat: [number, number] }) {
  useTicker(5000);
  const t = useT();
  const lang = useUi((s) => s.lang);
  const { clock, getDay, lineById, pierById } = services();
  const near = nearestPier(lngLat);
  const pier = pierById.get(near.id);
  if (!pier || near.distance > 2200) return null;
  const dep = nextDepartures(getDay, near.id, toIstanbul(clock.now()), 1)[0];
  const line = dep && lineById.get(dep.lineId);
  return (
    <button className="pierhint" onClick={() => (openPier(near.id, false), flyTo(pier.lngLat, 14.6))}>
      <span className="swatch swatch--pier swatch--xs">⚓︎</span>
      <span>
        <b>{lang === 'tr' ? pier.name : pier.nameEn}</b>{' '}
        <span className="muted">
          · 🚶 {Math.max(1, Math.round(near.distance / CONFIG.places.walkMPerMin))} {t('min')}
        </span>
        <br />
        <small className="muted">
          {dep && line ? `${t('nextFerry')}: ${line.name[lang]} · ${formatWait(dep.inSeconds, lang)}` : t('noDepartures')}
        </small>
      </span>
    </button>
  );
}
