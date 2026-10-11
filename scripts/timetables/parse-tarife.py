#!/usr/bin/env python3
"""
Şehir Hatları timetable PDF → cell tables, rebuilt from word geometry (never plain-text order).

  python3 scripts/timetables/parse-tarife.py data/raw/tarife.pdf [--render DIR]

Reads scripts/timetables/tarife-layout.json (where each of our tables sits), extracts every word
with its position (pdfplumber), clusters the time cells into columns (x) and rows (y) inside each
table's box, checks the column headers, and writes data/timetables-source.json:
one table per entry, rows = logical rows (continuation columns read down, then the next column),
each cell = null ("-", no call) or {"t": "HH:MM", "m": "*"} (footnote marker kept as printed).

Refuses (exit 1) when anything doesn't add up: wrong column count, two values in one cell, an
empty cell, a marker whose colour isn't the PDF's red, an unknown header, an unreadable time.
--render DIR also writes each parsed page as PNG (pdftoppm) for side-by-side checking.
Needs: python3 + pdfplumber (pip install pdfplumber), poppler-utils for --render.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
LAYOUT = json.loads((ROOT / 'scripts/timetables/tarife-layout.json').read_text(encoding='utf-8'))
OUT = ROOT / 'data/timetables-source.json'

# A time cell as printed, incl. the source's typos: "18.10", "9:15", "(08:15)", "(20:10)(V)", "06:10*".
TIME_RE = re.compile(r'^\(?(\d{1,2})[:.](\d{2})\)?(\(V\)|\(K\))?(\*{0,3})$')
DASH_RE = re.compile(r'^[-–—]$')
RED = (0.936539, 0.178497, 0.279251)  # the PDF's footnote red (checked: every marked time is red)


class ParseError(Exception):
    pass


def normalise_time(text):
    """'9:15' → ('09:15', ''), '06:10*' → ('06:10', '*'), '(20:10)(V)' → ('20:10', ''). None if not a time."""
    m = TIME_RE.match(text.strip())
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        raise ParseError(f'impossible time {text!r}')
    return f'{h:02d}:{mi:02d}', m.group(4)


def is_red(color):
    return color is not None and len(color) == 3 and all(abs(a - b) < 0.02 for a, b in zip(color, RED))


def cluster(values, gap):
    """1-D clusters: sorted values split where the gap exceeds `gap`. Returns list of (centre, members)."""
    out = []
    for v in sorted(values):
        if out and v - out[-1][-1] <= gap:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(c) / len(c) for c in out]


def nearest(centres, v):
    return min(range(len(centres)), key=lambda i: abs(centres[i] - v))


def norm_text(s):
    return re.sub(r'\s+', '', s).upper()


def page_text_of(page):
    """All upright words in reading order, de-duplicated (some pages draw their text twice)."""
    words = []
    for w in sorted(page.extract_words(), key=lambda w: (round(w['top'] / 2), w['x0'])):
        if not any(v['text'] == w['text'] and abs(v['x0'] - w['x0']) < 1.5 and abs(v['top'] - w['top']) < 1.5 for v in words):
            words.append(w)
    return norm_text(''.join(w['text'] for w in words))


def check_headers(page, table, col_centres):
    exp = [c['header'] for c in table['columns']]
    y0, y1 = table['headerBand']
    x0, _, x1, _ = table['bbox']
    if table.get('rotatedHeaders'):
        chars = [c for c in page.chars if not c.get('upright', True) and y0 <= c['top'] <= y1 and x0 <= c['x0'] <= x1]
        per = len(col_centres) // len(exp)
        for i, name in enumerate(exp):
            cx = col_centres[i * per]
            # rotated text: characters stacked vertically near the column centre, read bottom → top
            near = {(c['text'], round(c['x0'], 1), round(c['top'], 1)): c for c in chars if abs((c['x0'] + c['x1']) / 2 - cx) < 10}.values()
            # each header is a few rotated text lines side by side: split them by x, read each bottom → top
            lines = {}
            for c in near:
                lines.setdefault(round(c['x0'] / 1.5), []).append(c)
            texts = [norm_text(''.join(c['text'] for c in sorted(cs, key=lambda c: -c['top']))) for cs in lines.values()]
            text = '|'.join(texts)
            if not any(norm_text(name).replace('.', '') == t.replace('.', '') for t in texts):
                raise ParseError(f"{table['id']}: column {i} header {name!r} not found (read {text[:40]!r})")
        return
    words = [w for w in page.extract_words() if w['upright'] and y0 <= w['top'] <= y1 and x0 - 5 <= w['x0'] <= x1 + 5]
    text = norm_text(''.join(w['text'] for w in sorted(words, key=lambda w: (round(w['top'] / 3), w['x0']))))
    # headers must appear in left→right order
    pos = 0
    for name in exp:
        k = text.find(norm_text(name), pos)
        if k < 0:
            raise ParseError(f"{table['id']}: header {name!r} missing or out of order in {text!r}")
        pos = k + len(norm_text(name))


def parse_table(page, table):
    x0, top, x1, bottom = table['bbox']
    cells = []
    for w in page.extract_words(extra_attrs=['non_stroking_color', 'upright']):
        cx, cy = (w['x0'] + w['x1']) / 2, (w['top'] + w['bottom']) / 2
        if not (x0 <= cx <= x1 and top <= cy <= bottom) or not w['upright']:
            continue
        # some pages draw their text twice (sometimes a fraction of a point apart)
        if any(c['raw'] == w['text'] and abs(c['x'] - cx) < 1.5 and abs(c['y'] - cy) < 1.5 for c in cells):
            continue
        text = w['text']
        if DASH_RE.match(text):
            cells.append({'x': cx, 'y': cy, 'v': None, 'raw': text})
            continue
        t = normalise_time(text)
        if t is None:
            raise ParseError(f"{table['id']}: unreadable cell {text!r} at ({cx:.0f}, {cy:.0f})")
        if bool(t[1]) != is_red(w['non_stroking_color']):
            raise ParseError(f"{table['id']}: marker/colour mismatch for {text!r} (colour {w['non_stroking_color']})")
        cells.append({'x': cx, 'y': cy, 'v': {'t': t[0], **({'m': t[1]} if t[1] else {})}, 'raw': text})
    # Some "-" cells are tiny vector strokes instead of text.
    for g in page.lines + page.curves + page.rects:
        w, h = g['x1'] - g['x0'], g['bottom'] - g['top']
        cx, cy = (g['x0'] + g['x1']) / 2, (g['top'] + g['bottom']) / 2
        if 0.5 <= w <= 3.5 and h <= 1.2 and x0 <= cx <= x1 and top <= cy <= bottom:
            if not any(c['v'] is None and abs(c['x'] - cx) < 1.5 and abs(c['y'] - cy) < 1.5 for c in cells):
                cells.append({'x': cx, 'y': cy, 'v': None, 'raw': '-(stroke)'})

    n_cols = len(table['columns']) * table['perStop']
    cols = cluster([c['x'] for c in cells], 5.5)
    if len(cols) != n_cols:
        raise ParseError(f"{table['id']}: {len(cols)} columns found, expected {n_cols} ({[round(c) for c in cols]})")
    rows = cluster([c['y'] for c in cells], 3.2)
    grid = [[None] * n_cols for _ in rows]
    filled = [[False] * n_cols for _ in rows]
    for c in cells:
        r, k = nearest(rows, c['y']), nearest(cols, c['x'])
        if abs(rows[r] - c['y']) > 3.0:
            raise ParseError(f"{table['id']}: cell {c['raw']!r} sits between rows")
        if filled[r][k]:
            raise ParseError(f"{table['id']}: two values in row {r} column {k}: {grid[r][k]} and {c['raw']!r}")
        grid[r][k] = c['v']
        filled[r][k] = True
    for r, row in enumerate(filled):
        for k, ok in enumerate(row):
            if not ok:
                raise ParseError(f"{table['id']}: empty cell at row {r} column {k}")
    check_headers(page, table, cols)
    page_text = page_text_of(page)
    for mark, text in table.get('footnotes', {}).items():
        if norm_text(mark + text) not in page_text:
            raise ParseError(f"{table['id']}: footnote {mark}{text!r} is not printed on page {table['page']}")
    used = {c['v']['m'] for c in cells if c['v'] and 'm' in c['v']}
    if used - set(table.get('footnotes', {})):
        raise ParseError(f"{table['id']}: markers {used - set(table.get('footnotes', {}))} have no footnote in the layout")
    title = norm_text(table['title'])
    if title not in page_text or norm_text(table['days']) not in page_text:
        raise ParseError(f"{table['id']}: title or day heading not found on page {table['page']}")

    # Physical columns are stop-major: [stop0 part0, stop0 part1, …]. Logical rows: part 0 rows, then part 1 rows, …
    per = table['perStop']
    logical = []
    for part in range(per):
        for r in range(len(rows)):
            logical.append([grid[r][s * per + part] for s in range(len(table['columns']))])
    # Trailing continuation rows that are all "-" carry no information.
    while logical and all(v is None for v in logical[-1]):
        logical.pop()
    return {
        'id': table['id'],
        'page': table['page'],
        'title': table['title'],
        'days': table['days'],
        'columns': [{'stop': c['stop'], 'kind': c['kind']} for c in table['columns']],
        'footnotes': table.get('footnotes', {}),
        'notes': table.get('notes', []),
        'rows': logical,
    }


def check_cover(pdf):
    words = norm_text(' '.join(w['text'] for w in pdf.pages[0].extract_words()))
    for w in LAYOUT['pdf']['titleWords']:
        if norm_text(w) not in words:
            raise ParseError(f'cover page: {w!r} not found — is this the expected timetable?')
    # validity dates as printed on the cover: "7 EYLÜL / SEPTEMBER 2026" … "27 HAZİRAN / JUNE 2027"
    if not re.search(r'7EYLÜL/SEPTEMBER2026', words) or not re.search(r'27HAZİRAN/JUNE2027', words):
        raise ParseError(f'cover page: validity dates changed ({words[:120]!r}) — update tarife-layout.json')


def self_test():
    """The source's typo forms (seen on other lines' pages: 17, 24, 25, 33) normalise as printed."""
    cases = {'18.10': ('18:10', ''), '9:15': ('09:15', ''), '(08:15)': ('08:15', ''), '(20:10)(V)': ('20:10', ''),
             '06:10*': ('06:10', '*'), '06:30**': ('06:30', '**'), '20:55***': ('20:55', '***'), '00:00': ('00:00', '')}
    for raw, want in cases.items():
        got = normalise_time(raw)
        assert got == want, f'{raw!r} → {got!r}, want {want!r}'
    for raw in ['15:00’e', '(00:30-05:30)', 'KALKIŞ', '24:10']:
        try:
            assert normalise_time(raw) is None, raw
        except ParseError:
            pass
    print('self-test ok')


def main():
    args = sys.argv[1:]
    if args == ['--self-test']:
        return self_test()
    if not args:
        print(__doc__)
        sys.exit(2)
    pdf_path = Path(args[0])
    render = Path(args[args.index('--render') + 1]) if '--render' in args else None
    with pdfplumber.open(pdf_path) as pdf:
        check_cover(pdf)
        tables = [parse_table(pdf.pages[t['page'] - 1], t) for t in LAYOUT['tables']]
    for t in tables:
        n = sum(1 for r in t['rows'] for v in r if v)
        print(f"  ✓ {t['id']:<34} p{t['page']:<3} {len(t['rows']):>3} rows, {n:>3} times")
    out = {
        'source': 'Şehir Hatları winter timetable 2026-27',
        'file': pdf_path.name,
        'validFrom': LAYOUT['pdf']['validFrom'],
        'validTo': LAYOUT['pdf']['validTo'],
        'holidayRule': 'RESMİ TATİL GÜNLERİNDE PAZAR TARİFESİ UYGULANIR (p38)',
        'tables': tables,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Wrote {OUT.relative_to(ROOT)}')
    if render:
        render.mkdir(parents=True, exist_ok=True)
        for p in sorted({t['page'] for t in LAYOUT['tables']}):
            subprocess.run(['pdftoppm', '-r', '220', '-png', '-f', str(p), '-l', str(p), str(pdf_path), str(render / 'page')], check=True)
        print(f'Rendered pages to {render}')


if __name__ == '__main__':
    try:
        main()
    except ParseError as e:
        print(f'✗ {e}', file=sys.stderr)
        sys.exit(1)
