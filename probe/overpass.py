# One Overpass query: ferry terminals / named piers in the city + islands box, and anything named / operated Dentur or Turyol.
import json, urllib.request, urllib.parse
Q = '''[out:json][timeout:90];
rel(id:4473141,4473142,4473144,4473161,4476422);
out body;
(node(r); way(r););
out tags center;
(way(id:237469603,321390068,321202454,239596979,321389289,117469390););
out geom;'''
UA = 'IstanbulLivingCityBot/0.1 (+https://mutallimof.github.io/CityMap/) probe'
for url in ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']:
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, data=urllib.parse.urlencode({'data': Q}).encode(), headers={'User-Agent': UA}), timeout=120)
        d = json.load(r); break
    except Exception as e: print('ERR', url, e)
for el in d['elements']:
    if el['type'] == 'relation':
        print('REL', el['id'], el.get('tags', {}).get('name'), [(m['type'], m['ref'], m['role']) for m in el['members']]); continue
    if el.get('geometry'):
        g = el['geometry']; print('GEOM', el['id'], el.get('tags', {}).get('name'), 'start', g[0], 'end', g[-1]); continue
    t = el.get('tags', {}); c = el.get('center') or {'lat': el.get('lat'), 'lon': el.get('lon')}
    print(f"OSM {el['type']}/{el['id']} | {t.get('name','')} | op={t.get('operator','')} | {t.get('amenity','')}{t.get('man_made','')} | {c['lat']:.6f},{c['lon']:.6f} | " + ' '.join(f'{k}={v}' for k, v in t.items() if k not in ('name','operator','amenity','man_made') and not k.startswith('name:'))[:200])
