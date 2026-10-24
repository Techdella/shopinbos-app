// Seasonal campaigns on the phone (apps/mobile/src/app/campaigns, the Home card): the pure module's status, groups,
// countdowns, server clock, time-zone dates and calendar, checked against the web's own rules
// (src/lib/store-campaigns/status.ts, time.ts, presets.ts) so the two never drift; plus the screens' wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pure = await import("../apps/mobile/src/lib/campaigns-pure.ts");
const web = await import("../src/lib/store-campaigns/status.ts");
const time = await import("../src/lib/store-campaigns/time.ts");
const presets = await import("../src/lib/store-campaigns/presets.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.parse("2026-11-20T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

const CASES = {
  draft: { startsAt: null, endsAt: null },
  scheduled: { startsAt: iso(NOW + 2 * D), endsAt: iso(NOW + 4 * D) },
  live: { startsAt: iso(NOW - D), endsAt: iso(NOW + 3 * D) },
  endingSoon: { startsAt: iso(NOW - D), endsAt: iso(NOW + 2 * H) },
  ended: { startsAt: iso(NOW - 4 * D), endsAt: iso(NOW - D) },
  pausedLive: { startsAt: iso(NOW - D), endsAt: iso(NOW + D * 2), pausedAt: iso(NOW - H) },
  pausedScheduled: { startsAt: iso(NOW + D), endsAt: iso(NOW + D * 2), pausedAt: iso(NOW - H) },
  pausedEnded: { startsAt: iso(NOW - 3 * D), endsAt: iso(NOW - D), pausedAt: iso(NOW - 2 * D) },
  archived: { startsAt: iso(NOW - D), endsAt: iso(NOW + D), archivedAt: iso(NOW - H) },
  noSoon: { startsAt: iso(NOW - D), endsAt: iso(NOW + H), endingSoonHours: 0 },
};

test("status, groups and timers match the web's rules for every kind of campaign", () => {
  for (const [name, campaign] of Object.entries(CASES)) {
    assert.equal(pure.campaignStatus(campaign, NOW), web.computeCampaignStatus(campaign, NOW), name);
    const tab = web.campaignTab(campaign, NOW);
    assert.equal(pure.campaignGroup(campaign, NOW), tab === "archived" ? null : tab, name);
    assert.deepEqual(pure.campaignTimer(campaign, NOW), web.campaignTimer(campaign, NOW), name);
  }
  assert.equal(pure.campaignStatus(CASES.endingSoon, NOW), "ending_soon");
  assert.equal(pure.campaignGroup(CASES.pausedScheduled, NOW), "scheduled");
  assert.equal(pure.campaignGroup(CASES.pausedLive, NOW), "live");
});

test("the list: Live (soonest end first), Coming up (soonest start first), No dates yet, Ended (latest first); no archived", () => {
  const list = [
    { id: "ended-old", startsAt: iso(NOW - 9 * D), endsAt: iso(NOW - 8 * D) },
    { id: "live-late", startsAt: iso(NOW - D), endsAt: iso(NOW + 5 * D) },
    { id: "soon", startsAt: iso(NOW + 3 * D), endsAt: iso(NOW + 4 * D) },
    { id: "draft", startsAt: null, endsAt: null, updatedAt: iso(NOW) },
    { id: "live-early", startsAt: iso(NOW - D), endsAt: iso(NOW + D) },
    { id: "sooner", startsAt: iso(NOW + D), endsAt: iso(NOW + 9 * D), pausedAt: iso(NOW) },
    { id: "ended-new", startsAt: iso(NOW - 3 * D), endsAt: iso(NOW - D) },
    { id: "gone", ...CASES.archived },
  ];
  const groups = pure.groupCampaigns(list, NOW);
  assert.deepEqual(groups.map((group) => group.group), ["live", "scheduled", "drafts", "ended"]);
  assert.deepEqual(groups.map((group) => group.items.map((item) => item.id)), [["live-early", "live-late"], ["sooner", "soon"], ["draft"], ["ended-new", "ended-old"]]);
  // Empty groups are left out.
  assert.deepEqual(pure.groupCampaigns([list[1]], NOW).map((group) => group.group), ["live"]);
  assert.deepEqual(pure.groupCampaigns([], NOW), []);
});

test("countdowns tick to the end when live and to the start when scheduled, on the server's clock", () => {
  assert.deepEqual(pure.campaignTimer(CASES.live, NOW), { kind: "ends", target: NOW + 3 * D, msLeft: 3 * D });
  assert.deepEqual(pure.campaignTimer(CASES.scheduled, NOW), { kind: "starts", target: NOW + 2 * D, msLeft: 2 * D });
  assert.equal(pure.campaignTimer(CASES.live, NOW + 1000).msLeft, 3 * D - 1000);
  assert.equal(pure.campaignTimer(CASES.pausedLive, NOW).kind, "paused");
  // A scheduled one that starts while the screen is open flips to counting down to its end.
  assert.equal(pure.campaignTimer(CASES.scheduled, NOW + 2 * D).kind, "ends");
  // Same digits as the web's compact timer.
  for (const ms of [0, 999, 59_000, 3 * H + 5 * 60_000 + 7_000, 2 * D + 4 * H + 13 * 60_000 + 22_000, -5]) assert.equal(pure.compactTimer(ms), web.compactTimer(ms), String(ms));
  assert.deepEqual(pure.countdownParts(2 * D + 4 * H + 13 * 60_000 + 22_000), { days: 2, clock: "04:13:22" });
  // Server clock: same maths as the web.
  assert.equal(pure.clockOffset(iso(NOW), NOW - 5000, NOW - 4000), time.clockOffset(NOW, NOW - 5000, NOW - 4000));
  assert.equal(pure.clockOffset(null, 0, 0), 0);
  // Home: countdown pop-ups and sections come with a status only.
  assert.equal(pure.campaignTimer(pure.countdownTiming({ status: "paused", startsAt: iso(NOW - D), endsAt: iso(NOW + D) }), NOW).kind, "paused");
  assert.equal(pure.campaignTimer(pure.countdownTiming({ status: "live", startsAt: iso(NOW - D), endsAt: iso(NOW + D) }), NOW).kind, "ends");
});

test("pause, resume and end now follow the server's rules", () => {
  assert.deepEqual(pure.campaignActions(CASES.live, NOW), { pause: true, resume: false, endNow: true });
  assert.deepEqual(pure.campaignActions(CASES.scheduled, NOW), { pause: true, resume: false, endNow: false });
  assert.deepEqual(pure.campaignActions(CASES.pausedLive, NOW), { pause: false, resume: true, endNow: true });
  assert.deepEqual(pure.campaignActions(CASES.pausedScheduled, NOW), { pause: false, resume: true, endNow: false });
  assert.deepEqual(pure.campaignActions(CASES.ended, NOW), { pause: false, resume: false, endNow: false });
  assert.deepEqual(pure.campaignActions(CASES.draft, NOW), { pause: false, resume: false, endNow: false });
});

test("dates are wall-clock times in the campaign's time zone, like the web's date fields", () => {
  for (const zone of ["Africa/Lagos", "Africa/Nairobi", "Europe/London", "America/New_York", "UTC"]) {
    for (const local of ["2026-11-27T00:00", "2026-12-31T23:59", "2027-03-28T03:30", "2026-07-01T12:00"]) {
      const [date, clock] = local.split("T");
      const [year, month, day] = date.split("-").map(Number);
      const [hour, minute] = clock.split(":").map(Number);
      const ms = pure.fromWall({ year, month, day, hour, minute }, zone);
      assert.equal(ms, time.zonedInputToUtc(local, zone).getTime(), `${zone} ${local}`);
      assert.deepEqual(pure.toWall(ms, zone), { year, month, day, hour, minute }, `${zone} ${local} back`);
    }
  }
  // A time skipped by a clock change (01:30 in London on 28 March 2027) lands where the web puts it.
  assert.equal(pure.fromWall({ year: 2027, month: 3, day: 28, hour: 1, minute: 30 }, "Europe/London"), time.zonedInputToUtc("2027-03-28T01:30", "Europe/London").getTime());
  assert.equal(iso(pure.fromWall({ year: 2026, month: 11, day: 27, hour: 0, minute: 0 }, "Africa/Lagos")), "2026-11-26T23:00:00.000Z");
  assert.equal(pure.clockText(0, 0), "12:00am");
  assert.equal(pure.clockText(23, 59), "11:59pm");
  assert.equal(pure.clockText(12, 5), "12:05pm");
});

test("the calendar starts on Monday and moves across years", () => {
  const november = pure.monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
  assert.equal(november.length % 7, 0);
  assert.deepEqual(november.slice(0, 7), [null, null, null, null, null, null, 1]);
  assert.equal(november.filter((cell) => cell !== null).length, 30);
  assert.equal(pure.monthGrid(2028, 2).filter(Boolean).length, 29);
  assert.deepEqual(pure.shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(pure.shiftMonth(2027, 1, -1), { year: 2026, month: 12 });
});

test("the form: both dates, end after start and not past; codes shoppers can type", () => {
  assert.equal(pure.scheduleProblem(null, NOW + D, NOW), "bothDates");
  assert.equal(pure.scheduleProblem(NOW + D, NOW, NOW), "endAfterStart");
  assert.equal(pure.scheduleProblem(NOW - 3 * D, NOW - D, NOW), "endPassed");
  assert.equal(pure.scheduleProblem(NOW - D, NOW + D, NOW), null);
  assert.equal(pure.cleanCode("bf 20%off!"), "BF20OFF");
  assert.equal(pure.suggestCampaignCode("Black Friday 2026", 20), "BLACKFRI20");
  assert.equal(pure.suggestCampaignCode("", 0), "SALE");
  assert.ok(pure.percentOk(1) && pure.percentOk(100) && !pure.percentOk(0) && !pure.percentOk(101));
});

test("the phone's presets are the web's, in the same order and colours", () => {
  assert.deepEqual(pure.PRESETS.map((preset) => preset.id), [...presets.PRESET_IDS]);
  for (const preset of presets.CAMPAIGN_PRESETS) assert.deepEqual(pure.presetSwatch(preset.id), preset.swatch, preset.id);
  assert.deepEqual(pure.presetSwatch(null), pure.presetSwatch("blank"));
});

test("screens: list, create, detail, Home card, My shop and Marketing links", () => {
  for (const file of ["index.tsx", "new.tsx", "[id].tsx"]) assert.ok(existsSync(new URL(`../apps/mobile/src/app/campaigns/${file}`, import.meta.url)), file);
  const list = read("apps/mobile/src/app/campaigns/index.tsx");
  assert.match(list, /groupCampaigns\(/);
  assert.match(list, /useServerNow\(/);
  const create = read("apps/mobile/src/app/campaigns/new.tsx");
  // Same order as the web: the preset makes a draft, then PATCH the dates (and a code made for the campaign).
  assert.match(create, /createCampaign\(preset\)/);
  assert.match(create, /createCampaignCode\(/);
  assert.match(create, /updateCampaign\(campaign\.id/);
  // The look (banners, pop-up, badges) isn't edited on the phone, and nothing sends the seller to the web for it.
  assert.doesNotMatch(create, /web-only|openWeb\(/);
  const detail = read("apps/mobile/src/app/campaigns/[id].tsx");
  assert.match(detail, /<Sheet visible=\{confirmEnd\}/);
  assert.match(detail, /act\("end-now"\)/);
  assert.match(detail, /campaignPreviewLink\(/);
  assert.match(detail, /Share\.share\(/);
  assert.doesNotMatch(create + detail + list, /window\.(confirm|alert|prompt)|Alert\.alert/);
  const lib = read("apps/mobile/src/lib/campaigns.ts");
  for (const path of ["/api/app/campaigns", "/api/app/campaigns/countdowns", "/preview-token", "/api/app/marketing/discounts"]) assert.ok(lib.includes(path), path);
  // Every route the phone calls exists on the web.
  for (const route of ["route.ts", "[id]/route.ts", "[id]/[action]/route.ts", "countdowns/route.ts"]) assert.ok(existsSync(new URL(`../src/app/api/app/campaigns/${route}`, import.meta.url)), route);
  assert.match(read("apps/mobile/src/app/(tabs)/home.tsx"), /<CampaignsCard \/>/);
  assert.match(read("apps/mobile/src/components/CampaignsCard.tsx"), /fetchCountdowns/);
  assert.match(read("apps/mobile/src/app/(tabs)/shop.tsx"), /id: "campaigns"[^\n]*path: "app:\/campaigns"/);
  assert.match(read("apps/mobile/src/app/marketing/index.tsx"), /router\.push\("\/campaigns"\)/);
  assert.doesNotMatch(read("apps/mobile/src/app/campaigns/[id].tsx"), /web-only|openWeb\(/);
});
