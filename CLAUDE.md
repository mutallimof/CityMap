# Istanbul Living City

Animated, mobile-first map of Istanbul: vapurs on the water, a colourful OSM city, places, events, history.
Live: **https://mutallimof.github.io/CityMap/** · default branch `phase-0` · original plan `docs/plan.md` (keep as is)
· ideas `docs/ideas.md`. **No changelog file** (don't create one): project history = this file + git.

## Ground rules (from the user)
- Work autonomously; commit and deploy as you go (every push to `phase-0` deploys). Summary + link + "what to try" at the end.
- **No open-source licence** — the user keeps all rights.
- **Real data only.** Coordinates only from OSM (or geocoded from an official address) — never typed from memory.
  No demo/fake posts. Each line is labelled "Live timetable" or "Simulated schedule"; OSM attribution always visible.
- No API keys, no backend: static data + keyless services (OpenFreeMap, Open-Meteo, Nominatim).
- Priorities: beauty and smooth ferry motion → 60 fps on a mid-range phone → correctness (ferries never cross land;
  positions are a pure function of clock time). Respect reduce-motion everywhere.
- **Every visual constant lives in `src/config.ts`.** Record decisions in this file.

## Current state (2026-10-11, real timetables + Bosphorus commuter lines)
- **Ferries:** 7 Şehir Hatları lines (as the operator runs them), 27 OSM piers with berths, **real timetables**
  (winter 2026-27 PDF, valid to 27 Jun 2027; simulated fallback per line, labelled) — `src/sim`, pure.
  Lines (PDF page): Kadıköy – Karaköy – Eminönü (4), Üsküdar – Karaköy – Eminönü (5), Kadıköy – Beşiktaş (+ Fri/Sat
  night via Karaköy, 6), Kabataş – Adalar (12–13), Rumeli Kavağı – Eminönü (22), Anadolu Kavağı – Üsküdar (28),
  Uzun Boğaz Turu (35). Weekday peak ≈ 20 vessels at once (19:14).
  Piers added for the commuter lines (all OSM): Büyükdere (way/592032187, pier building), İstinye (node/6502486594),
  Beykoz (way/739105702), Paşabahçe (way/525436007), Çubuklu (way/525436006 passenger pier, not the car ferry).
  Procedural 3D vapurs (three.js custom layer): wake, bob, docking, smoke, horn rings, splash, gulls, Follow glide.
- **City:** OpenFreeMap vector tiles in our palette; day→golden→night from the real sun; live weather + seasons;
  re-packed 3D buildings with night windows; forests green all year with seasonal tree crowns.
- **Places:** ~380 featured pins (67 curated + 286 auto-picked + 23 event venues) + tile POIs by zoom;
  place sheet with hours/website/phone (Nominatim lookup on open), Story section, upcoming events.
- **Stories:** 509 historic places (Wikidata/Wikipedia/Commons), book markers.
- **Events:** ~340 events from 24 configured venues (daily scrape), glow/pulse on pins, chips
  Today · This weekend · Workshops · Free.
- **UI:** React over the map; filters = All + combinable category toggles + Open now + event chips; search; guides;
  pier boards with printed times + source credit; per-line "Live timetable" / "Simulated schedule" label;
  snapshot share; PWA; TR/EN; sound toggle (off by default); golden gulls tell facts; `?skyline=1` night test mode.
- **Plan** (`src/plan`): Evening / Day / Several days; "Add to plan" on place sheets and event rows; timeline sheet
  grouped by day (reorder, times, durations, remove); between stops only real connections (approx. walk / the
  actual ferry / "No transport info"); warnings (closed, closes during visit, hours unknown, overlap, arrives late,
  last ferry back, gone); stops numbered on the map, ferry legs on their real lanes; saved on the device; share
  link `#plan=` (read-only view + "Copy to my plans").

## Commands
```bash
npm install
npm run dev        # :5173 · ?t=18:30 ?date=2026-10-12 ?speed=60 ?debug=1 ?stress=40 ?weather=rain|snow|fog&season=spring
                   #   ?adaptive=0 (screenshots) ?intro=0 ?skyline=1 · #place= #pier= #guide= #plan= · keys: ` panel, s speed, n now
npm test           # vitest (209 tests)
npm run typecheck
npm run build      # validate:routes + validate:timetables + typecheck + vite build → dist/
npm run validate:data   # gate for refreshed data incl. timetables (also runs in the refresh job)
python3 scripts/timetables/parse-tarife.py data/raw/tarife.pdf && npm run data:timetables   # new timetable PDF
```

## Data pipelines
Processed outputs are committed in `data/`; `data/raw/` (downloads) is gitignored; `data/catalog/` = hand-written
ids/names/rules (no coordinates).

| Output | Script | Source | When / where |
|---|---|---|---|
| `land.geojson` | `data:coastline` | osmdata land-polygons (download in `data/raw`, see script header) | manual |
| `piers.geojson`, `districts.geojson` | `data:fetch-nominatim` → `data:piers` | Nominatim | manual |
| `routes.geojson` (one feature per directed lane), `lines.json` | `data:routes` (+ `validate:routes` in build) | A* on water grid; legs = pattern + every pier pair in `timetables.json`, two lanes each | manual |
| `timetables-source.json` → `timetables.json` | `parse-tarife.py` → `data:timetables` (+ `validate:timetables` in build) | Şehir Hatları PDF (by hand, never committed) | ~twice a year, see `scripts/timetables/README.md` |
| `catalog/holidays.json` | hand-written | Diyanet calendar + Law 2429 | with each timetable |
| `places.geojson` (67 curated) | `data:fetch-places` → `data:places` | Nominatim | manual |
| `landmarks.geojson` | `data:landmarks` | OFM tiles | manual |
| `venue-places.geojson` | `data:venues` | OFM tiles + Nominatim fallback | manual |
| `events.json`, `events-log.json`, `event-venues.geojson`, `venue-geocode.json` | `data:events` | venue sites + Nominatim | **daily 06:17 Istanbul**, Actions |
| `stories.json` | `data:stories` | Overpass + Wikidata + Wikipedia + Commons | **monthly (3rd)**, Actions |
| `places-auto.geojson` | `data:featured` | Overpass | **monthly (3rd)**, Actions |

- `.github/workflows/data-refresh.yml`: cron + `workflow_dispatch` (`what` = events|stories|places|both,
  `venues` = ids to force-refetch). Steps: scrapers (`continue-on-error`) → `validate:data` (fails ⇒ nothing
  committed) → commit (rebase + retry push) → calls `deploy.yml`. **Never deploy empty or broken data**: the
  validator refuses big drops vs the committed file and empty-after-non-empty.
- Timetables can't be scraped (sehirhatlari.istanbul and data.ibb.gov.tr block GitHub's runners: Cloudflare
  challenge / 403). The refresh job validates them every run and warns in its summary 30 days before expiry.
- `deploy.yml`: tests + build with `BASE=/<repo>/` → publishes `dist/` to the `gh-pages` branch (Pages source).
- The dev sandbox **cannot reach** venue sites, Wikimedia, Overpass or Open-Meteo. Develop those through Actions runs
  (dispatch the refresh job; for page structure push a temporary probe workflow on a side branch).

## Venue scraping rules (`scripts/events/`, config `data/catalog/venues.json` — internal, never shown in the UI)
- **Facts only:** title, date/time, venue/place, category, price if listed, event page + official ticket link.
  Never copy descriptions or images.
- **Polite:** respect robots.txt (403 on robots.txt = blocked), **≥ 4 s between requests per host**, clear User-Agent
  (`IstanbulLivingCityBot/0.1 (+site; contact)`), 25 s timeout, **at most once a day per venue** (20 h guard).
- **No ticket resellers** (Biletix, Passo, Bubilet, Biletinial, Mobilet) — never fetched, never linked.
- Every event attaches to a real map place: venue default, `aliases`, map-place names, or OSM name lookup;
  venues not in OSM come from `data/catalog/extra-venues.json` (official address, verified on the venue's own
  contact page before geocoding). Unplaceable events are dropped and counted.
- Blocked / failed / layout change (sudden zero) ⇒ skip, **keep that venue's last good events**, log status in
  `events-log.json`. No visible sources list or prototype label in the UI.
- Scraper kinds: `arter` (JSON endpoint), `akbank` (calendar), `sehir` (play sessions per stage), `salon` (API),
  `fisekhane`, `dasdas`, `kumbaraci`, `uniq`, `bkm`, `listtext` (list-page items), `generic` (list → detail, facts
  from text under `<h1>`). `disabled: "<reason>"` keeps a venue in the config without fetching.

## Code map
`src/sim` pure schedule/state, real timetables (`real.ts`) + tests · `src/ferries` vapur layer, model, wake, gulls, smoke · `src/water` shader +
coast distance field · `src/map` style, city (OFM) layers + look, buildings protocol/workers, skyline ·
`src/places` stores, filters, layers, icons, sheets · `src/events`, `src/stories`, `src/fun` (gull facts),
`src/audio` (synthesised sound), `src/weather`, `src/time` (sun/palette), `src/ui` (React HUD, store, i18n),
`src/app` (daylight, perf ladder, PWA), `scripts/` (data builders + scrapers, Turf only here; `scripts/timetables` PDF parser).
Stack: Vite 8, TypeScript 7 strict, MapLibre 6.13, three 0.186, React 19, Vitest 5.

## Key decisions & traps (keep in mind)
- **Sim:** schedule = f(lines, legs, timetable, holidays, day); state = f(schedule, t). A trip = any sequence of calls;
  each consecutive pair sails its own route leg (`routes.geojson`, one feature per pier pair, sailed either way).
  Raised-cosine leg ease; vessels appear/retire docked; trips are chained into vessels at piers (min turn 2 min, max
  layover 45 min sim / 170 min real); times = seconds since Istanbul midnight, late trips belong to the previous
  service day (stored 24:00+). Visual-only effects (bob, bump, heading smoothing, moments) never change *where* a vessel is.
- **Real timetables** (`src/sim/real.ts`): printed departures kept to the second (vessel docks one dwell before);
  printed arrivals met exactly; unprinted arrivals from route length + line speed; leg speed fitted within 9–34 km/h
  (validator rejects faster). Holidays → Sunday timetable; arife half-days → normal. Outside 7 Sep 2026 – 27 Jun 2027,
  or a line whose trips can't be sailed → simulated (per line, labelled). Pier boards list printed departures only.
- **PDF reading** (`scripts/timetables/rules.ts`): row tables = one trip per row; "cycle" tables (p. 4, 5, night p. 6)
  = a row is one vessel's round out via the printed piers and back from the last one (only when every gap fits one
  vessel). This is a reading of the layout, not printed explicitly — see Known issues. Footnotes mapped by text.
- **Routes** are generated (A* on 20 m water grid, string pulling, clearance-safe smoothing) then committed and
  validated (5 m sampling vs shoreline). Berths = shore point + 30 m seaward; approach points run along the shore;
  shared berths moor abreast. Each berth is approached from the side the raw A* water path arrives from (not the
  other pier's straight-line side — that made hairpins in İstinye bay).
- **Lanes** (`scripts/lib/lanes.ts`, `CONFIG.routes.lanes`): every leg is two directed lanes, shifted to the right of
  travel by 28 + 26 × lane index m (lines sharing > 400 m of water get different indices: 0/1/2), eased in 110→420 m
  from each berth (berths unchanged, docked vessels may overlap), clamped ≥ 60 m from land and to half the local
  bend radius, corners rounded; a lane may lengthen its leg ≤ 4% and never beyond what its tightest printed time
  can sail (Arnavutköy → Bebek stays on the centreline). `findLeg` prefers the lane in the travel direction.
  Open-water overlaps (two vessels < 40 m) went from ≈20 to ≈5 min/day.
- **Rendering:** one shared three.js renderer + `LocalFrame` (local metres around the camera centre, float64 matrix on
  CPU). The local→mercator matrix flips y: open ribbons must be `DoubleSide`. Raw shaders end with
  `#include <colorspace_fragment>`.
- **Water** = custom layer under the land; land fill opacity 0.999 (keeps it in the translucent pass after the water).
  Outside our coastline box: land-coloured background + OFM `water` polygons; the shader fades at the box edge.
- **MapLibre:** worker URL set via `setWorkerUrl(...?url)`; never transform a DOM marker root; OMT `concat`
  filters didn't evaluate (match `subclass` + class guard); OMT `rank` is per tile; tile feature id = osm_id×10+1/2/3.
- **Buildings:** OFM z14 merges same-height buildings → `buildings://` protocol + workers re-pack them.
- **Filters:** `src/places/filters.ts` is the single rule for pins, feed and hint; with any filter on, matches show
  at every zoom; tile POIs hide only for Open now / event chips; story markers follow Culture.
- **Featured pins zoomed out:** `featuredRank` 0 = well known / event today / filter match, 1 = curated, 2 = auto;
  rank 0 always, 1 from z10.6, 2 from z11.4, fading in; compact pins (`featm-*`, no glow margin) below z12.4 so
  collision boxes are the pin itself; sort key: favourites, event today, rank.
- **Event glow/pulse:** glow = an event today (`isToday`) or on now; pulse ring = on now (`isNow`) AND its pin is
  actually drawn (`PlaceLayers.renderedFeatured`, re-checked on moveend + every 3 s). Long runs never glow/pulse.
- **Planner** (`src/plan`: `model.ts` pure edits, `timeline.ts` pure connections/warnings, `share.ts` link codec,
  `store.ts` device storage `plans:v1`, `runtime.ts` real data + map, `ui.tsx`; constants `CONFIG.plan`):
  - Times = minutes since the stop's plan-day midnight (≥ 1440 = after midnight; events at 00:00–06:00 join the
    evening before). Events keep their real start (re-read from data); places get the next free slot (after the
    last stop + 15 min; moved to arrival if the way there is longer); reorder swaps places, jumps over events.
  - **Walking is approximate:** straight line × 1.3 at 4.5 km/h; "walk" when ≤ 2.5 km. Otherwise a ferry: piers
    within 1.6 km of each stop (closest 3 per side), published departures only (pier-board rule), from the
    schedules the map uses (real timetable, holidays, Fri/Sat nights, simulated fallback → labelled); picks the
    earliest arrival at the next stop, then the earliest departure. Nothing real → "No transport info". No buses,
    metro, trams, suggestions, notifications or accounts.
  - Last ferry back: when a day's last stop is too far to walk to its first stop, the latest departure that
    gets back on that service day (incl. after midnight); warned when the plan ends after it.
  - Closed checks only with OSM hours (exact closing minute); POIs tapped on the map keep their OSM position.
  - Share link `#plan=1.<base64url JSON>`: kind, first day, days, per stop [type, ref, day, start, duration, name,
    (lng, lat for POIs)]; ≤ 2000 characters and ≤ 20 stops (names shortened → dropped first); a 3-stop evening is
    ≈ 290 characters. Decoding validates everything and never throws; missing places/events show "no longer
    available" with the saved name.
- **Nominatim:** ≤ 1 req/s, search only on submit (no autocomplete), bounded to our box, attribution shown.
- **Sound:** synthesised Web Audio, off by default, `audioSession = ambient` (iOS silent switch), reduce-motion = waves only.
- **Perf:** adaptive ladder (pixel ratio → particles/gulls → windows → flat buildings). Headless screenshots run
  ~2 fps: always use `?adaptive=0&intro=0`. Debug globals (`map`, `ferries`, `ui`, …) exist in dev builds only.

## Known issues
- Timetables: the PDF prints departures per pier, not which pier a Karaköy/Eminönü departure sails to on the
  Kadıköy/Üsküdar – Karaköy – Eminönü lines; we read rows as rounds (out K→Kr→E, back E→K direct), which fits the
  row layout, the footnotes and the sailing times. One Kadıköy berth for both the old (Eski) and new (Yeni) pier
  (night trips keep the PDF's note). Arife half-days run the normal timetable (PDF says nothing). Some Bosphorus piers
  are unserved (Boğaz Hattı commuter line, Kısa Boğaz Turu not included; Kandilli, Küçüksu, Tarabya, Yeniköy).
- Ferries of different lines pass through each other near shared piers (not fixed). Worst at Üsküdar since the
  commuter lines (≈15 min/day of two vessels < 40 m apart, was ≈1; Anadolu Kavağı – Üsküdar lays over 09:10–11:35
  in the outer slot), Beşiktaş ≈5, Kadıköy ≈85 (unchanged).
- Bebek → Arnavutköy is printed as 5 min; over our 1.64 km route that fits to ≈33 km/h (limit 34).
- Eminönü / Beşiktaş berths of Rumeli Kavağı – Eminönü: the Boğaz berths (PDF doesn't say).
- No events from CRR, Zorlu PSM, İBB Kültür (connect timeouts from GitHub runners, likely geo-blocking).
  Moda Sahnesi is on the map but its site publishes no dates (reseller only). Borusan Sanat / İKSV return 0
  between seasons/festivals. Event categories are guessed from titles.
- Overpass is often overloaded (504/500): the monthly places/stories jobs may keep last month's data for some areas.
- `stories.json` is ~630 KB (lazy-loaded); the main JS chunk is > 500 KB (build warning).
- Snapshots don't include DOM labels/pins. Sound and `?skyline=1` not yet judged on a real iPhone.
- Leftover branches `probe-run`, `probe-out`, `probe/holidays`, `probe/holidays-out` (the git proxy refuses deletion) — delete in GitHub.
- Actions warn about Node 20 deprecation for `actions/checkout@v4` / `setup-node@v4`.

## Roadmap (next sessions, in order)
1. ~~Real ferry timetables~~ — done (winter 2026-27). Next timetable ~27 Jun 2027: `scripts/timetables/README.md`.
2. ~~"Plan my evening / trip"~~ — done (no alerts: no notifications by design).
3. **Cleanup pass** — dead code, config consolidation, bundle splitting, test gaps, docs.
4. **Cartoon-style redesign** — a playful illustrated look across map, ferries, icons and UI.
