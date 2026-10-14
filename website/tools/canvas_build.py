"""Build the theme's canvas partials from the design canvas.

The design canvas (claude.ai artifact, Site-*.dc.html) is rendered in a browser and each view's DOM is saved
with buttons tagged data-go="<handler>" (see tools/README in the scratch setup). This script turns those
saved DOMs into static HTML partials for the theme:

  themes/shopinbos/canvas/<part>.html   markup with {{img:..}}, {{go:..}} and {{url:..}} tokens
  themes/shopinbos/assets/css/canvas.css the canvas stylesheet, minus the canvas runtime rules
  themes/shopinbos/assets/img/c/         the canvas images

Usage: python3 -I canvas_build.py <cdom dir> <blob dir> <imgmap.json> <theme dir>
"""
import json, os, re, shutil, sys, unicodedata
from bs4 import BeautifulSoup, NavigableString

CDOM, BLOB, IMGMAP, THEME = sys.argv[1:5]
IMGS = json.load(open(IMGMAP))
OUT = os.path.join(THEME, 'canvas')
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(THEME, 'assets/img/c'), exist_ok=True)

# Where each canvas handler goes on the site. {{go:..}} becomes a /go/ link in PHP.
URLS = {
    'nav.signup': '{{go:signup}}', 'nav.login': '{{go:login}}', 'nav.home': '/', 'nav.pricing': '/pricing/',
    'nav.market': '/marketplace/', 'nav.templates': '/templates/', 'nav.suppliers': '/for-suppliers/',
    'nav.delivery': '/delivery/', 'nav.blog': '/blog/', 'nav.academy': '/academy/', 'nav.about': '/about/',
    'nav.supplierJoin': '{{go:supplier}}', 'nav.partnerJoin': '{{go:partner}}', 'learnNav.academy': '/academy/', 'ad.launch': '{{go:signup}}',
    'mg.store': '/features/storefront/', 'mg.templates': '/templates/', 'mg.wa': '/features/sell-on-whatsapp/',
    'mg.social': '/features/social-selling/', 'mg.pay': '/features/payments/', 'mg.delivery': '/features/logistics/',
    'mg.market': '/marketplace/', 'mg.ai': '/features/peggy-ai/', 'mg.fashion': '/solutions/fashion/',
    'mg.beauty': '/solutions/beauty/', 'mg.food': '/solutions/food/', 'mg.gadgets': '/solutions/electronics/',
    'mg.drop': '/features/dropshipping/', 'mg.trending': '/trending/', 'mg.shopify': '/compare/shopify/',
    'mg.woo': '/compare/woocommerce/', 'mg.suppliers': '/for-suppliers/', 'mg.riders': '/delivery/#riders',
    'mg.academy': '/academy/', 'mg.blog': '/blog/', 'mg.pdf': '/resources/', 'mg.pdfdoc': '/resources/',
    'mg.help': '/help/', 'mg.about': '/about/',
    'legalNav.terms': '/legal/terms/', 'legalNav.privacy': '/legal/privacy/', 'legalNav.refunds': '/legal/refunds/',
    'legalNav.cookies': '/legal/cookies/', 'legalNav.rules': '/legal/seller-rules/',
}
# Text-specific overrides, for handlers the canvas reuses for different things.
BY_TEXT = {
    ('mg.delivery', 'Delivery companies'): '/delivery/',
    ('mg.help', 'Talk to us on WhatsApp'): '{{wa}}',
    ('mg.pay', 'Pay on delivery'): '/features/pay-on-delivery/',
}
# Copy changes on top of the canvas. Food on Shopinbos means food products (snacks, spices, drinks,
# groceries), not restaurant menus or kitchen orders.
TEXT = {
    'Food and bakeries': 'Food and groceries',
    'Menus, kitchen screen, delivery': 'Snacks, spices and drinks',
    'Snacks and sauces, with a menu on WhatsApp and orders that go straight to the kitchen':
        'Snacks, spices and sauces, sold on WhatsApp and in the store, packed and delivered across Nigeria',
    'Mama Put Snacks': 'Mama Tee Pantry',
    'mamaputsnacks.shopinbos.com': 'mamateepantry.shopinbos.com',
    'A smiling baker behind his counter of fresh pastries': 'A smiling food seller with his packed snacks',
    'Last checked 1 October 2026': 'Last checked {{checked}}',
    'We checked these details on 1 October 2026': 'We checked these details on {{checked}}',
}
def _urls(name):
    f = os.path.join(CDOM, name)
    return json.load(open(f)) if os.path.exists(f) else {}


LAND_URLS = _urls('land-urls.json')
CMP_URLS = _urls('cmp-urls.json')
used_imgs = set()


def slug(t):
    t = unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', t.lower().replace("'", '')).strip('-')


def text(el):
    return ' '.join(el.get_text(' ', strip=True).split())


def resolve(btn):
    key = btn.get('data-go', '')
    t = text(btn)
    for (k, prefix), url in BY_TEXT.items():
        if k == key and t.startswith(prefix):
            return url
    if key in URLS:
        return URLS[key]
    if key == 'item.open':
        known = {**LAND_URLS, **CMP_URLS}
        for name in sorted(known, key=len, reverse=True):
            if t.startswith(name):
                return known[name]
    card = btn.find_parent(class_='pcard') or btn
    img = card.find('img')
    up = btn
    for _ in range(3):
        if img is not None:
            break
        up = up.parent
        img = up.find('img') if up is not None else None
    alt = img.get('alt', '') if img else ''
    if key in ('item.open', 'prod.open') and alt.endswith(' template preview'):
        return '/templates/' + slug(alt[:-len(' template preview')]) + '/'
    if key in ('item.open', 'prod.open'):
        return '/marketplace/products/' + slug(alt or text(btn)) + '/'
    if key in ('item.add', 'item.sellIt'):
        return '{{go:add:' + slug(alt or text(btn)) + '}}'
    if key == 'item.use' and alt.endswith(' template preview'):
        return '{{go:template:' + slug(alt[:-len(' template preview')]) + '}}'
    if key in ('item.use', 'item.start'):
        return '{{go:signup}}'
    if key == 'item.browse':
        return '/marketplace/'
    return None


def clean(root, soup):
    for sp in root.find_all('span', class_='sc-interp'):
        sp.unwrap()
    for el in [root] + root.find_all(True):
        el.attrs.pop('data-dc-tpl', None)
        if el.get('class'):
            el['class'] = [c for c in el['class'] if not c.startswith('sc-')] or None
            if el['class'] is None:
                del el['class']
    for img in root.find_all('img'):
        src = img.get('src', '')
        if src.startswith('blob/'):
            h = src[5:]
            name = IMGS.get(h, h)
            ext = 'png' if name.startswith(('logo', 'icon')) else 'webp'
            used_imgs.add((h, name, ext))
            img['src'] = '{{img:c/%s.%s}}' % (name, ext)
            if not img.get('loading'):
                img['loading'] = 'lazy'
    for m in root.find_all('span', class_='mono'):
        name = m.parent.get_text(' ', strip=True).replace(m.get_text(strip=True), '', 1).strip()
        if name:
            m['data-brand'] = ' '.join(name.split())[:60]
    for a in root.find_all('a', href='#'):
        a['href'] = '{{go:signup}}'
    for b in root.find_all(attrs={'data-go': True}):
        url = resolve(b)
        if url and b.name == 'button':
            b.name = 'a'
            b['href'] = url
            b['class'] = (b.get('class') or []) + ['cv-b']
            b.attrs.pop('type', None)
            del b['data-go']
        elif url:
            b['data-href'] = url
            del b['data-go']
        else:
            b['data-cv'] = b['data-go']
            del b['data-go']
    return root


def load(view):
    return BeautifulSoup(open(os.path.join(CDOM, view + '.html')).read(), 'html.parser')


def sections(soup):
    return soup.find('main').find_all('section', recursive=False)


def active_style(btn):
    s = btn.get('style', '')
    return 'rgb(22, 20, 31)' in s.split('color')[0] or s.startswith('background: rgb(22, 20, 31)')


def panes(base_sec, variants, group):
    """A section that changes with a tab: keep one copy per tab, tagged for site.js."""
    soup = BeautifulSoup('', 'html.parser')
    wrap = soup.new_tag('div', attrs={'class': 'cv-panes', 'data-group': group})
    for i, sec in enumerate([base_sec] + variants):
        sec = BeautifulSoup(str(sec), 'html.parser').find('section')
        sec['data-pane'] = str(i)
        if i:
            sec['hidden'] = ''
        # The tab buttons are the item.pick buttons whose look changes between copies.
        wrap.append(sec)
    all_picks = [s.find_all(attrs={'data-go': 'item.pick'}) for s in wrap.find_all('section', recursive=False)]
    n = min(len(p) for p in all_picks)
    tabs = [j for j in range(n) if len({p[j].get('style', '') for p in all_picks}) > 1]
    for picks in all_picks:
        for k, j in enumerate(tabs):
            picks[j]['data-go'] = 'tab'
            picks[j]['data-pane'] = str(k)
    return wrap


def write(name, el, soup):
    clean(el, soup)
    el['class'] = (el.get('class') or []) + ['cv']
    html = str(el)
    for a, b in TEXT.items():
        html = html.replace(a, b)
    html = re.sub(r'\n\s*\n', '\n', html)
    open(os.path.join(OUT, name + '.html'), 'w').write(html.strip() + '\n')
    print(f'{name:22s} {len(html):7d}')


def page_parts(prefix, view, variant_groups=None):
    """Write each top-level section of a canvas view as a part, with tab panes where variants differ."""
    soup = load(view)
    base = sections(soup)
    diff = {}
    for group, views in (variant_groups or {}).items():
        vs = [sections(load(v)) for v in views]
        for i in range(len(base)):
            if base[i].find(attrs={'data-go': 'item.toggle'}):
                # Questions: keep the copy with every answer in it.
                base[i] = max([base[i]] + [v[i] for v in vs], key=lambda x: len(str(x)))
                continue
            changed = [v[i] for v in vs if str(v[i]) != str(base[i])]
            if changed:
                diff[i] = (group, changed)
    names = []
    for i, sec in enumerate(base):
        name = f'{prefix}-{i + 1:02d}'
        if i in diff:
            el = panes(sec, diff[i][1], diff[i][0])
        else:
            el = BeautifulSoup(str(sec), 'html.parser').find('section')
        for k, b in enumerate(el.find_all(attrs={'data-go': 'item.toggle'})):
            ans = b.find_next_sibling()
            if ans is not None:
                ans['class'] = (ans.get('class') or []) + ['qa-a']
                b['aria-expanded'] = 'true' if k == 0 else 'false'
                if k:
                    ans['hidden'] = ''
        write(name, el, soup)
        names.append(name)
    return names


# ---- Header: bar + three mega panels + mobile menu -------------------------------------------------------
home = load('home')
header = home.find('header')
bar = header.find_all('div', recursive=False)[1]
for i, view in enumerate(['mega', 'megasol', 'megares']):
    m = load(view).find(class_='mega')
    m['hidden'] = ''
    m['data-mega'] = str(i)
    m['id'] = 'mega-' + ['product', 'solutions', 'resources'][i]
    bar.append(m)
for i, b in enumerate(header.find_all(class_='megab')):
    b['data-go'] = 'mega'
    b['data-mega'] = str(i)
    b['aria-expanded'] = 'false'
    b['aria-controls'] = 'mega-' + ['product', 'solutions', 'resources'][i]
mm = load('menu').find(class_='mmenu')
mm['hidden'] = ''
mm['id'] = 'mmenu'
header.append(mm)
burger = header.find(class_='burger')
burger['aria-controls'] = 'mmenu'
burger['aria-expanded'] = 'false'
burger['data-go'] = 'burger'
header['class'] = ['cv-hdr']
write('header', header, home)

# ---- Footer and the sticky mobile button ---------------------------------------------------------------
foot = home.find('footer')
write('footer', foot, home)
write('stickycta', home.find(class_='stickycta'), home)

# ---- Pages -------------------------------------------------------------------------------------------------
page_parts('home', 'home', {
    'show': ['home-gadgets', 'home-food'],
    'conn': ['home-pay', 'home-ship', 'home-ads', 'home-bring', 'home-talk'],
    'adplat': ['home-fb', 'home-tt'],
})

page_parts('pricing', 'pricing', {'billing': ['pricing-year']})
page_parts('suppliers', 'suppliers')
page_parts('delivery', 'delivery', {
    'partner': ['delivery-rider'],
    'area': ['delivery-lagos', 'delivery-abuja', 'delivery-ibadan', 'delivery-ph', 'delivery-states'],
})
page_parts('templates', 'templates', {
    'tplcat': ['templates-fashion', 'templates-shoes', 'templates-luxury', 'templates-food', 'templates-home', 'templates-gadgets'],
})

for slug in sorted(set(LAND_URLS.values())):
    slug = slug.strip('/').split('/')[-1]
    if os.path.exists(os.path.join(CDOM, f'land-{slug}.html')):
        page_parts(f'land-{slug}', f'land-{slug}')

for url in sorted(set(CMP_URLS.values())):
    slug = url.strip('/').split('/')[-1]
    if os.path.exists(os.path.join(CDOM, f'cmp-{slug}.html')):
        page_parts(f'cmp-{slug}', f'cmp-{slug}')

# ---- Stylesheet --------------------------------------------------------------------------------------------
css = open(os.path.join(CDOM, 'site.css')).read()
css = css[css.find('x-dc{display'):]
css = re.sub(r'x-dc\{[^}]*\}', '', css)
css = re.sub(r'@import[^;]+;', '', css)
css = css.replace('#FF6A2B_TEXT', 'inherit')  # an unset token in the canvas: eyebrows take the text colour
css = re.sub(r'\n\s*\n+', '\n', css)
css = """/* Generated from the design canvas by website/tools/canvas_build.py. Edit the canvas, then rebuild. */
/* Undo site.css's text margin reset inside canvas sections (first, so the canvas classes below still win). */
.sib :where(.cv) :where(p,h1,h2,h3,h4){margin:revert}
""" + css + """
/* Canvas buttons that became links */
:where(a.cv-b){display:inline-block;text-decoration:none;cursor:pointer;font-size:13.333px;line-height:normal;text-align:center;color:inherit}
.site a.cv-b:hover{color:inherit}
.mega[hidden],.mmenu[hidden],.cv-panes>[hidden],.qa-a[hidden]{display:none!important}
.megab[aria-expanded="true"]{color:#16141F!important;border-bottom-color:#16141F!important}
.megab[aria-expanded="true"]>span{transform:rotate(180deg)!important}
.wp-site-blocks>div:has(>.cv-hdr){position:sticky;top:0;z-index:30}
.admin-bar .wp-site-blocks>div:has(>.cv-hdr){top:32px}
@media (max-width:782px){.admin-bar .wp-site-blocks>div:has(>.cv-hdr){top:46px}}
.cv{line-height:normal}
section.cv.ahero,.cv>section.ahero{padding:0}
.sib>.cv{margin-block:0}
.mono:has(>.brand-logo){background:#FFFFFF!important;box-shadow:inset 0 0 0 1px #ECEAF2}
.mono>.brand-logo{width:60%;height:60%;object-fit:contain}
body .wp-block-post-content>*{margin-block:0}
.sib .wp-block-post-content:not(.prose)>.fold,.sib .wp-block-post-content:not(.prose)>.ctaband{margin-top:-48px}
@media (max-width:640px){.sib .wp-block-post-content:not(.prose)>.fold{margin-top:-32px}}
.navlink.is-on{color:#16141F!important;border-bottom-color:#FF6A2B!important}
"""
open(os.path.join(THEME, 'assets/css/canvas.css'), 'w').write(css)

# ---- Images ------------------------------------------------------------------------------------------------
for h, name, ext in sorted(used_imgs):
    dst = os.path.join(THEME, 'assets/img/c', f'{name}.{ext}')
    src = os.path.join(BLOB, h)
    if ext == 'webp' and open(src, 'rb').read(4) != b'RIFF':
        from PIL import Image
        Image.open(src).convert('RGB').save(dst, 'WEBP', quality=82)
    else:
        shutil.copyfile(src, dst)
print(len(used_imgs), 'images')
