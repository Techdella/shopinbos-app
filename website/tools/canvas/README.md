# Canvas build

The site UI comes from the design canvas (claude.ai artifact, `Site-*.dc.html`). To rebuild after the design or copy changes:

1. Download the canvas page and its runtime, rewrite `/_blob/` to `blob/`, and serve the folder (`python3 -m http.server 8099`).
2. Write the views to render: `variants.py` (named states), `landings.py` (feature/solution pages from `seed/landings.json`), `compare.py` (`seed/comparisons.json`), `pdfs.py` (Starter Kit page and pop-ups from `seed/resources.json`).
3. Save each view's DOM with `node extract.js <cdom dir> <view…>`.
4. Run `python3 -I ../canvas_build.py <cdom dir> <blob dir> <imgmap.json> ../../wp-content/themes/shopinbos`.
5. Deploy, then run `wp shopinbos setup` so pages pick up new sections.

`canvas_build.py` writes `themes/shopinbos/canvas/*.html`, `assets/css/canvas.css` and `assets/img/c/`. Copy fixes on top of the canvas live in its `TEXT` map.
