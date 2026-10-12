#!/usr/bin/env python3
"""
City sound files: data/catalog/sounds.json → public/audio/<id>.webm (Opus) + <id>.m4a (AAC, iOS-safe) + credits.

  python3 scripts/audio/build-audio.py            # download (data/raw/audio), check licences, build
  python3 scripts/audio/build-audio.py --offline  # reuse data/raw/audio + data/raw/audio/meta.json

Needs ffmpeg (libopus + aac) and network access to commons.wikimedia.org (the dev sandbox has none: run it in
GitHub Actions). Every source's licence and author are read from its Commons file page and must match the
catalog and be CC0 / public domain / CC BY — otherwise nothing is written. Fails if either format's total
exceeds the mobile budget.
"""
import html, json, os, re, subprocess, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAT = os.path.join(ROOT, 'data/catalog/sounds.json')
RAW = os.path.join(ROOT, 'data/raw/audio')
OUT = os.path.join(ROOT, 'public/audio')
UA = 'IstanbulLivingCityBot/0.1 (+https://mutallimof.github.io/CityMap/; audio build)'
ALLOWED = re.compile(r'^(CC0|Public domain|CC BY \d\.\d)$')
BUDGET = 2_000_000  # bytes per format
SR = 32000
OPUS = ['-c:a', 'libopus', '-b:a', '24k', '-vbr', 'on', '-application', 'audio', '-f', 'webm']
AAC = ['-c:a', 'aac', '-b:a', '28k', '-ar', str(SR), '-movflags', '+faststart', '-f', 'mp4']
XFADE = 2.5  # s between parts of one output


def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()


def commons(title):
    q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'formatversion': 2, 'prop': 'imageinfo', 'titles': 'File:' + title,
                                'iiprop': 'url|sha1|extmetadata', 'iiextmetadatafilter': 'LicenseShortName|LicenseUrl|Artist'})
    with urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?' + q, headers={'User-Agent': UA}), timeout=40) as r:
        p = json.load(r)['query']['pages'][0]
    ii = p['imageinfo'][0]
    em = {k: v.get('value') for k, v in ii['extmetadata'].items()}
    return {'url': ii['url'], 'page': ii['descriptionurl'], 'sha1': ii['sha1'], 'licence': em.get('LicenseShortName'),
            'licenceUrl': em.get('LicenseUrl'), 'artist': strip(em.get('Artist'))}


def run(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def lufs(path):
    out = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', out)[-1])


def main():
    cat = json.load(open(CAT))
    os.makedirs(RAW, exist_ok=True)
    meta_path = os.path.join(RAW, 'meta.json')
    offline = '--offline' in sys.argv
    meta = json.load(open(meta_path)) if offline else {}
    bad = []
    for key, s in cat['sources'].items():
        if not offline:
            meta[key] = commons(s['file'])
            time.sleep(1)
        m = meta[key]
        if not ALLOWED.match(m['licence'] or '') or m['licence'] != s['licence']:
            bad.append(f"{key}: Commons says {m['licence']!r}, catalog {s['licence']!r}")
        raw = m.get('raw') if offline else os.path.join(RAW, key + os.path.splitext(s['file'])[1])
        if not offline and not os.path.exists(raw):
            with urllib.request.urlopen(urllib.request.Request(m['url'], headers={'User-Agent': UA}), timeout=180) as r, open(raw, 'wb') as f:
                f.write(r.read())
            time.sleep(1)
        m['raw'] = raw
    json.dump(meta, open(meta_path, 'w'), ensure_ascii=False, indent=1)
    if bad:
        sys.exit('licence check failed:\n  ' + '\n  '.join(bad))

    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(RAW, 'tmp')
    os.makedirs(tmp, exist_ok=True)
    sizes = {'webm': 0, 'm4a': 0}
    used = set()
    for o in cat['outputs']:
        # Cut each part to mono 32 kHz WAV, loudness-match the parts, join with short crossfades.
        parts = []
        for k, (src, a, b) in enumerate(o['parts']):
            used.add(src)
            p = os.path.join(tmp, f"{o['id']}-{k}.wav")
            run(['-ss', str(a), '-to', str(b), '-i', meta[src]['raw'], '-ac', '1', '-ar', str(SR), '-af', 'highpass=f=40', p])
            q = p + '.n.wav'
            run(['-i', p, '-af', f"volume={o['lufs'] - lufs(p):.2f}dB", q])
            parts.append(q)
        joined = os.path.join(tmp, o['id'] + '.wav')
        if len(parts) == 1:
            os.replace(parts[0], joined)
        else:
            inputs = sum((['-i', p] for p in parts), [])
            chain, last = [], '[0]'
            for k in range(1, len(parts)):
                lab = f'[x{k}]'
                chain.append(f'{last}[{k}]acrossfade=d={XFADE}:c1=qsin:c2=qsin{lab}')
                last = lab
            run([*inputs, '-filter_complex', ';'.join(chain), '-map', last, joined])
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', joined], capture_output=True, text=True).stdout)
        fade = o.get('fadeOut', 0.05)
        final = os.path.join(tmp, o['id'] + '.final.wav')
        run(['-i', joined, '-af', f'afade=t=in:d=0.03,afade=t=out:st={dur - fade:.3f}:d={fade},alimiter=limit=0.89:level=false', final])
        for ext, codec in (('webm', OPUS), ('m4a', AAC)):
            dst = os.path.join(OUT, f"{o['id']}.{ext}")
            run(['-i', final, '-map_metadata', '-1', *codec, dst])
            sizes[ext] += os.path.getsize(dst)
        print(f"{o['id']:10} {dur:6.1f} s  webm {os.path.getsize(os.path.join(OUT, o['id'] + '.webm')) // 1000:4} kB  m4a {os.path.getsize(os.path.join(OUT, o['id'] + '.m4a')) // 1000:4} kB")
    print(f"total: webm {sizes['webm'] / 1e6:.2f} MB, m4a {sizes['m4a'] / 1e6:.2f} MB (budget {BUDGET / 1e6:.1f} MB each)")
    if max(sizes.values()) > BUDGET:
        sys.exit('over the mobile budget')
    write_credits(cat, meta, sorted(used))


def write_credits(cat, meta, used):
    rows = []
    for key in used:
        s, m = cat['sources'][key], meta[key]
        lic = f'<a href="{html.escape(m["licenceUrl"])}">{html.escape(m["licence"])}</a>' if m.get('licenceUrl') else html.escape(m['licence'])
        rows.append(f'<li><a href="{html.escape(m["page"])}">{html.escape(s["file"])}</a> — {html.escape(s["what"])}<br>'
                    f'<small>{html.escape(s["author"])} · {lic}</small></li>')
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sound credits</title>
<style>:root{{color-scheme:light dark}}body{{font:15px/1.5 system-ui,sans-serif;max-width:720px;margin:0 auto;padding:16px;background:Canvas;color:CanvasText}}li{{margin:0 0 10px}}small{{opacity:.75}}</style>
</head><body>
<h1>Sound credits</h1>
<p>Istanbul Living City plays real field recordings from Wikimedia Commons, cut, mixed and re-encoded (mono, Opus / AAC).
Licences as stated on each file page (CC0, public domain or Creative Commons Attribution).</p>
<ul>
{chr(10).join(rows)}
</ul>
</body></html>
'''
    open(os.path.join(OUT, 'credits.html'), 'w').write(page)


if __name__ == '__main__':
    main()
