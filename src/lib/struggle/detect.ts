// Spotting someone who is stuck, so Peggy can offer help before they give up (src/components/peggy/PeggyNudge.tsx).
// Pure: the component feeds it what happens on the page and shows a nudge when it returns a reason.
//
// - error:     an error was shown to them (a technical one at once; their own mistakes after three in two minutes)
// - rage:      four or more fast clicks in the same spot (1.2 s, 40 px)
// - dead:      the same button or link clicked five times in 10 s without the page changing
// - scroll:    scrolling and scrolling: 12 screens in a minute, or up and down 8 times in 30 s, without tapping
// - wander:    going back and forth between the same few pages: 6 page changes in a minute over 3 pages or fewer
//
// After a nudge: quiet for three minutes, and at most three nudges per page load.

export type StruggleReason = "error" | "rage" | "dead" | "scroll" | "wander";

export const STRUGGLE = {
  rageClicks: 4,
  rageWindowMs: 1200,
  rageRadiusPx: 40,
  deadClicks: 5,
  deadWindowMs: 10_000,
  scrollScreens: 12,
  scrollWindowMs: 60_000,
  scrollReversals: 8,
  reversalWindowMs: 30_000,
  wanderRoutes: 6,
  wanderWindowMs: 60_000,
  wanderMaxPages: 3,
  userErrors: 3,
  userErrorWindowMs: 120_000,
  quietMs: 180_000,
  maxNudges: 3,
} as const;

type Click = { at: number; x: number; y: number; key: string };
type ScrollStep = { at: number; screens: number };

export type StruggleState = {
  clicks: Click[];
  scrolls: ScrollStep[];
  reversals: number[];
  direction: 1 | -1 | 0;
  /** Pixels scrolled since the last change of direction. */
  run: number;
  routes: Array<{ at: number; path: string }>;
  userErrors: number[];
  lastNudgeAt: number;
  nudges: number;
};

export function newStruggleState(): StruggleState {
  return { clicks: [], scrolls: [], reversals: [], direction: 0, run: 0, routes: [], userErrors: [], lastNudgeAt: -Infinity, nudges: 0 };
}

const within = <T extends { at: number }>(list: T[], now: number, windowMs: number) => list.filter((item) => now - item.at <= windowMs);

/** Returns the reason, and counts the nudge, if a nudge may be shown now. */
function nudge(state: StruggleState, reason: StruggleReason, now: number): StruggleReason | null {
  if (state.nudges >= STRUGGLE.maxNudges || now - state.lastNudgeAt < STRUGGLE.quietMs) return null;
  state.lastNudgeAt = now;
  state.nudges += 1;
  // Start counting afresh, so one burst doesn't nudge twice.
  state.clicks = [];
  state.scrolls = [];
  state.reversals = [];
  state.routes = [];
  state.userErrors = [];
  return reason;
}

/**
 * A click. `key` names what was clicked (the same button gives the same key); `changedSince` is whether the page
 * changed (new content, another page) since the previous click on it, i.e. whether that click did anything.
 */
export function onClick(state: StruggleState, click: Click & { changedSince: boolean }, now = click.at): StruggleReason | null {
  // A tap means they're doing something, not just scrolling.
  state.scrolls = [];
  state.reversals = [];
  const previous = state.clicks.filter((c) => c.key === click.key);
  if (click.changedSince && previous.length) state.clicks = state.clicks.filter((c) => c.key !== click.key);
  state.clicks = [...within(state.clicks, now, STRUGGLE.deadWindowMs), { at: click.at, x: click.x, y: click.y, key: click.key }];

  const fast = within(state.clicks, now, STRUGGLE.rageWindowMs).filter((c) => Math.hypot(c.x - click.x, c.y - click.y) <= STRUGGLE.rageRadiusPx);
  if (fast.length >= STRUGGLE.rageClicks) return nudge(state, "rage", now);
  if (click.key && state.clicks.filter((c) => c.key === click.key).length >= STRUGGLE.deadClicks) return nudge(state, "dead", now);
  return null;
}

/** Typing or another deliberate action: they're working, not stuck scrolling. */
export function onActivity(state: StruggleState) {
  state.scrolls = [];
  state.reversals = [];
}

/** A scroll of `deltaPx` (signed) in a view `viewportPx` tall. */
export function onScroll(state: StruggleState, deltaPx: number, viewportPx: number, now: number): StruggleReason | null {
  if (!deltaPx || viewportPx <= 0) return null;
  const direction = deltaPx > 0 ? 1 : -1;
  // A change of direction counts only after a real run (half a screen or more), not a nudge of the wheel.
  if (direction !== state.direction) {
    if (state.direction && state.run >= viewportPx / 2) state.reversals = [...state.reversals.filter((at) => now - at <= STRUGGLE.reversalWindowMs), now];
    state.direction = direction;
    state.run = 0;
  }
  state.run += Math.abs(deltaPx);
  state.scrolls = [...within(state.scrolls, now, STRUGGLE.scrollWindowMs), { at: now, screens: Math.abs(deltaPx) / viewportPx }];
  const screens = state.scrolls.reduce((sum, step) => sum + step.screens, 0);
  if (screens >= STRUGGLE.scrollScreens) return nudge(state, "scroll", now);
  if (state.reversals.length >= STRUGGLE.scrollReversals) return nudge(state, "scroll", now);
  return null;
}

export function onRoute(state: StruggleState, path: string, now: number): StruggleReason | null {
  state.routes = [...within(state.routes, now, STRUGGLE.wanderWindowMs), { at: now, path }];
  const pages = new Set(state.routes.map((r) => r.path)).size;
  if (state.routes.length >= STRUGGLE.wanderRoutes && pages <= STRUGGLE.wanderMaxPages) return nudge(state, "wander", now);
  return null;
}

/** An error shown on the page. `technical`: something broke on our side (not a mistake in what they typed). */
export function onError(state: StruggleState, technical: boolean, now: number): StruggleReason | null {
  if (technical) return nudge(state, "error", now);
  state.userErrors = [...state.userErrors.filter((at) => now - at <= STRUGGLE.userErrorWindowMs), now];
  if (state.userErrors.length >= STRUGGLE.userErrors) return nudge(state, "error", now);
  return null;
}
