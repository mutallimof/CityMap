/** Fog has no emoji that reads as fog everywhere (Apple draws 🌫 as a plain blurred grey square): we draw it. */
export const FOG = 'fog';

/**
 * WMO weather code → icon (day/night) for the weather chip: an emoji, or FOG for the drawn fog icon
 * (`FogIcon`). Emoji carry U+FE0F so every platform draws the colour emoji, never a text glyph or an empty
 * box. Clear nights keep the text moon ☾ of the clock.
 */
export function weatherIcon(code: number, night: boolean): string {
  if (code === 0) return night ? '☾' : '☀️';
  if (code <= 2) return night ? '☁️' : '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return FOG;
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '🌨️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}
