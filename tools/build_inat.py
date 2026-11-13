"""Régénère data/medias.json et data/inat.json depuis iNaturalist.
Lancé par GitHub Actions (.github/workflows/inat.yml) : aucune installation nécessaire.
- medias.json : pour chaque espèce, jusqu'à 8 photos de présentation sous licence libre
  (photos de taxon iNaturalist, puis les observations les plus appréciées de Guyane)
  et les localités des observations de qualité recherche en Guyane (coordonnées non masquées).
- inat.json : photos d'observations de qualité recherche en Guyane, pour le quiz."""
import csv, json, time, urllib.request, urllib.parse, re, sys

API = 'https://api.inaturalist.org/v1'
OK = {'cc0', 'cc-by', 'cc-by-nc', 'cc-by-sa', 'cc-by-nc-sa'}
GUYANE = 6949

def get(path, **q):
    url = f'{API}/{path}' + ('?' + urllib.parse.urlencode(q) if q else '')
    for k in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'SkwamatKwizz/1.0 (github.com/nicolasburnel/skwamat-kwizz)'})
            with urllib.request.urlopen(req, timeout=60) as r:
                time.sleep(1.1)
                return json.load(r)
        except Exception as e:
            print('retry', url, e, file=sys.stderr); time.sleep(5 * (k + 1))
    return {}

def clean(a):
    a = re.sub(r'^\(c\)\s*', '', a or '')
    a = re.sub(r',?\s*(some|no) rights reserved.*$', '', a, flags=re.I)
    a = re.sub(r',?\s*uploaded by.*$', '', a, flags=re.I)
    return a.strip() or 'iNaturalist'

def ext(url): return (url or '').rsplit('.', 1)[-1].split('?')[0]

rows = list(csv.DictReader(open('data/especes.csv', encoding='utf-8')))
medias, quiz = {}, {}
for r in rows:
    ids = [i for i in (r.get('inat_id') or '').split('+') if i.strip()]
    if not ids: continue
    tphotos, obs = [], []
    for tid in ids:
        t = (get(f'taxa/{tid}').get('results') or [{}])[0]
        for tp in t.get('taxon_photos') or []:
            p = tp.get('photo') or {}
            if p.get('license_code') in OK: tphotos.append([p['id'], ext(p.get('url')), clean(p.get('attribution')), p['license_code'], 0])
        for page in (1, 2, 3):
            j = get('observations', taxon_id=tid, place_id=GUYANE, quality_grade='research', per_page=200, page=page, order_by='votes')
            res = j.get('results') or []
            obs += res
            if len(res) < 200: break
    seen = {p[0] for p in tphotos}
    gf = []
    for o in sorted(obs, key=lambda o: -(o.get('faves_count') or 0)):
        for p in (o.get('photos') or [])[:3]:
            m = re.search(r'photos/(\d+)/\w+\.(\w+)', p.get('url') or '')
            if not m or p.get('license_code') not in OK or int(m.group(1)) in seen: continue
            seen.add(int(m.group(1)))
            gf.append([int(m.group(1)), m.group(2), o['id'], clean(p.get('attribution')), p['license_code']])
    ph = tphotos[:6]
    ph += [[q[0], q[1], q[3], q[4], q[2]] for q in gf[:max(0, 8 - len(ph))]]
    pts, cells = [], set()
    for o in obs:
        g = o.get('geojson')
        if not g or o.get('obscured'): continue
        lon, lat = g['coordinates']
        cell = (round(lon * 20), round(lat * 20))
        if cell in cells: continue
        cells.add(cell); pts.append([round(lon, 2), round(lat, 2)])
    medias[r['id']] = {'ph': ph, 'pt': pts, 'n': len(obs)}
    quiz[r['id']] = gf[:60]
    print(r['nom'], len(ph), len(gf), len(pts))

json.dump(medias, open('data/medias.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(quiz, open('data/inat.json', 'w'), ensure_ascii=False, separators=(',', ':'))
