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

## Open ideas

- An events feed / "tonight" list, per-event share cards, more venues once they appear in OSM (Akbank Sanat,
  Salon İKSV), stage-level places for multi-stage venues, story trails (walks linking stories).
- Departure alerts ("Plan my evening"), Turyol / Dentur Avrasya lines (their sites are reachable from Actions),
  the Kısa Boğaz Turu and the Boğaz Hattı commuter line, the old vs new Kadıköy pier as two berths.
