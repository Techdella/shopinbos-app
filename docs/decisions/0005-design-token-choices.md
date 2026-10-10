# 0005 — Design token choices not fixed by the spec

- Status: proposed
- Date: 2026-10-10

- **Accent button text is ink (`#16141F`), not white.** White on `#FF6A2B` is about 2.9:1, below the spec's
  4.5:1 rule (SPEC 5.3). Ink on accent is about 6.4:1. If the prototype uses white, it needs a darker orange.
- **`stores` is a reserved subdomain** besides the spec's list, because `stores.shopinbos.com` is the CNAME
  target for custom domains (SPEC 9.1 Domain).
- Mascots: the old repo has `rex-1..3.png` and `peggy-1..3.png`, not the spec's `rex.png`/`rex-side.png`/
  `peggy.png`/`peggy-wave.png`. They're copied at 1024px to `packages/tokens/assets/mascots/`; `rex` and `peggy`
  point at the `-1` variants. Rename when the owner confirms which pose is which.
- A unit test enforces 4.5:1 contrast for each text/background token pair.
