"""Render the canvas's free PDF page with the site's real guides.

Replaces the canvas's PDFS list with the Starter Kit and three other guides from
plugins/shopinbos-core/includes/seed/resources.json (so page counts and "More free PDFs" are real) and writes
V-pdf-kit.dc.html, plus a pop-up variant for each pop-up (pdf, exit, news, cookie) on the home view.

Usage: python3 -I pdfs.py <render dir> <resources.json>
"""
import json, re, sys

R, SRC = sys.argv[1:3]
res = {r['slug']: r for r in json.load(open(SRC))}
src = open(R + '/Site-blog.dc.html').read().replace('/_blob/', 'blob/')
src = re.sub(r'onClick="\{\{\s*([^}\s]+)\s*\}\}"', r'onClick="{{\1}}" data-go="\1"', src)

STYLE = {'guide': ('#FF6A2B', '#FFFFFF', '#FFE27A'), 'workbook': ('#0C4A44', '#FFFFFF', '#8BE3D3'),
         'template': ('#FFE27A', '#16141F', '#FF6A2B'), 'checklist': ('#E7E1FF', '#16141F', '#5B3FD6')}
TAG = {'guide': 'Guide', 'workbook': 'Workbook', 'template': 'Templates', 'checklist': 'Checklist'}
PICK = [('online-sellers-starter-kit', 'Most downloaded'), ('product-pricing-calculator-template', None),
        ('abandoned-cart-email-templates', 'Email and WhatsApp'), ('first-90-days-launch-checklist', None)]
pdfs = []
for slug, tag in PICK:
    r = res[slug]
    bg, fg, acc = STYLE[r['style']]
    sub = r['sub'] if len(r['sub']) < 90 else r['sub'][:r['sub'].rfind(' ', 0, 85)] + '…'
    pdfs.append({'key': slug, 't': r['title'], 'd': sub, 'pages': int(r['pages']), 'bg': bg, 'fg': fg, 'acc': acc, 'tag': tag or TAG[r['style']]})
json.dump({p['t']: '/resources/' + p['key'] + '/' for p in pdfs}, open(R + '/pdf-urls.json', 'w'), ensure_ascii=False, indent=1)

start = src.index('const PDFS = [')
end = src.index('];', start) + 2
src = src[:start] + 'const PDFS = ' + json.dumps(pdfs, ensure_ascii=False) + ';' + src[end:]
src = src.replace("(s.pdfKey || 'kit')", "(s.pdfKey || 'online-sellers-starter-kit')").replace("pdfKey: 'kit'", "pdfKey: 'online-sellers-starter-kit'")


def gen(name, state, open_faq=True):
    s = src.replace('<sc-if value="{{item.open}}"', '<sc-if value="{{true}}"') if open_faq else src
    s = s.replace('Object.assign(this.state, {"view": "blog"})', 'Object.assign(this.state, ' + json.dumps(state) + ')')
    open(f'{R}/V-{name}.dc.html', 'w').write(s)


gen('pdf-kit', {'view': 'pdf'})
gen('pdf-kit-done', {'view': 'pdf', 'pdfDone': True})
for pop in ['pdf', 'exit', 'news', 'cookie']:
    gen('pop-' + pop, {'view': 'home', 'pop': pop})
gen('pop-pdf-done', {'view': 'home', 'pop': 'pdf', 'pdfDone': True})
print(len(pdfs), 'pdfs')
