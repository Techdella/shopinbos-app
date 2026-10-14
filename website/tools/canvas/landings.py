"""Render the site's feature and solution pages with the canvas's own landing template.

Replaces the canvas's LANDS / LAND_NAME data with plugins/shopinbos-core/includes/seed/landings.json (the
source of truth for that copy) and writes one V-land-<slug>.dc.html per page, ready for extract.js.
Also writes land-urls.json (page name -> URL) for canvas_build.py.

Usage: python3 -I landings.py <render dir> <landings.json>
"""
import json, re, sys

R, SRC = sys.argv[1:3]
pages = json.load(open(SRC))
src = open(R + '/Site-blog.dc.html').read().replace('/_blob/', 'blob/')
src = re.sub(r'onClick="\{\{\s*([^}\s]+)\s*\}\}"', r'onClick="{{\1}}" data-go="\1"', src)
src = src.replace('<sc-if value="{{item.open}}"', '<sc-if value="{{true}}"')

# Theme image file -> canvas image key.
IMG = {'person-hero.webp': 'p-hero', 'person-cta-right.webp': 'p-ctar', 'leather-slides.webp': 's-sandal', 'person-food.webp': 'p-food',
       'person-fashion.webp': 'p-fashion', 'person-cta-left.webp': 'p-ctal', 'person-gadgets.webp': 'p-gadgets',
       'peggy-wave.webp': 'peggy-wave', 'tote-bag.webp': 'f-bag', 'store-hero.webp': 'p-hero'}
URL = {('/features/' if p['type'] == 'sib_feature' else '/solutions/') + p['slug'] + '/': p['slug'] for p in pages}
NAME = {p['slug']: p['title'] for p in pages}

lands = {}
for p in pages:
    lands[p['slug']] = {
        'eyebrow': p['eyebrow'], 'h1': p['h1'], 'sub': p['sub'], 'img': IMG.get(p['img'], p['img'] if '.' not in p['img'] else 'p-hero'), 'bg': p['bg'], 'fit': p['fit'],
        'kws': p['kws'], 'ben': p['ben'], 'rows': p['rows'], 'faq': p['faq'], 'seo': p['seo'],
        'rel': [URL[u] for _, u in p.get('rel', []) if u in URL][:4],
    }


def replace_const(text, name, value):
    start = text.index('const ' + name + ' = {')
    i = text.index('{', start)
    depth = 0
    for j in range(i, len(text)):
        depth += {'{': 1, '}': -1}.get(text[j], 0)
        if depth == 0:
            break
    end = text.index(';', j)
    return text[:start] + 'const ' + name + ' = ' + json.dumps(value, ensure_ascii=False) + text[end:]


src = replace_const(src, 'LANDS', lands)
src = replace_const(src, 'LAND_NAME', NAME)
src = src.replace("LANDS['online-store']", "LANDS['storefront']").replace("(s.land || 'online-store')", "(s.land || 'storefront')")
for p in pages:
    s = src.replace('Object.assign(this.state, {"view": "blog"})', 'Object.assign(this.state, ' + json.dumps({'view': 'landing', 'land': p['slug']}) + ')')
    open(f"{R}/V-land-{p['slug']}.dc.html", 'w').write(s)
json.dump({NAME[k]: u for u, k in URL.items()}, open(R + '/land-urls.json', 'w'), ensure_ascii=False, indent=1)
print(len(pages), 'landing pages')
