/** WMO weather code → icon (day/night). */
export function weatherIcon(code: number, night: boolean): string {
  if (code === 0) return night ? '☾' : '☀️';
  if (code <= 2) return night ? '☁️' : '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫';
  if (code >= 51 && code <= 67) return '🌧';
  if (code >= 71 && code <= 77) return '🌨';
  if (code >= 80 && code <= 82) return '🌦';
  if (code >= 95) return '⛈';
  return '🌤';
}
