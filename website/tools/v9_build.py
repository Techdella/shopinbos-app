#!/usr/bin/env python3
"""
Build the V9 website from the design canvas export.

Input:  website/design/v9/V9-*.dc.html (one artboard per page, exported from the "Website V9" canvas)
        and a folder of the canvas's images (named <blob id>.jpg/.png).
Output: wp-content/themes/shopinbos/v9/
          v9.css            the design's stylesheet (shared by every artboard)
          img/<id>.webp     images, max 1600px wide
          pages/<slug>.html page markup with routes, image paths and form hooks filled in

Usage:  python3 website/tools/v9_build.py <images folder>

Tokens left in the markup and filled in by PHP at render time (inc/v9.php):
  %%IMG%%  theme image folder   %%SIGNUP%% %%LOGIN%% %%SUPPLIER%% %%PARTNER%% app links
  %%ADD%%  sign-up with intent=add_product   %%SOCIAL:<name>%%  social profile links
"""
import os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'design', 'v9')
OUT = os.path.join(ROOT, 'wp-content', 'themes', 'shopinbos', 'v9')

ROUTES = {
    'V9-Home': '/', 'V9-OnlineStore': '/online-store/', 'V9-Builder': '/website-builder/', 'V9-Start': '/start/',
    'V9-Templates': '/templates/', 'V9-Pricing': '/pricing/', 'V9-Payments': '/payments/', 'V9-Social': '/social-selling/',
    'V9-FindStock': '/find-stock/', 'V9-Trending': '/trending/', 'V9-Trending-Product': '/trending/',
    'V9-Suppliers': '/suppliers/', 'V9-Delivery': '/delivery/', 'V9-RexPeggy': '/rex-and-peggy/', 'V9-Plug': '/plug/',
    'V9-Plug-Joined': '/plug/', 'V9-AppPilot': '/app/', 'V9-AppPilot-Done': '/app/', 'V9-Academy': '/academy/',
    'V9-Academy-Course': '/academy/', 'V9-Academy-Lesson': '/academy/', 'V9-Blog': '/blog/', 'V9-BlogPost': '/blog/',
    'V9-Gist': '/gist/', 'V9-Compare': '/compare/', 'V9-Compare-Builder': '/compare/global-store-builder/',
    'V9-Help': '/help/', 'V9-HelpArticle': '/help/', 'V9-About': '/about/', 'V9-Contact': '/contact/',
    'V9-Contact-Sent': '/contact/', 'V9-Terms': '/legal/terms/', 'V9-Privacy': '/legal/privacy/',
    'V9-Refunds': '/legal/refunds/', 'V9-SellerRules': '/legal/seller-rules/', 'V9-Cookies': '/legal/cookies/',
}
# Pages built (the -Sent/-Done/-Joined artboards are the same pages with the success state shown).
PAGES = {
    'V9-Home': 'home', 'V9-OnlineStore': 'online-store', 'V9-Builder': 'website-builder', 'V9-Start': 'start',
    'V9-Templates': 'templates', 'V9-Pricing': 'pricing', 'V9-Payments': 'payments', 'V9-Social': 'social-selling',
    'V9-FindStock': 'find-stock', 'V9-Trending': 'trending', 'V9-Trending-Product': 'trending-product',
    'V9-Suppliers': 'suppliers', 'V9-Delivery': 'delivery', 'V9-RexPeggy': 'rex-and-peggy', 'V9-Plug': 'plug',
    'V9-AppPilot': 'app', 'V9-Academy': 'academy', 'V9-Academy-Course': 'academy-course',
    'V9-Academy-Lesson': 'academy-lesson', 'V9-Blog': 'blog', 'V9-BlogPost': 'blog-post', 'V9-Gist': 'gist',
    'V9-Compare': 'compare', 'V9-Compare-Builder': 'compare-single', 'V9-Help': 'help',
    'V9-HelpArticle': 'help-article', 'V9-About': 'about', 'V9-Contact': 'contact', 'V9-Terms': 'legal-terms',
    'V9-Privacy': 'legal-privacy', 'V9-Refunds': 'legal-refunds', 'V9-SellerRules': 'legal-seller-rules',
    'V9-Cookies': 'legal-cookies',
}
SOCIALS = {'Instagram', 'TikTok', 'X', 'YouTube', 'LinkedIn'}


def link_for(target, text):
    t = text.strip()
    if re.match(r'^(Start your shop|Start free|Start selling|Start with|Get started|Try it|Open my shop)', t) or t.endswith('Try it'):
        return '%%SIGNUP%%'
    if t == 'Log in':
        return '%%LOGIN%%'
    if t.startswith('+ Add to my shop'):
        return '%%ADD%%'
    if t in ('Apply now', 'Apply as a supplier', 'Become a supplier'):
        return '%%SUPPLIER%%'
    if t in ('Register', 'Register your company', 'Ride with Shopinbos', 'Register as a rider'):
        return '%%PARTNER%%'
    if t in SOCIALS and target == 'V9-Home':
        return '%%SOCIAL:' + t.lower() + '%%'
    if t.startswith('Nigeria · English'):
        return '#'
    if t == 'Careers':
        return '/careers/'
    return ROUTES.get(target, '/')


def text_of(html):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html)).strip()


def rewrite_links(body):
    def a(m):
        tag, inner = m.group(1), m.group(2)
        h = re.search(r'href="(V9-[A-Za-z-]+)\.dc\.html"', tag)
        if not h:
            return m.group(0)
        href = link_for(h.group(1), text_of(inner))
        return tag.replace(h.group(0), 'href="' + href + '"') + inner + '</a>'
    body = re.sub(r'(<a\b[^>]*>)(.*?)</a>', a, body, flags=re.S)
    # anything left (links without an <a> pairing we could read)
    return re.sub(r'href="(V9-[A-Za-z-]+)\.dc\.html"', lambda m: 'href="' + ROUTES.get(m.group(1), '/') + '"', body)


def rewrite_images(body):
    seen = [0]

    def img(m):
        tag = m.group(0)
        tag = re.sub(r'src="/_blob/([0-9a-f]{32})"', r'src="%%IMG%%\1.webp"', tag)
        seen[0] += 1
        if 'loading=' not in tag:
            # The first few images (logo, hero) load straight away; the rest lazily.
            tag = tag.replace('<img ', '<img loading="lazy" ' if seen[0] > 4 else '<img fetchpriority="high" ' if seen[0] == 2 else '<img ', 1)
        if 'decoding=' not in tag:
            tag = tag.replace('<img ', '<img decoding="async" ', 1)
        return tag
    return re.sub(r'<img\b[^>]*>', img, body)


def fix_forms(body):
    """Make the drawn form controls real: the message box becomes a textarea, the label buttons that flip the
    success state (label for="sent") get keyboard focus. v9.js sends the form before the state flips."""
    def area(m):
        style = re.sub(r'color:#[0-9A-Fa-f]+;?', '', m.group(1))
        return ('<textarea name="message" rows="5" placeholder="' + m.group(2) + '" style="' + style +
                ';color:#16141F;border:0;outline:0;resize:vertical;font-family:inherit;width:100%;box-sizing:border-box"></textarea>')
    body = re.sub(r'<span style="(display:block;border-radius:14px;background:#fff;box-shadow:inset 0 0 0 1.5px #E3E0E8;padding:14px 16px;height:140px;[^"]*)">([^<]+)</span>', area, body)
    return body.replace('<label for="sent" ', '<label for="sent" role="button" tabindex="0" ')


def extract(path):
    s = open(path, encoding='utf-8').read()
    helmet = re.search(r'<helmet>(.*?)</helmet>', s, re.S).group(1)
    css = '\n'.join(re.findall(r'<style>(.*?)</style>', helmet, re.S))
    body = s[s.find('</helmet>') + len('</helmet>'):s.rfind('</x-dc>')].strip()
    title = re.search(r'<title>(.*?)</title>', s).group(1)
    return css, body, title


def build_css(files):
    """One stylesheet: the rules of every artboard, each line once, in first-seen order."""
    lines, seen = [], set()
    for f in files:
        css, _, _ = extract(f)
        for ln in css.split('\n'):
            key = ln.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            lines.append(ln)
    return '\n'.join(lines) + '\n'


def build_images(src):
    from PIL import Image
    os.makedirs(os.path.join(OUT, 'img'), exist_ok=True)
    used = set()
    for f in glob.glob(os.path.join(SRC, 'V9-*.dc.html')):
        used |= set(re.findall(r'/_blob/([0-9a-f]{32})', open(f, encoding='utf-8').read()))
    n = 0
    for bid in sorted(used):
        found = glob.glob(os.path.join(src, bid + '.*'))
        if not found:
            print('missing image', bid)
            continue
        im = Image.open(found[0])
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        dest = os.path.join(OUT, 'img', bid + '.webp')
        if im.mode in ('RGBA', 'LA', 'P'):
            im.save(dest, 'WEBP', quality=90, method=6)
        else:
            im.convert('RGB').save(dest, 'WEBP', quality=72, method=6)
        n += 1
    print('images', n)


def main():
    files = sorted(glob.glob(os.path.join(SRC, 'V9-*.dc.html')))
    os.makedirs(os.path.join(OUT, 'pages'), exist_ok=True)
    open(os.path.join(OUT, 'v9.css'), 'w', encoding='utf-8').write(build_css(files))
    titles = {}
    for f in files:
        name = os.path.basename(f)[:-len('.dc.html')]
        if name not in PAGES:
            continue
        _, body, title = extract(f)
        body = fix_forms(rewrite_images(rewrite_links(body)))
        open(os.path.join(OUT, 'pages', PAGES[name] + '.html'), 'w', encoding='utf-8').write(body + '\n')
        titles[PAGES[name]] = title
    with open(os.path.join(OUT, 'pages', 'titles.json'), 'w', encoding='utf-8') as fh:
        import json
        json.dump(titles, fh, indent=1, ensure_ascii=False)
    print('pages', len(titles))
    if len(sys.argv) > 1:
        build_images(sys.argv[1])


if __name__ == '__main__':
    main()
