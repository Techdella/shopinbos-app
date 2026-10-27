// Admin side of the tiered delivery partner verification (shared/partner-tiers.ts): every team decision re-computes
// the tier, reject and suspend need a reason the partner sees, reinstating a suspended partner puts them back to
// verified when they had a tier, the tier rules save through saveTierRules (with history), and the review queue
// and tier panel are on the partner pages.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const api = (path) => read(`src/app/api/admin/logistics-partners/${path}`);

test("every per-item decision route re-computes the tier", () => {
  for (const route of ["[id]/documents/route.ts", "[id]/vehicles/route.ts", "[id]/identity/route.ts", "[id]/guarantor/route.ts", "[id]/status/route.ts"]) {
    assert.match(api(route), /refreshPartnerTier\(/, route);
    assert.match(api(route), /withAdmin\(/, route);
  }
  const actions = read("src/app/actions/admin.ts");
  assert.equal((actions.match(/refreshPartnerTier\(/g) ?? []).length >= 2, true, "single and bulk status updates refresh the tier");
});

test("rejections need a reason", () => {
  const status = api("[id]/status/route.ts");
  assert.match(status, /body\.action !== "reject" && body\.action !== "suspend"\) \|\| \(body\.reason\?\.length \?\? 0\) >= 3/);
  assert.match(status, /statusReason: reason/);
  for (const route of ["[id]/vehicles/route.ts", "[id]/identity/route.ts"]) {
    assert.match(api(route), /action: z\.literal\("reject"\), reason: z\.string\(\)\.trim\(\)\.min\(3/, route);
  }
});

test("reinstating a suspended partner restores verified when they had a tier", () => {
  const status = api("[id]/status/route.ts");
  assert.match(status, /current\.verificationTier !== "none" \? \("verified" as const\)/);
  assert.match(status, /current\.verificationStatus === "suspended"\s*\?\s*\{ verificationStatus: reinstateTo, status: "active", statusReason: null/);
  assert.match(status, /tier: z\.enum\(\["tier1", "tier2"\]\)\.optional\(\)/, "approve may set a tier explicitly");
});

test("tier rules save through saveTierRules, validated, with recent changes", () => {
  const route = api("tier-rules/route.ts");
  assert.match(route, /saveTierRules\(rules, user\.id, note\)/);
  assert.match(route, /export const GET = withAdmin/);
  assert.match(route, /export const PUT = withAdmin/);
  assert.match(route, /platformSettingChange\.findMany\(\{ where: \{ key: TIER_RULES_KEY \}/);
  assert.match(read("src/app/admin/logistics-partners/tier-rules/page.tsx"), /TierRulesForm/);
});

test("guarantor by call, limits lift and restore", () => {
  assert.match(api("[id]/guarantor/route.ts"), /respondedVia: "call"/);
  const limits = api("[id]/limits/route.ts");
  assert.match(limits, /limitsLiftedAt: parsed\.data\.action === "lift" \? new Date\(\) : null/);
});

test("the partner pages show the review queue, tiers, badges and the tier panel", () => {
  const list = read("src/app/admin/logistics-partners/page.tsx");
  assert.match(list, /label: "Waiting for review", count: queue\.length/);
  assert.match(list, /partnerVerificationState\(row\)/);
  assert.match(list, /\/admin\/logistics-partners\/tier-rules/);
  const detail = read("src/app/admin/logistics-partners/[id]/page.tsx");
  assert.match(detail, /<TierPanel partnerId=\{partner\.id\} \/>/);
  const panel = read("src/app/admin/logistics-partners/[id]/TierPanel.tsx");
  assert.match(panel, /tier1Checklist\(snapshot\)/);
  assert.match(panel, /tier2Checklist\(snapshot\)/);
  assert.match(panel, /verificationFileHref/);
  assert.match(panel, /checkGraduation\(/);
  assert.doesNotMatch(panel, /nin\.hash|\.hash\b/, "the NIN hash is never shown");
});
