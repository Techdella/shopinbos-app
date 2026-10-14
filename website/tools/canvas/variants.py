"""Write V-<name>.dc.html variants of the canvas with a seeded state; FAQ answers forced open; buttons tagged with data-go."""
import json, re, sys
R = sys.argv[1]
src = open(R + '/Site-blog.dc.html').read().replace('/_blob/', 'blob/')
src = re.sub(r'onClick="\{\{\s*([^}\s]+)\s*\}\}"', r'onClick="{{\1}}" data-go="\1"', src)
base_open = src.replace('<sc-if value="{{item.open}}"', '<sc-if value="{{true}}"')
def gen(name, state, open_all=True):
    s = base_open if open_all else src
    s = s.replace('Object.assign(this.state, {"view": "blog"})', 'Object.assign(this.state, ' + json.dumps(state) + ')')
    open(f'{R}/V-{name}.dc.html', 'w').write(s)
V = json.loads(sys.argv[2])
for name, state in V.items():
    gen(name, state)
print(len(V), 'variants')
