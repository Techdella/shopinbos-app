/**
 * Rex (mint dinosaur, builds) and Peggy (penguin, runs the shop).
 * Files are 1024px copies of the old repo's public/brand/mascots. Resolve with your bundler,
 * e.g. `new URL(mascots.rex, import.meta.url)` or copy into an app's public folder.
 */
export const mascotFiles = {
  'rex-1': 'assets/mascots/rex-1.png',
  'rex-2': 'assets/mascots/rex-2.png',
  'rex-3': 'assets/mascots/rex-3.png',
  'peggy-1': 'assets/mascots/peggy-1.png',
  'peggy-2': 'assets/mascots/peggy-2.png',
  'peggy-3': 'assets/mascots/peggy-3.png',
} as const;

export const mascots = {
  rex: mascotFiles['rex-1'],
  peggy: mascotFiles['peggy-1'],
} as const;
