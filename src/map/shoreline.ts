import type { FeatureCollection, MultiLineString, Polygon, MultiPolygon, Position } from 'geojson';

type BBox = readonly [number, number, number, number];

const EPS = 1e-7;

function onSameEdge(a: Position, b: Position, [w, s, e, n]: BBox): boolean {
  const near = (v: number, edge: number) => Math.abs(v - edge) < EPS;
  return (
    (near(a[0], w) && near(b[0], w)) ||
    (near(a[0], e) && near(b[0], e)) ||
    (near(a[1], s) && near(b[1], s)) ||
    (near(a[1], n) && near(b[1], n))
  );
}

/**
 * Real shoreline from clipped land polygons: every ring segment except the
 * artificial ones that run along the clipping box. Used for the shoreline
 * highlight / inner shadow / shallow-water band so the data edge isn't drawn
 * as a coast.
 */
export function shorelineFromLand(
  land: FeatureCollection<Polygon | MultiPolygon>,
  bbox: BBox,
): MultiLineString {
  const lines: Position[][] = [];
  for (const f of land.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        let current: Position[] = [];
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i];
          const b = ring[i + 1];
          if (onSameEdge(a, b, bbox)) {
            if (current.length > 1) lines.push(current);
            current = [];
            continue;
          }
          if (current.length === 0) current.push(a);
          current.push(b);
        }
        if (current.length > 1) lines.push(current);
      }
    }
  }
  return { type: 'MultiLineString', coordinates: lines };
}
