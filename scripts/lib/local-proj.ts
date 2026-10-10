/** Equirectangular local projection in metres — accurate to <0.1% over our ~50 km box. */
export interface LocalProj {
  toXY(p: readonly number[]): [number, number];
  toLngLat(p: readonly number[]): [number, number];
}

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON_EQ = 111_320;

export function localProj(originLon: number, originLat: number, refLat = originLat): LocalProj {
  const kx = M_PER_DEG_LON_EQ * Math.cos((refLat * Math.PI) / 180);
  return {
    toXY: ([lon, lat]) => [(lon - originLon) * kx, (lat - originLat) * M_PER_DEG_LAT],
    toLngLat: ([x, y]) => [originLon + x / kx, originLat + y / M_PER_DEG_LAT],
  };
}

/** Compass bearing in degrees (0 = north, 90 = east) of a vector in local metres. */
export function bearingOf(dx: number, dy: number): number {
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}
