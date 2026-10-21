# İstanbul Living City

An animated map of İstanbul that runs in the browser and is designed for phones first. Ferries move on the water
according to the published timetables, and the city is drawn from OpenStreetMap. Places, upcoming cultural events
and short histories of old buildings are shown on top.

**Live:** <https://mutallimof.github.io/CityMap/>

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/toy.jpg" width="260" alt="Toy look at city zoom, late afternoon: pastel land, blue Bosphorus, ferries and place pins"><br>Toy look (default), 17:30</td>
    <td align="center"><img src="docs/screenshots/night.jpg" width="260" alt="Night look over Karaköy and Eminönü at 20:30: dark city, glowing streets, ferries at the piers"><br>Night look, 20:30</td>
  </tr>
</table>

Both screenshots come from the running app (headless Chromium, `scripts/dev/shot.mjs`).

## What works today

- **Ferries.** Seven Şehir Hatları lines on 27 piers, plus four private city lines (three Turyol, one Dentur
  Avrasya) on their own 7 piers. Vessels follow routes computed on the water and keep to the published departure
  times. Each line is labelled "Official timetable" or "Simulated schedule". Tap a pier for its departure board, or
  a ferry to follow it.
- **The city.** OpenStreetMap vector tiles in the project's own colours, 3D buildings, day / golden hour / night from
  the real sun position, live weather (rain, snow, fog, wind) and the seasons.
- **Four looks:** Toy (default), Classic, Storybook and Night. You can switch between them without reloading.
- **Places.** About 370 featured places plus the points of interest in the map tiles. Place sheets show opening
  hours, website and phone from OpenStreetMap when available, plus an "Open now" filter.
- **Events.** Several hundred upcoming events (498 in the file of 20 Oct 2026) from the websites of about 20 cultural
  venues. Only facts are kept: title, time, venue, price if listed, and a link to the venue's own page. Filter
  chips: Today, This weekend, Workshops, Free.
- **Stories.** 513 historic places with a short Wikipedia summary and a Wikimedia Commons photo.
- **Planner.** Plan an evening, a day or several days. Between stops it shows an approximate walk or a real ferry
  departure; otherwise it says "No transport info". It warns about closing times and overlaps. Plans are saved on the
  device and can be shared as a read-only link.
- **City sound** (off by default), mixed from open-licence recordings by time of day, zoom and weather.
- Search, guides, snapshot sharing, Turkish / English, installable as a web app, follows the "reduce motion" setting.

There are no accounts, no backend and no API keys. The site is static files plus keyless services that the
browser calls directly (OpenFreeMap tiles, Open-Meteo weather, Nominatim search).

### Ferries: what is real and what is simulated

The departure and arrival times come from the operators' published timetables, and the boats follow fixed routes
between real piers. **Positions between piers are simulated:** the map computes where a boat would be at that time.
It is not GPS or live vessel tracking. If a boat is late or cancelled, the map does not know.

### Limitations

- No live vessel positions (see above). On holidays the private operators' lines show a simulated schedule, because
  their sites print no holiday timetable.
- Some Şehir Hatları tables (Kadıköy / Üsküdar – Karaköy – Eminönü and the Friday / Saturday night service) print
  only departure times per pier. The direction shown for those departures is our reading of the table and is
  marked †. The same goes for the order of stops on Turyol boats that are printed to two destinations.
- Not every ferry is on the map: the Şehir Hatları Boğaz commuter line and short Bosphorus tour, İDO, and some
  Turyol / Dentur lines (islands, Beşiktaş) are missing.
- Walking times are a straight line × 1.3 at 4.5 km/h, not a street route. There are no buses, metro or trams.
- Events come only from venues whose own sites can be read. Some large venues block automated reading, so they
  have no events. Events from a venue that hasn't been refreshed for 3 days are hidden.
- Weather needs Open-Meteo. If it can't be reached for 3 hours, the weather chip disappears and the scene goes calm.
- Performance and battery use have only been measured in a headless browser, not on a real iPhone.
- Map pins can't be reached with the keyboard (the list view is the keyboard path), and sheets don't trap focus.
- Most sound recordings are not from İstanbul (no openly licensed Bosphorus recordings were found).

## Run it locally

Requires Node.js 22 (the version CI uses).

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # Vitest: 402 tests in 70 files, all passing on 21 Oct 2026
npm run build      # validates ferry routes and timetables, type-checks, builds to dist/
```

`npm run typecheck` type-checks without building. `npm run validate:data` checks the committed data files.
Useful URL switches: `?theme=toy|classic|storybook|night`, `?t=18:30&date=2026-10-21` (clock),
`?weather=rain|snow|fog` (weather demo), `?view=lng,lat,zoom` (start position), `?intro=0` (skip the intro).

## Tech stack

TypeScript (strict), Vite, MapLibre GL JS, three.js (custom layers for the water, ferries and 3D scenery), React
for the interface, Vitest. Data scripts are in TypeScript (Turf) and Python. GitHub Actions refreshes the data and
deploys the site, and GitHub Pages hosts it.

## Data sources

Details, licences and how each is credited in the app: [docs/data-sources.md](docs/data-sources.md).

- OpenStreetMap (via OpenFreeMap vector tiles, land polygons, Nominatim and Overpass): the city, coastline, piers,
  places.
- Şehir Hatları winter timetable PDF 2026-27: Şehir Hatları ferry times.
- Turyol and Dentur Avrasya websites: their city lines' ferry times.
- Cultural venues' own websites: event facts.
- Wikidata, Wikipedia, Wikimedia Commons: stories and their photos.
- Open-Meteo: live weather.
- Wikimedia Commons: sound recordings.
- Fontsource: self-hosted fonts (SIL OFL).

## How the data is refreshed

- A scheduled GitHub Actions job (`.github/workflows/data-refresh.yml`) runs every day. It reads the venues' event
  pages and the private ferry operators' timetables (it reads those again once 6 days have passed since the last
  read). On the 3rd of each month it also refreshes the stories and the auto-picked places. Then it commits the
  data and deploys the site.
- The Şehir Hatları timetable comes from the official PDF. It is parsed by hand when a new one is published (the
  current one is valid to 27 Jun 2027). Every refresh and every build checks it.
- Refreshed data is validated before it is committed. Empty files, sharp drops or broken timetables stop the job,
  and nothing is deployed. A venue or operator that fails keeps its last good data. An operator timetable stays
  in use for 45 days after its last good read, then that line shows a simulated schedule.

## Licence

This repository has no licence file and no open-source licence: the owner keeps all rights. Map data is ©
OpenStreetMap contributors. Other data, sounds and fonts keep their own licences (see
[docs/data-sources.md](docs/data-sources.md)).

## How it was built

The owner directed the project, and it was written with [Claude Code](https://claude.com/claude-code), Anthropic's
coding agent. The project notes the agent works from are in [CLAUDE.md](CLAUDE.md).
