// Seasonal campaigns (Marketing > Seasonal campaigns): the status worked out from the dates (right even when the
// scheduler is late), the scheduler's jobs, timers and time zones, the render merge (order, relative positions,
// orphans, the store's own design never changed), the slot rules when campaigns overlap, presets, signed preview
// links, and the words in all five languages. Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const status = await import("../src/lib/store-campaigns/status.ts");
const time = await import("../src/lib/store-campaigns/time.ts");
const merge = await import("../src/lib/store-campaigns/merge.ts");
const blocks = await import("../src/lib/store-campaigns/blocks.ts");
const presets = await import("../src/lib/store-campaigns/presets.ts");
const token = await import("../src/lib/store-campaigns/preview-token.ts");
const catalog = await import("../src/components/storefront/boutique/blocks/block-catalog.ts");
const { CATALOGS } = await import("../shared/i18n/catalog.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const H = 3_600_000;
const D = 24 * H;
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0); // 20 Nov 2026, 12:00 UTC
const at = (offset) => new Date(NOW + offset).toISOString();

// ─── Status ─────────────────────────────────────────────────────────────────

test("status: worked out from the dates, pause and archive, with ending soon", () => {
  const s = (c) => status.computeCampaignStatus(c, NOW);
  assert.equal(s({ startsAt: null, endsAt: null }), "draft");
  assert.equal(s({ startsAt: at(D), endsAt: null }), "draft", "half a schedule is still a draft");
  assert.equal(s({ startsAt: at(D), endsAt: at(3 * D) }), "scheduled");
  assert.equal(s({ startsAt: at(-D), endsAt: at(3 * D) }), "live");
  assert.equal(s({ startsAt: at(-D), endsAt: at(5 * H) }), "ending_soon", "less than 24h left by default");
  assert.equal(s({ startsAt: at(-D), endsAt: at(5 * H), endingSoonHours: 2 }), "live", "the seller's own threshold");
  assert.equal(s({ startsAt: at(-D), endsAt: at(5 * H), endingSoonHours: 0 }), "live", "0 turns ending soon off");
  assert.equal(s({ startsAt: at(-3 * D), endsAt: at(-1) }), "ended");
  assert.equal(s({ startsAt: at(-D), endsAt: at(-D + H) }), "ended");
  assert.equal(s({ startsAt: at(-D), endsAt: at(D), pausedAt: at(-H) }), "paused");
  assert.equal(s({ startsAt: at(-3 * D), endsAt: at(-D), pausedAt: at(-2 * D) }), "ended", "a paused campaign whose time ran out reads as ended");
  assert.equal(s({ startsAt: at(-D), endsAt: at(D), archivedAt: at(-1) }), "archived");
  assert.equal(s({ startsAt: at(0), endsAt: at(D) }), "live", "live from the exact start");
  assert.equal(s({ startsAt: at(-D), endsAt: at(0) }), "ended", "ended at the exact end");
  // Boundaries are exact to the millisecond, whatever the date type.
  assert.equal(status.computeCampaignStatus({ startsAt: new Date(NOW + 1), endsAt: NOW + D }, NOW), "scheduled");
});

test("status: tabs, timers and the dashboard order", () => {
  const live = { startsAt: at(-D), endsAt: at(2 * D) };
  const pausedEarly = { startsAt: at(D), endsAt: at(2 * D), pausedAt: at(-H) };
  const pausedLive = { startsAt: at(-D), endsAt: at(2 * D), pausedAt: at(-H) };
  assert.equal(status.campaignTab(live, NOW), "live");
  assert.equal(status.campaignTab(pausedEarly, NOW), "scheduled");
  assert.equal(status.campaignTab(pausedLive, NOW), "live");
  assert.equal(status.campaignTab({ startsAt: null, endsAt: null }, NOW), "drafts");
  assert.equal(status.inCampaignTab({ startsAt: at(-D), endsAt: at(D), archivedAt: at(-1) }, "all", NOW), false, "All leaves archived out");

  assert.deepEqual(status.campaignTimer({ startsAt: at(2 * H), endsAt: at(D) }, NOW), { kind: "starts", target: NOW + 2 * H, msLeft: 2 * H });
  assert.deepEqual(status.campaignTimer(live, NOW), { kind: "ends", target: NOW + 2 * D, msLeft: 2 * D });
  assert.equal(status.campaignTimer({ startsAt: at(-2 * D), endsAt: at(-D) }, NOW).kind, "ended");
  assert.equal(status.campaignTimer(pausedLive, NOW).kind, "paused");

  const items = [
    { id: "a", status: "scheduled", startsAt: at(5 * D), endsAt: at(6 * D) },
    { id: "b", status: "live", startsAt: at(-D), endsAt: at(3 * D) },
    { id: "c", status: "ended", startsAt: at(-5 * D), endsAt: at(-D) },
    { id: "d", status: "ending_soon", startsAt: at(-D), endsAt: at(H) },
    { id: "e", status: "scheduled", startsAt: at(D), endsAt: at(2 * D) },
    { id: "f", status: "draft", startsAt: null, endsAt: null },
  ];
  assert.deepEqual(status.sortForWidget(items).map((item) => item.id), ["d", "b", "e", "a"], "live first (soonest end), then scheduled by start");
  assert.equal(status.sortForWidget([...items, ...items.map((item) => ({ ...item, id: `${item.id}2` }))]).length, 5, "at most five");
});

test("timer formatting: digits, compact backend timer and words", () => {
  const ms = 2 * D + 4 * H + 13 * 60_000 + 22_000;
  assert.equal(status.clockDigits(ms, "dhms"), "02:04:13:22");
  assert.equal(status.clockDigits(ms, "hms"), "52:13:22", "hours include the days");
  assert.equal(status.compactTimer(ms), "2d 04:13:22");
  assert.equal(status.compactTimer(3 * H + 5_000), "03:00:05");
  assert.equal(status.clockDigits(-5_000), "00:00:00:00", "never negative");
  assert.deepEqual(status.timeParts(999), { days: 0, hours: 0, minutes: 0, seconds: 0, totalHours: 0, done: true }, "under a second is done");
  assert.deepEqual(status.wordsUnit(2 * D + H), { unit: "days", count: 3 }, "rounded up");
  assert.deepEqual(status.wordsUnit(5 * H), { unit: "hours", count: 5 });
  assert.deepEqual(status.wordsUnit(90_000), { unit: "minutes", count: 2 });
});

// ─── Scheduler ──────────────────────────────────────────────────────────────

test("scheduler: jobs owed, idempotent marks, and late runs", () => {
  const jobs = (c, now = NOW) => status.dueCampaignJobs(c, now);
  const window = { startsAt: at(-H), endsAt: at(3 * D) };
  assert.deepEqual(jobs(window), ["start"], "just started");
  assert.deepEqual(jobs({ ...window, startJobRanAt: at(-H) }), [], "running it again does nothing");
  assert.deepEqual(jobs({ startsAt: at(-D), endsAt: at(5 * H) }), ["start", "ending_soon"], "a late first run catches up");
  assert.deepEqual(jobs({ startsAt: at(-D), endsAt: at(5 * H), startJobRanAt: at(-D), endingSoonSentAt: at(-H) }), []);
  assert.deepEqual(jobs({ startsAt: at(-D), endsAt: at(5 * H), endingSoonHours: 0 }), ["start"], "no ending-soon note when switched off");
  assert.deepEqual(jobs({ startsAt: at(D), endsAt: at(2 * D) }), [], "nothing before the start");
  assert.deepEqual(jobs({ ...window, pausedAt: at(-1) }), [], "paused: nothing starts");
  assert.deepEqual(jobs({ startsAt: at(-3 * D), endsAt: at(-H), startJobRanAt: at(-3 * D) }), ["end"]);
  assert.deepEqual(jobs({ startsAt: at(-3 * D), endsAt: at(-H), startJobRanAt: at(-3 * D), endJobRanAt: at(-H) }), [], "the end runs once");
  // Cron down for the whole campaign: only the end runs, and the start is marked missed (no "now live" message).
  const missed = { startsAt: at(-3 * D), endsAt: at(-H) };
  assert.deepEqual(jobs(missed), ["end"]);
  assert.equal(status.startWasMissed(missed, NOW), true);
  assert.equal(status.startWasMissed({ ...missed, startJobRanAt: at(-3 * D) }, NOW), false);
  assert.deepEqual(jobs({ ...missed, pausedAt: at(-2 * D) }), ["end"], "a paused campaign still gets its end (discount off)");
  assert.deepEqual(jobs({ ...window, archivedAt: at(-1) }), [], "archived campaigns are left alone");
  assert.deepEqual(jobs({ startsAt: null, endsAt: null }), []);
  // The status never depends on the jobs: a campaign whose start job never ran is still live on the store.
  assert.equal(status.computeCampaignStatus({ ...window, startJobRanAt: null }, NOW), "live");
});

test("scheduler: new dates clear the marks so the side effects run again", () => {
  assert.deepEqual(status.jobResetsForNewDates({ startsAt: at(D), endsAt: at(2 * D) }, NOW), { startJobRanAt: true, endJobRanAt: true, endingSoonSentAt: true });
  assert.deepEqual(status.jobResetsForNewDates({ startsAt: at(-D), endsAt: at(2 * D) }, NOW), { startJobRanAt: false, endJobRanAt: true, endingSoonSentAt: true }, "extending a live campaign");
  assert.deepEqual(status.jobResetsForNewDates({ startsAt: at(-3 * D), endsAt: at(-D) }, NOW), { startJobRanAt: false, endJobRanAt: false, endingSoonSentAt: false });
  const server = read("src/lib/store-campaigns/server.ts");
  assert.match(server, /updateMany\(\{ where: \{ id: row\.id, startJobRanAt: null \}/, "start is claimed with a conditional update");
  assert.match(server, /updateMany\(\{ where: \{ id: row\.id, endJobRanAt: null \}/, "end is claimed with a conditional update");
  assert.match(server, /updateMany\(\{ where: \{ id: row\.id, endingSoonSentAt: null \}/);
});

test("overlaps and discount dates", () => {
  const others = [
    { id: "x", name: "Christmas", startsAt: at(2 * D), endsAt: at(10 * D), hasOverrides: true },
    { id: "y", name: "Bar only", startsAt: at(2 * D), endsAt: at(10 * D), hasOverrides: false },
    { id: "z", name: "Old", startsAt: at(-10 * D), endsAt: at(-5 * D), hasOverrides: true },
    { id: "me", name: "Me", startsAt: at(0), endsAt: at(5 * D), hasOverrides: true },
  ];
  assert.deepEqual(status.overlappingCampaigns({ id: "me", startsAt: at(0), endsAt: at(5 * D) }, others).map((o) => o.id), ["x"], "only others with look changes that overlap");
  assert.deepEqual(status.overlappingCampaigns({ id: "me", startsAt: at(10 * D), endsAt: at(12 * D) }, others), [], "touching ends don't overlap");
  assert.equal(status.discountDatesMismatch({ startsAt: at(0), endsAt: at(5 * D) }, { startsAt: null, expiresAt: at(3 * D) }), true);
  assert.equal(status.discountDatesMismatch({ startsAt: at(0), endsAt: at(5 * D) }, { startsAt: at(-D), expiresAt: null }), false);
  assert.equal(status.discountDatesMismatch({ startsAt: at(0), endsAt: at(5 * D) }, null), false);
});

// ─── Time zones and clock drift ─────────────────────────────────────────────

test("time zones: wall-clock times in the store's zone, stored as UTC; clock offset", () => {
  assert.equal(time.zonedInputToUtc("2026-11-27T00:00", "Africa/Lagos").toISOString(), "2026-11-26T23:00:00.000Z", "Lagos is UTC+1");
  assert.equal(time.utcToZonedInput("2026-11-26T23:00:00.000Z", "Africa/Lagos"), "2026-11-27T00:00");
  assert.equal(time.zonedInputToUtc("2026-11-27T00:00", "Africa/Nairobi").toISOString(), "2026-11-26T21:00:00.000Z");
  // Daylight saving in London: summer and winter offsets both come out right.
  assert.equal(time.zonedInputToUtc("2026-07-01T09:00", "Europe/London").toISOString(), "2026-07-01T08:00:00.000Z");
  assert.equal(time.zonedInputToUtc("2026-12-01T09:00", "Europe/London").toISOString(), "2026-12-01T09:00:00.000Z");
  for (const zone of time.CAMPAIGN_TIME_ZONES) {
    assert.ok(time.isValidTimeZone(zone), zone);
    assert.equal(time.utcToZonedInput(time.zonedInputToUtc("2026-03-29T10:30", zone), zone), "2026-03-29T10:30", `${zone} round trip`);
  }
  assert.equal(time.isValidTimeZone("Mars/Olympus"), false);
  assert.equal(time.safeTimeZone("nope"), "Africa/Lagos");
  assert.equal(time.zonedInputToUtc("not a date", "Africa/Lagos"), null);
  assert.equal(time.zonedTime("Africa/Lagos", 2026, 12, 32, 0, 0), Date.UTC(2026, 11, 31, 23, 0), "day overflow rolls into the next month");
  // A phone 10 minutes slow: server said 12:00:00.500 for a request sent at 11:50:00.000 and back at 11:50:01.000.
  const sent = Date.UTC(2026, 0, 1, 11, 50, 0);
  assert.equal(time.clockOffset(sent + 10 * 60_000 + 500, sent, sent + 1000), 10 * 60_000, "half the round trip either way");
  assert.match(read("src/hooks/useServerClock.ts"), /addEventListener\("focus"/, "re-syncs on focus");
  assert.match(read("src/hooks/useServerClock.ts"), /RESYNC_MS = 5 \* 60_000/, "and every few minutes");
});

// ─── Render merge ───────────────────────────────────────────────────────────

const section = (id, kind = "story-split", extra = {}) => ({ id, kind, name: id, visible: true, blocks: [], ...extra });
const basePage = () => ({
  id: "home", pageType: "home", title: "Home", slug: "/",
  sections: [section("bar", "announcement-bar"), section("head", "header"), section("hero", "hero-split"), section("best", "featured-products"), section("story"), section("foot", "footer")],
});
const snapshot = () => ({ templateId: "breeze", templateName: "Breeze", layoutFamily: "editorial-boutique", themeTokens: { heroBg: "#111111", heroText: "#ffffff", accent: "#ff0000", ctaBg: "#000000", ctaText: "#ffffff", paperBg: "#ffffff", cardBg: "#f5f5f5", ink: "#111111", muted: "#666666", border: "#dddddd", headingStyle: "grotesk", radius: "soft" }, pages: [basePage(), { id: "about", pageType: "about", title: "About", slug: "about", sections: [section("a1")] }], updatedAt: "2026-11-01" });
const ids = (list) => list.map((s) => s.id);

test("render merge: hide → replace → add → reorder, relative positions, chrome kept in place", () => {
  const base = basePage().sections;
  const overrides = [
    { id: "o4", page: "home", action: "reorder", sectionId: "story", position: { before: "cmp-1" } },
    { id: "o3", page: "home", action: "add", section: section("cmp-1", "campaign-countdown-hero"), position: { index: 0 } },
    { id: "o1", page: "home", action: "hide", sectionId: "hero" },
    { id: "o2", page: "home", action: "replace", sectionId: "best", section: section("whatever", "other-kind", { name: "Deals", settings: { source: "sale" } }) },
    { id: "o5", page: "home", action: "add", section: section("cmp-2", "campaign-deal-grid"), position: { after: "best" } },
  ];
  const { sections, skipped } = merge.applySectionOverrides(base, overrides);
  assert.deepEqual(skipped, []);
  // index 0 is the first body section (under the header), and the reorder could anchor on a section added earlier in the merge.
  assert.deepEqual(ids(sections), ["bar", "head", "story", "cmp-1", "hero", "best", "cmp-2", "foot"]);
  assert.equal(sections.find((s) => s.id === "hero").visible, false, "hidden, not removed");
  const best = sections.find((s) => s.id === "best");
  assert.equal(best.kind, "featured-products", "replace keeps the base id and kind");
  assert.equal(best.name, "Deals");
  assert.deepEqual(best.settings, { source: "sale" });
  // A hide and a replace on the same section: replace changes content, the section stays hidden.
  const both = merge.applySectionOverrides(base, [{ id: "h", page: "home", action: "hide", sectionId: "best" }, { id: "r", page: "home", action: "replace", sectionId: "best", section: section("x", "y", { name: "New" }) }]).sections.find((s) => s.id === "best");
  assert.equal(both.visible, false);
  assert.equal(both.name, "New");
  // Index past the end lands before the footer.
  assert.deepEqual(ids(merge.applySectionOverrides(base, [{ id: "a", page: "home", action: "add", section: section("late"), position: { index: 99 } }]).sections).slice(-2), ["late", "foot"]);
  // The base list is never changed.
  assert.deepEqual(ids(base), ["bar", "head", "hero", "best", "story", "foot"]);
  assert.equal(base[2].visible, true);
});

test("render merge: orphaned overrides are skipped and reported, never guessed", () => {
  const overrides = [
    { id: "gone-hide", page: "home", action: "hide", sectionId: "deleted" },
    { id: "gone-replace", page: "home", action: "replace", sectionId: "deleted", section: section("x") },
    { id: "gone-anchor", page: "home", action: "add", section: section("cmp-x"), position: { before: "deleted" } },
    { id: "gone-move", page: "home", action: "reorder", sectionId: "deleted", position: { index: 0 } },
    { id: "ok", page: "home", action: "hide", sectionId: "story" },
    { id: "no-page", page: "faq", action: "hide", sectionId: "q" },
  ];
  const base = snapshot();
  const result = merge.applyCampaignToSnapshot(base, { theme: { tokens: {} }, sections: overrides });
  assert.deepEqual(result.skipped.sort(), ["gone-anchor", "gone-hide", "gone-move", "gone-replace", "no-page"]);
  assert.deepEqual(ids(result.snapshot.pages[0].sections), ["bar", "head", "hero", "best", "story", "foot"], "nothing added where the anchor is gone");
  assert.equal(result.snapshot.pages[0].sections.find((s) => s.id === "story").visible, false, "the rest still applies");
  assert.deepEqual(merge.orphanedOverrides(base, overrides).sort(), result.skipped.sort());
  assert.deepEqual(merge.orphanedOverrides(null, overrides), []);
});

test("render merge: theme keys override, everything else falls through; base snapshot untouched", () => {
  const base = snapshot();
  const before = JSON.stringify(base);
  const { snapshot: shown } = merge.applyCampaignToSnapshot(base, { theme: { tokens: { heroBg: "#0A0A0A", ctaBg: "#FFD60A" } }, sections: [], hideStoreAnnouncement: true });
  assert.equal(shown.themeTokens.heroBg, "#0A0A0A");
  assert.equal(shown.themeTokens.ctaBg, "#FFD60A");
  assert.equal(shown.themeTokens.paperBg, "#ffffff", "untouched keys fall through to the base");
  assert.equal(shown.pages[0].sections.find((s) => s.kind === "announcement-bar").visible, false, "a campaign bar replaces the store's own while live");
  assert.equal(JSON.stringify(base), before, "the store's design is never modified");
  // A fix to the base during the campaign still shows through.
  const fixed = snapshot();
  fixed.pages[0].sections[4].name = "Our story (fixed typo)";
  assert.equal(merge.applyCampaignToSnapshot(fixed, { theme: { tokens: { accent: "#123456" } }, sections: [] }).snapshot.pages[0].sections[4].name, "Our story (fixed typo)");
  // Brand settings: published snapshot and saved colours merged into a copy.
  const settings = { editor: { published: base }, themeTokens: { accent: "#ff0000" }, other: 1 };
  const merged = merge.applyCampaignToBrandSettings(settings, { theme: { tokens: { accent: "#00ff00" } }, sections: [] });
  assert.equal(merged.editor.published.themeTokens.accent, "#00ff00");
  assert.equal(merged.themeTokens.accent, "#00ff00");
  assert.equal(settings.themeTokens.accent, "#ff0000");
  assert.equal(merge.applyCampaignToBrandSettings(settings, { theme: { tokens: {} }, sections: [] }), settings, "nothing to merge: same object back");
});

test("render merge: stored overrides are cleaned (bad colours, chrome additions, incomplete entries)", () => {
  const theme = merge.readThemeOverride({ tokens: { heroBg: "#000", accent: "red", ink: "#12345", headingStyle: "serif", radius: "pill", evil: "x" }, logoUrl: "javascript:alert(1)" });
  assert.deepEqual(theme, { tokens: { heroBg: "#000", headingStyle: "serif" } });
  assert.equal(merge.readThemeOverride({ tokens: {}, logoUrl: "https://cdn.example/logo.png" }).logoUrl, "https://cdn.example/logo.png");
  const list = merge.readSectionOverrides([
    { id: "a", page: "home", action: "add", section: section("h", "header") },
    { id: "b", page: "home", action: "hide" },
    { id: "c", page: "home", action: "reorder", sectionId: "x" },
    { id: "d", page: "home", action: "explode", sectionId: "x" },
    { id: "e", page: "home", action: "hide", sectionId: "x" },
    { id: "e", page: "home", action: "hide", sectionId: "y" },
    { id: "f", action: "add", section: section("cmp"), position: { index: -4 } },
  ]);
  assert.deepEqual(list.map((o) => o.id), ["e", "f"], "a campaign can't add a second header, and duplicates are dropped");
  assert.equal(list[1].page, "home");
  assert.deepEqual(list[1].position, { index: 0 });
});

// ─── Slots ──────────────────────────────────────────────────────────────────

test("slot rules: one look, one bar (campaign beats the store's), popups by priority, two badges per product", () => {
  const bar = (id, text) => ({ id, type: "announcement", enabled: true, settings: { messages: [{ text }] } });
  const campaigns = [
    { id: "low", priority: 1, startsAt: at(-D), hasOverrides: true, blocks: [bar("bl", "Low bar"), { id: "pl", type: "popup", enabled: true, settings: { formId: "form-low" } }, { id: "gl", type: "badge", enabled: true, settings: { label: "Low", appliesTo: "all" } }] },
    { id: "high", priority: 10, startsAt: at(-2 * D), hasOverrides: false, blocks: [bar("bh", "High bar"), { id: "ph", type: "popup", enabled: true, settings: { formId: "form-high" } }, { id: "gh", type: "badge", enabled: true, settings: { label: "High", appliesTo: "discounted" } }, { id: "gh2", type: "badge", enabled: true, settings: { label: "Second", appliesTo: "all" } }] },
    { id: "tie", priority: 1, startsAt: at(-H), hasOverrides: true, blocks: [{ id: "bt", type: "announcement", enabled: false, settings: { messages: [{ text: "Off" }] } }, { id: "empty", type: "announcement", enabled: true, settings: { messages: [] } }] },
  ];
  const slots = blocks.resolveCampaignSlots(campaigns);
  assert.equal(slots.theme.id, "tie", "highest priority with look changes; a tie goes to the most recent start");
  assert.equal(slots.announcement.campaign.id, "high", "one bar: highest priority (an empty or switched-off bar doesn't count)");
  assert.equal(slots.announcement.settings.messages[0].text, "High bar");
  assert.deepEqual(slots.popups.map((p) => p.formId), ["form-high", "form-low"], "pop-ups queue by priority; the storefront shows one per page view");
  const onSale = { id: "p1", retailPrice: 7500, compareAtPrice: 10000 };
  const fullPrice = { id: "p2", retailPrice: 7500 };
  assert.deepEqual(blocks.badgesForProduct(slots.badges, onSale).map((b) => b.settings.label), ["High", "Second"], "at most two, by priority");
  assert.deepEqual(blocks.badgesForProduct(slots.badges, fullPrice).map((b) => b.settings.label), ["Second", "Low"]);
  assert.equal(blocks.resolveCampaignSlots([]).announcement, null);
  assert.equal(blocks.resolveCampaignSlots([]).theme, null);
  // The storefront hides the store's own bar only when a campaign bar shows.
  assert.match(read("src/lib/store-campaigns/storefront.server.ts"), /hideStoreAnnouncement: Boolean\(slots\.announcement\)/);
});

test("badges and words: rules, real % off, {countdown} and {discount_code}, contrast", () => {
  const badge = (settings) => blocks.readBadgeSettings(settings);
  const product = { id: "p", retailPrice: 6000, compareAtPrice: 10000, tags: ["Gift", "ankara"] };
  assert.equal(blocks.badgeMatches(badge({ appliesTo: "tag", tag: "gift" }), product), true, "tags match case-insensitively");
  assert.equal(blocks.badgeMatches(badge({ appliesTo: "products", productIds: ["q"] }), product), false);
  assert.equal(blocks.badgeMatches(badge({ appliesTo: "collection", collectionId: "c" }), product, new Set(["p"])), true);
  assert.equal(blocks.badgeText(badge({ label: "BF Deal", autoPercent: true }), product), "-40%");
  assert.equal(blocks.badgeText(badge({ label: "BF Deal", autoPercent: true }), { id: "x", retailPrice: 100 }), "BF Deal", "no compare-at price: the label");
  assert.deepEqual(blocks.fillCampaignText("Ends in {countdown}. Code {discount_code}!", { discountCode: "BF40" }), [{ kind: "text", value: "Ends in " }, { kind: "countdown" }, { kind: "text", value: ". Code BF40!" }]);
  assert.deepEqual(blocks.fillCampaignText("Code {discount_code} now", {}), [{ kind: "text", value: "Code now" }]);
  assert.equal(blocks.passesAA("#FFFFFF", "#0A0A0A"), true);
  assert.equal(blocks.passesAA("#FFD60A", "#FFFFFF"), false);
  const bar = blocks.readAnnouncementSettings({ messages: [{ text: "Hi", link: "javascript:alert(1)" }, { text: "" }, { text: "Two", link: "/shop" }], rotateSeconds: 1, background: "red" });
  assert.deepEqual(bar.messages.map((m) => m.link), ["", "/shop"], "only store paths or https links");
  assert.equal(bar.rotateSeconds, 3);
  assert.equal(bar.background, "");
  const countdown = blocks.readCountdownSettings({ target: "custom", customAt: "2026-12-01T10:00:00Z", format: "words", expiry: "message", expiredText: "Over" });
  assert.equal(blocks.countdownTargetMs(countdown, { startsAt: at(0), endsAt: at(D) }), Date.parse("2026-12-01T10:00:00Z"));
  assert.equal(blocks.countdownTargetMs(blocks.readCountdownSettings({}), { startsAt: at(0), endsAt: at(D) }), NOW + D, "default: the campaign's end");
  assert.equal(blocks.countdownTargetMs(blocks.readCountdownSettings({ target: "start" }), { startsAt: at(0), endsAt: at(D) }), NOW);
});

// ─── Presets ────────────────────────────────────────────────────────────────

test("presets: every season is complete, editable and uses real sections", () => {
  const wanted = ["black_friday", "cyber_monday", "christmas", "detty_december", "new_year", "valentine", "easter", "ramadan_eid", "back_to_school", "flash_sale", "blank"];
  assert.deepEqual(presets.CAMPAIGN_PRESETS.map((p) => p.id), wanted);
  for (const preset of presets.CAMPAIGN_PRESETS) {
    if (preset.id === "blank") continue;
    assert.ok(Object.keys(preset.tokens).length >= 3, `${preset.id} changes the look`);
    for (const value of Object.values(preset.tokens)) assert.ok(/^#[0-9A-F]{6}$/i.test(value) || ["serif", "grotesk"].includes(value), `${preset.id}: ${value}`);
    assert.ok(preset.sections.length >= 1, `${preset.id} adds sections`);
    for (const spec of preset.sections) {
      assert.ok(presets.CAMPAIGN_SECTION_KINDS.includes(spec.kind), spec.kind);
      assert.ok(catalog.isStoreBlock(spec.kind), `${spec.kind} is a real section the builder knows`);
    }
    assert.ok(preset.announcement.length >= 1, `${preset.id} has a top bar`);
    assert.ok(preset.badge, `${preset.id} has a badge`);
    assert.ok(preset.priority >= 0);
    // Applying it to a store produces valid overrides that merge cleanly.
    const overrides = presets.presetSectionOverrides(preset, (key) => `T(${key})`, (n) => `x${n}`, "hero");
    assert.deepEqual(merge.readSectionOverrides(overrides).map((o) => o.id), overrides.map((o) => o.id), `${preset.id}: overrides survive a save and read`);
    const merged = merge.applyCampaignToSnapshot(snapshot(), { theme: { tokens: preset.tokens }, sections: overrides });
    assert.deepEqual(merged.skipped, [], `${preset.id}: nothing orphaned on a typical store`);
    if (preset.hideFirstHero) assert.equal(merged.snapshot.pages[0].sections.find((s) => s.id === "hero").visible, false);
    const added = overrides.filter((o) => o.action === "add");
    for (const o of added) assert.match(JSON.stringify(o.section.blocks), /T\(preset\./, "words come from the catalog in the seller's language");
    const made = presets.presetBlocks(preset, (key, vars) => (vars?.countdown ? `${key} ${vars.countdown}` : key));
    assert.ok(made.some((b) => b.type === "announcement" && /\{countdown\}/.test(b.settings.messages[0].text)), `${preset.id}: the bar shows the timer`);
    assert.ok(made.some((b) => b.type === "countdown"));
    for (const b of made) assert.doesNotMatch(JSON.stringify(b.settings), /\b\d{1,2}% off\b/i, "no made-up offers");
  }
  assert.equal(presets.firstHeroSectionId(basePage()), "hero");
  assert.equal(presets.firstHeroSectionId({ sections: [section("a")] }), null);
});

test("presets: suggested dates (fixed and moveable feasts) are upcoming and in the store's zone", () => {
  const lagos = "Africa/Lagos";
  const bf = presets.presetWindowForYear("black_friday", 2026, lagos);
  assert.equal(new Date(bf.startsAt).toISOString(), "2026-11-26T23:00:00.000Z", "Friday 27 Nov 2026, 00:00 in Lagos");
  assert.equal(new Date(bf.endsAt).toISOString(), "2026-11-29T22:59:00.000Z", "through Sunday 23:59");
  assert.equal(new Date(presets.presetWindowForYear("black_friday", 2027, lagos).startsAt).getUTCDate(), 25, "26 Nov 2027 in Lagos");
  assert.equal(new Date(presets.presetWindowForYear("cyber_monday", 2026, lagos).startsAt).toISOString(), "2026-11-29T23:00:00.000Z", "Monday 30 Nov");
  const easter = presets.presetWindowForYear("easter", 2027, lagos);
  assert.ok(easter.startsAt < Date.UTC(2027, 2, 28) && easter.endsAt > Date.UTC(2027, 2, 28), "Easter 2027 (28 March) is inside");
  const eid = presets.presetWindowForYear("ramadan_eid", 2026, lagos);
  assert.ok(eid.startsAt < Date.UTC(2026, 2, 20) && eid.endsAt > Date.UTC(2026, 2, 20), "Eid al-Fitr 2026 is inside");
  for (const year of [2026, 2027, 2028]) assert.ok(presets.MOVABLE_DATES[year], `lookup table has ${year}`);
  for (const preset of presets.CAMPAIGN_PRESETS) {
    const window = presets.suggestedPresetDates(preset.id, lagos, NOW);
    if (preset.id === "blank") {
      assert.equal(window, null);
      continue;
    }
    assert.ok(window, `${preset.id} suggests dates`);
    assert.ok(window.endsAt > NOW && window.endsAt > window.startsAt, `${preset.id}: upcoming and the end after the start`);
  }
  // On 20 Nov 2026, Christmas suggests this December and Valentine's next February.
  assert.equal(new Date(presets.suggestedPresetDates("christmas", lagos, NOW).startsAt).getUTCFullYear(), 2026);
  assert.equal(new Date(presets.suggestedPresetDates("valentine", lagos, NOW).startsAt).getUTCFullYear(), 2027);
  const flash = presets.suggestedPresetDates("flash_sale", lagos, NOW + 60_000);
  assert.equal(flash.endsAt - flash.startsAt, 24 * H);
  assert.equal(flash.startsAt % H, 0, "starts on the hour");
});

// ─── Preview links ──────────────────────────────────────────────────────────

test("preview links: signed, tied to one campaign and store, and they expire", () => {
  const secret = "test-secret";
  const signed = token.signPreviewToken({ campaignId: "camp1", storeId: "store1" }, secret, NOW);
  const payload = token.verifyPreviewToken(signed, secret, { now: NOW + D, campaignId: "camp1" });
  assert.deepEqual(payload, { c: "camp1", s: "store1", e: NOW + 7 * D });
  assert.equal(token.verifyPreviewToken(signed, secret, { now: NOW + 7 * D + 1 }), null, "expired after 7 days");
  assert.equal(token.verifyPreviewToken(signed, "other-secret", { now: NOW }), null, "another secret");
  assert.equal(token.verifyPreviewToken(signed, secret, { now: NOW, campaignId: "camp2" }), null, "another campaign");
  const [body, sig] = signed.split(".");
  const forged = Buffer.from(JSON.stringify({ c: "camp1", s: "store2", e: NOW + 99 * D })).toString("base64url");
  assert.equal(token.verifyPreviewToken(`${forged}.${sig}`, secret, { now: NOW }), null, "can't be moved to another store");
  assert.equal(token.verifyPreviewToken(`${body}.${sig}x`, secret, { now: NOW }), null);
  assert.equal(token.verifyPreviewToken(`${body}.${sig}.extra`, secret, { now: NOW }), null);
  assert.equal(token.verifyPreviewToken(signed, "", { now: NOW }), null, "no secret, no previews");
  assert.throws(() => token.signPreviewToken({ campaignId: "c", storeId: "s" }, ""));
  assert.deepEqual(token.previewParamsFromPath(`/shop?x=1&preview_campaign=camp1&token=${signed}&preview_at=2026-11-29T21:00:00Z`), { campaignId: "camp1", token: signed, at: "2026-11-29T21:00:00Z" });
  assert.equal(token.previewParamsFromPath("/shop"), null);
  assert.equal(token.readPreviewAt("2026-11-29T21:00:00Z", NOW), Date.parse("2026-11-29T21:00:00Z"));
  assert.equal(token.readPreviewAt("3026-01-01", NOW), null, "silly times ignored");
  // The storefront only reads campaigns that are live, or the one a valid preview token names, for this store.
  const storefront = read("src/lib/store-campaigns/storefront.server.ts");
  assert.match(storefront, /archivedAt: null, pausedAt: null, startsAt: \{ lte: now \}, endsAt: \{ gt: now \}/);
  assert.match(storefront, /payload\.s !== storeId/);
  // Browser code never pulls in the signing module (node:crypto).
  for (const file of ["src/components/storefront/campaign/tracking.ts", "src/components/storefront/campaign/CampaignLayer.tsx"]) assert.doesNotMatch(read(file), /preview-token"/, file);
});

// ─── Security, wiring ───────────────────────────────────────────────────────

test("wiring: seller-only APIs scoped to their store, cron auth, migration, nav", () => {
  const api = read("src/lib/store-campaigns/api.ts");
  assert.match(api, /withSeller\(/);
  const server = read("src/lib/store-campaigns/server.ts");
  assert.match(server, /findFirst\(\{ where: \{ id, storeId: store\.id \}/, "every campaign is looked up within the seller's own store");
  assert.match(read("src/app/api/cron/seasonal-campaigns/route.ts"), /cronAuthorization\(req\.headers\.get\("authorization"\), secret\)/);
  const sql = read("docs/migrations/2026-10-30-campaigns.sql");
  for (const table of ["StoreCampaign", "StoreCampaignBlock", "StoreCampaignEvent"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
    assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(sql, /"endsAt" > "startsAt"/);
  assert.match(sql, /cron\.schedule\(\s*'seasonal-campaigns',\s*'\*\/5 \* \* \* \*'/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'seasonal-campaigns'\)/, "scheduled at most once");
  const schema = read("prisma/schema.prisma");
  for (const model of ["StoreCampaign", "StoreCampaignBlock", "StoreCampaignEvent"]) assert.match(schema, new RegExp(`model ${model} \\{`));
  assert.match(read("src/lib/nav.ts"), /href: "\/home\/campaigns"/);
  // Events: batched, rate-limited, only for live campaigns of that store.
  const events = read("src/app/api/public/store/[slug]/campaign-events/route.ts");
  assert.match(events, /checkRateLimit\(/);
  assert.match(events, /storeId: store\.id, archivedAt: null, pausedAt: null/);
  // One pop-up engine: campaign pop-ups are store pop-ups that only show while their campaign runs.
  assert.match(read("src/app/api/public/store/[slug]/marketing/route.ts"), /campaignPopupStates\(/);
  // Countdowns are accessible: no per-second announcements, one label with the end date, reduced motion respected.
  const countdown = read("src/components/storefront/campaign/CampaignCountdown.tsx");
  assert.match(countdown, /aria-live="off"/);
  assert.match(countdown, /countdown\.endsLabel/);
  assert.match(read("src/components/storefront/boutique/blocks/CampaignCountdownHero.tsx"), /motion-reduce:hidden/);
});

// ─── Words ──────────────────────────────────────────────────────────────────

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test("i18n: every campaign word used in code is in the catalog, in all five languages", () => {
  const en = CATALOGS.campaigns.en;
  const root = new URL("../", import.meta.url).pathname;
  const files = [
    ...filesUnder(join(root, "src/app/home/campaigns")),
    ...filesUnder(join(root, "src/components/campaigns")),
    ...filesUnder(join(root, "src/components/storefront/campaign")),
    ...["CampaignCountdownHero", "CampaignPromoStrip", "CampaignDealGrid", "CampaignFeaturedDeal", "CampaignGiftGuide", "campaign-timer"].map((name) => join(root, `src/components/storefront/boutique/blocks/${name}.tsx`)),
  ];
  const used = new Set();
  for (const file of files) for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"([\w.-]+)"/g)) used.add(match[1]);
  // Keys the server builds: presets, block defaults, popup words.
  for (const preset of presets.CAMPAIGN_PRESETS) for (const key of presets.presetMessageKeys(preset)) used.add(key);
  for (const key of ["popup.formName", "popup.defaultEyebrow", "popup.defaultBody", "popup.cta", "newCampaignName", "copyName", "preset.nameWithYear", "badge.defaultLabel"]) used.add(key);
  for (const kind of presets.CAMPAIGN_SECTION_KINDS) used.add(`kind.${kind}`);
  assert.ok(used.size > 150, `${used.size} keys found`);
  const missing = [...used].filter((key) => !(key in en));
  assert.deepEqual(missing, [], "every key has English");
  for (const lang of ["pcm", "yo", "ha", "ig"]) {
    const gaps = [...used].filter((key) => !(key in CATALOGS.campaigns[lang]));
    assert.deepEqual(gaps, [], `${lang} has every key`);
  }
  // The bar's starter words keep {countdown} after translation (the storefront swaps it for the timer).
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) assert.match(CATALOGS.campaigns[lang]["preset.black_friday.bar1"], /\{countdown\}/, lang);
});
