# Ferry timetables (Şehir Hatları PDF → data/timetables.json)

The operator's site blocks GitHub's servers (Cloudflare challenge), so the timetable comes from the
official PDF, downloaded by hand in a browser. **Never commit the PDF** (the repo is public): it
lives in `data/raw/` (gitignored). Only the derived facts are committed:

| File | What |
|---|---|
| `data/timetables-source.json` | every cell of our tables, rebuilt from word positions (`parse-tarife.py`) |
| `data/timetables.json` | trips per app line, footnotes applied, validity dates, source credit (`build-timetables.ts`) |
| `data/catalog/holidays.json` | public holidays (Sunday timetable), hand-written with sources |

The current file is the **winter timetable 2026-27, valid 7 Sep 2026 – 27 Jun 2027**. After that date
the app falls back to the simulated schedule by itself (labelled "Simulated schedule"); the daily
refresh job warns in its run summary from 30 days before.

## When the next timetable comes out (~27 Jun 2027)

1. Download `https://files.sehirhatlari.istanbul/tarife.pdf` in a browser → `data/raw/tarife.pdf`.
2. `pip install pdfplumber` (once; poppler-utils for `--render`).
3. Update `scripts/timetables/tarife-layout.json`: validity dates (`pdf`), page numbers, table boxes
   (`bbox`, `headerBand`, in PDF points), columns and footnotes. Render pages to check them:
   `python3 scripts/timetables/parse-tarife.py data/raw/tarife.pdf --render data/raw/pages`
   (220 dpi: points × 3.06 = pixels). The cover check also needs the new dates in `check_cover`.
4. Parse: `python3 scripts/timetables/parse-tarife.py data/raw/tarife.pdf`. It refuses anything that
   doesn't add up (column count, empty or doubled cells, unknown headers, footnote text not printed,
   marker colour). Self-test of the time normaliser: `--self-test`.
5. Compare `data/timetables-source.json` with the rendered pages, cell by cell where it matters, and
   update `scripts/timetables/source.test.ts` (every mismatch you find becomes a test).
6. If a table's layout or footnotes changed meaning, update `scripts/timetables/rules.ts` (footnotes are
   mapped by their printed text, so a renumbered marker fails instead of silently changing meaning).
7. `npm run data:timetables` → `data/timetables.json`.
8. Holidays: add the new period to `data/catalog/holidays.json` (`days`, `covers`; religious dates from
   Diyanet's calendar). The validator refuses a timetable the holiday list doesn't cover.
9. If a trip calls at a pier pair with no route yet: `npm run data:routes` (adds the leg), then
   `npm run validate:timetables`, `npm test`, `npm run build`.
10. A new pier: add it to `data/catalog/piers.json` (pin `"osm"` when the name match is ambiguous), then
   `npm run data:fetch-nominatim` → `npm run data:piers` (coordinates only from OSM) and check the existing
   piers didn't move.

Rotated column headers (pp. 12–13, 22, 28) are read bottom → top per text line and matched without spaces.

## How tables become trips (see `rules.ts`)

- Row tables (Kabataş – Adalar p. 12–13, Rumeli Kavağı – Eminönü p. 22, Anadolu Kavağı – Üsküdar p. 28,
  Uzun Boğaz Turu p. 35): one row = one trip; KALKIŞ = departure, VARIŞ = arrival, "-" = the trip skips that
  pier (the trip is the actual stop sequence; a pier pair it sails gets its own route leg). A time under
  KALKIŞ at a trip's last pier = the vessel is there by then (e.g. Eminönü → Sarıyer trips).
- Cycle tables (Kadıköy / Üsküdar – Karaköy – Eminönü, night Kadıköy – Karaköy – Beşiktaş): each column
  is one pier's departures; a row is one vessel's round (out via the printed piers, back from the last
  printed one), when every gap fits one vessel — otherwise each departure is its own trip.
- Times after midnight belong to the previous service day (stored as 24:00+).
- Arrival times the PDF doesn't print are computed in the app from the route length and line speed.
