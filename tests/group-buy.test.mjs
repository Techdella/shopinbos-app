// Group buy (shared/group-buy.ts): settings checks, who counts towards filling, the countdown, what happens after
// the charges, and the share text.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = await import("../shared/group-buy.ts");

test("group settings: 2–20 people, a known window, a price below the normal price", () => {
  const ok = { groupPriceKobo: 800_000, retailKobo: 1_000_000, size: 5, hours: 24 };
  assert.equal(g.groupSettingsProblem(ok), null);
  assert.match(g.groupSettingsProblem({ ...ok, size: 1 }), /2 to 20/);
  assert.match(g.groupSettingsProblem({ ...ok, size: 21 }), /2 to 20/);
  assert.match(g.groupSettingsProblem({ ...ok, hours: 5 }), /how long/);
  assert.match(g.groupSettingsProblem({ ...ok, groupPriceKobo: 1_000_000 }), /lower/);
  assert.match(g.groupSettingsProblem({ ...ok, groupPriceKobo: 10_000 }), /at least/);
});

test("only saved cards (and paid / paying members) count towards filling", () => {
  const members = [{ status: "pending" }, { status: "joined" }, { status: "charged" }, { status: "pay_link" }, { status: "dropped" }, { status: "cancelled" }];
  assert.equal(g.joinedCount(members), 3);
});

test("group state: open, full, expired, closed", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const group = { status: "open", size: 3, endsAt: "2026-11-02T12:00:00Z" };
  assert.equal(g.groupState(group, 2, now), "open");
  assert.equal(g.groupState(group, 3, now), "full");
  assert.equal(g.groupState(group, 2, new Date("2026-11-02T12:00:00Z")), "expired");
  assert.equal(g.groupState({ ...group, status: "charged" }, 3, now), "closed");
});

test("the countdown reads hh:mm and goes past 24 hours", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  assert.equal(g.timeLeft("2026-11-02T15:42:00Z", now).label, "05:42");
  assert.equal(g.timeLeft("2026-11-04T11:00:00Z", now).label, "49:00");
  assert.deepEqual(g.timeLeft("2026-11-02T09:00:00Z", now), { hours: 0, minutes: 0, label: "00:00", ended: true });
});

test("pay links last 2 hours; savings never go below zero", () => {
  assert.equal(g.payLinkDeadline(new Date("2026-11-02T10:00:00Z")).toISOString(), "2026-11-02T12:00:00.000Z");
  assert.equal(g.savingKobo(1_000_000, 800_000), 200_000);
  assert.equal(g.savingKobo(800_000, 1_000_000), 0);
});

test("after the charges: done when nobody is left to pay", () => {
  assert.equal(g.statusAfterCharges([{ status: "charged" }, { status: "dropped" }]), "charged");
  assert.equal(g.statusAfterCharges([{ status: "charged" }, { status: "pay_link" }]), "filled");
  assert.equal(g.chargeOutcome("success"), "paid");
  for (const status of ["failed", "send_otp", "pending", null]) assert.equal(g.chargeOutcome(status), "pay_link");
});

test("share text says nobody pays unless it fills", () => {
  const text = g.groupShareText({ productName: "Ankara dress", storeName: "Tofs", priceText: "₦8,000", size: 5, joined: 4, url: "https://tofs.mybos.store/group/x", timeLeftLabel: "05:00" });
  assert.match(text, /1 more person/);
  assert.match(text, /Nobody pays unless the group fills/);
  assert.match(text, /tofs\.mybos\.store/);
});

test("the shared group-buy rules are import-free and say the card check is refunded", () => {
  const source = readFileSync(new URL("../shared/group-buy.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import /m);
  assert.match(source, /refunded\s+\/\/ straight away|refunded/);
});
