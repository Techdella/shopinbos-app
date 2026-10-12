// Store rewards (gamification): pure logic for prize draws, codes, reward progress and loyalty points
// (Node strips the types natively).
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

const g = await import("../src/lib/gamification/logic.ts");

test("weighted draw: every ticket maps to exactly its slice's share; zero-weight and ineligible slices never land", () => {
  const weights = [30, 0, 15, 25, 10, 20];
  const total = g.totalTickets(weights);
  assert.equal(total, 100);
  const counts = new Array(weights.length).fill(0);
  for (let ticket = 0; ticket < total; ticket++) counts[g.pickWeighted(weights, ticket)]++;
  assert.deepEqual(counts, weights, "ticket ranges are exactly the weights");
  assert.equal(g.pickWeighted(weights, 0), 0);
  assert.equal(g.pickWeighted(weights, 29), 0);
  assert.equal(g.pickWeighted(weights, 30), 2, "the zero-weight slice is skipped");
  assert.equal(g.pickWeighted(weights, total), -1, "a ticket past the end lands nowhere");

  // A free gift that's out of stock can't be won: its tickets disappear, the others keep their ratios.
  const eligible = [true, true, false, true, true, true];
  const t2 = g.totalTickets(weights, eligible);
  assert.equal(t2, 85);
  const seen = new Set();
  for (let ticket = 0; ticket < t2; ticket++) seen.add(g.pickWeighted(weights, ticket, eligible));
  assert.ok(!seen.has(2) && !seen.has(1));
  assert.equal(g.pickWeighted([0, 0], 0), -1);

  // A secure random draw over many plays stays close to the odds.
  const draws = new Array(weights.length).fill(0);
  for (let i = 0; i < 20000; i++) draws[g.pickWeighted(weights, randomInt(total))]++;
  weights.forEach((w, i) => assert.ok(Math.abs(draws[i] / 20000 - w / total) < 0.02, `slice ${i} near ${w}%`));
});

test("odds shown to shoppers are whole percents that add up to 100", () => {
  assert.deepEqual(g.sliceOdds([{ weight: 1 }, { weight: 1 }, { weight: 1 }]), [34, 33, 33]);
  assert.equal(g.sliceOdds(g.DEFAULT_SLICES).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(g.sliceOdds([{ weight: 0 }, { weight: 5 }]), [0, 100]);
  assert.deepEqual(g.sliceOdds([{ weight: 0 }, { weight: 0 }]), [0, 0]);
});

test("prize codes: unique, unambiguous, prefixed by game; the server issues one-use codes and retries clashes", () => {
  const codes = new Set();
  for (let i = 0; i < 20000; i++) codes.add(g.gameCode("SPIN", randomBytes(8)));
  assert.equal(codes.size, 20000, "no repeats in 20,000 codes");
  for (const code of [...codes].slice(0, 500)) {
    assert.match(code, /^SPIN-[2-9A-HJKMNP-Z]{8}$/);
    assert.doesNotMatch(code.slice(5), /[01ILO]/);
  }
  assert.equal(g.gameCode("NEXT", [0, 1, 2, 3, 4, 5, 6, 7]), "NEXT-23456789");
  assert.equal(g.isGameCode("spin-7kq2mxab"), true);
  assert.equal(g.isGameCode("SALE20"), false);

  const play = readFileSync(new URL("../src/lib/gamification/play.server.ts", import.meta.url), "utf8");
  assert.match(play, /maxUses: 1/, "every prize code works once");
  assert.match(play, /P2002/, "a code clash draws a new code instead of failing");
  assert.match(play, /randomInt\(tickets\)/, "the server draws the outcome");
});

test("prizes become ordinary discounts: % / ₦ off, free delivery, a free gift scoped to the gift product", () => {
  assert.deepEqual(g.prizeDiscount({ kind: "percent", value: 10, productId: null }), { type: "percentage", value: 10, productIds: [] });
  assert.deepEqual(g.prizeDiscount({ kind: "amount", value: 1500, productId: null }), { type: "fixed_amount", value: 1500, productIds: [] });
  assert.deepEqual(g.prizeDiscount({ kind: "free_delivery", value: 0, productId: null }), { type: "free_shipping", value: 0, productIds: [] });
  assert.deepEqual(g.prizeDiscount({ kind: "free_gift", value: 0, productId: "p9" }, 4500), { type: "fixed_amount", value: 4500, productIds: ["p9"] });
  assert.equal(g.prizeDiscount({ kind: "free_gift", value: 0, productId: "p9" }, null), null, "no price, no gift");
  assert.equal(g.prizeDiscount({ kind: "try_again", value: 0, productId: null }), null);
  assert.equal(g.sliceLabel({ kind: "amount", value: 1000, label: "" }), "₦1,000 off");
  assert.equal(g.sliceLabel({ kind: "percent", value: 5, label: "Lucky 5" }), "Lucky 5");
});

test("settings are cleaned: limits, defaults, 4–8 slices, sorted tiers, and problems in plain words", () => {
  const config = g.readGameConfig({
    gamification: {
      prizes: { slices: [{ kind: "percent", value: 500, weight: -3 }, { kind: "bogus" }, { kind: "free_gift" }, { kind: "amount", value: 2000, weight: 5 }], codeDays: 999 },
      wheel: { enabled: true, trigger: "nope", delaySeconds: 0, collect: "whatsapp" },
      progress: { tiers: [{ id: "b", threshold: 50000, kind: "percent", value: 5 }, { id: "a", threshold: 20000, kind: "free_gift", productId: "gift" }, { threshold: 1 }, { threshold: 2 }] },
      loyalty: { enabled: true, silverAt: 500, goldAt: 100, startedAt: "not a date" },
    },
  });
  assert.equal(config.prizes.slices.length, 4);
  assert.equal(config.prizes.slices[0].value, 90, "percent capped at 90");
  assert.equal(config.prizes.slices[0].weight, 0);
  assert.equal(config.prizes.slices[1].kind, "try_again");
  assert.equal(config.prizes.codeDays, 90);
  assert.equal(config.wheel.trigger, "delay");
  assert.equal(config.wheel.delaySeconds, 1);
  assert.equal(config.wheel.collect, "whatsapp");
  assert.deepEqual(config.progress.tiers.map((tier) => [tier.id, tier.threshold]), [["t3", 1], ["a", 20000], ["b", 50000]], "at most three tiers, sorted by amount");
  assert.ok(config.loyalty.goldAt > config.loyalty.silverAt, "gold always above silver");
  assert.equal(config.loyalty.startedAt, null);
  assert.ok(g.configProblems(config).some((p) => /free-gift slice/.test(p)));

  const fresh = g.readGameConfig(undefined);
  assert.equal(fresh.prizes.slices.length, g.DEFAULT_SLICES.length);
  assert.equal(fresh.wheel.enabled, false, "games are off until the seller turns them on");
  assert.deepEqual(g.configProblems(fresh), []);
  const noPrize = { ...fresh, prizes: { ...fresh.prizes, slices: fresh.prizes.slices.map((s) => ({ ...s, weight: s.kind === "try_again" ? 5 : 0 })) } };
  assert.match(g.configProblems(noPrize)[0], /nobody can win/);
  assert.deepEqual(g.rewardTiersFor({ gamification: { progress: { enabled: false, tiers: [{ threshold: 5 }] } } }), [], "no tiers while progress is off");
});

test("reward progress: free delivery and tiers on one bar, the next milestone, and the messages", () => {
  const tiers = [{ id: "gift", threshold: 40000, kind: "free_gift", value: 0, productId: "p1", label: "" }, { id: "pct", threshold: 60000, kind: "percent", value: 5, productId: null, label: "" }];
  const state = g.rewardProgress(15500, 20000, tiers, { p1: "Tote bag" });
  assert.deepEqual(state.milestones.map((m) => [m.id, m.threshold, m.position, m.reached, m.remaining]), [
    ["free_delivery", 20000, 33, false, 4500],
    ["gift", 40000, 67, false, 24500],
    ["pct", 60000, 100, false, 44500],
  ]);
  assert.equal(state.next.id, "free_delivery");
  assert.equal(state.percent, 26);
  assert.deepEqual(g.progressMessage(state), { lead: "Add ₦4,500 more", rest: " for free delivery" });

  const mid = g.rewardProgress(45000, 20000, tiers, { p1: "Tote bag" });
  assert.equal(mid.reachedCount, 2);
  assert.equal(mid.next.label, "5% off");
  assert.equal(mid.milestones[1].label, "Free Tote bag");

  const done = g.rewardProgress(80000, 20000, tiers, { p1: "Tote bag" });
  assert.equal(done.next, null);
  assert.equal(done.percent, 100);
  assert.deepEqual(g.progressMessage(done), { lead: "You've unlocked", rest: " free delivery, free Tote bag and 5% off" });

  assert.equal(g.rewardProgress(1000, null, []), null, "nothing to show");
  const onlyDelivery = g.rewardProgress(0, 10000, []);
  assert.equal(onlyDelivery.percent, 0);
  assert.equal(onlyDelivery.milestones[0].remaining, 10000);
});

test("loyalty points: earn per ₦100 with tier multipliers, redeem capped by balance, share of the order and minimum", () => {
  const s = { ...g.DEFAULT_GAME_CONFIG.loyalty, enabled: true, pointsPer100: 1, pointValue: 1, maxRedeemPercent: 20, minRedeemPoints: 100, silverAt: 2000, goldAt: 10000, silverMultiplier: 1.25, goldMultiplier: 1.5 };
  assert.equal(g.pointsForSpend(19999, s), 199, "rounded down");
  assert.equal(g.pointsForSpend(20000, s, 1.25), 250);
  assert.equal(g.pointsForSpend(-5, s), 0);
  assert.equal(g.pointsForSpend(10000, { pointsPer100: 0.1 }), 10, "no float drift");

  assert.equal(g.loyaltyTier(0, s), "bronze");
  assert.equal(g.loyaltyTier(2000, s), "silver");
  assert.equal(g.loyaltyTier(15000, s), "gold");
  assert.equal(g.tierMultiplier("gold", s), 1.5);
  assert.deepEqual(g.nextTier(1500, s), { tier: "silver", remaining: 500 });
  assert.equal(g.nextTier(12000, s), null);

  // ₦30,000 of products: at most 20% = ₦6,000 = 6,000 points.
  assert.deepEqual(g.redeemablePoints({ balance: 10000, base: 30000 }, s), { max: 6000, points: 6000, amount: 6000 });
  assert.deepEqual(g.redeemablePoints({ balance: 2500, base: 30000 }, s), { max: 2500, points: 2500, amount: 2500 }, "balance caps it");
  assert.deepEqual(g.redeemablePoints({ balance: 10000, base: 30000, requested: 999999 }, s), { max: 6000, points: 6000, amount: 6000 }, "asking for more is clamped");
  assert.deepEqual(g.redeemablePoints({ balance: 10000, base: 30000, requested: 50 }, s), { max: 6000, points: 0, amount: 0 }, "below the minimum uses none");
  assert.deepEqual(g.redeemablePoints({ balance: 90, base: 30000 }, s), { max: 0, points: 0, amount: 0 }, "a balance under the minimum can't be used");
  assert.deepEqual(g.redeemablePoints({ balance: 10000, base: 400 }, s), { max: 0, points: 0, amount: 0 }, "20% of ₦400 is under the minimum");
  // Points worth ₦2 each: the naira cap still holds.
  assert.deepEqual(g.redeemablePoints({ balance: 10000, base: 30000 }, { ...s, pointValue: 2 }), { max: 3000, points: 3000, amount: 6000 });
  assert.equal(g.pointsValue(250, { pointValue: 0.5 }), 125);
});

test("who plays and when they can play again", () => {
  assert.equal(g.contactKey(" Ada@Example.com ", null), "e:ada@example.com");
  assert.equal(g.contactKey(null, "0803 123 4567"), "p:2348031234567", "Nigerian 0 numbers and +234 numbers match");
  assert.equal(g.contactKey(null, "+234 803 123 4567"), "p:2348031234567");
  assert.equal(g.contactKey("nope", "12"), null);
  const now = new Date("2026-10-12T12:00:00Z");
  assert.equal(g.canPlayAgain(null, 7, now), true);
  assert.equal(g.canPlayAgain(new Date("2026-10-08T12:00:00Z"), 7, now), false);
  assert.equal(g.canPlayAgain(new Date("2026-10-05T12:00:00Z"), 7, now), true);

  const on = { enabled: true, frequencyDays: 7 };
  const t = now.getTime();
  assert.equal(g.popupDue(on, { lastShownAt: null, played: false, shownThisSession: false }, t), true);
  assert.equal(g.popupDue(on, { lastShownAt: t - 86_400_000, played: false, shownThisSession: false }, t), false, "shown yesterday");
  assert.equal(g.popupDue(on, { lastShownAt: null, played: true, shownThisSession: false }, t), false, "never after a play");
  assert.equal(g.popupDue({ ...on, enabled: false }, { lastShownAt: null, played: false, shownThisSession: false }, t), false);
});

test("builder: reward sections are insertable in both renderers, with inspector settings and matching starters", async () => {
  const logic = await import("../src/components/builder/editor/editor-logic.ts");
  const schema = await import("../src/components/builder/editor/section-schema.ts");
  assert.deepEqual(schema.REWARD_SECTION_KINDS, [...g.GAME_SECTION_KINDS], "the builder's list matches the storefront's");
  for (const renderer of ["boutique", "classic"]) {
    const grow = logic.insertOptions({ renderer, target: "template", existingKinds: [] }).find((group) => group.group === "Grow");
    for (const kind of g.GAME_SECTION_KINDS) assert.ok(grow.items.some((item) => item.kind === kind), `${kind} in ${renderer}`);
    const wheel = schema.sectionSchema("spin-wheel", renderer, "noir");
    const fields = wheel.settings.flatMap((group) => group.fields).map((field) => field.id);
    assert.ok(["display", "trigger", "delaySeconds", "title", "buttonLabel"].every((id) => fields.includes(id)), renderer);
  }
  for (const kind of g.GAME_SECTION_KINDS) {
    const section = logic.newBoutiqueSection(kind, "x1");
    const starter = g.gameSectionDefaults(kind);
    assert.equal(section.name, starter.name);
    assert.deepEqual(section.blocks[0].content, starter.copy);
    assert.deepEqual(section.settings, starter.settings);
    assert.equal(logic.sectionGroup(kind), "template");
  }
  const display = g.readSectionDisplay({ display: "inline", trigger: "scroll", scrollPercent: 70 }, g.DEFAULT_GAME_CONFIG.wheel);
  assert.deepEqual(display, { display: "inline", trigger: "scroll", delaySeconds: 8, scrollPercent: 70 });
  assert.equal(g.readSectionDisplay({}, g.DEFAULT_GAME_CONFIG.wheel).display, "popup");

  // Both storefront renderers draw them.
  const boutique = readFileSync(new URL("../src/components/storefront/boutique/BoutiqueStorefront.tsx", import.meta.url), "utf8");
  const classic = readFileSync(new URL("../src/components/storefront/TemplateStorefrontSurface.tsx", import.meta.url), "utf8");
  for (const kind of g.GAME_SECTION_KINDS) assert.ok(boutique.includes(`case "${kind}":`), kind);
  assert.match(classic, /isGameSectionKind\(kindSection\.kind\)/);
});

test("checkout: points go through the server's pricing and are spent inside the order transaction", () => {
  const pricing = readFileSync(new URL("../src/lib/commerce/pricing.server.ts", import.meta.url), "utf8");
  assert.match(pricing, /quotePoints\(/);
  const checkout = readFileSync(new URL("../src/app/api/public/store/[slug]/checkout/route.ts", import.meta.url), "utf8");
  assert.match(checkout, /spendPoints\(tx,/);
  const loyalty = readFileSync(new URL("../src/lib/gamification/loyalty.server.ts", import.meta.url), "utf8");
  assert.match(loyalty, /balance: \{ gte: input\.points \}/, "never spends more than the balance");
  assert.match(loyalty, /isMissingTable/, "checkout keeps working before the SQL is applied");
  const sql = readFileSync(new URL("../docs/migrations/2026-10-12-gamification.sql", import.meta.url), "utf8");
  for (const table of ["GamePlay", "LoyaltyAccount", "LoyaltyLedger"]) assert.match(sql, new RegExp(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`));
});
