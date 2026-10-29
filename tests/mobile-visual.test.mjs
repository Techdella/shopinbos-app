// v26 soft cards (apps/mobile/src/components/visual.tsx): the pure maths behind the mini bar charts, the last days'
// weekdays and totals in Lagos time, the ratings summary and the carousel dots (apps/mobile/src/lib/visual-pure.ts),
// Find's category tiles, and the wiring that keeps every surface on the live theme (light and dark).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pure = await import("../apps/mobile/src/lib/visual-pure.ts");
const find = await import("../apps/mobile/src/lib/find-pure.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const LANGS = ["en", "pcm", "yo", "ha", "ig"];

test("bar heights: the biggest fills the chart, the rest in proportion, an empty day is a short stub", () => {
  assert.deepEqual(pure.barHeights([10, 5, 0, 20], 100), [50, 25, 8, 100]);
  assert.deepEqual(pure.barHeights([0, 0, 0], 50), [4, 4, 4], "all zeros: all stubs");
  assert.deepEqual(pure.barHeights([-3, Number.NaN, 4], 40), [3, 3, 40], "negative and missing count as 0");
  assert.deepEqual(pure.barHeights([1, 1000], 100, 0.1), [10, 100], "a tiny day still shows the stub");
  assert.deepEqual(pure.barHeights([], 100), []);
});

test("Lagos days: weekday (Monday = 0) and the last 7 days ending today", () => {
  // 2026-10-29 is a Thursday. 23:30 UTC is already Friday 00:30 in Lagos.
  assert.equal(pure.lagosWeekday("2026-10-29T12:00:00Z"), 3);
  assert.equal(pure.lagosWeekday("2026-10-29T23:30:00Z"), 4);
  assert.equal(pure.lagosDayKey("2026-10-29T23:30:00Z"), "2026-10-30");
  assert.deepEqual(pure.trailingWeekdays(7, new Date("2026-10-29T12:00:00Z")), [4, 5, 6, 0, 1, 2, 3], "Fri … Thu, today last");
  assert.deepEqual(pure.trailingWeekdays(0), []);
});

test("money a day for the last week, shown only when the rows hold the whole total", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const rows = [
    { at: "2026-10-29T09:00:00Z", amount: 2500 },
    { at: "2026-10-29T10:00:00Z", amount: 2000 },
    { at: "2026-10-27T15:00:00Z", amount: 3000 },
    { at: "2026-10-23T08:00:00Z", amount: 1800 },
    { at: "2026-10-20T08:00:00Z", amount: 9999 }, // older than the window
    { at: null, amount: 700 },
  ];
  const full = pure.trailingTotals(rows, 7, 9300, now);
  assert.deepEqual(full.totals, [1800, 0, 0, 0, 3000, 0, 4500]);
  assert.equal(full.complete, true);
  // The server's week is bigger than the newest rows hold: no chart (it would look quieter than it was).
  assert.equal(pure.trailingTotals(rows, 7, 15000, now).complete, false);
  assert.equal(pure.trailingTotals([], 7, 0, now).complete, true, "a quiet week is complete (all zero)");
});

test("ratings summary: one decimal, the count, and star bars only when every rating is at hand", () => {
  const all = [{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 2 }];
  const summary = pure.ratingSummary(4.04, 4, all);
  assert.equal(summary.average, "4.0");
  assert.equal(summary.count, 4);
  assert.deepEqual(summary.bars.map((bar) => [bar.stars, bar.count]), [[5, 2], [4, 1], [3, 0], [2, 1], [1, 0]]);
  assert.equal(summary.bars[0].share, 0.5);
  assert.equal(pure.ratingSummary(4.4, 32, all).bars, null, "4 of 32: no bars from a sample");
  assert.equal(pure.ratingSummary(4.4, 32, all).average, "4.4");
  assert.equal(pure.ratingSummary(null, 0, []).average, null);
});

test("carousel dots follow the swipe", () => {
  assert.equal(pure.pageAt(0, 350, 3), 0);
  assert.equal(pure.pageAt(340, 350, 3), 1);
  assert.equal(pure.pageAt(5000, 350, 3), 2, "kept in range");
  assert.equal(pure.pageAt(-40, 350, 3), 0);
  assert.equal(pure.pageAt(100, 0, 3), 0);
});

test("Find categories get a round tile: the usual six their own, the rest a plain one", () => {
  assert.deepEqual(find.categoryLook("Fashion"), { icon: "bag", tone: "peach" });
  assert.deepEqual(find.categoryLook("Gadgets"), { icon: "phone", tone: "lilac" });
  assert.deepEqual(find.categoryLook("Garden tools"), { icon: "grid", tone: "gray" });
  assert.match(read("apps/mobile/src/app/find/index.tsx"), /<CategoryCircle[\s\S]{0,200}categoryLook\(name\)|categoryLook\(name\)[\s\S]{0,300}<CategoryCircle/);
});

test("one soft surface: Card, List and the codemodded cards use the theme's surfaceCard (shadow in light, hairline in dark)", () => {
  const theme = read("apps/mobile/src/theme.ts");
  assert.match(theme, /export const CARD_RADIUS = 24;/);
  assert.match(theme, /export function softShadow\(\)[\s\S]*scheme === "dark"[\s\S]*borderColor: colors\.line[\s\S]*boxShadow:/);
  assert.match(read("apps/mobile/src/components/ui.tsx"), /export function Card[\s\S]{0,300}\.\.\.surfaceCard\(\), padding: 18/);
  assert.match(read("apps/mobile/src/components/design.tsx"), /export function List[\s\S]{0,400}\.\.\.surfaceCard\(\)/);
  // No screen keeps the old hard-bordered white card; nothing new hard-codes light-only colours.
  for (const file of ["apps/mobile/src/app/(tabs)/home.tsx", "apps/mobile/src/app/(tabs)/shop.tsx", "apps/mobile/src/app/supplier/(tabs)/money.tsx", "apps/mobile/src/app/rider/(tabs)/index.tsx"]) {
    assert.doesNotMatch(read(file), /backgroundColor: colors\.surface, borderRadius: \d+, borderWidth: 1, borderColor: colors\.line/, file);
  }
  const visual = read("apps/mobile/src/components/visual.tsx");
  assert.doesNotMatch(visual, /StyleSheet\.create/, "built while drawing, so it follows the scheme");
  assert.doesNotMatch(read("apps/mobile/src/app/notifications/index.tsx"), /#FFF7F2|#FDF0D5/, "unread and warning tints follow dark mode");
  assert.doesNotMatch(read("apps/mobile/src/app/logistics/(tabs)/earnings.tsx"), /#FFF1C9/);
});

test("big numbers with mini bars: partner Money, rider Earnings, seller Home sales, supplier Money", () => {
  const partner = read("apps/mobile/src/app/logistics/(tabs)/earnings.tsx");
  assert.match(partner, /trailingTotals\(/);
  assert.match(partner, /week\.complete \? <MiniBars/);
  assert.match(read("apps/mobile/src/app/rider/(tabs)/earnings.tsx"), /<StatCard tone="forest"[\s\S]*chart=\{<DayBars/);
  assert.match(read("apps/mobile/src/app/(tabs)/home.tsx"), /<DarkCard[\s\S]{0,400}<MiniBars dark/);
  assert.match(read("apps/mobile/src/app/supplier/(tabs)/money.tsx"), /data\.days\.complete[\s\S]{0,60}<MiniBars/);
});

test("round actions and side-by-side decisions; the button labels stay one line", () => {
  const visual = read("apps/mobile/src/components/visual.tsx");
  assert.match(visual, /export function RoundAction[\s\S]*<OneLine text=\{label\}/);
  assert.match(read("apps/mobile/src/app/logistics/job/[id].tsx"), /<ButtonRow labels=\{\[t\("decline"\), t\("job\.acceptPick"\)\]\}[\s\S]*primaryLast/);
  assert.match(read("apps/mobile/src/app/rider/(tabs)/index.tsx"), /<ButtonRow labels=\{\[say\("skip"\), say\("startJob"\)\]\}/);
  assert.match(read("apps/mobile/src/components/peggy/PeggyCallViews.tsx"), /<RoundAction onDark size=\{68\} tone="decline"/);
  assert.match(read("apps/mobile/src/app/order/[id].tsx"), /testID="track-call"/);
  assert.match(read("apps/mobile/src/app/ask-peggy.tsx"), /t\("peg\.helpWith"\)[\s\S]{0,200}<CallPeggyButton variant="mic" \/>/);
});

test("the new words are in all five languages, with the same placeholders", () => {
  const keys = { m_ui: ["wk.0", "wk.6", "chart.lastDays"], m_find: ["packs.see"], m_familiar: ["peg.helpWith"], m_rider: ["offer.earn", "offer.distance", "offer.km", "done.earned", "done.cash"] };
  for (const [ns, list] of Object.entries(keys)) {
    for (const key of list) {
      for (const lang of LANGS) assert.ok(CATALOGS[ns][lang][key], `${ns} ${lang} ${key}`);
      const holes = (text) => (text.match(/\{\w+\}/g) ?? []).sort().join();
      for (const lang of LANGS) assert.equal(holes(CATALOGS[ns][lang][key]), holes(CATALOGS[ns].en[key]), `${ns} ${lang} ${key} placeholders`);
    }
  }
  // The short weekdays match the Riders app's.
  for (const lang of LANGS) for (let day = 0; day < 7; day += 1) assert.equal(CATALOGS.m_ui[lang][`wk.${day}`], CATALOGS.m_rider[lang][`wk.${day}`], `${lang} wk.${day}`);
});
