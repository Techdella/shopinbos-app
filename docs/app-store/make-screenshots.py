#!/usr/bin/env python3
# Usage, from the repo root: python3 docs/app-store/make-screenshots.py docs/play-store/listing/screenshots docs/app-store/screenshots/iphone-6.9
# Play Store phone screenshots (1080x1920) -> App Store 6.9" (1320x2868): extend the dotted top band, then scale.
import glob, os, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
W, H = 1320, 2868
PERIOD = 44
for f in sorted(glob.glob(os.path.join(src, "*.jpg"))):
    im = Image.open(f).convert("RGB")
    w, h = im.size
    target_h = round(w * H / W)
    extra = target_h - h
    band = im.crop((0, 0, w, PERIOD))
    canvas = Image.new("RGB", (w, target_h))
    for y in range(extra):
        row = (y - extra) % PERIOD
        canvas.paste(band.crop((0, row, w, row + 1)), (0, y))
    canvas.paste(im, (0, extra))
    canvas.resize((W, H), Image.LANCZOS).save(os.path.join(out, os.path.basename(f)), quality=92)
    print(os.path.basename(f), extra)
