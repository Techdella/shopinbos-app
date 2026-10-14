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
    'mg.help': '/help/', 'mg.about': '/about/', 'mg.gist': '/gist/', 'mg.pdf': '/resources/online-sellers-starter-kit/',
    'mg.pdfdoc': '/resources/online-sellers-starter-kit/',
    'legalNav.terms': '/legal/terms/', 'legalNav.privacy': '/legal/privacy/', 'legalNav.refunds': '/legal/refunds/',
    'legalNav.cookies': '/legal/cookies/', 'legalNav.rules': '/legal/seller-rules/',
}
# Text-specific overrides, for handlers the canvas reuses for different things.
HELP_TOPICS = ['Getting started', 'Orders', 'Payments and payouts', 'Delivery and pay on delivery', 'Your store and design',
               'WhatsApp and social', 'Find stock and dropship', 'Account and security']
HELP_POP = ['How pay on delivery works, step by step', 'When will I get my money?', 'Connect your own domain name',
            'Add your WhatsApp Business catalogue', 'A customer refused the parcel at the gate', 'Change your store colours and logo',
            'Add a staff member', 'Request a quote from a supplier']
BY_TEXT = {
    ('mg.help', 'Chat on WhatsApp'): '{{wa}}',
    ('mg.help', 'Back to Help centre'): '/help/',
    ('mg.pdf', 'Free PDFs'): '/resources/',
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
    '24 pages. We send it to your WhatsApp or email.': 'Free PDF. We send it to your WhatsApp or email.',
    '24 pages on getting your first 10 orders.': 'Six short chapters on getting your first 10 orders.',
    '24 pages': '8 pages',  # the real Starter Kit
    '<span>Payments by Paystack · Data handled under the NDPA 2023</span>': '',
    'Shopinbos Technologies Limited. All rights reserved.': 'Shopinbos is a product of Tech Della Solutions Ltd (RC 7038770). All rights reserved.',
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
    if btn.get('data-href-fixed'):
        return btn.attrs.pop('data-href-fixed')
    key = btn.get('data-go', '')
    t = text(btn)
    for (k, prefix), url in BY_TEXT.items():
        if k == key and t.startswith(prefix):
            return url
    if key in URLS:
        return URLS[key]
    if key == 'item.open':
        for title in HELP_POP:
            if t.startswith(title):
                return '{{helpurl:' + title + '}}'
        for name in sorted(HELP_TOPICS, key=len, reverse=True):
            if t.startswith(name + ' '):
                return '{{helpcat:' + name + '}}'
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
    named = btn.find_parent(attrs={'data-name': True})
    if key in ('item.add', 'item.sellIt') and named is not None:
        return '{{go:add:' + slug(named['data-name']) + '}}'
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
    for b in root.find_all('button'):
        if not b.get('data-go') and not b.get('data-cv') and 'Download' in b.get_text():
            b['data-cv'] = 'download'
            b['type'] = 'button'
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


TREND_CATS = ['Fashion', 'Shoes', 'Beauty', 'Gadgets', 'Home', 'Food']


def trend_filters(el):
    """Trending: the category chips filter the cards and rows on the page (site.js, data-filter)."""
    for b in el.find_all(attrs={'data-go': 'item.pick'}):
        label = b.get_text(strip=True)
        b['data-filter'] = 'all' if label == 'All categories' else label.lower()
    items = [c for g in el.find_all(class_='g3') for c in g.find_all(class_='card', recursive=False)] + el.find_all(class_='trow')
    for item in items:
        words = [t.strip() for t in item.stripped_strings]
        cat = next((w for w in words if w in TREND_CATS), None)
        if cat:
            item['data-cat'] = cat.lower()
        name = next((w for w in words if len(w) > 3 and w not in TREND_CATS and not re.match(r'^[#+₦▲▼\d]', w)), None)
        if name:
            item['data-name'] = name


def lead_form(box, kind, fields, button_text=None):
    """Turn a canvas box with inputs and a button into a real lead form (plugin leads.php, posted by site.js)."""
    box.name = 'form'
    box['method'] = 'post'
    box['action'] = '{{leadurl}}'
    box['data-cv-lead'] = kind
    for inp, name in zip(box.find_all(['input', 'select']), fields):
        inp['name'] = name
        if name == 'contact':
            inp['required'] = ''
            inp['autocomplete'] = 'email tel'
    hidden = '<input type="hidden" name="action" value="sib_lead"><input type="hidden" name="kind" value="%s">' % kind
    if kind == 'download':
        hidden += '<input type="hidden" name="resource" value="{{kit_id}}">'  # no marketing consent implied; we only send the PDF
    hidden += '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">'
    for h in BeautifulSoup(hidden, 'html.parser').find_all('input'):
        box.append(h)
    for b in box.find_all('button'):
        if b.get('data-go', '').startswith('pop.'):
            continue
        b['type'] = 'submit'
        b.attrs.pop('data-go', None)


def search_form(el):
    """The help centre's search box becomes a real search form, and its popular searches links."""
    inp = el.find('input', attrs={'aria-label': 'Search help articles'})
    if inp is None:
        inp = el.find('input', attrs={'aria-label': 'Search help'})
    if inp is None:
        for b in el.find_all('button'):
            url = {'Chat': '{{wa}}', 'Book': '/contact/'}.get(b.get_text(strip=True))
            if url and not b.get('data-go'):
                b.name = 'a'
                b['href'] = url
                b['class'] = (b.get('class') or []) + ['cv-b']
        return
    box = inp.parent
    box.name = 'form'
    box['action'] = '/'
    box['method'] = 'get'
    box['role'] = 'search'
    inp['name'] = 's'
    inp['type'] = 'search'
    hidden = BeautifulSoup('<input type="hidden" name="post_type" value="sib_help">', 'html.parser').input
    box.append(hidden)
    for b in box.find_all('button'):
        b['type'] = 'submit'
        b.attrs.pop('data-go', None)
    for sp in el.find_all('span', class_='tag'):
        if sp.parent is not None and 'Popular:' in sp.parent.get_text():
            sp.name = 'a'
            sp['href'] = '/?post_type=sib_help&s=' + sp.get_text(strip=True).replace(' ', '+')
            sp['class'] = (sp.get('class') or []) + ['cv-b']
    # Buttons the canvas left without an action.
    for b in el.find_all('button'):
        url = {'Chat': '{{wa}}', 'Book': '/contact/'}.get(b.get_text(strip=True))
        if url and not b.get('data-go'):
            b.name = 'a'
            b['href'] = url
            b['class'] = (b.get('class') or []) + ['cv-b']


def write(name, el, soup):
    clean(el, soup)
    el['class'] = (el.get('class') or []) + ['cv']
    html = str(el)
    html = re.sub(r'(href="\{\{helpcat:([^}]+)\}\}".*?>)\d+ articles<', lambda m: m.group(1) + '{{helpcount:' + m.group(2) + '}}<', html, flags=re.S)
    for a, b in TEXT.items():
        html = html.replace(a, b)
    html = re.sub(r'Updated daily · 7:00am, \w+day \d+ \w+ \d{4}', 'Updated daily · 7:00am, {{today}}', html)
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
        search_form(el)
        if i == 0:
            # The first section is above the fold: load its images straight away, the biggest one first.
            imgs = el.find_all('img')
            for k, img in enumerate(imgs):
                img['loading'] = 'eager'
                if k == 0 or 'p-hero' in img.get('src', '') or 'p-' in img.get('src', '')[:20]:
                    img['fetchpriority'] = 'high'
        if prefix == 'trending':
            trend_filters(el)
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
# Gist (60-second story tips) next to Blog in the Resources menu, the mobile menu and the footer.
import copy


def add_gist_after_blog(root):
    for b in list(root.find_all(attrs={'data-go': ['mg.blog', 'nav.blog']})):
        g = copy.copy(b)
        g['data-go'] = 'mg.gist'
        title = g.find('b')
        if title is not None:
            title.string = 'Gist'
            desc = title.find_next_sibling('span')
            if desc is not None:
                desc.string = 'Selling tips in 60 seconds'
        else:
            for t in g.find_all(string=True):
                if t.strip() == 'Blog':
                    t.replace_with('Gist')
        b.insert_after(g)


add_gist_after_blog(header)
header['class'] = ['cv-hdr']
write('header', header, home)

# ---- Footer and the sticky mobile button ---------------------------------------------------------------
foot = home.find('footer')
add_gist_after_blog(foot)
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

for land in sorted(set(LAND_URLS.values())):
    land = land.strip('/').split('/')[-1]
    if os.path.exists(os.path.join(CDOM, f'land-{land}.html')):
        page_parts(f'land-{land}', f'land-{land}')

for url in sorted(set(CMP_URLS.values())):
    cmp_slug = url.strip('/').split('/')[-1]
    if os.path.exists(os.path.join(CDOM, f'cmp-{cmp_slug}.html')):
        page_parts(f'cmp-{cmp_slug}', f'cmp-{cmp_slug}')

page_parts('trending', 'trending')
page_parts('help', 'help')
page_parts('helpart', 'helpart')

PDF_URLS = _urls('pdf-urls.json')


def pdf_page():
    """The Starter Kit page: canvas pdf view, with the hero form and its sent state as two panes."""
    base = sections(load('pdf-kit'))
    done = sections(load('pdf-kit-done'))
    for i, sec in enumerate(base):
        if str(sec) != str(done[i]):
            el = panes(sec, [done[i]], 'pdfdone')
        else:
            el = BeautifulSoup(str(sec), 'html.parser').find('section')
        form_box = el.find('input', attrs={'aria-label': 'Your first name'})
        if form_box is not None:
            lead_form(form_box.parent, 'download', ['name', 'contact', 'sells'])
        for b in el.find_all(attrs={'data-go': 'item.open'}):
            t = text(b)
            for title, url in PDF_URLS.items():
                if title in t:
                    b['data-go'] = 'nav.home'
                    b['data-href-fixed'] = url
        write(f'pdf-{i + 1:02d}', el, None)


def popups():
    """All pop-ups in one part, each hidden until site.js opens it."""
    wrap = BeautifulSoup('<div class="cv-pops"></div>', 'html.parser').div
    for name, view in [('pdf', 'pop-pdf'), ('pdf-done', 'pop-pdf-done'), ('exit', 'pop-exit'), ('news', 'pop-news')]:
        el = BeautifulSoup(str(load(view).find(class_='site').find_all(recursive=False)[-1]), 'html.parser').find('div')
        el['data-pop'] = name
        el['hidden'] = ''
        inp = el.find('input')
        if inp is not None:
            lead_form(inp.parent, 'trending' if name == 'news' else 'download', ['contact'])
        wrap.append(el)
    write('popups', wrap, None)


pdf_page()
popups()

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
/* Hover: buttons keep their own text colour (the canvas's a:hover would turn it black) and lift a little */
.site a.btn-acc:hover,.site a.btn-ink:hover,.site a.btn-ai:hover,.site a.btn-acc:focus-visible,.site a.btn-ink:focus-visible{color:#FFFFFF}
.site a.btn-ghost:hover{color:#16141F}
.site a.cv-b:not(.btn):hover{color:inherit}
.site .btn,.site .gbtn,.site .chip,.site .store{transition:transform .18s ease,box-shadow .18s ease,filter .18s ease,background-color .18s ease}
.site .btn:hover,.site .store:hover{transform:translateY(-1px);filter:brightness(1.06);box-shadow:0 10px 22px -12px rgba(22,20,31,.45)}
.site .btn-ghost:hover{border-color:#16141F;filter:none}
.site .btn:active{transform:translateY(0) scale(.98)}
.site .lnk:hover svg,.site .navlink:hover{transform:translateX(2px)}
.site .lnk svg{transition:transform .18s ease}
.site .navlink:hover,.site .megab:hover{color:#16141F!important}
.site .pcard,.site .postcard,.site .trk,.site a.card,.site .card:has(>a.cv-b),.site .tile,.site .mi{transition:transform .25s cubic-bezier(.2,.7,.2,1),box-shadow .25s ease}
.site .pcard:hover,.site .postcard:hover,.site .trk:hover,.site a.card:hover,.site .card:has(>a.cv-b):hover{transform:translateY(-4px);box-shadow:0 24px 40px -28px rgba(22,20,31,.45)}
.site .tile:hover{transform:translateY(-3px)}
.site .pcard img,.site .postcard img{transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.site .pcard:hover img,.site .postcard:hover img{transform:scale(1.04)}
.site .mi:hover{background:#F6F5F9;border-radius:14px}
/* Scroll reveal (site.js adds .rv to blocks below the fold) */
.rv{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1);transition-delay:var(--rv-d,0s)}
.rv.rv-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;transition:none}.marq{animation:none}}
.mega[hidden],.mmenu[hidden],.cv-panes>[hidden],.qa-a[hidden],.cv-pops>[hidden]{display:none!important}
form[data-cv-lead].is-busy{opacity:.6;pointer-events:none}
.cv-lead-err{color:#B42318;font-size:13px;font-weight:600}
.megab[aria-expanded="true"]{color:#16141F!important;border-bottom-color:#16141F!important}
.megab[aria-expanded="true"]>span{transform:rotate(180deg)!important}
.wp-site-blocks>div:has(>.cv-hdr){position:sticky;top:0;z-index:30}
.admin-bar .wp-site-blocks>div:has(>.cv-hdr){top:32px}
@media (max-width:782px){.admin-bar .wp-site-blocks>div:has(>.cv-hdr){top:46px}}
.cv{line-height:normal}
.help-art{padding:40px 0 72px}
.help-art-grid{grid-template-columns:260px minmax(0,740px)}
.help-art-main{display:flex;flex-direction:column;gap:24px;min-width:0}
.sib .help-art-main>*{margin:0}
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

# Images the plugin's sample marketplace data uses.
for h, name in IMGS.items():
    if name in ('s-suede', 'h-stool', 'e-camera', 's-sneak', 's-heels', 'f-bag', 'h-arm', 'e-buds', 'd-cashew', 's-sandal'):
        used_imgs.add((h, name, 'webp'))

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
