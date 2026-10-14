"""Build branded PDFs for the lead magnets.

python3 -I make_pdfs.py <docx dir> <theme dir> <work dir>
Writes <work>/html/<slug>-{cover,body,back}.html and <work>/manifest.json; print_pdfs.js prints them.
"""
import json, os, re, sys, html as H
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from convert import convert  # noqa: E402

SRC, THEME, WORK = sys.argv[1:4]
IMG = 'file://' + os.path.join(THEME, 'assets/img/')
FONTS = 'file://' + os.path.join(THEME, 'assets/fonts/')
os.makedirs(os.path.join(WORK, 'html'), exist_ok=True)
os.makedirs(os.path.join(WORK, 'flat'), exist_ok=True)


def flat(file, bg):
    """A cut-out photo flattened onto a solid colour as JPEG, so PDFs stay small."""
    from PIL import Image
    out = os.path.join(WORK, 'flat', f"{file.split('.')[0]}-{bg.strip('#')}.jpg")
    if not os.path.exists(out):
        im = Image.open(os.path.join(THEME, 'assets/img', file)).convert('RGBA')
        base = Image.new('RGBA', im.size, bg)
        base.alpha_composite(im)
        base.convert('RGB').save(out, 'JPEG', quality=84, optimize=True, progressive=True)
    return 'file://' + out

STYLES = {  # cover style: background, text, accent, label
    'guide': ('#FF6A2B', '#FFFFFF', '#FFE27A', 'FREE GUIDE'),
    'workbook': ('#0C4A44', '#FFFFFF', '#8BE3D3', 'FREE WORKBOOK'),
    'template': ('#FFE27A', '#16141F', '#FF6A2B', 'FREE TEMPLATES'),
    'checklist': ('#E7E1FF', '#16141F', '#5B3FD6', 'FREE CHECKLIST'),
}
PEOPLE = ['person-hero.webp', 'person-cta-left.webp', 'person-cta-right.webp', 'person-fashion.webp']

FONT_CSS = f"""
@font-face {{ font-family: 'Bricolage Grotesque'; src: url('{FONTS}bricolage-grotesque-latin.woff2') format('woff2'); font-weight: 200 800; }}
@font-face {{ font-family: 'Plus Jakarta Sans'; src: url('{FONTS}plus-jakarta-sans-latin.woff2') format('woff2'); font-weight: 200 800; }}
@font-face {{ font-family: 'Fraunces'; src: url('{FONTS}fraunces-latin.woff2') format('woff2'); font-weight: 100 900; }}
* {{ box-sizing: border-box; }}
html, body {{ margin: 0; padding: 0; }}
body {{ font-family: 'Plus Jakarta Sans', sans-serif; color: #16141F; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.disp {{ font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; letter-spacing: -0.02em; }}
"""


def style_for(title):
    t = title.lower()
    if 'checklist' in t or 'cheat sheet' in t:
        return 'checklist'
    if 'template' in t or 'swipe' in t or 'pack' in t and 'starter pack' not in t:
        return 'template'
    if 'toolkit' in t or 'worksheet' in t or 'calculator' in t or 'kit' in t:
        return 'workbook'
    return 'guide'


def slugify(t):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', t.lower())).strip('-')[:70].strip('-')


def body_html(d):
    h = d['html']
    h = re.sub(r'<h1[^>]*>', '<h2>', h).replace('</h1>', '</h2>')
    # number chapters (H2) for the contents page
    chapters = []

    def num(m):
        chapters.append(H.unescape(re.sub('<[^>]+>', '', m.group(2)).strip()))
        n = len(chapters)
        return f'<h2 id="ch{n}" class="disp"><span class="chn">{n:02d}</span>{m.group(2)}</h2>'
    h = re.sub(r'<h2([^>]*)>(.*?)</h2>', num, h, flags=re.S)
    # checklists: list items that start with a box character or any list under a heading containing "checklist" -> empty boxes
    h = re.sub(r'<li>\s*(?:☐|\[ \]|□)\s*', '<li class="box">', h)
    h = h.replace('Shopping Boss', 'Shopinbos')
    return h, chapters


def page_cover(d, st, person, pages_label):
    bg, fg, acc, label = STYLES[st]
    logo = 'logo-light.png' if fg == '#FFFFFF' else 'logo-dark.png'
    title = H.escape(d['title'])
    sub = H.escape(d['sub'])
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
@page {{ size: A4; margin: 0; }}
.cover {{ width: 210mm; height: 297mm; background: {bg}; color: {fg}; position: relative; overflow: hidden; padding: 22mm 18mm; display: flex; flex-direction: column; }}
.circle {{ position: absolute; right: -40mm; top: -30mm; width: 130mm; height: 130mm; border-radius: 50%; background: {acc}; opacity: .35; }}
.logo {{ height: 6mm; position: relative; align-self: flex-start; }}
.label {{ margin-top: 22mm; font-weight: 800; font-size: 10pt; letter-spacing: .16em; position: relative; display: inline-flex; gap: 8px; align-items: center; }}
.label span {{ border: 1.5px solid {fg}; border-radius: 999px; padding: 4px 12px; }}
h1 {{ font-size: 40pt; line-height: 1.02; margin: 8mm 0 0; max-width: 150mm; position: relative; }}
.sub {{ font-size: 13pt; line-height: 1.5; max-width: 118mm; margin-top: 6mm; position: relative; opacity: .92; }}
.person {{ position: absolute; right: 6mm; bottom: 0; height: 128mm; width: auto; }}
.foot {{ position: absolute; left: 18mm; bottom: 18mm; font-size: 10pt; font-weight: 700; display: flex; flex-direction: column; gap: 3mm; }}
.chip {{ background: #FFFFFF; color: #16141F; border-radius: 999px; padding: 6px 14px; align-self: flex-start; }}
</style></head><body><div class="cover"><div class="circle"></div>
<img class="logo" src="{IMG}{logo}" alt="Shopinbos">
<div class="label"><span>{label} · 2026 EDITION</span></div>
<h1 class="disp">{title}</h1><div class="sub">{sub}</div>
<img class="person" src="{flat(person, bg)}" alt="">
<div class="foot"><span class="chip">{pages_label}</span><span>shopinbos.com</span></div>
</div></body></html>"""


def page_body(d, h, chapters, st):
    bg, fg, acc, label = STYLES[st]
    acc_text = '#B23E0A' if st in ('guide', 'template') else ('#0C4A44' if st == 'workbook' else '#5B3FD6')
    toc = ''.join(f'<li><span class="n">{i:02d}</span><a href="#ch{i}">{H.escape(c)}</a></li>' for i, c in enumerate(chapters, 1))
    intro = f'{len(chapters)} short sections. Read it in order, or jump to the part you need today.' if chapters else ''
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
@page {{ size: A4; margin: 24mm 18mm 22mm; }}
body {{ font-size: 10.5pt; line-height: 1.6; }}
.toc {{ page-break-after: always; }}
.toc h2 {{ font-size: 26pt; margin: 0 0 4mm; }}
.toc p {{ color: #4A4655; font-size: 11.5pt; max-width: 150mm; }}
.toc ol {{ list-style: none; padding: 0; margin: 10mm 0 0; }}
.toc li {{ display: flex; gap: 6mm; align-items: baseline; padding: 4mm 0; border-bottom: 1px solid #ECEAF2; font-size: 12pt; font-weight: 700; }}
.toc li a {{ color: #16141F; text-decoration: none; }}
.toc .n {{ font-family: 'Bricolage Grotesque'; font-weight: 800; font-size: 20pt; color: {acc_text if st != 'template' else '#FF6A2B'}; min-width: 14mm; }}
.content h2 {{ font-size: 19pt; line-height: 1.15; margin: 10mm 0 4mm; page-break-after: avoid; display: flex; gap: 4mm; align-items: baseline; }}
.content h2 .chn {{ color: {acc_text}; font-size: 13pt; }}
.content h3 {{ font-family: 'Bricolage Grotesque'; font-weight: 800; font-size: 13pt; margin: 7mm 0 2mm; page-break-after: avoid; }}
.content h4 {{ font-size: 11pt; margin: 5mm 0 2mm; }}
.content p {{ margin: 0 0 3mm; color: #2B2836; }}
.content a {{ color: {acc_text}; }}
.content ul, .content ol {{ margin: 0 0 4mm; padding-left: 6mm; }}
.content li {{ margin: 0 0 1.5mm; }}
.content li.box {{ list-style: none; position: relative; }}
.content li.box::before {{ content: ''; position: absolute; left: -6mm; top: 1mm; width: 3.4mm; height: 3.4mm; border: 1.5px solid #16141F; border-radius: 1mm; }}
.content table {{ width: 100%; border-collapse: collapse; margin: 3mm 0 6mm; font-size: 9.5pt; page-break-inside: avoid; }}
.content th {{ background: #16141F; color: #fff; text-align: left; padding: 2.5mm 3mm; }}
.content td {{ border-bottom: 1px solid #ECEAF2; padding: 2.5mm 3mm; vertical-align: top; }}
.content tr:nth-child(even) td {{ background: #F6F5F9; }}
.content blockquote {{ margin: 4mm 0; padding: 4mm 6mm; background: #E2F6F1; border-radius: 3mm; color: #0C4A44; }}
.content strong {{ color: #16141F; }}
</style></head><body>
<section class="toc"><h2 class="disp">What’s inside</h2><p>{intro}</p><ol>{toc}</ol></section>
<section class="content">{h}</section>
</body></html>"""


def page_back():
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
@page {{ size: A4; margin: 0; }}
.back {{ width: 210mm; height: 297mm; background: #16141F; color: #fff; position: relative; overflow: hidden; padding: 30mm 18mm; display: flex; flex-direction: column; justify-content: center; gap: 8mm; }}
.circle {{ position: absolute; right: -50mm; top: -60mm; width: 160mm; height: 160mm; border-radius: 50%; background: rgba(255,255,255,.06); }}
h2 {{ font-size: 38pt; line-height: 1.05; margin: 0; max-width: 150mm; }}
p {{ font-size: 14pt; color: #C9C6D3; max-width: 140mm; line-height: 1.5; margin: 0; }}
.btn {{ align-self: flex-start; background: #FF6A2B; color: #fff; border-radius: 999px; padding: 5mm 9mm; font-weight: 800; font-size: 13pt; text-decoration: none; }}
.rex {{ width: 62mm; position: absolute; right: 18mm; bottom: 34mm; }}
.copy {{ position: absolute; left: 18mm; bottom: 16mm; font-size: 9pt; color: #9C98A8; }}
.logo {{ height: 6mm; position: absolute; left: 18mm; top: 18mm; }}
</style></head><body><div class="back"><div class="circle"></div><img class="logo" src="{IMG}logo-light.png" alt="Shopinbos">
<h2 class="disp">Ready to make your first sale?</h2>
<p>Rex builds your store with you in 5 minutes. Take card, transfer and pay on delivery, book riders, and let Peggy answer customers on WhatsApp.</p>
<a class="btn" href="https://shopinbos.com/go/signup?source=pdf">Start your shop free · shopinbos.com</a>
<img class="rex" src="{flat('rex.webp', '#16141F')}" alt="">
<div class="copy">© 2026 Shopinbos Technologies Limited · Free to share, not to sell</div>
</div></body></html>"""


SLUGS = {
    'Abandoned Cart Email Sequence Templates': 'abandoned-cart-email-templates',
    'Becoming a Social Media Manager without Experience': 'become-a-social-media-manager',
    'Beginner Friendly Product Validation Toolkit (2026)': 'product-validation-toolkit',
    'Building a One-Page Website for Your Business': 'one-page-website-guide',
    'Ecommerce Product Pricing Calculator Template': 'product-pricing-calculator-template',
    'First 90 Days Launch Checklist & Calendar': 'first-90-days-launch-checklist',
    'Fulfillment Decision Toolkit': 'fulfillment-decision-toolkit',
    'How to Start a Profitable Digital Product Business_': 'digital-product-business-guide',
    'Low-Competition Product Ideas_ Beginner_s Starter Pack': 'low-competition-product-ideas-pack',
    'Niche Research Toolkit': 'niche-research-toolkit',
    'Online Store Launch Toolkit For Beginners': 'online-store-launch-toolkit',
    'Payment Gateway Setup Cheat Sheet (With Expert Tips)': 'payment-gateway-setup-cheat-sheet',
    'Sales Funnel Starter Pack for First-Time Online Store Owners': 'sales-funnel-starter-pack',
    'Sales Page Copy Template Pack': 'sales-page-copy-templates',
    'Your E-commerce Platform Comparison Worksheet_ A Founder_s Starter Kit': 'ecommerce-platform-comparison-worksheet',
    'Your Ecommerce Tools Checklist_ The Essential Starter Pack (Free & Freemium)': 'ecommerce-tools-checklist',
    'Your Email Marketing Onboarding Kit for eCommerce Beginners': 'email-marketing-onboarding-kit',
    'Your Free Essential Ecommerce Starter Tools Pack (All-in-One)': 'ecommerce-starter-tools-pack',
    'Your Product Description & Copywriting Swipe File (Starter Pack)': 'product-description-swipe-file',
}
TITLES = {
    'Niche Research Toolkit': 'Niche Research Toolkit',
    'First 90 Days Launch Checklist & Calendar': 'First 90 Days Launch Checklist & Calendar',
    'Sales Page Copy Template Pack': 'Sales Page Copy Template Pack',
}
SHORT = {
    'niche-research-toolkit': 'Niche Research Toolkit',
    'first-90-days-launch-checklist': 'First 90 Days Launch Checklist and Calendar',
    'ecommerce-tools-checklist': 'Online Business Tools Checklist',
    'email-marketing-onboarding-kit': 'Email and WhatsApp Marketing Starter Kit',
    'product-description-swipe-file': 'Product Description and Copywriting Swipe File',
    'ecommerce-platform-comparison-worksheet': 'Online Store Platform Comparison Worksheet',
    'ecommerce-starter-tools-pack': 'Free Online Business Starter Tools Pack',
}
manifest = []
for i, f in enumerate(sorted(x for x in os.listdir(SRC) if x.endswith(('.docx', '.md')))):
    d = convert(os.path.join(SRC, f))
    title = d['title'] or f[:-5]
    title = re.sub(r'\s*\((Even|With)[^)]*\)\s*$', '', title) if len(title) > 70 else title
    d['title'] = title
    first = re.search(r'<p>(.*?)</p>', d['html'], re.S)
    sub = d['meta_description'] or (re.sub('<[^>]+>', '', first.group(1)) if first else '')
    sub = re.sub(r'\s+', ' ', sub).strip()
    if len(sub) > 190:
        sub = sub[:sub.rfind(' ', 0, 185)] + '…'
    d['sub'] = sub
    stem = os.path.splitext(f)[0]
    slug = SLUGS.get(stem) or (stem if stem in SLUGS.values() else '') or d['slug'] or slugify(title)
    title = TITLES.get(stem, SHORT.get(slug, title))
    d['title'] = title
    st = style_for(title)
    h, chapters = body_html(d)
    base = os.path.join(WORK, 'html', slug)
    open(base + '-body.html', 'w').write(page_body(d, h, chapters, st))
    open(base + '-back.html', 'w').write(page_back())
    manifest.append({'slug': slug, 'title': title, 'sub': sub, 'style': st, 'person': PEOPLE[i % len(PEOPLE)], 'chapters': chapters, 'meta_title': d['meta_title'], 'keyword': d['keyword'], 'source': f, 'base': base})
    d['_cover'] = (st, PEOPLE[i % len(PEOPLE)])
    open(base + '-cover-src.json', 'w').write(json.dumps({'title': title, 'sub': sub}))
    # cover is written after page count is known (print_pdfs.js renders the body first)
    open(base + '-cover.html', 'w').write(page_cover(d, st, PEOPLE[i % len(PEOPLE)], 'PAGES_LABEL'))
json.dump(manifest, open(os.path.join(WORK, 'manifest.json'), 'w'), indent=1, ensure_ascii=False)
print(len(manifest), 'documents')
for m in manifest:
    print(m['style'], '|', m['slug'], '|', m['title'][:60], '|', len(m['chapters']), 'chapters')
