# 0001 — Build the new monorepo in `shopinbos-app`, keep the old app in `legacy/`

- Status: proposed (owner to confirm)
- Date: 2026-10-10

## Context

The spec (section 2.1) names a new repo, `Techdella/shopinbos`. This session only has access to
`Techdella/shopinbos-app`, and the spec says the old code is reference only.

## Decision

Phase 0 is built at the root of `shopinbos-app` on a feature branch. The old Next.js app is moved,
unchanged, to `legacy/` (with its history) so it stays readable as reference. `legacy/` is outside the
pnpm workspace, ignored by lint, format and CI.

## Consequences

- If the owner prefers the separate `Techdella/shopinbos` repo, this branch can be pushed there as-is.
- Production for the old app keeps deploying from `main` until this PR merges. Merging changes what
  the existing Vercel project builds: point that project's root at `apps/web` or create the new Vercel project first.
- Delete `legacy/` once nothing in it is needed (ask the owner first).
