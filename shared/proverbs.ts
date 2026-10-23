// A proverb a week in the weekly tips and Rex & Peggy's emails: patience, trust, teamwork and doing the work.
// Well-known sayings only, shown as "Proverb of the week" without claiming a source. Pure, tested.

export const PROVERBS = [
  "Little by little, the bird builds its nest.",
  "However long the night, the dawn will break.",
  "If you want to go fast, go alone. If you want to go far, go together.",
  "When the music changes, so does the dance.",
  "Rain does not fall on one roof alone.",
  "Patience can cook a stone.",
  "A tree is known by its fruit.",
  "The one who asks questions does not lose the way.",
  "Little drops of water make a mighty ocean.",
  "The lizard that jumped from the high iroko tree said he would praise himself if no one else did.",
  "Hand go, hand come.",
  "One finger cannot lift a pebble.",
  "A good name is better than riches.",
] as const;

/** This week's proverb (the same all week, for everyone). */
export function proverbOfWeek(now: Date) {
  const week = Math.floor((now.getTime() + 60 * 60_000 + 3 * 86_400_000) / (7 * 86_400_000));
  return PROVERBS[week % PROVERBS.length];
}
