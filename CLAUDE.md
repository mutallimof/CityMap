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
2. ✅ Simulation: `sim/` + unit tests, routes + validator, ferries as arrows.
3. Vapur looks: 3D model, heading smoothing, wake, bob, docking.
4. Water + time: water shader, day/night, night lights, intro fly-in, seagulls.
5. Interactions: sheets, follow, layer chips, time controls, TR/EN.
6. Polish + perf, reduce-motion, deploy.

## Commands
```bash
npm install
npm run dev            # http://localhost:5173 (also on LAN). ?debug=1/0 · ?t=18:30 · ?speed=60 · keys: ` panel, s speed, n now
npm test               # vitest
npm run typecheck
npm run build          # typecheck + production build → dist/
npm run preview        # serve dist/

# Data pipeline (outputs are committed; re-run only when changing data)
# Coastline source (~930 MB download, unzips to 1.3 GB; data/raw/ is gitignored):
curl -o data/raw/lp.zip https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip \
  && unzip -q data/raw/lp.zip -d data/raw && rm data/raw/lp.zip
npm run data:coastline   # → data/land.geojson (land-polygons > overpass > coarse npm fallback)
npm run data:fetch-nominatim  # Nominatim (≤1 req/s) → data/raw/nominatim-istanbul.json — current pier/district source
npm run data:fetch-osm   # Overpass → data/raw/overpass-istanbul.json (OVERPASS_URL=… to pick a mirror)
npm run data:piers       # → data/piers.geojson (+ in-water berths), data/districts.geojson; --verbose lists candidates
npm run data:routes      # → data/routes.geojson + data/lines.json from data/catalog/lines.json (A* in water)
npm run validate:routes  # also runs in `npm run build`; fails on land / < 30 m from coast
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
- **2026-10-10 — Coastline source.** The plan's candidate `@geo-maps/earth-lands-100m` (and `-10m`) has only
  ~380 vertices across the whole bbox (Golden Horn a triangle) — rejected. Now using osmdata.openstreetmap.de
  **land-polygons-split-4326** (per user): stream shapefile → clip to bbox → union grid tiles (they overlap)
  → opening of 12 m (drops jetties < ~24 m wide that rendered as spiky artefacts) → simplify ~5 m.
  Result: 76 KB. Overpass `natural=coastline` assembly kept as an alternative source (unit tested).
- **Data downloads stay out of git** (`data/raw/` ignored); only processed files are committed.
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
- **Sim model (`src/sim`, pure).** Day schedule = f(lines, leg lengths, service day); state = f(schedule, t).
  Each line's origin departures follow peak/off-peak headways; a vessel sails out, dwells at every stop,
  turns at the terminus after one dwell, sails back, and is reused for the next origin departure
  (most-recently-freed first). Idle > `maxLayoverMin` → vessel leaves service; vessels appear/retire
  **docked** (render layer fades them) so nothing teleports. Leg motion: raised-cosine ease-in/out over
  `rampSeconds` (velocity and acceleration continuous); short legs lower peak speed instead of skipping ramps.
  Times are seconds since Istanbul local midnight; late trips (> 24:00) belong to the previous service day.
  Sim knows only leg lengths — mapping distance → coordinates/heading comes with routes.
- **Pier/district source = Nominatim (2026-10-10).** Geofabrik and overpass-api.de reset TLS, private.coffee
  and maps.mail.ru answer 500/504, overpass.osm.jp has an expired cert. Nominatim works: per pier
  "<name> iskelesi" + "ferry terminal near <name>", per district "<name>"; 1.1 s between requests.
  Candidates are pooled per catalog entry (terminals name berths after their *destination*, e.g. Kadıköy's
  "Kabataş İskelesi"), berths mentioning another catalog pier are penalised, and picks with plausible
  candidates > 1 km away are flagged. Districts accept admin boundaries (Nominatim gives the admin centre).
- **Piers have berths (user, 2026-10-10).** One pier = one marker/name; big terminals list several OSM berths
  in `data/catalog/piers.json` (first = main Şehir Hatları berth); each line picks its berth per stop in
  `data/catalog/lines.json` (`berths`), defaulting to the main one. Unclear choices are in each line's `toCheck`.
  Haydarpaşa dropped (no ferry terminal in OSM, no line uses it). Pins: Kabataş node/12985086871,
  Eminönü way/112174276, Kadıköy relation/19464376, Beşiktaş way/415337536.
- **Berth points are computed, not raw OSM.** Terminal nodes sit on land and our coastline drops jetties, so
  berth = nearest shoreline point + 30 m along the seaward normal; stores coast-parallel and seaward bearings.
- **Routes are generated, then committed and validated** (plan says hand-authored): A* on a 20 m water grid
  with a coast-hugging penalty (prefers mid-channel) → string pulling → clearance-safe Chaikin smoothing.
  Each leg leaves/enters its berth via an approach point ~160 m straight out to sea. Hand steering via `via`
  waypoints per leg. Validator = exact geometry (5 m sampling vs shoreline segments + point-in-land).
- **Bosphorus line stop list is PROVISIONAL** (zig-zag through every Bosphorus pier, headway 30/45) — awaiting user.
- **Rendering (step 2):** Three.js in a MapLibre custom layer, one InstancedMesh; geometry in local metres
  around `camera.center`, float64 matrix on the CPU (no GPU jitter). Heading = path tangent averaged ±15 m,
  then per-vessel exponential smoothing (`ferries.headingTau`). Vessels grow in/out while docked.
- Versions: Vite 8, TypeScript 7, MapLibre 6.13, Three 0.186, React 19, Vitest 5.
