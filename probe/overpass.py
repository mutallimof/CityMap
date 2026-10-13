# One Overpass query: ferry terminals / named piers in the city + islands box, and anything named / operated Dentur or Turyol.
import json, urllib.request, urllib.parse
Q = '''[out:json][timeout:90];
(
 nwr["amenity"="ferry_terminal"](40.84,28.95,41.06,29.15);
 nwr["man_made"="pier"]["name"](40.84,28.95,41.06,29.15);
 nwr["name"~"Dentur|Turyol",i](40.82,28.8,41.26,29.3);
 nwr["operator"~"Dentur|Turyol",i](40.82,28.8,41.26,29.3);
);
out tags center;'''
UA = 'IstanbulLivingCityBot/0.1 (+https://mutallimof.github.io/CityMap/) probe'
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']:
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode({'data': Q}).encode(), headers={'User-Agent': UA}), timeout=120)
        d = json.load(r); break
    except Exception as e: print('ERR', url, e)
for el in d['elements']:
    t = el.get('tags', {}); c = el.get('center') or {'lat': el.get('lat'), 'lon': el.get('lon')}
    print(f"OSM {el['type']}/{el['id']} | {t.get('name','')} | op={t.get('operator','')} | {t.get('amenity','')}{t.get('man_made','')} | {c['lat']:.6f},{c['lon']:.6f} | " + ' '.join(f'{k}={v}' for k, v in t.items() if k not in ('name','operator','amenity','man_made') and not k.startswith('name:'))[:200])
