/**
 * Sun position and sunrise/sunset (NOAA solar equations, ~1 min accuracy). Pure functions.
 * Angles in degrees; azimuth is a compass bearing (0 = north, 90 = east).
 */
const RAD = Math.PI / 180;

export interface SunPosition {
  azimuth: number;
  elevation: number;
}

function julianCentury(epochMs: number): number {
  return (epochMs / 86_400_000 + 2_440_587.5 - 2_451_545) / 36_525;
}

function solarParams(T: number) {
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    4 *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)) /
    RAD; // minutes
  return { decl, eqTime };
}

export function sunPosition(epochMs: number, lat: number, lon: number): SunPosition {
  const { decl, eqTime } = solarParams(julianCentury(epochMs));
  const d = new Date(epochMs);
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  const trueSolarMin = (((utcMin + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarMin / 4 - 180;
  const cosZen = Math.sin(lat * RAD) * Math.sin(decl * RAD) + Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(hourAngle * RAD);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZen))) / RAD;
  const az =
    Math.atan2(Math.sin(hourAngle * RAD), Math.cos(hourAngle * RAD) * Math.sin(lat * RAD) - Math.tan(decl * RAD) * Math.cos(lat * RAD)) / RAD + 180;
  return { azimuth: (az + 360) % 360, elevation: 90 - zenith };
}

/**
 * Sunrise and sunset (epoch ms) for the UTC day containing `epochMs`'s local noon at `lon`.
 * Uses the standard −0.833° altitude (refraction + solar disc). Null in polar day/night.
 */
export function sunTimes(epochMs: number, lat: number, lon: number): { sunrise: number; sunset: number; noon: number } | null {
  const dayStart = Math.floor((epochMs + (lon / 15) * 3_600_000) / 86_400_000) * 86_400_000;
  let noon = dayStart + 43_200_000 - (lon / 15) * 3_600_000;
  for (let i = 0; i < 2; i++) {
    const { eqTime } = solarParams(julianCentury(noon));
    noon = dayStart + (720 - 4 * lon - eqTime) * 60_000;
  }
  const { decl } = solarParams(julianCentury(noon));
  const cosH = (Math.cos(90.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  if (cosH < -1 || cosH > 1) return null;
  const H = Math.acos(cosH) / RAD; // degrees → 4 min each
  return { sunrise: noon - H * 4 * 60_000, sunset: noon + H * 4 * 60_000, noon };
}
