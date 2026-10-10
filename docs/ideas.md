# İstanbul Living City — Part B ideas

Vision: one app for İstanbul locals and tourists — a living map plus a feed of what's happening
(theatre, concerts, offers from shops and restaurants, events), not transit updates.
The map stays the hero; the feed is a bottom sheet.

Scores are 1–5 (5 = best): **Easy** to build now (static data, no backend), **Visual** appeal on the
map, **Return** = useful enough that people come back. **Total** = sum. ✅ = built in this pass.

| # | Idea | Easy | Visual | Return | Total | |
|---|------|:---:|:---:|:---:|:---:|:---:|
| 1 | **Feed of posts** (events, offers, announcements), each tied to a place; tap → fly to it | 3 | 4 | 5 | 12 | ✅ |
| 2 | **Glowing place pins** — Snapchat-style bubbles with a story ring when a place has new posts | 4 | 5 | 4 | 13 | ✅ |
| 3 | **Category chips** (Ferries · Food · Culture · Shopping · Events) filtering map + feed | 5 | 3 | 4 | 12 | ✅ |
| 4 | **Place sheet** — name, category, OSM opening hours with "open now", its posts | 4 | 3 | 4 | 11 | ✅ |
| 5 | **"Tonight" filter** — only what's on this evening; those pins pulse | 4 | 4 | 5 | 13 | ✅ |
| 6 | **Sunset time + best sunset spots** — countdown card; viewpoints glow during golden hour | 4 | 5 | 4 | 13 | ✅ |
| 7 | **Weather chip** (Open-Meteo, no key) — and the real wind drives the funnel smoke | 4 | 3 | 3 | 10 | ✅ |
| 8 | **Next ferry from the nearest pier** using my location | 4 | 2 | 5 | 11 | ✅ |
| 9 | **Favourites** saved on the device; hearts on pins, "Saved" filter in the feed | 5 | 2 | 4 | 11 | ✅ |
| 10 | **Share a place link** (deep link opens the app flown to the place) | 5 | 1 | 3 | 9 | ✅ |
| 11 | **Near this pier** — places around a pier in the pier sheet, with walking minutes | 4 | 2 | 4 | 10 | ✅ |
| 12 | **Event countdown ring** on pins (ring fills as the start time approaches) | 4 | 4 | 3 | 11 | ✅ (as the "soon" ring) |
| 13 | Story viewer — full-screen swipeable post cards from a pin | 3 | 5 | 4 | 12 | later |
| 14 | "Plan my evening" — ferry + dinner + show chained with times | 2 | 4 | 4 | 10 | later |
| 15 | Busy-now heat glow (by time-of-day patterns) | 3 | 5 | 3 | 11 | later — needs real data to be honest |
| 16 | Search across places, piers, posts | 4 | 1 | 4 | 9 | later |
| 17 | 3D landmarks (Galata Tower, Maiden's Tower, bridges) | 2 | 5 | 2 | 9 | later (plan Phase 3) |
| 18 | Offers wallet — save offers, expiry reminders | 3 | 2 | 3 | 8 | later |
| 19 | Venues light up after dark (pins brighten at night) | 5 | 4 | 2 | 11 | ✅ (pins follow day/night) |
| 20 | "Your vapur leaves in 10 min" push alerts | 2 | 1 | 5 | 8 | Phase 1 (needs service worker/backend) |
| 21 | Collectible ferry rides / AR at piers | 1 | 4 | 2 | 7 | Phase 3 |

## What got built (Part B, first pass)

- **Places** — real locations from OpenStreetMap via Nominatim (theatres, concert halls, arts
  centres, malls, cafés/restaurants near piers, viewpoints); `npm run data:fetch-places` →
  `npm run data:places` → `data/places.geojson`. Opening hours are OSM's `opening_hours` where present.
- **Posts are demo content** (`data/catalog/posts.json`): realistic but invented, every card and
  sheet carries a **DEMO** label and the feed header says so. Times are relative to "today" so the
  feed and the Tonight filter always have something to show.
- **Feed** bottom sheet (peek / half / full), **pins** with story rings + glow for fresh posts,
  **category chips**, **Tonight**, **place sheet**, **sunset card + viewpoints**, **weather chip**
  (wind steers the smoke), **nearest pier**, **favourites**, **share links**, **near this pier**.

See the decisions log in `CLAUDE.md` for how each piece works.

## What got built (second chunk, 2026-10-10)

- **Colourful city** from OpenStreetMap via OpenFreeMap vector tiles (no key), in our palette:
  pastel neighbourhoods, parks, woods, beaches, warm-white roads with soft-gold avenues, 3D pastel
  buildings from z15 with lit windows at night, street names. Landmarks from the same OSM tiles
  (`npm run data:landmarks`): Galata Tower (gold building), Maiden's Tower, five bridges (gold glow,
  lamps at night). Our coastline and water shader stay on top of everything.
- **Live weather + seasons**: Open-Meteo every 15 min. Rain gives streaks, drop rings and wet
  streets. Fog gives drifting banks that swallow the ferries. Wind gives chop, whitecaps, rocking
  and smoke. Snow gives flakes and white ground. Clouds give softer light, and storms bring
  lightning. Seasons follow the date: spring blossom and Emirgan tulips, bright summer, orange
  autumn, deep winter. The demo switch is `?weather=clear|cloudy|rain|storm|fog|snow|wind&season=spring|summer|autumn|winter`.
- **Real data only**: the demo posts are gone. More places fade in by zoom, using every named OSM
  café, restaurant, museum, shop and park from the tiles. The place sheet shows only OSM fields:
  hours with open/closed, website, phone and cuisine. These are looked up on Nominatim when a
  place is opened. It also shows the nearest pier and next ferry. There is an **Open now** filter.
- **Search**: instant results from local data and loaded tiles. Pressing Enter searches Nominatim,
  following its policy (no autocomplete, ≤1 req/s).
- **Guides** (seed): `data/catalog/guides.json` holds First day in Istanbul, Bosphorus by ferry and
  Sunset in Üsküdar. Each is drawn as a route.
- **Snapshot share**: a 4:5 image with a caption and watermark, sent to the share sheet.
- **PWA**: manifest, icons, iOS splash screens, full-screen, service worker.
- **Adaptive effects**: resolution drops first, then particles and gulls, then window lights, then
  3D buildings.
