"""Convert a Google Docs .docx article into WordPress block markup plus metadata.

Usage: python3 -I convert.py <docx> -> prints JSON {title, slug, meta_title, meta_description, keyword, content, faq, notes}
Editorial sections (SEO brief, meta tags, internal links, sources, social repurposing...) are removed from the body;
their meta title / description / slug / keyword are returned as fields.
"""
import json, re, subprocess, sys, html
from bs4 import BeautifulSoup, NavigableString

EDIT = re.compile(r'^(seo\b|seo brief|seo meta|meta (tags|information|title|description)|social media repurpos|sources (used|referenced)|internal link|target keywords|competitor|article overview|secondary (seo )?keywords|content type|search intent|seo summary|seo metadata|internal linking)', re.I)
META = re.compile(r'^\s*(?:[-*]\s*)?\*\*\s*(meta title|seo title|title tag|meta description|url slug|slug|primary keyword|focus keyword)\s*(?:\([^)]*\))?\s*:?\s*\*\*\s*:?\s*(.*)$', re.I)
LABEL = re.compile(r'^\s*(?:\*\*)?\s*((secondary|related|lsi)\s+(seo\s+)?keywords[^*:]*|keywords used[^*:]*|tags|seo brief|seo summary|seo meta tags|meta tags|references)\s*(?::\s*(?:\*\*)?|(?:\*\*)?\s*:|(?:\*\*)?\s*$)', re.I)
PLAIN_META = re.compile(r'^\s*(seo title|meta title|meta description|url slug|slug|primary keyword|focus keyword)\s*:?\s*$', re.I)
META_PLAIN = re.compile(r'^\s*[-*]\s*(meta title|seo title|meta description|url slug|slug|primary keyword|focus keyword)\s*(?:\([^)]*\))?\s*:\s*(.*)$', re.I)
FAQ = re.compile(r'^(frequently asked questions|faqs?\b)', re.I)


def clean_heading(t):
    t = re.sub(r'\*+', '', t).strip()
    t = re.sub(r'\\([#&*_\[\]])', r'\1', t)
    return t.strip()


def brand(s):
    s = s.replace('Shopping Boss', 'Shopinbos').replace('ShopinBos', 'Shopinbos').replace('Shopinbos’s', 'Shopinbos’')
    return s


def convert(path):
    md = subprocess.run(['pandoc', '-t', 'gfm', '--wrap=none', path], capture_output=True, text=True, check=True).stdout
    # Google Docs bold that spans a line break ("**Question?  \n** Answer") becomes "**Question?** Answer".
    md = re.sub(r'(?m)^\*\*([^*\n]+?)[ \t]*\\?\n\*\*[ \t]*', r'**\1** ', md)
    lines = md.splitlines()
    meta, out, title = {}, [], None
    skip_level = None  # heading level of the editorial section being skipped
    expect_value = None
    for line in lines:
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            level, text = len(m.group(1)), clean_heading(m.group(2))
            if not text:
                continue
            if EDIT.match(text) or text.lower().startswith('seo brief'):
                skip_level = level if skip_level is None else min(skip_level, level)
                continue
            if skip_level is not None:
                # A content heading ends the editorial section: the article title (H1), or a heading at the same or higher level.
                if level <= skip_level or (level == 1):
                    skip_level = None
                else:
                    continue
            if title is None and level == 1:
                title = text
                continue
            out.append('#' * max(2, level) + ' ' + text)
            continue
        if expect_value:
            if line.strip():
                k = {'seo title': 'meta title', 'slug': 'url slug', 'focus keyword': 'primary keyword'}.get(expect_value, expect_value)
                meta.setdefault(k, line.strip())
                expect_value = None
            continue
        pm = PLAIN_META.match(line)
        if pm:
            expect_value = pm.group(1).lower()
            continue
        if re.match(r'^\s*[-*]\s*(secondary|related|lsi)\s+(seo\s+)?keywords[^:]*:', line, re.I):
            continue
        if LABEL.match(line) and not line.lstrip().startswith('- ') :
            skip_level = 7  # until the next heading of any level
            continue
        mm = META.match(line) or META_PLAIN.match(line)
        if mm:
            key = mm.group(1).lower()
            val = re.sub(r'\*+', '', mm.group(2)).strip()
            val = re.sub(r'\s*\(\d+\s*char[a-z]*\)\s*$', '', val, flags=re.I).strip()
            if val:
                k = {'seo title': 'meta title', 'title tag': 'meta title', 'slug': 'url slug', 'focus keyword': 'primary keyword'}.get(key, key)
                meta.setdefault(k, val)
            continue
        if skip_level is not None:
            continue
        out.append(line)
    # No H1: the first heading becomes the title when nothing sits above it; then shift so the top level is H2.
    levels = [len(re.match(r'^(#+)', l).group(1)) for l in out if re.match(r'^#{2,6} ', l)]
    if title is None and levels:
        first = next(i for i, l in enumerate(out) if re.match(r'^#{2,6} ', l))
        lvl = len(re.match(r'^(#+)', out[first]).group(1))
        if lvl <= min(levels):
            title = out[first].lstrip('#').strip()
            out.pop(first)
            levels = [len(re.match(r'^(#+)', l).group(1)) for l in out if re.match(r'^#{2,6} ', l)]
    if levels and min(levels) > 2:
        shift = min(levels) - 2
        out = [re.sub(r'^(#{2,6}) ', lambda m: '#' * (len(m.group(1)) - shift) + ' ', l) for l in out]
    body = brand('\n'.join(out)).strip()
    body = re.sub(r'<span class="mark">(.*?)</span>', r'\1', body, flags=re.S)
    html_body = subprocess.run(['pandoc', '-f', 'gfm', '-t', 'html5', '--wrap=none'], input=body, capture_output=True, text=True, check=True).stdout
    blocks, faq = to_blocks(html_body)
    title = brand(title or '')
    return {
        'title': title,
        'slug': (meta.get('url slug') or '').strip('/ ').split('/')[-1],
        'meta_title': brand(meta.get('meta title', '')),
        'meta_description': brand(meta.get('meta description', '')),
        'keyword': meta.get('primary keyword', '').strip('"“” '),
        'content': blocks,
        'faq': faq,
        'words': len(re.sub('<[^>]+>', ' ', html_body).split()),
        'html': html_body,
    }


def inline(el):
    """Inner HTML with only safe inline tags kept."""
    soup = BeautifulSoup(str(el), 'html.parser')
    root = soup.find()
    for t in root.find_all(True):
        if t.name in ('u', 'span', 'mark'):
            t.unwrap()
        elif t.name == 'b':
            t.name = 'strong'
        elif t.name == 'i':
            t.name = 'em'
        elif t.name == 'a':
            href = t.get('href', '')
            t.attrs = {'href': href}
            if re.search(r'shopinbos\.com', href):
                t['href'] = re.sub(r'^https?://(www\.)?shopinbos\.com', '', href) or '/'
        elif t.name not in ('strong', 'em', 'a', 'br', 'code', 'sup', 'sub'):
            t.unwrap()
    s = ''.join(str(c) for c in root.contents).strip()
    return s


def p_block(inner):
    return '<!-- wp:paragraph -->\n<p>' + inner + '</p>\n<!-- /wp:paragraph -->\n\n'


def h_block(level, inner):
    attrs = '' if level == 2 else ' {"level":%d}' % level
    return '<!-- wp:heading%s -->\n<h%d class="wp-block-heading">%s</h%d>\n<!-- /wp:heading -->\n\n' % (attrs, level, inner, level)


def list_block(el):
    ordered = el.name == 'ol'
    items = []
    for li in el.find_all('li', recursive=False):
        # nested lists are flattened into the item text
        for sub in li.find_all(['ul', 'ol']):
            sub_items = ' · '.join(inline(x) for x in sub.find_all('li'))
            sub.replace_with(BeautifulSoup(' – ' + sub_items, 'html.parser'))
        for p in li.find_all('p'):
            p.unwrap()
        items.append('<!-- wp:list-item -->\n<li>' + inline(li) + '</li>\n<!-- /wp:list-item -->')
    tag = 'ol' if ordered else 'ul'
    attrs = ' {"ordered":true}' if ordered else ''
    return '<!-- wp:list%s -->\n<%s class="wp-block-list">%s</%s>\n<!-- /wp:list -->\n\n' % (attrs, tag, '\n\n'.join(items), tag)


def table_block(el):
    rows = el.find_all('tr')
    if not rows:
        return ''
    head = rows[0]
    body = rows[1:]
    th = ''.join('<th>' + inline(c) + '</th>' for c in head.find_all(['th', 'td']))
    tb = ''.join('<tr>' + ''.join('<td>' + inline(c) + '</td>' for c in r.find_all(['th', 'td'])) + '</tr>' for r in body)
    return '<!-- wp:table -->\n<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></figure>\n<!-- /wp:table -->\n\n' % (th, tb)


def serialize_faq(pairs):
    items = '\n'.join(q.replace('|', '/') + ' | ' + a.replace('|', '/') for q, a in pairs)
    return '<!-- wp:shopinbos/faq ' + json.dumps({'title': 'Questions sellers ask', 'items': items}, ensure_ascii=False).replace('--', '\\u002d\\u002d').replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026') + ' /-->\n\n'


def to_blocks(h):
    soup = BeautifulSoup(h, 'html.parser')
    out, faq_pairs = [], []
    in_faq, faq_level = False, 2
    pending_q = None
    answer = []

    def flush_q():
        nonlocal pending_q, answer
        if pending_q and answer:
            faq_pairs.append((pending_q, ' '.join(answer)))
        pending_q, answer = None, []

    for el in soup.children:
        if isinstance(el, NavigableString):
            continue
        name = el.name
        if name in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            level = min(4, max(2, int(name[1])))
            text = el.get_text(' ', strip=True)
            if in_faq and text.endswith('?'):
                flush_q()
                pending_q = text
                continue
            if in_faq:
                flush_q()
                in_faq = False
            if FAQ.match(text):
                in_faq, faq_level = True, level
                continue
            out.append(h_block(level, inline(el)))
            continue
        if in_faq:
            text = el.get_text(' ', strip=True)
            strong = el.find('strong') if name == 'p' else None
            if strong is not None and el.contents and el.contents[0] == strong and strong.get_text(' ', strip=True).endswith('?'):
                flush_q()
                pending_q = re.sub(r'^q\s*[:.]\s*', '', strong.get_text(' ', strip=True), flags=re.I)
                strong.extract()
                rest = re.sub(r'^a\s*[:.]\s*', '', re.sub(r'\s+', ' ', inline(el)).strip(), flags=re.I)
                if rest:
                    answer.append(rest)
                continue
            if name == 'p' and text.endswith('?') and len(text) < 200:
                flush_q()
                pending_q = re.sub(r'^(q\d*[:.)]\s*|\d+[.)]\s*)', '', text, flags=re.I)
                continue
            if pending_q:
                answer.append(re.sub(r'\s+', ' ', inline(el) if name == 'p' else el.get_text(' ', strip=True)).strip())
                continue
        if name == 'p':
            inner = inline(el)
            if inner:
                out.append(p_block(inner))
        elif name in ('ul', 'ol'):
            out.append(list_block(el))
        elif name == 'table':
            out.append(table_block(el))
        elif name == 'blockquote':
            out.append('<!-- wp:quote -->\n<blockquote class="wp-block-quote">' + ''.join(p_block(inline(p)) for p in el.find_all('p')) + '</blockquote>\n<!-- /wp:quote -->\n\n')
        elif name == 'hr':
            continue
        else:
            t = inline(el)
            if t:
                out.append(p_block(t))
    if in_faq:
        flush_q()
    content = ''.join(out)
    if len(faq_pairs) >= 2:
        content += serialize_faq(faq_pairs)
    return content, faq_pairs


if __name__ == '__main__':
    print(json.dumps(convert(sys.argv[1]), ensure_ascii=False))
