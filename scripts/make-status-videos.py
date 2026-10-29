#!/usr/bin/env python3
"""Renders Shopinbos's official Status videos (720x1280, 30 fps, 10 s) with PIL and pipes them to ffmpeg.
Usage: make.py <repo_public_dir> <out_dir> [key ...]"""
import math, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

PUBLIC, OUT = sys.argv[1], sys.argv[2]
ONLY = set(sys.argv[3:])
W, H, FPS, DUR = 720, 1280, 30, 10.0
NAVY = (14, 42, 56); MINT = (115, 216, 200); CREAM = (244, 241, 234); PAPER = (250, 247, 241)
AMBER = (242, 169, 59); CORAL = (232, 106, 79); TEAL = (46, 126, 120); PLUM = (107, 79, 138)
INK = (22, 20, 31); KRAFT = (201, 139, 75); KRAFT_D = (163, 108, 54); RED = (229, 57, 53); WHITE = (255, 255, 255)
SKIN = (141, 85, 36); HAIR = (43, 27, 18)

FD = "/usr/share/fonts/opentype/inter/"
def font(name, size): return ImageFont.truetype(FD + name, size)
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
_fc = {}
def F(name, size):
    key = (name, int(size))
    if key not in _fc: _fc[key] = ImageFont.truetype(MONO, int(size)) if name == "mono" else font(name, int(size))
    return _fc[key]

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(x):
    x = clamp(x); return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
def ease_out(x): x = clamp(x); return 1 - (1 - x) ** 3
def back_out(x):
    x = clamp(x); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def lerp(a, b, x): return a + (b - a) * x
def seg(t, a, b): return clamp((t - a) / (b - a))

# ─── Static layers ──────────────────────────────────────────────────────────
BG = Image.new("RGB", (W, H), NAVY)
d = ImageDraw.Draw(BG)
for y in range(20, H, 36):
    for x in range(20, W, 36):
        d.ellipse((x - 1.6, y - 1.6, x + 1.6, y + 1.6), fill=(36, 70, 86))
# soft mint glow
glow = Image.new("L", (W, H), 0)
ImageDraw.Draw(glow).ellipse((-200, 700, 920, 1600), fill=70)
glow = glow.filter(ImageFilter.GaussianBlur(120))
BG = Image.composite(Image.new("RGB", (W, H), TEAL), BG, glow)

def load_rgba(path, size):
    im = Image.open(os.path.join(PUBLIC, path)).convert("RGBA")
    im.thumbnail((size, size), Image.LANCZOS)
    return im
MASCOT = {"rex": load_rgba("brand/mascots/rex-1.png", 300), "peggy": load_rgba("brand/mascots/peggy-1.png", 300)}
WORDMARK = load_rgba("brand/app/wordmark-light.png", 330)
ICON = load_rgba("brand/logos/shopping boss white icon.png", 64)

# Phone geometry (screen-space drawing at 1x, then pasted with scale).
PW, PH, PR = 420, 820, 58
SW, SH, SR = 388, 788, 44

def rounded_mask(w, h, r):
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255); return m
PHONE_MASK = rounded_mask(PW, PH, PR)
SCREEN_MASK = rounded_mask(SW, SH, SR)
SHADOW = Image.new("L", (PW + 120, PH + 120), 0)
ImageDraw.Draw(SHADOW).rounded_rectangle((60, 80, PW + 60, PH + 60), PR, fill=150)
SHADOW = SHADOW.filter(ImageFilter.GaussianBlur(28))

def text_c(d, xy, s, f, fill, spacing=6):
    d.multiline_text(xy, s, font=f, fill=fill, anchor="mm", align="center", spacing=spacing)

def wrap(s, f, width):
    words, lines, cur = s.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if f.getlength(trial) <= width or not cur: cur = trial
        else: lines.append(cur); cur = w_
    if cur: lines.append(cur)
    return "\n".join(lines)

# ─── Subjects (drawn on the phone screen; u = 0..1 through the recording) ──
def sparkle(d, x, y, r, col):
    d.polygon([(x, y - r), (x + r * 0.28, y - r * 0.28), (x + r, y), (x + r * 0.28, y + r * 0.28), (x, y + r), (x - r * 0.28, y + r * 0.28), (x - r, y), (x - r * 0.28, y - r * 0.28)], fill=col)

def heart(d, x, y, r, col):
    d.ellipse((x - r, y - r * 0.7, x, y + r * 0.3), fill=col)
    d.ellipse((x, y - r * 0.7, x + r, y + r * 0.3), fill=col)
    d.polygon([(x - r * 0.95, y - 0.05 * r), (x + r * 0.95, y - 0.05 * r), (x, y + r)], fill=col)

def box(d, x, y, w, h, tape=True):
    d.rounded_rectangle((x - w / 2, y - h / 2, x + w / 2, y + h / 2), 8, fill=KRAFT, outline=KRAFT_D, width=3)
    if tape: d.rectangle((x - 9, y - h / 2, x + 9, y + h / 2), fill=(232, 205, 160))
    d.line((x - w / 2 + 12, y + h / 2 - 16, x - w / 2 + 40, y + h / 2 - 16), fill=KRAFT_D, width=4)

def subj_bag(img, d, u, t):
    cx, cy = SW / 2, 400
    z = 1 + 0.18 * ease(u)
    sway = math.sin(t * 2.4) * 6
    d.ellipse((cx - 120 * z, cy + 150 * z, cx + 120 * z, cy + 182 * z), fill=(222, 214, 200))
    # handle
    d.arc((cx - 72 * z + sway, cy - 170 * z, cx + 72 * z + sway, cy - 10 * z), 180, 360, fill=NAVY, width=int(16 * z))
    d.polygon([(cx - 130 * z, cy + 160 * z), (cx + 130 * z, cy + 160 * z), (cx + 100 * z + sway * 0.4, cy - 80 * z), (cx - 100 * z + sway * 0.4, cy - 80 * z)], fill=CORAL)
    d.polygon([(cx - 100 * z + sway * 0.4, cy - 80 * z), (cx + 100 * z + sway * 0.4, cy - 80 * z), (cx + 92 * z, cy - 20 * z), (cx - 92 * z, cy - 20 * z)], fill=(200, 84, 60))
    d.rounded_rectangle((cx - 24 * z, cy - 34 * z, cx + 24 * z, cy - 4 * z), 6, fill=AMBER)
    # swinging tag
    a = math.sin(t * 3) * 0.35
    tx, ty = cx + 110 * z + math.sin(a) * 50, cy - 60 * z + math.cos(a) * 50
    d.line((cx + 96 * z, cy - 70 * z, tx, ty), fill=NAVY, width=3)
    d.rounded_rectangle((tx - 30, ty, tx + 30, ty + 40), 8, fill=MINT)
    for i, (sx, sy, ph) in enumerate([(70, 220, 0), (320, 260, 1.3), (300, 560, 2.2), (80, 520, 3.1)]):
        k = (math.sin(t * 4 + ph) + 1) / 2
        sparkle(d, sx, sy, 10 + 12 * k, AMBER if i % 2 else MINT)

def subj_customer(img, d, u, t):
    cx, cy = SW / 2, 360
    z = 1 + 0.1 * ease(u)
    bob = math.sin(t * 3) * 5
    # body
    d.rounded_rectangle((cx - 120 * z, cy + 60 * z + bob, cx + 120 * z, cy + 270 * z), int(80 * z), fill=TEAL)
    d.polygon([(cx - 26 * z, cy + 60 * z + bob), (cx + 26 * z, cy + 60 * z + bob), (cx, cy + 110 * z + bob)], fill=CREAM)
    # head
    hy = cy - 40 * z + bob
    d.ellipse((cx - 78 * z, hy - 90 * z, cx + 78 * z, hy + 80 * z), fill=SKIN)
    d.pieslice((cx - 84 * z, hy - 104 * z, cx + 84 * z, hy + 30 * z), 180, 360, fill=HAIR)
    d.ellipse((cx - 38 * z, hy - 8 * z, cx - 22 * z, hy + 10 * z), fill=INK)
    d.ellipse((cx + 22 * z, hy - 8 * z, cx + 38 * z, hy + 10 * z), fill=INK)
    d.arc((cx - 40 * z, hy, cx + 40 * z, hy + 52 * z), 15, 165, fill=INK, width=int(7 * z))
    # bag held up
    lift = ease(seg(u, 0.1, 0.4)) * 60
    bx, by = cx + 150 * z, cy + 120 * z - lift + bob
    d.line((cx + 90 * z, cy + 150 * z, bx - 10, by + 10), fill=SKIN, width=int(30 * z))
    d.arc((bx - 34, by - 70, bx + 34, by - 6), 180, 360, fill=NAVY, width=8)
    d.rounded_rectangle((bx - 58, by - 40, bx + 58, by + 80), 12, fill=AMBER)
    img.paste(ICON.resize((40, 46)), (int(bx - 20), int(by - 4)), ICON.resize((40, 46)))
    # hearts floating up
    for i in range(5):
        p = (t * 0.45 + i / 5) % 1
        hx = 60 + i * 64 + math.sin(t * 2 + i) * 14
        hy2 = 640 - p * 520
        r = 14 + 6 * (i % 2)
        if p < 0.9: heart(d, hx, hy2, r, CORAL if i % 2 else (240, 140, 160))

def subj_stock(img, d, u, t):
    # van drives in, then boxes stack beside it
    vx = lerp(-220, 110, ease_out(seg(u, 0, 0.35))) + (math.sin(t * 30) * 1.5 if u < 0.35 else 0)
    vy = 430
    d.rectangle((0, vy + 120, SW, SH), fill=(226, 220, 207))
    d.line((0, vy + 120, SW, vy + 120), fill=(200, 192, 176), width=4)
    d.rounded_rectangle((vx - 110, vy - 60, vx + 80, vy + 100), 16, fill=NAVY)
    d.rounded_rectangle((vx + 70, vy - 10, vx + 140, vy + 100), 14, fill=NAVY)
    d.rounded_rectangle((vx + 88, vy + 4, vx + 128, vy + 44), 8, fill=(186, 230, 222))
    img.paste(ICON.resize((44, 50)), (int(vx - 38), int(vy - 6)), ICON.resize((44, 50)))
    for wx in (vx - 60, vx + 100):
        d.ellipse((wx - 28, vy + 76, wx + 28, vy + 132), fill=INK)
        d.ellipse((wx - 11, vy + 93, wx + 11, vy + 115), fill=(180, 180, 180))
    # boxes pop in
    spots = [(318, vy + 82, 0.42), (318, vy + 6, 0.56), (238, vy + 82, 0.66), (318, vy - 70, 0.78), (238, vy + 6, 0.88)]
    for bx, by, at in spots:
        if seg(u, at, at + 0.1) <= 0: continue
        k = back_out(seg(u, at, at + 0.1))
        drop = (1 - k) * 120
        box(d, bx, by - drop, 76 * min(1, k + 0.2), 74 * min(1, k + 0.2))
    if u > 0.9:
        sparkle(d, 318, vy - 150, 18, AMBER)

def subj_pack(img, d, u, t):
    cx, by = SW / 2, 560
    # open box
    d.polygon([(cx - 130, by - 120), (cx + 130, by - 120), (cx + 120, by + 90), (cx - 120, by + 90)], fill=KRAFT)
    items = [(cx - 50, CORAL, 0.05), (cx + 40, MINT, 0.25), (cx - 5, AMBER, 0.45)]
    for ix, col, at in items:
        k = ease(seg(u, at, at + 0.18))
        if k <= 0: continue
        iy = lerp(160, by - 120 - 20 + 40 * k, k)
        if k < 1: d.rounded_rectangle((ix - 40, iy - 50, ix + 40, iy + 50), 14, fill=col)
        else: d.rounded_rectangle((ix - 40, by - 140, ix + 40, by - 80), 14, fill=col)
    d.polygon([(cx - 130, by - 120), (cx + 130, by - 120), (cx + 120, by + 90), (cx - 120, by + 90)], outline=KRAFT_D, width=4)
    d.rectangle((cx - 130, by - 80, cx + 130, by + 90), fill=KRAFT)
    d.line((cx - 100, by + 60, cx - 40, by + 60), fill=KRAFT_D, width=5)
    # flaps close
    k = ease(seg(u, 0.68, 0.82))
    lf = lerp(-150, 0, k)
    d.polygon([(cx - 130, by - 120), (cx, by - 120), (cx + lf * 0.1, by - 120 + lf * 0.6 - 0), (cx - 130, by - 120 + lf)], fill=KRAFT_D)
    d.polygon([(cx + 130, by - 120), (cx, by - 120), (cx - lf * 0.1, by - 120 + lf * 0.6), (cx + 130, by - 120 + lf)], fill=KRAFT_D)
    if k >= 1:
        tk = ease(seg(u, 0.84, 0.92))
        d.rectangle((cx - 16, by - 124, cx + 16, by - 124 + 210 * tk), fill=(232, 205, 160))
        c = back_out(seg(u, 0.9, 0.98))
        if c > 0:
            r = 46 * c
            d.ellipse((cx + 110 - r, by - 200 - r, cx + 110 + r, by - 200 + r), fill=TEAL)
            d.line([(cx + 110 - 20 * c, by - 200), (cx + 110 - 4 * c, by - 184 * 1), (cx + 110 + 22 * c, by - 216)], fill=WHITE, width=9, joint="curve")

def subj_bike(img, d, u, t):
    cx, cy = SW / 2 + 10, 480
    bounce = math.sin(t * 22) * 2.5
    d.rectangle((0, cy + 110, SW, SH), fill=(226, 220, 207))
    # speed lines
    for i in range(4):
        x0 = (t * 260 + i * 110) % (SW + 120) - 120
        d.line((SW - x0, cy - 60 + i * 40, SW - x0 + 60, cy - 60 + i * 40), fill=(200, 192, 176), width=6)
    y = cy + bounce
    for wx in (cx - 110, cx + 110):
        d.ellipse((wx - 58, y + 30, wx + 58, y + 146), fill=INK)
        d.ellipse((wx - 34, y + 54, wx + 34, y + 122), fill=(210, 210, 210))
        for k in range(4):
            a = t * 5 + k * math.pi / 4
            d.line((wx - 32 * math.cos(a), y + 88 - 32 * math.sin(a), wx + 32 * math.cos(a), y + 88 + 32 * math.sin(a)), fill=(120, 120, 120), width=4)
    d.polygon([(cx - 110, y + 88), (cx - 20, y - 10), (cx + 70, y - 10), (cx + 110, y + 88), (cx + 40, y + 70), (cx - 50, y + 70)], fill=CORAL)
    d.rounded_rectangle((cx - 40, y - 34, cx + 60, y - 4), 14, fill=NAVY)
    d.line((cx + 70, y - 10, cx + 100, y - 80), fill=INK, width=10)
    d.line((cx + 84, y - 84, cx + 130, y - 92), fill=INK, width=10)
    d.ellipse((cx + 118, y - 52, cx + 146, y - 24), fill=AMBER)
    # delivery box
    d.rounded_rectangle((cx - 150, y - 120, cx - 30, y - 10), 14, fill=MINT)
    img.paste(ICON.resize((50, 58)), (int(cx - 115), int(y - 95)), ICON.resize((50, 58)))
    # exhaust puffs
    for i in range(3):
        p = (t * 1.2 + i / 3) % 1
        r = 10 + 24 * p
        x = cx - 170 - p * 120
        col = tuple(int(lerp(c, 244, p)) for c in (190, 186, 178))
        d.ellipse((x - r, y + 80 - r - p * 30, x + r, y + 80 + r - p * 30), fill=col)

def subj_drop(img, d, u, t):
    d.rectangle((0, 610, SW, SH), fill=(226, 220, 207))
    # house front + door
    d.rectangle((200, 230, 370, 610), fill=(214, 200, 176))
    d.polygon([(180, 240), (285, 150), (390, 240)], fill=TEAL)
    d.rounded_rectangle((240, 420, 330, 610), 8, fill=PLUM)
    d.ellipse((312, 510, 324, 522), fill=AMBER)
    # box carried to the door
    k = ease(seg(u, 0.05, 0.55))
    bx = lerp(-60, 200, k); byy = 560 - abs(math.sin(k * math.pi * 3)) * 18 * (1 - k)
    box(d, bx, byy, 92, 84)
    c = back_out(seg(u, 0.62, 0.74))
    if c > 0:
        r = 70 * c
        cx, cy = 140, 330
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=TEAL)
        d.line([(cx - 30 * c, cy + 2 * c), (cx - 6 * c, cy + 26 * c), (cx + 34 * c, cy - 24 * c)], fill=WHITE, width=14, joint="curve")
    if u > 0.75:
        for i, (sx, sy) in enumerate([(60, 230), (230, 280), (70, 440)]):
            sparkle(d, sx, sy, 10 + 8 * ((math.sin(t * 5 + i) + 1) / 2), AMBER)

VIDEOS = {
    "seller-product": dict(title="Show your product on video", mascot="rex", subject=subj_bag, music="lets-go", at=34),
    "seller-customer": dict(title="Show a happy customer", mascot="peggy", subject=subj_customer, music="kite-lines", at=20),
    "supplier-stock": dict(title="Show new stock arriving", mascot="rex", subject=subj_stock, music="everywhere", at=28),
    "supplier-packing": dict(title="Show orders being packed", mascot="peggy", subject=subj_pack, music="crazy", at=30),
    "partner-ready": dict(title="Show your bike or van ready", mascot="rex", subject=subj_bike, music="buckle-up-and-break-free", at=24),
    "partner-delivered": dict(title="Show a delivery done", mascot="peggy", subject=subj_drop, music="lets-go", at=70),
}

def screen(spec, t):
    rec_t = clamp((t - 2.6) / 5.4)
    img = Image.new("RGB", (SW, SH), PAPER)
    d = ImageDraw.Draw(img)
    spec["subject"](img, d, rec_t, t)
    # story bars
    d.rounded_rectangle((18, 18, SW - 18, 24), 3, fill=(210, 205, 195))
    d.rounded_rectangle((18, 18, 18 + (SW - 36) * rec_t, 24), 3, fill=NAVY)
    # REC pill
    d.rounded_rectangle((18, 40, 164, 82), 21, fill=NAVY)
    if int(t * 2) % 2 == 0 or t < 2.6: d.ellipse((32, 52, 50, 70), fill=RED)
    secs = int(max(0.0, t - 2.6) / 5.4 * 15) if t > 2.6 else 0
    d.text((60, 61), f"REC 0:{min(secs, 15):02d}", font=F("mono", 20), fill=WHITE, anchor="lm")
    # record button with progress arc
    bx, by = SW / 2, SH - 90
    d.ellipse((bx - 46, by - 46, bx + 46, by + 46), outline=WHITE, width=8, fill=None)
    d.ellipse((bx - 50, by - 50, bx + 50, by + 50), outline=(205, 198, 186), width=3)
    if rec_t > 0: d.arc((bx - 54, by - 54, bx + 54, by + 54), -90, -90 + 360 * rec_t, fill=MINT, width=8)
    r = 30 if t > 2.6 else 36
    d.rounded_rectangle((bx - r, by - r, bx + r, by + r), 12 if t > 2.6 else r, fill=RED)
    return img

def phone(spec, t):
    ph = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
    body = Image.new("RGBA", (PW, PH), (7, 22, 30, 255))
    ph.paste(body, (0, 0), PHONE_MASK)
    sc = screen(spec, t)
    ph.paste(sc, ((PW - SW) // 2, (PH - SH) // 2), SCREEN_MASK)
    ImageDraw.Draw(ph).rounded_rectangle((PW / 2 - 50, 22, PW / 2 + 50, 40), 9, fill=(7, 22, 30))
    return ph

def frame(spec, t):
    im = BG.copy()
    d = ImageDraw.Draw(im)
    # Title: centred on the intro, then up top over the phone.
    move = ease(seg(t, 1.8, 2.5))
    out = ease(seg(t, 8.0, 8.5))
    size = lerp(64, 42, move)
    ft = F("InterDisplay-Bold.otf", size)
    title = wrap(spec["title"], ft, 540)
    appear = ease_out(seg(t, 0.1, 0.8))
    ty = lerp(400, 250, move) + (1 - appear) * 60 - out * 80
    if appear > 0 and out < 1:
        alpha = appear * (1 - out)
        col = tuple(int(lerp(NAVY[i], CREAM[i], alpha)) for i in range(3))
        ey = ty - (110 if move < 0.5 else 80) * lerp(1, 0.8, move) - 10
        d.text((W / 2, ey), "STATUS  ·  VIDEO", font=F("mono", 22), fill=tuple(int(lerp(NAVY[i], MINT[i], alpha)) for i in range(3)), anchor="mm")
        text_c(d, (W / 2, ty), title, ft, col, spacing=int(size * 0.12))
    # Mascot pops in on the intro, drops away as the phone comes up.
    mk = back_out(seg(t, 0.4, 1.0)) - ease(seg(t, 1.8, 2.3)) * 1.3
    if mk > 0.02:
        m = MASCOT[spec["mascot"]]
        s = max(1, int(m.width * min(mk, 1.05)))
        mm = m.resize((s, s), Image.LANCZOS)
        im.paste(mm, (int(W / 2 - s / 2), int(760 - s / 2 + (1 - min(mk, 1)) * 120)), mm)
    # Phone slides up and records, then shrinks away.
    up = ease(seg(t, 1.8, 2.7))
    if up > 0 and out < 1:
        ph = phone(spec, t)
        scale = lerp(0.8, 0.5, out)
        if abs(scale - 1) > 0.01:
            ph = ph.resize((int(PW * scale), int(PH * scale)), Image.BILINEAR)
        x = int(W / 2 - ph.width / 2)
        y = int(lerp(H + 40, 350, up) + out * 120)
        sh = SHADOW.resize((int(SHADOW.width * scale), int(SHADOW.height * scale)))
        im.paste((0, 0, 0), (x - int(60 * scale), y - int(60 * scale)), sh.point(lambda v: int(v * (1 - out))))
        if out > 0:
            a = ph.split()[3].point(lambda v: int(v * (1 - out)))
            ph.putalpha(a)
        im.paste(ph, (x, y), ph)
    # End card.
    e = ease_out(seg(t, 8.3, 9.0))
    if e > 0:
        r = 92 * back_out(seg(t, 8.3, 8.9))
        cx, cy = W / 2, 390
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=MINT)
        tri = 0.42 * r
        d.polygon([(cx - tri * 0.7, cy - tri), (cx - tri * 0.7, cy + tri), (cx + tri * 1.05, cy)], fill=NAVY)
        col = tuple(int(lerp(NAVY[i], CREAM[i], e)) for i in range(3))
        text_c(d, (W / 2, 580 + (1 - e) * 40), "Post a video", F("InterDisplay-Bold.otf", 72), col)
        sub = tuple(int(lerp(NAVY[i], MINT[i], e)) for i in range(3))
        d.text((W / 2, 660 + (1 - e) * 40), "UP TO 30 SECONDS", font=F("mono", 28), fill=sub, anchor="mm")
        wm = WORDMARK.copy(); wm.putalpha(wm.split()[3].point(lambda v: int(v * e)))
        im.paste(wm, (int(W / 2 - wm.width / 2), 740), wm)
    return im

def render(key, spec):
    mp4 = os.path.join(OUT, f"{key}.mp4"); jpg = os.path.join(OUT, f"{key}.jpg")
    music = os.path.join(PUBLIC, "audio", "tips", spec["music"] + ".mp3")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-ss", str(spec["at"]), "-t", str(DUR), "-i", music,
           "-filter_complex", f"[1:a]volume=0.55,afade=t=in:st=0:d=0.6,afade=t=out:st={DUR-1.2}:d=1.2,aresample=44100[a]",
           "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-profile:v", "main", "-level", "3.1",
           "-pix_fmt", "yuv420p", "-g", "60", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", "-shortest", mp4]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(DUR * FPS)
    for i in range(n):
        t = i / FPS
        im = frame(spec, t)
        if i == int(5.2 * FPS): im.save(jpg, quality=80, optimize=True, progressive=True)
        p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    print(key, os.path.getsize(mp4), os.path.getsize(jpg))

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for key, spec in VIDEOS.items():
        if ONLY and key not in ONLY: continue
        if os.environ.get("STILLS"):
            for s in (0.9, 2.2, 4.0, 6.5, 9.5): frame(spec, s).save(os.path.join(OUT, f"{key}-{s}.png"))
            continue
        render(key, spec)
