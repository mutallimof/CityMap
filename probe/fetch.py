# Polite probe: one request at a time, >= 4.5 s apart, clear UA. Prints a digest to the log only.
import sys, time, re, json, html, urllib.request, urllib.error
UA = 'IstanbulLivingCityBot/0.1 (+https://mutallimof.github.io/CityMap/; fikretmutallimov at gmail.com) probe'
KEY = re.compile(r'sefer|saat|tarife|timetable|schedule|hareket|kullan|kosul|koşul|gizli|yasal|legal|terms|kvkk|cerez|çerez|privacy|hakk|imprint|iletisim|iletişim|contact|api|json|ajax|hat|line|iskele|pier|route|guzergah|güzergah|bilgi', re.I)
def text_of(h):
    h = re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ', h)
    h = re.sub(r'(?s)<[^>]+>', ' ', h)
    return re.sub(r'\s+', ' ', html.unescape(h)).strip()
import os
ALL = os.environ.get('ALL') == '1'
SCRIPTMAX = int(os.environ.get('SCRIPTMAX', '4000'))
def run(urls, textmax):
    first = True
    for u in urls:
        if not first: time.sleep(4.5)
        first = False
        print('\n' + '=' * 100 + '\nURL', u, flush=True)
        req = urllib.request.Request(u, headers={'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'tr,en;q=0.8'})
        try:
            r = urllib.request.urlopen(req, timeout=25); code = r.status; body = r.read(); hdr = r.headers; final = r.geturl()
        except urllib.error.HTTPError as e:
            code = e.code; body = e.read(); hdr = e.headers; final = u
        except Exception as e:
            print('ERROR', repr(e)); continue
        ct = hdr.get('content-type', '')
        print('STATUS', code, 'FINAL', final, 'TYPE', ct, 'BYTES', len(body))
        s = body.decode('utf-8', 'replace')
        if 'json' in ct or s.lstrip()[:1] in '[{':
            try:
                print(json.dumps(json.loads(s), ensure_ascii=False, indent=1)[:textmax]); continue
            except Exception: pass
        if 'html' in ct or '<html' in s[:2000].lower():
            m = re.search(r'(?is)<title[^>]*>(.*?)</title>', s); print('TITLE', m and m.group(1).strip())
            links = sorted(set(re.findall(r'''(?:href|src|action|data-url|url)\s*[=:]\s*["']([^"'#][^"']*)["']''', s)))
            print('LINKS', len(links))
            for l in links:
                if KEY.search(l) or l.endswith('.js') or l.endswith('.pdf'): print('  L', l)
            for m in sorted(set(re.findall(r'''["'`](/?[\w\-/.]*(?:api|ajax|json|Sefer|sefer|Hat|hat|Tarife|tarife|Saat|saat)[\w\-/.?=&]*)["'`]''', s)))[:120]:
                print('  S', m)
            if ALL: 
                for l in links:
                    if not l.startswith('/_next') and 'image' not in l: print('  A', l)
            for sc in re.findall(r'(?is)<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', s):
                if re.search(r'\d{1,2}[:.]\d{2}|sefer|Sefer|tarife|ajax|url', sc): print('SCRIPT', len(sc), sc[:SCRIPTMAX].replace('\n', ' '))
            print('TEXT', text_of(s)[:textmax])
        else:
            print(s[:textmax])
if __name__ == '__main__':
    run([l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')], int(sys.argv[2]) if len(sys.argv) > 2 else 6000)
