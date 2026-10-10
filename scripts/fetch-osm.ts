/**
 * Download piers + district places from OpenStreetMap in one Overpass query (ferry terminals /
 * piers, place=* features). Coastline ways are included for the alternative coastline source,
 * but the primary coastline now comes from osmdata land polygons (see build-coastline.ts).
 * Override the endpoint with OVERPASS_URL=…
 * Output (raw, never hand-edited): data/raw/overpass-istanbul.json
 *
 * Run: npm run data:fetch-osm   (needs network access to an Overpass endpoint)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DATA_BBOX } from './bbox';
import { RAW_OVERPASS, type OverpassResponse } from './lib/overpass';

const ENDPOINTS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const [w, s, e, n] = DATA_BBOX;
const bb = `${s},${w},${n},${e}`;
const QUERY = `
[out:json][timeout:180];
(
  way["natural"="coastline"](${bb});
  nwr["amenity"="ferry_terminal"](${bb});
  nwr["man_made"="pier"]["name"](${bb});
  nwr["public_transport"="station"]["ferry"="yes"](${bb});
  nwr["place"~"^(city|town|suburb|quarter|neighbourhood|village|island)$"]["name"](${bb});
);
out geom;
`;

async function main() {
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      console.log(`POST ${url} …`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'istanbul-living-map/0.0 (prototype data build)' },
        body: new URLSearchParams({ data: QUERY }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = (await res.json()) as OverpassResponse;
      mkdirSync('data/raw', { recursive: true });
      writeFileSync(RAW_OVERPASS, JSON.stringify({ ...json, query: QUERY.trim(), fetchedAt: new Date().toISOString(), endpoint: url }));
      const count = (pred: (t: Record<string, string>) => boolean) => json.elements.filter((el) => pred(el.tags ?? {})).length;
      console.log(`✓ ${json.elements.length} elements (OSM base ${json.osm3s?.timestamp_osm_base ?? '?'})`);
      console.log(`  coastline ways: ${count((t) => t.natural === 'coastline')}`);
      console.log(`  ferry terminals: ${count((t) => t.amenity === 'ferry_terminal')}`);
      console.log(`  places: ${count((t) => !!t.place)}`);
      console.log(`Wrote ${RAW_OVERPASS}. Next: npm run data:coastline && npm run data:piers`);
      return;
    } catch (err) {
      console.warn(`  ✗ ${String(err)}`);
      lastErr = err;
    }
  }
  console.error('All Overpass endpoints failed.');
  throw lastErr;
}

main().catch(() => process.exit(1));
