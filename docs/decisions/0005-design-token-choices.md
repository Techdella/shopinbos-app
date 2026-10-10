# 0005 — Design token choices not fixed by the spec

- Status: accepted (owner, 2026-10-10)
- Date: 2026-10-10

- **Accent button text is ink (`#16141F`), not white.** White on `#FF6A2B` is about 2.9:1, below the spec's
  4.5:1 rule (SPEC 5.3). Ink on accent is about 6.4:1. If the prototype uses white, it needs a darker orange.
- **`stores` is a reserved subdomain** besides the spec's list, because `stores.shopinbos.com` is the CNAME
  target for custom domains (SPEC 9.1 Domain).
- Mascots: the old repo has `rex-1..3.png` and `peggy-1..3.png`. They're renamed by pose in
  `packages/tokens/assets/mascots/` (checked by eye):
  - `rex-1` → `rex-three-quarter`, `rex-2` → `rex-side`, `rex-3` → `rex-front`
  - `peggy-1` → `peggy-side` (back three-quarter), `peggy-2` → `peggy-front`, `peggy-3` → `peggy-three-quarter`
  - The spec's `rex.png` = `rex-front`, `rex-side.png` = `rex-side`, `peggy.png` = `peggy-front`.
  - There is **no waving Peggy**. `peggyWave` uses `peggy-three-quarter` until one is drawn.
  - App icons: Seller uses `rex-front`; Riders and Partners use `peggy-front`.
- A unit test enforces 4.5:1 contrast for each text/background token pair.
