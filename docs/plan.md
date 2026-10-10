# Istanbul Living City App — Production Plan

Oct 10, 2026

## 1. Vision

**One app where Istanbul is alive on a map: ferries moving on the Bosphorus, what's open, what's on tonight, and every place's own feed.** Working name: *Istanbul Living City* (rename later).

**Who it's for:** locals (commute by vapur, find tonight's plan, follow favourite places) and tourists (understand the city at a glance, ride the ferries, eat well, see a play or concert). Both get the same map; tourists get English-first labels and a "first day in Istanbul" layer.

**Why the map is the dealbreaker.** Every competitor (Google Maps, Yemeksepeti, Biletix, municipal apps) is a list with a map attached. Ours is a map that feels like a living toy. If the first 10 seconds make people say "wow, I can see every vapur on the water right now", they share it, they come back, and businesses want to be on it. That pull is what brings in data partners and contributors. So the build order is: **beauty and motion first, then usefulness, then breadth.**

**The three promises of the product**

1. **See the city move** — ferries, crowds, events, day and night, in real time.
2. **Know what's happening** — menus, shows, mall shops, opening hours, each with its own feed.
3. **One app, not twelve** — transit, food, culture and shopping in one place, growing into a virtual Istanbul.

## 2. Feasibility

**One person with Claude Code can build the prototype and a working MVP of the map. The full "everything app" needs a small team, mainly because of data, partnerships and moderation — not code.**

| Stage | What exists at the end | People | Time |
| --- | --- | --- | --- |
| Phase 0 — Prototype | Web demo of the animated map with simulated vapurs | 1 + Claude Code | Rough demo in a weekend; polished in 1–2 weeks |
| Phase 1 — MVP | Real ferry timetables, piers, places near piers, iOS/Android beta | 1–2 | 2–4 months |
| Phase 2 — Launch | Restaurant/theatre/mall feeds, business accounts, public launch | 3–5 | 6–9 months more |
| Phase 3 — Digital city | Social layer, virtual Istanbul, many more data partners | 8–15 | 1–2 years |

**What Claude Code is great at here**

- Map rendering, shaders, animation loops and interaction code.
- Data pipelines: coastline data, timetables, pier and route files.
- Backend APIs, database schema, business admin panel, tests, deploy scripts.
- Fast iteration: "make the wake longer", "add sunset colours".

**What a human must do**

- Art direction taste: decide how it should feel; give reference screenshots.
- Real-world data deals: Şehir Hatları, Turyol, Dentur, malls, theatres, restaurants.
- App store accounts, legal entity, KVKK (Turkish data protection) decisions.
- Ground truth: check that the vapur really left Karaköy at 14:15.

**Hiring order when growing:** (1) designer/motion artist, (2) partnerships person in Istanbul, (3) mobile/backend engineer, (4) community/content moderator.

## 3. Scope by phase

**Each phase must be lovable on its own; nothing from a later phase gets built early.**

**Phase 0 — Prototype (the "wow" demo)**

- Stylized Istanbul map with real coastline: Bosphorus, Golden Horn, Marmara coast, Princes' Islands.
- ~20 real piers, 6 real ferry lines, ferries animated on a simulated timetable.
- Tap a vapur → card with line, next stop, ETA. Tap a pier → next departures.
- Day/night cycle tied to real Istanbul time, plus a time-speed slider.
- Runs in a mobile browser. Goal: show people and get reactions, not users.

**Phase 1 — MVP (useful every day)**

- Real timetables for Şehir Hatları first, then Turyol and Dentur.
- Ferry trip planner ("Kadıköy → Beşiktaş, next 3 departures").
- "Near the pier" layer: 5–10 hand-picked cafes and restaurants around each pier.
- Favourites, push alert "your vapur leaves in 10 min". TR + EN.
- iOS + Android beta, 200–500 testers.

**Phase 2 — Launch (the city's feeds)**

- Place pages with their own feed: restaurants (menus, specials), theatres (shows, ticket links), malls (floor map, shop feeds).
- Business accounts: a web dashboard to post updates and edit menus.
- "Tonight" layer: events in the next 3 hours on the map.
- User contributions: report a delay, crowd level, menu photo (moderated).
- Metro, Marmaray, tram on the map as quieter lines.

**Phase 3 — Digital city (virtual Istanbul)**

- 3D landmarks (Galata, Maiden's Tower, mosques, bridges) and neighbourhood moods.
- Social: friends on the map (opt-in), plans, "who's going".
- Virtual Istanbul: explore remotely, seasonal events, collectible ferry rides, maybe AR at piers.
- Civic layer if useful (pharmacy on duty, İstanbulkart balance, announcements).

## 4. Prototype spec (Phase 0) — THIS IS WHAT TO BUILD NOW

**A mobile-first web page: a tilted, stylized map of Istanbul's waters where 20–40 vapurs sail on a simulated timetable, with tap-to-inspect and a day/night cycle. It must run at 60 fps on a mid-range phone.**

### 4.1 Goal and non-goals

- **Goal:** a 30-second demo that makes people say "I want this app". Used to pitch friends, testers, designers, ferry operators.
- **Non-goals:** real-time data, accounts, restaurants, feeds, native apps, backend. All data is static files.

### 4.2 What the user sees (first 10 seconds)

1. Loading screen: a small vapur icon crossing a line, "İstanbul is waking up…".
2. Camera starts high above the Sea of Marmara, then flies in (~3 s) to a 50° tilted view over the Bosphorus mouth (Karaköy – Kadıköy – Üsküdar triangle).
3. Water shimmers; ferries are already moving, leaving wakes; a few seagulls follow them.
4. A clock chip top-left shows Istanbul time; a "Simulated schedule" badge next to it.
5. A hint bubble "Tap a vapur" fades after 4 s.

### 4.3 Map look

- **Style:** illustrated and calm, like a premium game map — not satellite, not Google Maps. Soft pastel land, deep teal water, minimal labels.
- **Land:** warm cream (day) / dark slate (night), 1–2 px lighter shoreline highlight, soft inner shadow along coasts.
- **Water:** animated shader — slow ripples, subtle sparkle in sun direction, darker mid-strait, lighter near shores (distance-to-coast gradient).
- **Labels:** only districts (Kadıköy, Beşiktaş, Üsküdar, Eminönü, Sarıyer…) and pier names when zoomed in. One rounded font (Nunito or Manrope); Turkish characters (İ ı ş ğ ç ö ü) must render correctly.
- **Landmarks (optional, later in Phase 0):** Galata Tower, Maiden's Tower, 15 Temmuz and Fatih Sultan Mehmet bridges (bridges matter most — ferries pass under them).
- **Roads/buildings:** none or very faint. Water and ferries are the stars.

### 4.4 Vapur animations (the core)

- **Model:** stylized classic İstanbul vapur — white hull, dark lower band, one or two yellow/black funnels; low-poly glTF or procedural Three.js. Exaggerated scale (~3–4× real) at city zoom, shrinking toward real size when zoomed in.
- **Movement:** interpolated along the route polyline by time; ease-in over the first ~60 s after leaving a pier, ease-out over the last ~60 s. Heading follows the path tangent with smoothing — never snapping.
- **Docking:** slows, rotates parallel to the pier, waits 3–5 min, small settle "bump", then departs.
- **Wake:** V-shaped foam trail fading over ~20–30 s of travel; width grows with speed; gone when docked. Small bow foam.
- **Life details:** gentle roll/pitch bob (±1–2°, different phase per ferry), funnel smoke drifting with wind, horn "toot" ring animation on departure (optional sound toggle).
- **Night:** cabin window glow, red (port) and green (starboard) lights, white masthead light, light streak reflection on water.
- **Seagulls:** 3–6 tiny birds circling and following 2–3 ferries.
- **Selected ferry:** soft ring pulse under it, others dim slightly, camera can follow.

### 4.5 Interactions

- Pan, pinch-zoom, two-finger rotate and tilt (desktop: drag, wheel, right-drag).
- **Tap a vapur → bottom sheet:** line name + colour, from → to, next stop + ETA countdown, progress bar, "Follow" button; route highlights on map.
- **Tap a pier → bottom sheet:** pier name, next 5 departures by line with minutes-to-go, greyed "Nearby — coming soon" section.
- **Layer chips:** Ferries · Routes · Piers · Landmarks.
- **Time controls:** "Now" button, speed (1×, 10×, 60×), time scrubber (jump to sunset for demos).
- **Language switch:** TR / EN.
- Hit areas ≥ 44 px; tapping empty map closes sheets.

### 4.6 Data for the prototype

- **Coastline:** OpenStreetMap-derived land polygons clipped to lon 28.80–29.30, lat 40.82–41.26, simplified (target < 400 KB). Candidate source: npm package `@geo-maps/earth-lands-100m` (OSM data → credit "© OpenStreetMap contributors", ODbL). Alternative: OpenFreeMap vector tiles.
- **Piers (~20):** Eminönü, Karaköy, Kabataş, Beşiktaş, Ortaköy, Bebek, Arnavutköy, Emirgan, Sarıyer, Rumeli Kavağı, Anadolu Kavağı, Kanlıca, Anadolu Hisarı, Çengelköy, Beylerbeyi, Üsküdar, Haydarpaşa, Kadıköy, Bostancı, Kınalıada, Burgazada, Heybeliada, Büyükada. Coordinates from OSM pier/ferry-terminal features — never typed from memory.
- **Lines (6):** Kadıköy–Karaköy, Kadıköy–Eminönü, Üsküdar–Eminönü, Kadıköy–Beşiktaş, Bosphorus line (Eminönü → Anadolu Kavağı with stops), Islands line (Kabataş → Büyükada with stops). Real lines; schedules simulated.
- **Routes:** hand-authored GeoJSON LineStrings with waypoints in water, curving naturally. A validation script fails the build if a segment touches land or passes within 30 m of the coast (except the last 100 m into a pier).
- **Simulated timetable:** per line first/last departure, headway (15–20 min peak, 30 min off-peak), cruise speed ~22–26 km/h, dwell 3–5 min. Positions are a pure function of clock time.

```json
{
  "id": "kadikoy-karakoy",
  "name": { "tr": "Kadıköy – Karaköy", "en": "Kadıköy – Karaköy" },
  "color": "#E0A100",
  "stops": ["kadikoy", "karakoy"],
  "routeId": "route-kadikoy-karakoy",
  "service": { "first": "07:00", "last": "23:30", "headwayPeak": 15, "headwayOff": 30, "dwellMin": 4, "speedKmh": 24 },
  "simulated": true
}
```

### 4.7 Tech for the prototype

- **Vite + TypeScript**; no framework in the map core; thin **React** layer for UI sheets and controls.
- **MapLibre GL JS** for camera, gestures, tilt/rotate, land and labels with a custom style.
- **Three.js** in a MapLibre custom layer for water shader, ferries, wakes, birds, landmarks.
- **Turf.js** in build scripts for route validation and distance along lines.
- Self-hosted fonts; no API keys; deploy to Vercel, Netlify or Cloudflare Pages.

### 4.8 Project structure

```text
istanbul-living-map/
  docs/plan.md           # this file
  data/
    raw/                 # downloaded sources, never edited
    piers.geojson
    routes.geojson
    lines.json
    land.geojson         # clipped, simplified coastline
  scripts/
    build-coastline.ts   # clip + simplify
    validate-routes.ts   # routes must stay in water
  src/
    config.ts            # ALL visual constants (colours, speeds, wake length…)
    map/                 # MapLibre setup, style, camera, intro fly-in
    water/               # water shader layer
    ferries/             # model, movement, wake, lights, selection
    sim/                 # clock, timetable, position-at-time (pure functions + tests)
    ui/                  # bottom sheets, chips, time controls, i18n
    debug/               # fps meter, route overlay, sim speed
  public/models/vapur.glb
  CLAUDE.md              # short spec, conventions, commands, decisions log
```

### 4.9 Build steps

1. **Skeleton:** Vite app, MapLibre with custom land/water style, coastline pipeline, piers on the map, debug panel with fps.
2. **Simulation:** `sim/` module with unit tests (position at time, dwell, headways), routes + validator, ferries as simple arrows moving correctly.
3. **Vapur looks:** 3D vapur model, heading smoothing, wake, bob, docking. Most iteration time goes here.
4. **Water + time:** water shader, day/night cycle, night lights, intro fly-in, seagulls.
5. **Interactions:** vapur/pier sheets, follow mode, layer chips, time controls, TR/EN.
6. **Polish + perf:** real phones, cut what drops below 60 fps, reduce-motion mode, deploy.

### 4.10 Acceptance criteria (definition of done)

- [ ] 60 fps on a mid-range phone (iPhone 12 / Pixel 6 class) with 40 ferries visible; never below 45 fps.
- [ ] First meaningful view < 3 s on 4G; total download < 5 MB before map tiles.
- [ ] No ferry ever crosses land (validator passes; visual check at 10× for a full day).
- [ ] Ferries slow, dock, wait and depart smoothly — no teleporting, no heading snaps.
- [ ] Tapping a ferry or pier opens the right sheet within 100 ms.
- [ ] Day/night follows Europe/Istanbul time (UTC+3); sunset roughly right.
- [ ] Works on iOS Safari and Android Chrome; fits a 360 px wide screen.
- [ ] Turkish characters render everywhere; "Simulated schedule" badge always visible.
- [ ] OpenStreetMap attribution visible.

## 5. Tech architecture (later phases — do NOT build in Phase 0)

Phase 0 has no backend, only static files. Target architecture for Phase 1–2:

- **Clients:** mobile app (Capacitor wrapping the same web map), web map, business dashboard.
- **API + auth** (Node.js, Fastify or Hono, TypeScript): one gateway for all clients.
- **Services:** live ferries (timetables + AIS merged positions), places & feeds, contributions & moderation, search & push alerts.
- **Storage:** Postgres + PostGIS, Redis (live positions, cache), CDN (PMTiles map tiles, media).
- **Ingest workers:** OSM, İBB open data, operator timetables, AIS feed, business updates.
- Analytics: privacy-friendly analytics + Sentry.

## 6. Data strategy

**Start with free public data, make the map so good that operators and venues want in, then turn users into contributors.**

| Data | Source | Phase | Notes |
| --- | --- | --- | --- |
| Coastline, piers, landmarks, places | OpenStreetMap | 0 | ODbL: attribution + share-alike |
| City datasets (pier passenger counts, transit…) | İBB Open Data Portal (data.ibb.gov.tr) | 1 | CKAN portal, ~540 datasets |
| Ferry timetables | Şehir Hatları, Turyol, Dentur websites | 1 | No public API confirmed; enter manually first |
| Live ferry positions | AIS | 1–2 | Check Bosphorus coverage + licence |
| Metro, tram, Marmaray | İBB open data / Metro İstanbul | 2 | |
| Restaurants, theatres, malls | Businesses | 2 | Business accounts; hand-seed 50–100 |
| Delays, crowds, menu photos | Users | 2 | Moderated |

Rule: every record stores its source and last-checked date; stale data (timetables > 30 days, menus > 90 days) is flagged.

## 7. Design direction

- **Mood:** warm, playful, premium; Bosphorus blue, tea-glass gold. Not cartoonish, not corporate.
- **References:** Snap Map 3D feel, Mini Metro clean lines, Apple Maps 3D, Monument Valley colours, old Şehir Hatları posters.
- **Palette (start):** water #1F5E6E → #2E8C9A near shores, land #F3E9D7, night land #1E2430, accent gold #E0A100, sunset coral #F08A5D.
- **Line colours:** one colour per ferry line on route, badge and sheet.
- **Type:** one rounded sans (Nunito or Manrope), full Turkish support.
- **Motion:** nothing jumps; UI eases 300–600 ms, ferries physics-like; ambient motion subtle.
- **UI pattern:** full-screen map, bottom sheets (peek/half/full), chip row on top, floating "Now" button.
- **Accessibility:** reduce-motion setting, colour-blind-safe line colours, contrast ≥ 4.5:1.

## 8. Roadmap and gates

- **Phase 0 Prototype** → Gate A: 10 of 20 testers want it; 60 fps on phones.
- **Phase 1 MVP** → Gate B: 300 weekly users; 25% come back after a week.
- **Phase 2 Launch** → Gate C: 50 active businesses; 5,000 monthly users.
- **Phase 3 Digital city.**

If a gate is missed, fix the current phase instead of starting the next.
