#!/usr/bin/env python3
# Usage, from the repo root:
#   python3 docs/app-store/make-screenshots.py docs/play-store/listing/screenshots docs/app-store/screenshots/iphone-6.9 docs/app-store/screenshots/iphone-6.3
#
# The optional third folder gets the same set at 1206x2622 for App Store Connect's required "iPhone with Dynamic
# Island (medium display)" slot (Apple doesn't scale the 6.9" set into it).
#
# Google Play phone screenshots (1080x1920) -> App Store 6.9" iPhone (1320x2868):
# 1. The phone frame's round front camera (an Android look; Apple guideline 2.3.10) becomes an iPhone Dynamic Island,
#    tilted like the phone. CAMERAS has a rough position per screenshot; the script finds the exact centre and tilt.
# 2. The dotted top band is repeated upwards to reach the taller iPhone shape, then the image is scaled.
# SKIP: screenshots left out of the App Store set (06-wallet shows the prepaid balance's Top up and "Pays for AI
# credits", which store builds don't have: Apple 3.1.1, docs/store-payments-audit.md).
import glob, math, os, sys
from PIL import Image, ImageDraw

W, H = 1320, 2868
W_MEDIUM, H_MEDIUM = 1206, 2622
PERIOD = 44  # the dot grid's spacing in the Play screenshots
CAMERAS = {
    "01-onb.jpg": (350, 638), "02-home.jpg": (710, 638), "03-products.jpg": (348, 638), "04-chats.jpg": (705, 744),
    "05-orders.jpg": (352, 748), "07-find.jpg": (352, 746), "08-delivery.jpg": (708, 746),
}
SKIP = {"06-wallet.jpg"}
ISLAND_W, ISLAND_H = 150, 44  # in Play-screenshot pixels, for a ~550px-wide phone screen
SS = 4  # supersampling for smooth edges


def luminance(px, x, y):
    r, g, b = px[x, y]
    return 0.299 * r + 0.587 * g + 0.114 * b


def find_camera(im, hint):
    px = im.load()
    hx, hy = hint
    dark = [(x, y) for y in range(hy - 25, hy + 26) for x in range(hx - 25, hx + 26) if luminance(px, x, y) < 60]
    if len(dark) < 100:
        raise SystemExit(f"no camera near {hint}")
    return sum(x for x, _ in dark) / len(dark), sum(y for _, y in dark) / len(dark)


def find_tilt(im, cx, cy):
    """The screen's top edge either side of the camera: walk up from the camera row until the bezel (dark)."""
    px = im.load()
    points = []
    for dx in list(range(-110, -39, 10)) + list(range(40, 111, 10)):
        x = round(cx + dx)
        y = round(cy)
        if luminance(px, x, y) < 150:
            continue
        while y > 0 and luminance(px, x, y) >= 110:
            y -= 1
        points.append((x, y))
    n = len(points)
    mx = sum(x for x, _ in points) / n
    my = sum(y for _, y in points) / n
    slope = sum((x - mx) * (y - my) for x, y in points) / sum((x - mx) ** 2 for x, _ in points)
    return math.degrees(math.atan(slope))


def add_island(im, name):
    cx, cy = find_camera(im, CAMERAS[name])
    angle = find_tilt(im, cx, cy)
    size = (ISLAND_W + 20) * SS
    mask = Image.new("L", (size, size), 0)
    left, top = (size - ISLAND_W * SS) // 2, (size - ISLAND_H * SS) // 2
    ImageDraw.Draw(mask).rounded_rectangle((left, top, left + ISLAND_W * SS, top + ISLAND_H * SS), radius=ISLAND_H * SS // 2, fill=255)
    mask = mask.rotate(-angle, resample=Image.BICUBIC).resize((size // SS, size // SS), Image.LANCZOS)
    im.paste(Image.new("RGB", mask.size, (10, 10, 12)), (round(cx - mask.width / 2), round(cy - mask.height / 2)), mask)
    return cx, cy, angle


def extend_top(im):
    w, h = im.size
    target_h = round(w * H / W)
    extra = target_h - h
    band = im.crop((0, 0, w, PERIOD))
    canvas = Image.new("RGB", (w, target_h))
    for y in range(extra):
        row = (y - extra) % PERIOD
        canvas.paste(band.crop((0, row, w, row + 1)), (0, y))
    canvas.paste(im, (0, extra))
    return canvas


src, out = sys.argv[1], sys.argv[2]
out_medium = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(out, exist_ok=True)
if out_medium:
    os.makedirs(out_medium, exist_ok=True)
for path in sorted(glob.glob(os.path.join(src, "*.jpg"))):
    name = os.path.basename(path)
    if name in SKIP:
        continue
    im = Image.open(path).convert("RGB")
    cx, cy, angle = add_island(im, name)
    big = extend_top(im).resize((W, H), Image.LANCZOS)
    big.save(os.path.join(out, name), quality=92)
    if out_medium:
        # Same shape to within a pixel: scale to the height, trim the width evenly.
        w = round(W * H_MEDIUM / H)
        medium = big.resize((w, H_MEDIUM), Image.LANCZOS)
        left = (w - W_MEDIUM) // 2
        medium.crop((left, 0, left + W_MEDIUM, H_MEDIUM)).save(os.path.join(out_medium, name), quality=92)
    print(f"{name}: camera ({cx:.0f}, {cy:.0f}), tilt {angle:.1f}°")
