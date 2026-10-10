# 0004 — Tooling versions at phase 0

- Status: accepted
- Date: 2026-10-10

Latest stable at setup, with these exceptions:

- **TypeScript 6.0.3**, not 7.x: `typescript-eslint` supports `<6.1`. Revisit when it supports 7.
- **Prisma 7.10.0**: `latest` on npm is an 8.0 release candidate.
- **React 19.2.3** everywhere: the version Expo SDK 57 pins. Next.js 16.4 accepts it, so the hoisted
  `node_modules` holds one React for web and native.
- **pnpm `node-linker=hoisted`**: the most reliable layout for Metro in a pnpm workspace.
- Styling on native uses a small `StyleSheet` theme from `@shopinbos/tokens`, not NativeWind (spec 3 allows either).
