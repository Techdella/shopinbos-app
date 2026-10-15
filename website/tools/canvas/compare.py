"""Render the site's compare pages with the canvas's own compare template.

Replaces the canvas's CMP data with plugins/shopinbos-core/includes/seed/comparisons.json and writes one
V-cmp-<slug>.dc.html per comparison, ready for extract.js. Also writes cmp-urls.json (title -> URL).

Usage: python3 -I compare.py <render dir> <comparisons.json>
"""
import json, re, sys

R, SRC = sys.argv[1:3]
items = json.load(open(SRC))
src = open(R + '/Site-blog.dc.html').read().replace('/_blob/', 'blob/')
src = re.sub(r'onClick="\{\{\s*([^}\s]+)\s*\}\}"', r'onClick="{{\1}}" data-go="\1"', src)
src = src.replace('<sc-if value="{{item.open}}"', '<sc-if value="{{true}}"')

WIN = {'us': 0, 'them': 1, 'tie': 2}
cmp = {}
for c in items:
    rows = [[x.strip() for x in r.split('|')] for r in c['rows']]
    cmp[c['slug']] = {
        'name': c['competitor'], 'h1': c['h1'], 'sub': c['sub'], 'kws': c['kws'], 'us': c['us'], 'them': c['them'],
        'rows': [r[:3] for r in rows], 'win': [WIN.get((r[3] if len(r) > 3 else 'tie').lower(), 2) for r in rows],
        'move': c['steps'], 'faq': [[x.strip() for x in f.split('|', 1)] for f in c.get('faq', []) if '|' in f],
    }

start = src.index('const CMP = {')
i = src.index('{', start)
depth = 0
for j in range(i, len(src)):
    depth += {'{': 1, '}': -1}.get(src[j], 0)
    if depth == 0:
        break
src = src[:start] + 'const CMP = ' + json.dumps(cmp, ensure_ascii=False) + src[src.index(';', j):]
# The page's own questions first, then the canvas's standard switching questions.
src = src.replace("faq: faqOf([['Is Shopinbos cheaper than ' + C.name", "faq: faqOf((C.faq || []).concat([['Is Shopinbos cheaper than ' + C.name", 1)
k = src.index("(C.faq || []).concat(")
end = src.index(']]),', k)
src = src[:end] + ']])),' + src[end + 4:]
src = src.replace('CMP[s.cmp] || CMP.shopify', 'CMP[s.cmp] || CMP[Object.keys(CMP)[0]]')
for c in items:
    s = src.replace('Object.assign(this.state, {"view": "blog"})', 'Object.assign(this.state, ' + json.dumps({'view': 'compare', 'cmp': c['slug']}) + ')')
    open(f"{R}/V-cmp-{c['slug']}.dc.html", 'w').write(s)
json.dump({'Shopinbos vs ' + c['competitor']: '/compare/' + c['slug'] + '/' for c in items}, open(R + '/cmp-urls.json', 'w'), ensure_ascii=False, indent=1)
print(len(items), 'comparisons')
