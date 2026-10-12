import { CONFIG } from '../config';

/** Fog for the weather chip: a soft grey cloud over three mist lines, emoji-sized (original drawing). */
export function FogIcon() {
  const c = CONFIG.weather.fogIcon;
  return (
    <svg className="fog-icon" viewBox="0 0 24 24" width="1.25em" height="1.25em" aria-hidden>
      <path d="M6.5 13.5a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.4 1.6A3.3 3.3 0 0 1 17.6 13.5z" fill={c.cloud} />
      <path d="M7.4 10.4a3 3 0 0 1 1.9-3.3" fill="none" stroke={c.highlight} strokeWidth="1.4" strokeLinecap="round" />
      <g fill="none" stroke={c.mist} strokeWidth="2" strokeLinecap="round">
        <path d="M4 16.4h12.5" />
        <path d="M7 19.4h13" />
        <path d="M5 22.2h9" />
      </g>
    </svg>
  );
}
