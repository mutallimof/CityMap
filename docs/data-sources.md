# Data sources

Everything on the map comes from real, published sources. No API keys and no backend: the site ships
static data (built by scripts in `scripts/`, refreshed by GitHub Actions) and the visitor's browser calls
a few keyless services directly.

| Source | What we use it for | Licence | Attribution shown in the app | Refresh |
|---|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org) via [OpenFreeMap](https://openfreemap.org) vector tiles ([OpenMapTiles](https://openmaptiles.org) schema) | The city: land use, roads, 3D buildings, parks, street and place names, map POIs; hero-landmark footprints and event-venue positions (read from the tiles at build time) | Data: [ODbL](https://opendatacommons.org/licenses/odbl/); OpenMapTiles schema: CC BY 4.0 | Attribution bar, always visible: "OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors" | Live (tiles load in the browser); build-time extracts by hand |
| OpenStreetMap [land polygons](https://osmdata.openstreetmap.de/data/land-polygons.html) | Coastline / land shape the water is drawn against; ferry routes are computed on it | ODbL | Attribution bar: "© OpenStreetMap contributors" | By hand (rarely) |
| OpenStreetMap via [Nominatim](https://nominatim.org) | Pier, district and curated place coordinates (build time); place details when a place opens (hours, website, phone); search; names for tapped plan points | ODbL | "Search: Nominatim · © OpenStreetMap contributors" in search; "© OpenStreetMap" on place sheets; "Real places · OpenStreetMap" in the feed | Build: by hand. Live: on demand only (≤ 1 request/s, never as you type) |
| OpenStreetMap via [Overpass API](https://overpass-api.de) | Auto-picked featured places; candidates for historic stories | ODbL | As above (OSM credit in the attribution bar) | Monthly (GitHub Actions) |
| [Open-Meteo](https://open-meteo.com) | Live weather (rain, snow, fog, cloud, wind) that drives the map's weather and the funnel smoke | Data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Attribution bar: "Weather data by Open-Meteo.com", linked | Every 15 min in the browser |
| [Wikidata](https://www.wikidata.org) | Which places have a story, their Wikipedia / Commons links | CC0 | — (not required); stories link to Wikipedia | Monthly (GitHub Actions) |
| [Wikipedia](https://www.wikipedia.org) | Short summaries in the Story section of historic places | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | "Text: Wikipedia, CC BY-SA 4.0" + "Read more on Wikipedia" link on every story | Monthly (GitHub Actions) |
| [Wikimedia Commons](https://commons.wikimedia.org) photos | One photo per story (loaded from Wikimedia's servers) | Per file (CC BY / CC BY-SA / PD / CC0) | Author, licence (linked) and "Wikimedia Commons" under each photo | Monthly (GitHub Actions) |
| [Şehir Hatları](https://www.sehirhatlari.istanbul) timetable PDF (İBB Şehir Hatları A.Ş.) | Ferry departures and arrivals for the seven lines (winter 2026-27, valid to 27 Jun 2027) | Published timetable; we use the times (facts) only | Every line is labelled "Official timetable" or "Simulated schedule"; pier boards show "Times: Şehir Hatları winter timetable 2026-27" with a link | By hand, about twice a year (next: around 27 Jun 2027) |
| Turkish public holidays (Diyanet calendar, Law 2429) | Holidays run the Şehir Hatları Sunday timetable (the private operators' lines go simulated: their sites print no holiday timetable) | Public facts | — | With each timetable |
| [Turyol](https://www.turyol.com/Home/Tarifeler) "Sefer Saatleri" (S.S. Turizm ve Yolcu Deniz Taşıyıcılar Kooperatifi) | Departure times for three city lines: Kadıköy (Yeni) – Karaköy – Eminönü, Üsküdar – Karaköy – Eminönü, Karaköy – Kadıköy (Metro) | Published timetable; facts (pier, day type, time) only. No robots.txt and no terms of use on the site; only "© All Rights Reserved" and ticket-sale / privacy contracts, none about reading the site | Badge "Turyol timetable"; operator on pier boards and vessel sheets; "Times: Turyol timetable (turyol.com) (read <date>)"; attribution bar "Ferry times: Şehir Hatları · Turyol · Dentur Avrasya" → [ferry credits](https://mutallimof.github.io/CityMap/ferry-credits.html) | Weekly (GitHub Actions); a read counts for 45 days (no validity printed) |
| [Dentur Avrasya](https://www.denturavrasya.com/tr-TR/hatlarimiz/uskudar-kabatas) line page | Departure times for Üsküdar – Kabataş, and its printed "continuous service" windows (shown as notes) | Published timetable; facts only. No robots.txt and no terms of use on the site; only "© Tüm hakları saklıdır" and a KVKK (privacy) notice. (dentur.com.tr, a different site, disallows crawling and is never read) | Badge "Dentur Avrasya timetable"; operator on pier boards and vessel sheets; credit as above | Weekly (GitHub Actions); a read counts for 45 days |
| Event pages of İstanbul cultural venues | Upcoming events: title, date / time, venue, category, price when listed | Facts only — no descriptions or images are copied | Every event links back to the venue's own event page / official ticket link | Daily (GitHub Actions) |
| [Wikimedia Commons](https://commons.wikimedia.org) sound recordings | City sound: harbour, water, street, rain, wind, gulls, pier, horns, bell | CC0 / public domain / CC BY 3.0 / CC BY 4.0 (per file; never BY-SA or NC) | While sound is on, the attribution bar shows "Sounds: Wikimedia Commons (CC0 / PD / CC BY)" → [audio credits](https://mutallimof.github.io/CityMap/audio/credits.html) | By hand |
| Fonts: Nunito, Fredoka, Patrick Hand, Fraunces (via [Fontsource](https://fontsource.org), self-hosted) | Interface text and themed map labels | [SIL OFL 1.1](https://openfontlicense.org) | "Fonts (OFL)" link in the map style picker → [font credits](https://mutallimof.github.io/CityMap/fonts-credits.html) | With dependency updates |

Generated credits pages: [audio/credits.html](https://mutallimof.github.io/CityMap/audio/credits.html)
(from `public/audio/credits.html`, written by `npm run data:audio`),
[fonts-credits.html](https://mutallimof.github.io/CityMap/fonts-credits.html) (`public/fonts-credits.html`) and
[ferry-credits.html](https://mutallimof.github.io/CityMap/ferry-credits.html) (`public/ferry-credits.html`).

**Ferry operators' timetables** are read the same polite way (robots.txt, ≥ 4 s between requests, one at a
time, identifying user agent), once a week, about 16 requests in all; a failed or changed page keeps the last
good timetable until its dates run out, then that line shows the simulated schedule.

**Event collection is polite:** it respects each site's robots.txt, waits several seconds between requests
to a site, fetches each venue at most once a day with an identifying user agent, keeps only facts and
links back to the venue, and never uses ticket resellers.

**Refreshed data is validated before it ships:** the refresh job refuses empty or sharply shrunk data
and keeps the last good copy; ferry routes and timetables are validated on every build.

**Open-Meteo credit:** Open-Meteo's free API asks for attribution. The map's attribution bar shows
"Weather data by Open-Meteo.com" (linked to https://open-meteo.com/) in every look, except while a
`?weather=` demo preset replaces the live data.
