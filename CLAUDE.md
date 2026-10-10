# Istanbul Living City — Phase 0 prototype

Full plan: `docs/plan.md`. **Build only Phase 0 (§4).** No backend, no accounts, no real-time data.

## Short spec
- Mobile-first web page: tilted (≈50°), stylized map of Istanbul's waters (Bosphorus, Golden Horn,
  Marmara coast, Princes' Islands) with 20–40 vapurs sailing on a **simulated** timetable.
- ~23 real piers (coordinates **only from OSM**, never typed from memory), 6 real lines, simulated schedules.
- Vapur motion: interpolated by clock time, ease in/out of piers (~60 s), smoothed heading (never snaps),
  docking (slow, rotate parallel, wait 3–5 min, settle bump), V-wake, bob, night lights, seagulls.
- Tap vapur/pier → bottom sheets. Layer chips, time controls (Now, 1×/10×/60×, scrubber), TR/EN.
- Day/night follows Europe/Istanbul time. "Simulated schedule" badge + OSM attribution always visible.
- Priorities: (1) beauty and smooth ferry motion, (2) 60 fps with 40 ferries on a mid-range phone,
  (3) correctness: ferries never cross land; positions are a pure function of clock time.
- Definition of done: plan §4.10 acceptance criteria.

## Build steps (plan §4.9)
1. ✅ Skeleton: Vite, MapLibre custom land/water style, coastline pipeline, piers, debug fps panel.
2. Simulation: `sim/` + unit tests, routes + validator, ferries as arrows.
3. Vapur looks: 3D model, heading smoothing, wake, bob, docking.
4. Water + time: water shader, day/night, night lights, intro fly-in, seagulls.
5. Interactions: sheets, follow, layer chips, time controls, TR/EN.
6. Polish + perf, reduce-motion, deploy.

## Commands
```bash
npm install
npm run dev            # http://localhost:5173 (also on LAN for phones). ?debug=1 / ?debug=0, ` toggles panel
npm test               # vitest
npm run typecheck
npm run build          # typecheck + production build → dist/
npm run preview        # serve dist/

# Data pipeline (outputs are committed; re-run only when changing data)
npm run data:fetch-osm   # Overpass → data/raw/overpass-istanbul.json (needs network to overpass-api.de)
npm run data:coastline   # → data/land.geojson (overpass source if raw file exists, else coarse npm fallback)
npm run data:piers       # → data/piers.geojson, data/districts.geojson (from catalog + OSM)
```

## Conventions
- Stack: Vite + TypeScript (strict), MapLibre GL JS, Three.js in a MapLibre custom layer (from step 2/3),
  React only for UI sheets/controls, Turf.js only in build scripts, Vitest.
- **Every visual constant lives in `src/config.ts`** (colours, sizes, speeds, wake, scale, zooms).
- Small typed modules: `src/map` (MapLibre setup/style/labels), `src/sim` (pure functions + tests),
  `src/ferries`, `src/water`, `src/ui`, `src/debug`, `src/data` (runtime loaders).
- `data/raw/` = downloaded sources, never hand-edited. `data/catalog/` = hand-written ids/names (no coordinates).
- No API keys, no tile servers; all data static. Fonts self-hosted (`@fontsource/nunito`).
- Commit after each build step.

## Decisions log
- **2026-10-10 — Coastline source.** The plan's candidate `@geo-maps/earth-lands-100m` (and the `-10m`
  variant) has only ~380 vertices across the whole bbox: the Golden Horn is a triangle, the Bosphorus jagged.
  Not good enough. Built a second pipeline: OSM `natural=coastline` ways via Overpass, assembled into land
  polygons (`scripts/lib/assemble-coastline.ts`, unit tested). The sandbox network blocks Overpass, so
  `data/land.geojson` is currently the coarse geo-maps **placeholder** until `npm run data:fetch-osm` runs.
- **Piers/districts from OSM only.** `data/catalog/*.json` holds ids + names + match tokens; `build-piers.ts`
  takes coordinates from OSM ferry terminals / place features, prefers Şehir Hatları terminals, flags
  ambiguous matches; pin with `"osm": "node/123"`. Until OSM data is fetched, piers/districts are empty.
- **Labels are DOM markers, not MapLibre symbol layers.** No glyph server needed (no API keys), Nunito
  webfont renders Turkish characters natively; we only show a few dozen labels so DOM cost is negligible.
- **Shoreline lines derived at runtime** from land polygons (dropping segments along the clip box), so
  `land.geojson` stays polygon-only within the 400 KB budget and the data edge isn't drawn as a coast.
- **Land rings are RFC 7946 wound** (land on the left) — the inner-shadow layer uses a negative `line-offset`.
- **MapLibre 6 worker:** set explicitly via `setWorkerUrl(…maplibre-gl-worker.mjs?url)`; Vite's dep
  pre-bundling otherwise breaks MapLibre's relative worker URL.
- **React not mounted yet** — installed, but arrives with the UI sheets (step 5); step 1 has no UI to own.
- Versions: Vite 8, TypeScript 7, MapLibre 6.13, Three 0.186, React 19, Vitest 5.
