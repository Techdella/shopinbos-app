"""Turn blog posts written in markdown (content/blog-q4/*.md, see FORMAT.md there) into WordPress block markup.

Usage: python3 -I md_posts.py <markdown dir> <out.json>
Writes a JSON list the plugin's setup command imports (seed/blog-q4.json). Posts dated in the future are
scheduled by WordPress and go live on their date.
"""
import html, json, os, re, sys

SRC, OUT = sys.argv[1:3]


def attrs(d):
    s = json.dumps(d, ensure_ascii=False)
    for a, b in (('--', '\\u002d\\u002d'), ('<', '\\u003c'), ('>', '\\u003e'), ('&', '\\u0026')):
        s = s.replace(a, b)
    return s


def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', lambda m: '<a href="%s">%s</a>' % (html.escape(m.group(2), quote=True), m.group(1)), t)
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)', r'<em>\1</em>', t)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    return t


def plain(t):
    """Text for block attributes: keep links and bold as markdown-ish plain text the blocks render."""
    t = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', r'\1', t)
    return re.sub(r'\*\*(.+?)\*\*', r'\1', t).strip()


def p(t):
    return '<!-- wp:paragraph -->\n<p>%s</p>\n<!-- /wp:paragraph -->\n\n' % inline(t)


def h(level, t):
    t = inline(re.sub(r'\*\*', '', t))
    if level == 2:
        return '<!-- wp:heading -->\n<h2 class="wp-block-heading">%s</h2>\n<!-- /wp:heading -->\n\n' % t
    return '<!-- wp:heading {"level":%d} -->\n<h%d class="wp-block-heading">%s</h%d>\n<!-- /wp:heading -->\n\n' % (level, level, t, level)


def lst(items, ordered):
    li = ''.join('<!-- wp:list-item -->\n<li>%s</li>\n<!-- /wp:list-item -->' % inline(i) for i in items)
    if ordered:
        return '<!-- wp:list {"ordered":true} -->\n<ol class="wp-block-list">%s</ol>\n<!-- /wp:list -->\n\n' % li
    return '<!-- wp:list -->\n<ul class="wp-block-list">%s</ul>\n<!-- /wp:list -->\n\n' % li


def table(rows):
    cells = [[c.strip() for c in r.strip().strip('|').split('|')] for r in rows if not re.match(r'^\s*\|?\s*:?-{2,}', r)]
    head, body = cells[0], cells[1:]
    th = ''.join('<th>%s</th>' % inline(c) for c in head)
    tb = ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % inline(c) for c in r) for r in body)
    return '<!-- wp:table -->\n<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></figure>\n<!-- /wp:table -->\n\n' % (th, tb)


def special(kind, title, lines):
    lines = [l.strip() for l in lines if l.strip()]
    if kind in ('tip', 'warn', 'note'):
        return '<!-- wp:shopinbos/callout %s /-->\n\n' % attrs({'kind': kind, 'title': title, 'text': plain(' '.join(lines))})
    if kind == 'steps':
        return '<!-- wp:shopinbos/steps %s /-->\n\n' % attrs({'title': title, 'items': '\n'.join(plain(l) for l in lines)})
    if kind == 'checklist':
        return '<!-- wp:shopinbos/checklist %s /-->\n\n' % attrs({'title': title, 'items': '\n'.join(plain(re.sub(r'^[-*]\s*(\[.?\]\s*)?', '', l)) for l in lines)})
    if kind == 'faq':
        return '<!-- wp:shopinbos/faq %s /-->\n\n' % attrs({'title': title or 'Questions sellers ask', 'items': '\n'.join(plain(l) for l in lines if '|' in l), 'openFirst': True})
    return ''.join(p(l) for l in lines)


def convert(text):
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    meta = {}
    for line in m.group(1).splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            meta[k.strip()] = v.strip().strip('"')
    body = text[m.end():].splitlines()
    out, para, i = [], [], 0

    def flush():
        if para:
            out.append(p(' '.join(para)))
            para.clear()
    while i < len(body):
        line = body[i]
        s = line.strip()
        if not s:
            flush(); i += 1; continue
        mm = re.match(r'^:::(\w[\w-]*)\s*(.*)$', s)
        if mm:
            flush()
            kind, title, block = mm.group(1), mm.group(2), []
            i += 1
            while i < len(body) and body[i].strip() != ':::':
                block.append(body[i]); i += 1
            out.append(special(kind, title, block)); i += 1; continue
        if s.startswith('#'):
            flush()
            level = len(s) - len(s.lstrip('#'))
            if level == 1:
                i += 1; continue  # the title is the post title
            out.append(h(min(level, 4), s.lstrip('#').strip())); i += 1; continue
        if s.startswith('|'):
            flush()
            rows = []
            while i < len(body) and body[i].strip().startswith('|'):
                rows.append(body[i]); i += 1
            out.append(table(rows)); continue
        if re.match(r'^([-*]|\d+[.)])\s+', s):
            flush()
            ordered = bool(re.match(r'^\d', s))
            items = []
            while i < len(body) and re.match(r'^\s*([-*]|\d+[.)])\s+', body[i]):
                items.append(re.sub(r'^\s*([-*]|\d+[.)])\s+', '', body[i]).strip()); i += 1
            out.append(lst(items, ordered)); continue
        if s.startswith('>'):
            flush()
            out.append('<!-- wp:quote -->\n<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>%s</p>\n<!-- /wp:paragraph --></blockquote>\n<!-- /wp:quote -->\n\n' % inline(s.lstrip('> '))); i += 1; continue
        para.append(s); i += 1
    flush()
    meta['content'] = ''.join(out)
    meta['words'] = len(re.sub(r'<[^>]+>', ' ', meta['content']).split())
    return meta


posts = []
for f in sorted(os.listdir(SRC)):
    if f.endswith('.md') and re.match(r'^\d{4}-\d{2}-\d{2}-', f):
        posts.append(convert(open(os.path.join(SRC, f)).read()))
json.dump(posts, open(OUT, 'w'), ensure_ascii=False, indent=1)
for x in posts:
    print(x['date'], x['slug'], x['category'], x['words'])
