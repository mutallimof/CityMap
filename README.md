# Livin' Istanbul

<img src="public/wordmark.svg" width="236" alt="Livin' Istanbul logo: a small ferry above a wave line">

An animated, phone-first map of Istanbul: ferries on the Bosphorus, places, events and old stories, drawn from open data.

**Live:** <https://mutallimof.github.io/CityMap/>

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/toy.jpg" width="260" alt="Toy look at city zoom, late afternoon: pastel land, blue Bosphorus, ferries and place pins"><br>Toy look (default)</td>
    <td align="center"><img src="docs/screenshots/night.jpg" width="260" alt="Night look over Karaköy and Eminönü: dark city, glowing streets, ferries at the piers"><br>Night look</td>
  </tr>
</table>

## What it does today

- **Ferries.** Seven Şehir Hatları lines plus four private city lines (three Turyol, one Dentur Avrasya). Boats follow
  routes drawn on the water and keep to the operators' published departure times. Each line is labelled "Official
  timetable" or "Simulated schedule". Tap a pier for its departure board, or a ferry to follow it.
- **The city.** OpenStreetMap vector tiles in the project's own colours, 3D buildings, day / dusk / night from the sun
  position, live weather and the seasons. Four looks (Toy, Classic, Storybook, Night), switchable without a reload.
- **Places.** Featured places and the points of interest in the map tiles, with opening hours, website and phone from
  OpenStreetMap when available, and an "Open now" filter.
- **Events.** Upcoming events from the websites of about 20 cultural venues. Only facts are kept (title, time, venue,
  price if listed) with a link to the venue's own page.
- **Stories.** Several hundred historic places with a short Wikipedia summary and a Wikimedia Commons photo.
- **Planner.** Plan an evening, a day or several days; between stops it shows an approximate walk or a real ferry
  departure, and warns about closing times. Plans are saved on the device and can be shared as a read-only link.
- Search, guides, snapshot sharing, Turkish / English, installable as a web app, optional city sound (off by default),
  follows the "reduce motion" setting.

There are no accounts, no backend and no API keys: the site is static files plus keyless services the browser calls
directly (OpenFreeMap tiles, Open-Meteo weather, Nominatim search).

## Limitations

- **Ferry positions are simulated, not GPS.** Departure times come from the operators' timetables and the boats move
  along fixed routes between real piers, so the map shows where a boat would be at that time. It does not know about
  delays or cancellations.
- Only some ferries are on the map: seven Şehir Hatları lines and four private city lines. The Şehir Hatları Boğaz
  commuter line, the short Bosphorus tour, İDO, and the other Turyol / Dentur lines are missing.
- Some timetables print only departure times per pier. The direction shown for those departures is our reading of
  the table and is marked †. The private operators publish no holiday timetable, so holidays show a simulated
  schedule for their lines.
- Walking times are a straight line × 1.3 at 4.5 km/h, not a street route. There are no buses, metro or trams.
- Events come only from venues whose sites can be read; some large venues block automated reading and have none.
  Events from a venue not refreshed for 3 days are hidden. Weather disappears if Open-Meteo is unreachable for 3 hours.
- Performance and battery use have only been measured in a headless browser, not on a real phone.
- Map pins can't be reached with the keyboard (the list view is the keyboard path), and sheets don't trap focus.
- Most sound recordings are not from Istanbul (no openly licensed Bosphorus recordings were found).

## Run it locally

Requires Node.js 22 (`.nvmrc`, the version CI uses).

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # Vitest
npm run build      # validates ferry routes and timetables, type-checks, builds to dist/
```

`npm run typecheck` type-checks without building; `npm run validate:data` checks the committed data files. Useful URL
switches: `?theme=toy|classic|storybook|night`, `?t=18:30&date=2026-10-21` (clock), `?weather=rain|snow|fog`,
`?view=lng,lat,zoom` (start position), `?intro=0` (skip the intro).

The app name, public URL and the base path the site is served under (`/CityMap/`) are set once, in `site.json`.

## Tech stack

TypeScript (strict), Vite, MapLibre GL JS, three.js (custom layers for the water, ferries and 3D scenery), React for
the interface, Vitest. Data scripts are TypeScript and Python. GitHub Actions refreshes the data and deploys to
GitHub Pages.

## Data

Every source, its licence and how it is credited in the app: [docs/data-sources.md](docs/data-sources.md). In short:
OpenStreetMap (city, piers, places), the Şehir Hatları timetable PDF, the Turyol and Dentur Avrasya websites,
cultural venues' own sites (event facts), Wikidata / Wikipedia / Wikimedia Commons (stories, photos, sounds),
Open-Meteo (weather) and Fontsource (self-hosted fonts, SIL OFL).

A scheduled GitHub Actions job (`.github/workflows/data-refresh.yml`) reads venue events daily and the private
operators' timetables weekly, and refreshes stories and auto-picked places monthly. Data is validated before it is
committed; empty files, sharp drops or broken timetables stop the job and nothing is deployed. A venue or operator
that fails keeps its last good data. The Şehir Hatları timetable is parsed by hand from the official PDF when a new
one is published (see `scripts/timetables/README.md`).

## Licence

The code is under the [MIT licence](LICENSE) (copyright 2026 mutallimof). The data, sounds and fonts the app uses keep
their own licences: map data is © OpenStreetMap contributors, and the other sources are listed in
[docs/data-sources.md](docs/data-sources.md).

## How it was built

The owner directed the project and it was written with [Claude Code](https://claude.com/claude-code), Anthropic's
coding agent. The project notes the agent works from are in [CLAUDE.md](CLAUDE.md).
