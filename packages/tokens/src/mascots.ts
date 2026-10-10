/**
 * Rex (mint dinosaur, builds) and Peggy (penguin, runs the shop).
 * 1024px copies of the old repo's public/brand/mascots, named by pose:
 *   rex-1 → rex-three-quarter, rex-2 → rex-side, rex-3 → rex-front
 *   peggy-1 → peggy-side, peggy-2 → peggy-front, peggy-3 → peggy-three-quarter
 * The spec's `peggy-wave` pose doesn't exist yet; `peggyWave` falls back to the three-quarter pose.
 */
export const mascotFiles = {
  'rex-front': 'assets/mascots/rex-front.png',
  'rex-three-quarter': 'assets/mascots/rex-three-quarter.png',
  'rex-side': 'assets/mascots/rex-side.png',
  'peggy-front': 'assets/mascots/peggy-front.png',
  'peggy-three-quarter': 'assets/mascots/peggy-three-quarter.png',
  'peggy-side': 'assets/mascots/peggy-side.png',
} as const;

/** The spec's names (SPEC 5.4). */
export const mascots = {
  rex: mascotFiles['rex-front'],
  rexSide: mascotFiles['rex-side'],
  peggy: mascotFiles['peggy-front'],
  /** TODO: replace when a waving Peggy is drawn. */
  peggyWave: mascotFiles['peggy-three-quarter'],
} as const;
