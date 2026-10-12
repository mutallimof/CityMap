# Istanbul Living City

Animated, mobile-first map of Istanbul: vapurs on the water, a colourful OSM city, places, events, history.
Live: **https://mutallimof.github.io/CityMap/** · default branch `phase-0` · public docs: `README.md` (portfolio
page; screenshots in `docs/screenshots/`, regenerate with `scripts/dev/shot.mjs`), `docs/data-sources.md` (every source,
licence, in-app credit, refresh) · ideas `docs/ideas.md` (stays an ideas list). The business plan `docs/plan.md` is
**not tracked** (gitignored 2026-10-12; read it with `git show v0.2.0:docs/plan.md`; never re-add it, never put
strategy / monetisation / scraper details in public docs). **No changelog / decisions / operations files** (don't
create them): project history = this file + git.

## Ground rules (from the user)
- Tags: `v0.1.0` = the look before the theme redesign; `v0.2.0` = the redesign, before the cleanup pass (tag pushes
  are refused by the session git proxy: tags are made by a one-off workflow on a `probe/tag-…` branch; leftover
  probe branches: `probe/tag-v0.2.0` — the session can't delete remote branches, the user may).
- Work autonomously; commit and deploy as you go (every push to `phase-0` deploys). Summary + link + "what to try" at the end.
- **No open-source licence** — the user keeps all rights.
- **Real data only.** Coordinates only from OSM (or geocoded from an official address) — never typed from memory.
  No demo/fake posts. Each line is labelled "Official timetable" or "Simulated schedule"; OSM attribution always visible.
- No API keys, no backend: static data + keyless services (OpenFreeMap, Open-Meteo, Nominatim).
- Priorities: beauty and smooth ferry motion → 60 fps on a mid-range phone → correctness (ferries never cross land;
  positions are a pure function of clock time). Respect reduce-motion everywhere.
- **Every visual constant lives in `src/config.ts`** (shared tunables + the Classic look) **or in its theme's file in
  `src/themes/`** (one file per look). Record decisions in this file.

## Current state (2026-10-12, switchable looks: Toy (default), Classic, Storybook, Night)
- **Ferries:** 7 Şehir Hatları lines (as the operator runs them), 27 OSM piers with berths, **real timetables**
  (winter 2026-27 PDF, valid to 27 Jun 2027; simulated fallback per line, labelled) — `src/sim`, pure.
  Lines (PDF page): Kadıköy – Karaköy – Eminönü (4), Üsküdar – Karaköy – Eminönü (5), Kadıköy – Beşiktaş (+ Fri/Sat
  night via Karaköy, 6), Kabataş – Adalar (12–13), Rumeli Kavağı – Eminönü (22), Anadolu Kavağı – Üsküdar (28),
  Uzun Boğaz Turu (35). Weekday peak ≈ 20 vessels at once (19:14).
  Piers added for the commuter lines (all OSM): Büyükdere (way/592032187, pier building), İstinye (node/6502486594),
  Beykoz (way/739105702), Paşabahçe (way/525436007), Çubuklu (way/525436006 passenger pier, not the car ferry).
  Procedural 3D vapurs (three.js custom layer): wake, bob, docking, smoke, horn rings, splash, gulls, Follow glide.
  Several vessels at one berth moor side by side (up to 4 at Kadıköy on a weekday).
- **City:** OpenFreeMap vector tiles in our palette; day→golden→night from the real sun; live weather + seasons;
  re-packed 3D buildings with night windows; forests green all year with seasonal tree crowns.
- **Places:** ~380 featured pins (67 curated + 286 auto-picked + 23 event venues) + tile POIs by zoom;
  place sheet with hours/website/phone (Nominatim lookup on open), Story section, upcoming events.
- **Stories:** 509 historic places (Wikidata/Wikipedia/Commons), book markers.
- **Events:** ~340 events from 24 configured venues (daily scrape), glow/pulse on pins, chips
  Today · This weekend · Workshops · Free.
- **UI:** React over the map; filters = plain on/off chips (categories, Open now, event chips; several at once; an
  active chip is filled with a count; "Clear" while any is on); search; guides; map style picker (themes);
  pier boards with printed times + source credit; per-line "Official timetable" / "Simulated schedule" label;
  snapshot share; PWA; TR/EN; city sound from real recordings (off by default, see Sound); golden gulls tell facts; `?skyline=1` night test mode.
- **Plan** (`src/plan`): Evening / Day / Several days; "Add to plan" on place sheets and event rows; timeline sheet
  grouped by day (reorder, times, durations, remove); between stops only real connections (approx. walk / the
  actual ferry / "No transport info"); optional start / end point (hotel, home: search, map tap or my location;
  end defaults to "same as start"; per-day change on several-day plans) connected the same way; warnings (closed,
  closes during visit, hours unknown, overlap, arrives late, gone — no "last ferry" warning); stops numbered on the
  map, start / end as rings, ferry legs on their real lanes; saved on the device; share link `#plan=` (read-only
  view + "Copy to my plans"; start / end only with the share dialog's toggle, off by default).

## Themes (switchable looks, `src/themes`)
- A theme is a `ThemeSpec` (`src/themes/types.ts`): base palettes (day / sunset / night), city palettes + seasons,
  shore / piers / routes, water, wake, vapur colours, night lights, smoke, gulls, light, weather colours, icon
  colours, label colours + fonts, guide / plan colours, `style` knobs (water marks, building caps, toy vapur, bubble
  pins, 3D trees / landmarks, paper grain, heat glow…) and `ui` (CSS tokens day + night, extra CSS, lazy `assets`).
- **Classic** (`classic.ts`) = the original look, built from CONFIG (no visual change: screenshots diff within
  animation noise vs v0.1.0). Drawing code reads `look()` (never CONFIG for themed values).
- **Add a theme:** one file `src/themes/<id>.ts` exporting `defineTheme({ id, name, blurb, card, …only what
  changes })` (deep-merged over Classic; arrays replace) + one line in `THEMES` (`registry.ts`). The registry test
  checks every theme has Classic's shape. Day/night from the sun, live weather and seasons apply to every theme
  (they blend the theme's own palettes).
- Choice: `?theme=<id>` (test switch, not saved) › saved on the device (`localStorage theme:v1`) › `DEFAULT_THEME`
  = **toy** (decided 2026-10-12: the friendliest, clearest look and the brief's main theme; Classic stays
  selectable). index.html's tiny loader script repeats that default to paint the loading screen per look.
  Switcher: palette button in the top bar → preview cards (`src/ui/ThemePanel.tsx`, original mini-map SVGs).
- **Live switch**, no reload: a soft veil in the new land colour (`src/themes/dom.ts`, instant with reduce-motion),
  then every module re-reads the look: `retheme()` on CityLook, VapurLayer (+ gulls), WeatherLayer, PlaceLayers,
  DaylightController (re-applies palette / water / light), `basePaint` / `guidePaint` / `planPaint` triples,
  `setLabelFonts`; the HUD gets `data-theme` + a generated `<style>` of tokens. React re-renders via `useTheme()`.

- **Pins** (`style.pins`): 'classic' = shape pins; 'bubble' = round glossy bubbles with a white rim, category glyph,
  short tail and ground shadow (`bubbleCanvas` in `src/places/icons.ts`, also used by lists / legend); bubbles glow
  only for an event today. Bubble pins "bounce in" by zoom: `featuredSize()` overshoots ×1.18 as each rank appears
  and settles within 0.4 zoom (pure function of zoom). Rank fade-in / collisions unchanged.
- **HUD tokens:** `--font-display` (headings, chips, clock), `--plan`, `--plan-end`, `--link`, `--warn`, `--guide`
  (defaults = Classic in `ui.css`); theme fonts are OFL @fontsource packages loaded by `ui.assets` (lazy).

### Toy theme (`src/themes/toy.ts`)
- Saturated pastels, cream land, cream roads with white casings; water: 3 soft colour bands, white coastal foam
  line + two breathing contour ripples (screen-px wide, from metres-per-pixel — not `fwidth(d)`, the 8-bit coast
  field is too noisy), drifting little wave marks in world-fixed cells sized in px (octave-blended like the
  glints, `style.water`). Night = navy/purple with lit windows on walls only.
- **Roof caps** (`style.buildings.cap`): the building worker also emits layer `r` = each building's outer ring
  inset by `CONFIG.city.roofInsetM` (mitred offset, centroid-shrink fallback; `a` = √area m) when the tile URL has
  `?r=`; layer `city-roofs` extrudes it `capM` thick on top in a roof palette (`city.day/night.roofs`, footprints
  > 80 m take the wall colour). Gives a soft rim and **no lit windows on rooftops** (the cap covers the roof).
  Heights × `heightScale`, ≥ `minFloors`; gentler shading (`light`, no wall gradient). Switching themes swaps the
  building tile URL (`buildingTilesUrl()`), so Classic never pays for roofs.
- **Scenery** (`src/scenery`, lazy-loaded three.js layer `scenery`, only for themes with `trees3d` / `landmarks3d`):
  lollipop trees on a world-fixed jittered grid inside the real OSM woods / parks / gardens of the loaded tiles
  (`scatter.ts`, tested; ≤ 3200, from z14.6, crowns from the city palette incl. season / snow / night lift);
  hero landmarks from primitives (`models.ts`: Galata Tower, Maiden's Tower, Hagia Sophia, Blue Mosque,
  Süleymaniye, Dolmabahçe) at their OSM footprints (`data/hero-landmarks.json` ← `npm run data:hero-landmarks`
  from OFM tiles: the building polygon under the OSM POI, oriented box, height); 3D bridges along the OSM bridge
  lines (suspension towers where the deck meets the shore, from the coast field). Models replace their pins /
  stars / story markers (names via `hero-labels`); tapping a model opens its place (featured pin, else the OSM
  building). The worker drops OSM buildings under hero footprints (`?x=1`). Constants: `CONFIG.scenery`.
- UI: Fredoka (OFL, @fontsource/fredoka) for headings / chips, white-rimmed chunky controls (`ui.css`).
- Toy vapur (`style.vapur.model`): rounder hull with bevelled edges, tall cabin, big funnel, cel shading
  (`style.toon` → `src/three/materials.ts`) and a constant-px outline (smooth-normal shell, back faces).

### Storybook theme (`src/themes/storybook.ts`)
- Golden land, teal water (bands, dark-teal ink coastline + contour lines, sparse ink wave marks, **watercolour
  pooling** `style.water.pool`: darker wobbly edge + pigment granulation), sage parks, terracotta roofs (caps),
  slightly lower blocks, warm night with lit streets; **paper grain + vignette** over the map only
  (`applyPaper`, generated texture, `mix-blend-mode: multiply`, `style.paper`); classic vapur with a thin ink
  outline; Fraunces headings / district names, Patrick Hand place / street / pier names.

### Night theme (`src/themes/night.ts`)
- Navy land and sea all day (day = a lighter blue hour, dusk pinker, night deepest; weather still applies), streets
  glowing by day too (`style.dayGlow`), cyan coast foam, neon-outlined vapurs, glowing bubble pins (`pinGlow`) and
  names (`labelBlur`), dark HUD always. **Glow clouds** (`style.heat`): heatmap layer `place-heat` on the featured
  places source — real data only: place density, venues with an event today weigh 1, well-known places 0.32,
  others 0.18; under roads / buildings, fades out by z17. No 3D trees / heroes (kept clean).

### Fonts (all SIL OFL 1.1, self-hosted from @fontsource packages; credits page `public/fonts-credits.html`)
| Font | Used for | Copyright |
|---|---|---|
| Nunito | interface text (all styles); Cyrillic names in themed map labels | The Nunito Project Authors |
| Fredoka 500/600 | Toy headings, chips; Toy map labels ("Toy Rounded") | The Fredoka Project Authors |
| Patrick Hand | Storybook map labels ("Storybook Hand") | Patrick Wagesreiter |
| Fraunces 600 | Storybook headings, district names ("Storybook Serif") | The Fraunces Project Authors |
- Map label fonts use MapLibre 6's style **`font-faces`** (`src/themes/fonts.ts`: woff2 files bundled with `?url`,
  Latin + Latin Extended + combining marks, drawn locally with TinySDF). Nothing downloads until a label uses it.
  Classic labels keep OpenFreeMap's Noto glyphs. Rule for new fonts: OFL only, self-hosted, add here + credits page.

## Sound sources (all Wikimedia Commons; licence and author re-checked on each file page by `data:audio`)
| File(s) | Commons file | Author | Licence |
|---|---|---|---|
| `hum` | Galata Kulesi Sabah Ses.wav, Galata Kulesi Öğlen Ses.wav, Galata Kulesi Akşam Ses.wav (Istanbul, from Galata Tower) | Asibala | CC0 |
| `harbour` | Sunday in the city street noise1.ogg (seaside town: traffic, gulls, people) | cori (pdsounds.org) | Public domain |
| `water` | Algemene sfeer van het havengebied Rotterdam - SoundCloud - GvNL-Steim Workshop.ogg | GvNL-Steim Workshop (Geluid van Nederland) | **CC BY 3.0** |
| `street` | Karlova 0001.ogg (Prague street) + Restaurant ambience.ogg | Juan de Vojníkov; stephan (pdsounds.org) | Public domain |
| `rain` | Light Rain Distant Thunder July 5th 2016.wav | kvgarlic (freesound.org) | CC0 |
| `wind` | Killiney Hill Storm Floris 20250804 1537.ogg | Karlunun | CC0 |
| `gull-1`, `gull-2` / `gull-3` | Gull 1.ogg / Gull 2.ogg | avphillips (pdsounds.org) | Public domain |
| `gull-4` | XC707075 - European Herring Gull - Larus argentatus.mp3 | Sonothèque ADVL (xeno-canto) | CC0 |
| `gull-5` | Western Gull Golden Gate National Recreation Area.ogg | U.S. National Park Service | Public domain |
| `pier` | Squeaks and twangs of Barking Riverside Pier.ogg | JoBrodie | CC0 |
| `horn` | Cruise ship Albatros ship horn.ogg | Tvabutzku1234 | CC0 |
| `foghorn` | Fog signal Bremerhaven.ogg | Tvabutzku1234 | CC0 |
| `bell` | WWS ShipSodekshipsbell.ogg | Work With Sounds / National Maritime Museum in Gdańsk | **CC BY 4.0** |

Pages: `https://commons.wikimedia.org/wiki/File:<name>`. CC BY files are credited in the attribution bar while
sound is on (→ `public/audio/credits.html`, generated with links). Rule for new sounds: CC0 / PD preferred, CC BY only
with that credit; never BY-SA/NC. Cut points in `data/catalog/sounds.json`; beds ≥ 60 s. Note: the Galata clips were
also uploaded identically (CC0) by Kübradereli1 as "GALATA TOWER MORNING/NOON/EVENING audio.wav".

## Commands
```bash
npm install
npm run dev        # :5173 · ?t=18:30 ?date=2026-10-12 ?speed=60 ?debug=1 ?stress=40 ?weather=rain|snow|fog&season=spring
                   #   ?adaptive=0 (screenshots) ?intro=0 ?skyline=1 ?view=lng,lat,zoom[,pitch,bearing] (initial camera, no intro)
                   #   ?debug=0 ?motion=reduced|full ?theme=<id> · #place= #pier= #guide= #plan= · keys: ` panel, s speed, n now
node scripts/dev/shot.mjs out.png "adaptive=0&intro=0&debug=0&view=29,41.02,14" [waitMs]   # headless screenshot (real WebGL
                   #   via SwiftShader, needs the dev server; ~5 fps; never move the camera — jumps crash headless Chromium)
npm test           # vitest
npm run typecheck
npm run build      # validate:routes + validate:timetables + typecheck + vite build → dist/
npm run validate:data   # gate for refreshed data incl. timetables (also runs in the refresh job)
python3 scripts/timetables/parse-tarife.py data/raw/tarife.pdf && npm run data:timetables   # new timetable PDF
npm run data:audio      # sounds.json → public/audio (needs ffmpeg + Commons: run in Actions, not the sandbox)
node scripts/build-icons.cjs   # public/icons/icon.svg → PWA icons + iOS splash PNGs (Playwright)
```
- **Screenshot regression check** (used for the cleanup pass): fixed scene `motion=reduced&t=12:00&date=2026-10-12&
  weather=clear&season=autumn&theme=<id>&view=28.985,41.02,14.2,45,0` (+ night street zoom `t=21:30 …
  view=28.9765,41.0255,15.8,50,20`), each look, vs a dev server of the previous tag in a `git worktree` on another port.
  The worktree needs a real (hard-linked: `cp -al`) `node_modules`, not a symlink — Vite refuses `/@fs` files outside
  its root, fonts 403 and the HUD shifts. Same code ⇒ pixel-identical apart from moving vessels.

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
| `hero-landmarks.json` | `data:hero-landmarks` (catalog `data/catalog/hero-landmarks.json`) | OFM tiles | manual |
| `venue-places.geojson` | `data:venues` | OFM tiles + Nominatim fallback | manual |
| `events.json`, `events-log.json`, `event-venues.geojson`, `venue-geocode.json` | `data:events` | venue sites + Nominatim | **daily 06:17 Istanbul**, Actions |
| `stories.json` | `data:stories` | Overpass + Wikidata + Wikipedia + Commons | **monthly (3rd)**, Actions |
| `places-auto.geojson` | `data:featured` | Overpass | **monthly (3rd)**, Actions |
| `public/audio/*.webm/.m4a`, `credits.html` | `data:audio` (`scripts/audio/build-audio.py`) | Wikimedia Commons, list in `data/catalog/sounds.json` | manual, in Actions |

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
Grouped by feature; tests sit next to what they test (`*.test.ts`); non-obvious modules start with a header comment.
- `src/sim` pure schedule / state: `schedule.ts` (trips → legs → vessels), `real.ts` (real timetables), `fleet.ts`
  (poses, docking, slides), `berths.ts` (abreast slots), `network.ts`, `path.ts`, `motion.ts`, `time.ts` + tests.
- `src/ferries` vapur layer, model, wake, gulls, smoke, lights; `ferries/ui/` pier board (`PierSheet`), vessel sheet
  (`VesselSheet`), timetable badge / credit (`timetable.tsx`).
- `src/water` shader + coast distance field · `src/map` style, city (OFM) layers (`city.ts`) + their generated pattern
  textures (`city-patterns.ts`: crowns, tulips, night windows) + colours (`city-look.ts`), buildings protocol / workers,
  labels, intro camera, skyline · `src/scenery` toy trees / hero landmarks / bridges · `src/three` shared renderer,
  `LocalFrame`, toon materials.
- `src/places` stores, filters, layers, icons, opening hours; `places/ui/` sheets, feed, extras · `src/events`,
  `src/stories`, `src/guides`, `src/search`, `src/share` (snapshot), `src/fun` (gull facts), `src/osm` (Nominatim).
- `src/plan` planner (pure `model.ts` / `timeline.ts` / `share.ts`, `store.ts`, `runtime.ts`, `ui.tsx`, `points.tsx`).
- `src/audio` city sound (`mix.ts` pure levels, `engine.ts` Web Audio) · `src/weather` conditions, palette under
  weather (`look.ts`), icon, rain / snow layer · `src/time` sun position + day/golden/night palette blend (`palette.ts`).
- `src/themes` looks (registry, Classic, Toy, Storybook, Night, live switch, fonts) · `src/ui` React HUD (App, top bar,
  chips, sheets, store, i18n) · `src/app` daylight, perf ladder, clock, PWA · `src/data/load.ts` data fetchers ·
  `src/debug` dev panel · `src/config.ts` shared tunables + the Classic look · `src/main.tsx` boot.
- `scripts/` data builders, validators, scrapers (Turf only here); `scripts/timetables` PDF parser; `scripts/dev`
  headless screenshots.
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
  each berth is used by the lines listed in `lines.json` (Eminönü and Beşiktaş have two OSM berths). Each berth is approached from the side the raw A* water path arrives from (not the
  other pier's straight-line side — that made hairpins in İstinye bay).
- **Berth slots** (`src/sim/berths.ts`, pure, per berth): each dock stay takes the lowest abreast slot free when it
  arrives (0 = quay, 1, 2, … hull to hull outside, 1.25 beams between centres, seaward only) and keeps it until it
  leaves; occupancy padded 120 s both sides; the previous service day's late stays are carried in with the slots
  that day gives them alone (no change at midnight). A docking turn whose window meets another stay at the berth is
  "tight": not swung on the spot but sailed over the first / last 160 m of the leg (direction fixed by the course
  at 160 m, so U-turns never flip). Slot offsets ease in over `berthBlendM` (≤ half a short leg). Overflow never
  moves to a pier's other OSM berth: its approach isn't routed/validated against the coast. Test: no docked hulls
  overlap at any pier over a weekday and a Sunday (real size and ×3.9, incl. a pier's two OSM berths); 1 s smoothness.
- **Blocked stays slide along the quay** (2026-10-12): a stay with a vessel moored OUTSIDE it when it arrives /
  leaves (`DockInfo.blockedIn/Out`, berths.ts) doesn't cross that hull: over `slideM(hullM)` of route it first
  slides along the quay (towards the side the route goes / comes from, astern if need be) by
  min(1.2 hulls, 0.8 × slide distance), then swings out / in (turn direction fixed by the course where the slide
  ends). `hullM` = drawn hull length passed in `DockingParams` each frame (pure f(schedule, t, zoom)); the wake
  re-samples poses with the same berth info (`poseAt`). Test: no crossing at ×1.3 over a weekday; ≤ 60 s/day at
  ×3.9 (only the 456 m Karaköy–Eminönü legs, shorter than two city-zoom hulls).
- **Sibling berths spread** for long drawn hulls: berths of one pier < 350 m apart (`berthSpread`, network.ts) move
  half the shortfall (1.08 hull − gap) apart along the line between them, weighted like the slot offset — Eminönü's
  two berths (127 m) no longer overlap at city zoom; at real size nothing moves.
- **Pier names on top** (`map.moveLayer(label-pier)` at the end of boot): drawn over docked hulls and placed first.
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
- **Filters:** `src/places/filters.ts` is the single rule for pins, feed, hint and chip counts (`chipCount`); chips
  are plain toggles (no "All", no reset when every category is on — decision 2026-10-12); with any filter on,
  matches show at every zoom; tile POIs hide only for Open now / event chips; story markers follow Culture.
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
  - **Start / end points** (`PlanPoint` = name + position; `plan.ends`, per-day `plan.dayEnds[day]`, a field set
    there — incl. null = none — overrides; end absent = "same as start", following that day's start): start → first
    stop = walk timed to arrive on time, else the ferry you can leave for latest that still arrives (none → the
    soonest after 2 h before, + "arrives late"); last stop → end = same rule as between stops. Only on days with
    stops. Picked by search (`localSearch` / `osmSearch` from `src/search`), map tap (`setMapPick`, one reverse
    Nominatim lookup for a name) or device location (once, on tap; must be in our box). `src/plan/points.tsx`.
  - **No "last ferry" warning** (removed): we only have Şehir Hatları; Turyol, Dentur etc. often run later.
  - Closed checks only with OSM hours (exact closing minute); POIs tapped on the map keep their OSM position.
  - Share link `#plan=1.<base64url JSON>`: kind, first day, days, per stop [type, ref, day, start, duration, name,
    (lng, lat for POIs)]; ≤ 2000 characters and ≤ 20 stops (names shortened → dropped first); a 3-stop evening is
    ≈ 290 characters. Start / end only when the share dialog's toggle is on (off each time): `e` {s, e} for the
    plan, `d` [[day index, {s, e}]] per day; point = [name, lng, lat], 0 = none, 1 = same as start. Still version
    `1.`: links without `e`/`d` (all older links) open and start at the first stop (test keeps a real old link).
    Decoding validates everything and never throws; missing places/events show "no longer available".
- **Attribution bar** (MapLibre's own, bottom right, lifted 140 px above the sheet's peek): OSM, OpenFreeMap /
  OpenMapTiles, "Weather data by Open-Meteo.com" (`src/weather/credit.ts`, off for `?weather=` demos) and, while sound
  is on, the sounds credit. Extra credits ride on an empty source + invisible layer (`src/map/credit.ts`). Trap:
  maplibre-gl.css is imported after styles.css, so overrides of `.maplibregl-ctrl-*` need the extra
  `.maplibregl-control-container` class (the lift silently did nothing before 2026-10-12: the bar sat under the sheet).
- **Deep links** (`src/ui/deeplink.ts`, pure, tested): a malformed `%` escape is ignored, never thrown; `hashchange`
  opens a link pasted into an open tab. A boot error removes the loader and shows above it.
- **Accessibility (2026-10-12):**
  - **Contrast** — every UI token pair is ≥ 4.5:1 (WCAG AA) in each look, day and night: `src/themes/contrast.ts` (pure,
    knows the cascade: ui.css `:root` + night block < the look's `vars` < its `nightVars`) and
    `contrast.test.ts` (ink / muted / link / warn / ok / bad / gold-ink on the panel and on a tinted panel, accent-ink on
    accent, chip-on-ink, plan-ink, guide-ink, attribution pills over a black and a white map). New tokens: `--ok`,
    `--bad`, `--gold-ink`, `--plan-ink`, `--guide-ink`, `--attrib-bg`, `--attrib-ink` (defaults in ui.css). Rule: a new
    text colour = a token in the test, never a hard-coded hex in CSS. Toy / Night buttons use dark ink on the bright
    coral / pink accent (white failed), Storybook's terracotta and Toy's blue got a notch darker.
  - **Tap targets** — controls keep their size; an invisible `::after` (end of ui.css, `inset: min(0px, calc((100% - 44px) / 2))`)
    gives iconbtn / chip / pill / fab / close buttons / segmented buttons a ≥ 44 × 44 hit area. Neighbours are ≥ 8 px apart
    (top-bar icons: 36 px + 9 px), segmented buttons abut and stretch vertically only. Scrollers clip a pseudo-element, so
    `.chips`, `.sunset__spots` and `.place` carry the padding for it. Text links in credits / contact rows are 44 px lines;
    every attribution credit is a link in its own 44 px row, drawn as a small pill (`--attrib-*`). Trap: don't put the
    hit area on an element with `all: unset` (position resets).
  - **Escape** closes the top-most thing (`src/ui/escape.ts`: search, map style, legend, time, sheet, expanded feed); a dialog
    that handles Escape itself (plan share) calls preventDefault first. aria labels use the language setting.
- **Nominatim:** ≤ 1 req/s, search only on submit (no autocomplete), bounded to our box, attribution shown.
  `osmSearch` (`src/search/osm.ts`): `null` = unreachable ("Couldn’t reach search"), `[]` = nothing found ("No results").
- **Sound** (`src/audio`; constants `CONFIG.sound`): real recordings only (list + licences under "Sound sources").
  - `mix.ts` (pure, tested) = levels from sun (`theme.night`), zoom (closeness z11 → z15.5), water share around the
    view centre (coast field, radius 260 m at z16, doubling per zoom out) and the scene's weather. Beds: **harbour**
    (day shore), **water** (lapping; the night shore), **hum** (zoomed out + inland/night background; Istanbul from
    Galata Tower), **street** (inland close in, mostly day), **rain**, **wind** (6 → 15 m/s). Rain/snow/wind push the
    city beds back; fog and snow close a low-pass (16 kHz → 900 Hz). One-shots as Poisson streams (≥ 4 s apart,
    random clip, pitch ±8%, pan, volume 40–100%): gulls (day, by the water), ship's bell, pier creaks (close in on the
    shore), fog signal (fog only). **Horns** only for real (timetabled) departures within `hearM·2^(13−z)` of the
    centre, ≤ 1 per 20 s (`HornGate`).
  - `engine.ts`: beds play random 22–48 s stretches of a ≥ 65 s file, 5 s crossfades, two voices panned ±0.55 →
    no audible loop. Context at 32 kHz; beds load when first needed and are dropped after 150 s silent. Nothing is
    created or fetched until the switch is on (test). Opus `.webm` where `canPlayType` says "probably", else / on
    decode failure AAC `.m4a` (iOS). `audioSession = ambient` (silent switch); context suspended while the tab is
    hidden or sound is off. Reduce-motion = beds only (no one-shots, no horns). Debug global `sound` (`sound.mix`).
  - Credit: while sound is on the attribution bar shows "Sounds: Wikimedia Commons …" → `audio/credits.html`.
  - Budget: Opus 1.48 MB, AAC 1.76 MB for everything (one format per visitor; usually only 3–4 beds load). Build
    fails over 2 MB per format. **No call to prayer** (none in the files; Galata clips checked on a spectrogram).
- **Perf:** adaptive ladder (pixel ratio → particles/gulls → windows → flat buildings). Headless screenshots run
  ~2 fps: always use `?adaptive=0&intro=0`. Debug globals (`map`, `ferries`, `ui`, …) exist in dev builds only.

## Known issues
- Not done on purpose (accessibility, next steps): viewport zoom is still locked (index.html), no focus trap in
  sheets / dialogs and no focus return, map pins are not keyboard-reachable (list view / feed is the keyboard path).
- `docs/plan.md` and the removed `docs/design-pass/*.jpg` screenshots are untracked / deleted now but still in the
  public git history (rewriting history would break tags and clones; not done).
- Fixed 2026-10-12: pin images that change size (the bar icon's night glow, a theme switch) threw in
  `updateImage` and aborted the night / theme refresh (latent since v0.1.0); `put()` now re-adds on a size change.
- Planner "freeze" (a stop near Kadıköy + one across the water): not reproduced. `src/plan/perf.test.ts` builds such
  plans (weekday, Sat night, holiday, simulated dates; start points, several days, share round trip) under a timing
  guard — each ≤ ~20 ms; in the app a #plan= link with a Karaköy → Kadıköy → Karaköy ferry evening adds no long tasks.
  Note: a Moda café is > 1.6 km (walk × 1.3) from Kadıköy pier, so its legs say "No transport info" by design.
- Timetables: the PDF prints departures per pier, not which pier a Karaköy/Eminönü departure sails to on the
  Kadıköy/Üsküdar – Karaköy – Eminönü lines; we read rows as rounds (out K→Kr→E, back E→K direct), which fits the
  row layout, the footnotes and the sailing times. One Kadıköy berth for both the old (Eski) and new (Yeni) pier
  (night trips keep the PDF's note). Arife half-days run the normal timetable (PDF says nothing). Some Bosphorus piers
  are unserved (Boğaz Hattı commuter line, Kısa Boğaz Turu not included; Kandilli, Küçüksu, Tarabya, Yeniköy).
- Lines still pass through each other near shared piers (under way). City zoom only: a few seconds a day on the
  456 m Karaköy–Eminönü legs a sliding vessel still touches a moored one (hulls drawn longer than the leg).
- Bebek ↔ Arnavutköy (checked 2026-10-12, times unchanged): the PDF prints departures 5 min apart (e.g. Bebek 08:20,
  Arnavutköy 08:25); with the 1 min dwell the sim sails 4 min. The OSM piers are 1.09 km apart in a straight line,
  but our lanes run 1.55 km (→) / 1.67 km (←) around Akıntıburnu (≥ 60 m from land + lane offset): avg 23–25 km/h,
  cruise 31 / 33.5 km/h with the 60 s ramps. Over a ~1.2 km line it would cruise ≈ 24 km/h, normal for a vapur:
  the timetable is plausible, the speed comes from our route length. A tighter route around the cape would fix it.
- Kadıköy old / new pier (night trips' PDF notes "Kadıköy (Eski)" / "(Yeni) İskelesi"): OSM has no pier named or
  tagged as either — only "Kadıköy 2 İskelesi" (our berth, relation/19464376), unnamed / "Kadıköy" ferry terminals
  and private (Turyol) piers — so mapping them would be guesswork; one berth stays, the board keeps the PDF's note.
- Eminönü / Beşiktaş berths of Rumeli Kavağı – Eminönü: the Boğaz berths (PDF doesn't say).
- No events from CRR, Zorlu PSM, İBB Kültür (connect timeouts from GitHub runners, likely geo-blocking).
  Moda Sahnesi is on the map but its site publishes no dates (reseller only). Borusan Sanat / İKSV return 0
  between seasons/festivals. Event categories are guessed from titles.
- Overpass is often overloaded (504/500): the monthly places/stories jobs may keep last month's data for some areas.
- `stories.json` is ~630 KB (lazy-loaded); the main JS chunk is > 500 KB (build warning).
- Snapshots don't include DOM labels/pins. Sound and `?skyline=1` not yet judged on a real iPhone.
- Sound: only the hum bed and Galata are Istanbul recordings; harbour/street/rain/wind/gulls/horn are from elsewhere
  (no open-licence Bosphorus / vapur recordings on Commons; Freesound needs a login and its robots.txt blocks
  search/API). The horn is a cruise ship, not a vapur. Gulls are herring/western gulls (Istanbul's are yellow-legged).
- Actions warn about Node 20 deprecation for `actions/checkout@v4` / `setup-node@v4`.

## Performance notes (2026-10-12, headless Chromium in the sandbox — JS time per frame, not GPU)
- Busiest moment (Mon 19:00, z11.6) and `?stress=40` (z12.4), Classic and Toy: ferries 1.9–2.8 ms, water 0.2–0.4 ms,
  toy scenery 0.4–0.5 ms per frame; Toy over parks at z15.4: ~2000 trees, scenery 0.7 ms; a tree refresh (moveend,
  debounced) 8–13 ms. GPU cost on a real iPhone 13 is **not verified** (no device here).
- Adaptive ladder: resolution → fewer particles + half the trees + no gulls → no lit windows → no 3D trees → flat
  buildings. Tree crowns are 80-triangle icosahedra, ≤ 2600 instances.
- No per-frame allocation of colours, projection matrices, the ferry layer's id set / trail list / gull targets or
  the gulls' lookup; the sim still builds pose objects per frame (`fleetAt`), small.
- Bundle: app chunk ≈ 312 kB (112 kB gz); MapLibre, three.js and React in their own long-cached chunks; theme fonts
  (CSS + woff2) and the scenery layer load only when a look needs them.

## Roadmap (next sessions, in order)
1. ~~Real ferry timetables~~ — done (winter 2026-27). Next timetable ~27 Jun 2027: `scripts/timetables/README.md`.
2. ~~"Plan my evening / trip"~~ — done (no alerts: no notifications by design).
3. ~~Cartoon-style redesign~~ — done (2026-10-12): theme registry + Toy / Storybook / Night, Classic kept.
4. ~~Cleanup pass~~ — done (2026-10-12): dead code / config / strings / CSS removed, ferry UI and city patterns
   regrouped, header comments, new tests, README + data-sources, plan.md untracked. Screenshots unchanged.
5. **Real iPhone pass** — judge the looks on a device (GPU, battery), tune tree counts / roof caps there.
6. ~~Open-Meteo credit~~ — done (2026-10-12): attribution bar, see Key decisions.
