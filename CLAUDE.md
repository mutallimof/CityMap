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
3. ✅ Vapur looks: 3D model, heading smoothing, wake, bob, docking.
4. ✅ Water + time: water shader, day/night, night lights, intro fly-in, seagulls, funnel smoke.
5. ✅ Interactions: sheets, follow, layer chips, time controls, TR/EN.
6. ✅ Polish + perf (adaptive pixel ratio), reduce-motion, deploy (GitHub Pages).
7. ✅ Part B (user, 2026-10-10): living city map + feed — see `docs/ideas.md`.
9. ✅ Design pass (user, 2026-10-10): buildings, night contrast, places allow-list + icon family, iPhone layout —
   before/after in `docs/design-pass/`.
8. ✅ Chunk 3 (user, 2026-10-10): colourful OSM city (OpenFreeMap), live weather + seasons, places by zoom
   (real data only), search, Open now, guides, snapshot share, PWA, adaptive effects.

## Commands
```bash
npm install
npm run dev            # http://localhost:5173 (also on LAN). ?debug=1/0 · ?t=18:30 · ?speed=60 · ?stress=40 · ?weather=rain&season=spring · ?adaptive=0 · #place= #pier= #guide= · keys: ` panel, s speed, n now
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
npm run data:fetch-places  # Nominatim (2.5 s apart, 429 backoff, incremental) → data/raw/nominatim-places.json
npm run data:places      # → data/places.geojson (OSM places: hours, website, phone, major)
npm run data:landmarks   # OpenFreeMap tiles (cached in data/raw/tiles) → data/landmarks.geojson
node scripts/build-icons.cjs  # icon.svg → PWA icons + iOS splashes (needs Playwright/Chromium)
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
- No API keys. Static data + keyless services: OpenFreeMap tiles/glyphs, Open-Meteo, Nominatim (browser, ≤1 req/s, on submit). UI font self-hosted (`@fontsource/nunito`); map glyphs from OpenFreeMap.
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
- **Labels (superseded, design pass):** all map text and place icons are MapLibre symbols in one collision
  space (OpenFreeMap glyphs, Noto Sans) so nothing overlaps; only the selected-place highlight is a DOM marker.
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
- **Bosphorus line = real long tour (user):** Eminönü → Beşiktaş → Üsküdar → Kanlıca → Sarıyer → Rumeli Kavağı →
  Anadolu Kavağı; 19 km/h + 5 min dwells ≈ 1h53 one way; simulated headways 30/45. Other Bosphorus piers
  stay on the map unserved for now. The two unsure berths stay as they are (user).
- **`?stress=N`** (perf test): every line runs all day on the longest uniform headway giving ≥ N vessels now.
- **Deploy:** `.github/workflows/deploy.yml` builds `phase-0` with `BASE=/<repo>/` and deploys to GitHub Pages.
- **Rendering (step 2):** Three.js in a MapLibre custom layer, one InstancedMesh; geometry in local metres
  around `camera.center`, float64 matrix on the CPU (no GPU jitter). Heading = path tangent averaged ±15 m,
  then per-vessel exponential smoothing (`ferries.headingTau`). Vessels grow in/out while docked.
- **Approach points run along the shore** (240 m along, 80 m out) so vessels glide in alongside the pier
  instead of bow-first; falls back to straight out to sea where water is tight.
- **Docking is pure:** docked heading = f(arrival heading, berth along-bearing, departure heading, dock time):
  swing alongside over `dockTurnSeconds` after arriving, swing out over the same before leaving.
- **Shared berths moor abreast** (slot 0 at the quay, 1, 2 … further out to sea) — sliding along the
  quay put exaggerated hulls on land at curved quays. Near piers hulls also get a seaward "quay clearance"
  offset so 3–4× hulls don't overlap the coast; both blend in over `berthBlendM` of route (no jumps).
- **Vapur model is procedural** (`src/ferries/model.ts`, ~1k triangles): body InstancedMesh with vertex colours
  + a line-colour stripe InstancedMesh (2 draw calls) + soft shadow quads. Lambert, flat shading.
- **Mirror trap:** the local→mercator matrix flips y; MapLibre's matrix compensates for closed meshes, so
  hulls are fine, but open ribbons (wake) must be `DoubleSide`.
- **Wake = pure past poses.** Trail = the vessel's own pose function sampled at earlier sim times on a fixed
  grid (cached per vessel; only the newest sample is computed per frame), V arms widening from the bow,
  prop wash behind the stern, fades with age and speed. One dynamic ribbon mesh for all vessels.
- **Real-time-only effects** (not part of the sim): bob (roll/pitch/heave, per-ship phase), settle bump on
  arrival, heading smoothing. Everything that says *where* a vessel is stays a pure function of sim time.
- Known: lines don't avoid each other (vessels of different lines can overlap where routes cross).
- **Water is a custom layer under the land** with a distance-to-coast field rasterised at runtime (canvas +
  EDT). Land fill uses opacity 0.999 so MapLibre draws it in the ordered pass *after* the water (opaque
  fills are drawn early with depth and would be painted over). Raw ShaderMaterials end with
  `#include <colorspace_fragment>`. Glints use metres-per-pixel octaves so they stay pixel-sized.
- **Day/night = real sun for the simulated time** (NOAA equations); one continuous palette blend
  day → golden → night drives map paint, sky, water, 3D lights, night lights, labels, pins.
- **One shared three.js renderer + LocalFrame** for all custom layers.
- **UI is React over the map** (`src/ui`), tiny observable store; sheet = peek/half/full, transform-only.
- **Marker pitfall:** MapLibre positions DOM markers via inline `transform` on the root — never
  transform/transition the marker root (pins animate `.pin__inner`).
- **Part B places are real OSM features** (Nominatim lookups listed in `data/catalog/place-queries.json`;
  religious/diplomatic/police/municipal-canteen names excluded so demo posts are never attributed to
  them). **Posts are DEMO** (templates by venue group; relative times so "Tonight" always has content),
  labelled DEMO on every card + sheet + feed header.
- **Weather** from Open-Meteo in the user's browser (no key); real wind steers the funnel smoke.
  The sandbox can't reach it (chip hides), the deployed site can.
- **Deploy:** workflow publishes to Pages via Actions *and* to a `gh-pages` branch, so either Pages
  source setting works. Pages must be enabled once by the repo owner.
- Versions: Vite 8, TypeScript 7, MapLibre 6.13, Three 0.186, React 19, Vitest 5.

- **City basemap (chunk 3):** OpenFreeMap `planet` vector tiles (OpenMapTiles schema) drawn in our own palette
  (`CONFIG.city`, `src/map/city.ts`); ground layers sit between our land fill and the shore lines, so the coast
  and water shader stay ours. Colours = `cityLook()` (pure): day→golden→night, season tints, wet/snow/overcast.
  Tile feature ids = osm_id×10 + 1/2/3 (Planetiler) → used to link POIs/buildings/landcover to OSM.
  Merged tile buildings share ids, so pastel variety mixes in height. Night windows = a second extrusion layer
  with generated window patterns, cross-faded. Labels for streets/POIs use MapLibre symbols (OFM glyphs);
  our district/pier/landmark labels stay DOM.
- **Landmarks** come from the tiles too (`scripts/build-landmarks.ts`, names in `data/catalog/landmarks.json`,
  searched around a named pier): tower POIs → their building id (gold extrusion), bridge name lines → glow +
  night lamps, Emirgan Korusu → landcover id for spring tulips.
- **Weather** (`src/weather`): `Conditions` from Open-Meteo WMO codes or `?weather=` presets, eased over
  `easeS`; DaylightController applies it to palette, city, water (`uRain` rings, `uChop`), ferries (wind, sea
  rocking, fog-dimmed lights) and `WeatherLayer` (fog sheet in world space — ferries fade because it's drawn over
  them; rain/snow as screen-space instanced quads; lightning). Fog shader must use world position (modelMatrix).
- **Real data only (user):** demo posts removed. Featured places (`data/places.geojson`, incl. website/phone/major)
  are DOM pins; every other named OSM POI is the `poi` symbol layer (zoom + rank reveal, collision). Opening a
  place looks up missing tags via Nominatim `lookup` (queued ≥1.1 s, session-cached); missing fields are hidden.
  "Open now" can only use known hours, so it hides the tile POIs.
- **Search:** local + loaded-tile results as you type; Nominatim `search` (bounded to our bbox) only on submit —
  the Nominatim policy forbids autocomplete. Result attribution shown in the panel.
- **Guides:** `data/catalog/guides.json` references place/pier/landmark ids + `ferry:<lineId>` legs (sliced from
  the line's route by `stopVertex`); a unit test resolves every guide against committed data.
- **Snapshot:** frame copied inside MapLibre's `render` event (no preserveDrawingBuffer), cropped 4:5, caption +
  watermark; Web Share with files, download fallback. DOM labels/pins are not in the image.
- **PWA:** `public/manifest.webmanifest` (fullscreen), icons/splashes generated from `public/icons/icon.svg`,
  `public/sw.js` (prod only): network-first page, cache-first hashed assets, SWR OpenFreeMap tiles (≤600).
- **Adaptive quality ladder** (`src/app/perf.ts`): pixel ratio → particles/gulls → window pass → flat buildings;
  low-end devices start at 1.5×. Headless screenshots run at ~2 fps — use `?adaptive=0` or the ladder kicks in.
- **Pages is live** (gh-pages branch source): https://mutallimof.github.io/CityMap/
- **Design pass (user, 2026-10-10).**
  - *Buildings:* OpenFreeMap's z14 tiles group all same-height buildings of a tile into one multipolygon, so a
    style can't vary them. A `buildings://` MapLibre protocol + 2 Web Workers (`src/map/buildings`) re-pack the
    layer into single buildings with `v` (0–99 variation), `h` (real OSM height, else 2–5 floors × 3.2 m) and `b`.
    Day: soft pastels, light from the sun, no texture. Night: 38 % of buildings dark, the rest get one of three
    sparse, irregular warm-window facades (64 px tiles, runs of lit flats); pale neutral night light so facades
    keep their value. Default pitch 46°.
  - *Night contrast:* darker blue water, neutral dark land, lighter facades, sodium-gold main roads with a
    blurred street-light glow (fades in z12.6→14.2), bright teal shoreline. Roads step back when zoomed out.
  - *Places:* allow-list of OSM class/subclass (`POI_KINDS` in `src/places/icons.ts`): cafés, restaurants, bars,
    bakeries/sweets, museums, galleries, theatres, cinemas, malls/bazaars/department stores, parks, viewpoints,
    landmarks. Match on `subclass` + class guard (concat expressions didn't evaluate). OpenMapTiles `rank` is a
    per-tile order (cafés ~40), so thresholds are 24/60/140 by zoom; `icon-padding` limits density; names only for
    rank ≤ 20 until z17.4. Tile POIs carry no hours/website, so "more OSM detail" is honoured by featured places
    (curated, detailed) always winning collisions — not per POI.
  - *Icons:* one canvas-drawn family (`src/places/icons.ts`): colour + shape per category (circle food & drink,
    rounded square culture, hexagon shopping, leaf nature, star landmark), white glyphs; featured = bigger pin
    with glow and a baked open-now dot; bars glow at night, viewpoints at golden hour (images swapped). Legend
    chip. Lists/sheets/search use the same icons (`PlaceIcon`).
  - *Layout (390 px):* clock chip stacks time over "Simulated schedule"; search + TR/EN are icon buttons; camera
    sits in the sheet header; a soft scrim under the HUD hides map icons beneath the controls.
  - *Ferries:* exaggeration 5.6× at z10, 4.9× at z11 (was 4×) so they read as boats when zoomed out.
