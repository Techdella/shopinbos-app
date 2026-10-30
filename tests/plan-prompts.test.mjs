// Batch 3: the plan / credits slide-in (web with its button, the phone apps without), Peggy's 3 free calls a month
// on free plans, and Peggy's notes to the team (Admin › Support › Peggy notes).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const prompts = await import("../shared/plan-prompts.ts");
const plans = await import("../shared/plans.ts");

test("plan and credits codes open the slide-in; other errors don't", () => {
  assert.equal(prompts.planPromptFor("PLAN_LIMIT"), "plan");
  assert.equal(prompts.planPromptFor("UPGRADE_REQUIRED"), "plan");
  assert.equal(prompts.planPromptFor("AI_CREDITS_NEEDED"), "credits");
  for (const code of [null, undefined, "", "RATE_LIMITED", "VALIDATION_ERROR"]) assert.equal(prompts.planPromptFor(code), null);
  assert.equal(prompts.plansUrlFor("seller"), "/home/settings?tab=Billing");
  assert.equal(prompts.plansUrlFor("logistics_partner"), "/logistics/billing");
  assert.match(prompts.plansUrlFor("supplier"), /^\/supplier\/profile\?tab=/);
});

test("web: one slide-in for every page, with a button only on the web", () => {
  const web = read("src/components/plans/PlanPrompts.tsx");
  assert.match(web, /window\.fetch = async/);
  assert.match(web, /response\.status === 402 \|\| response\.status === 403/);
  assert.match(web, /inApp \? null : credits \? \(\s*<BuyCreditsButton/);
  assert.match(web, /t\("lock\.title"\)/);
  assert.match(read("src/components/shell/GlobalTopBar.tsx"), /<PlanPrompts role=\{role\} \/>/);
});

test("phone: 'This isn't on your plan' with no price, link or button to buy", () => {
  const phone = read("apps/mobile/src/components/PlanPrompt.tsx");
  assert.match(phone, /t\("lock\.notOnPlan"\)/);
  assert.doesNotMatch(phone, /lock\.seePlans|lock\.topUp|Linking|openURL|router\.push/);
  assert.match(read("apps/mobile/src/lib/api.ts"), /DeviceEventEmitter\.emit\(PLAN_PROMPT_EVENT/);
  assert.match(read("apps/mobile/src/app/_layout.tsx"), /<PlanPrompt \/>/);
});

test("Peggy calls: 3 a month on free plans, no cap on paid ones; every way to start a call checks", () => {
  assert.equal(plans.FREE_PEGGY_CALLS_PER_MONTH, 3);
  assert.equal(plans.peggyCallsLeft("seller_free", 0), 3);
  assert.equal(plans.peggyCallsLeft("supplier_free", 2), 1);
  assert.equal(plans.peggyCallsLeft("logistics_free", 7), 0);
  assert.equal(plans.peggyCallsLeft("seller_growth", 40), null);
  for (const file of ["src/app/api/app/peggy-call/route.ts", "src/app/api/mobile/peggy-call/route.ts", "src/app/api/public/peggy-call/route.ts"]) {
    assert.match(read(file), /if \(\(await peggyCallsLeftFor\((user\.id|userId)\)\) === 0\) return apiError\("PLAN_LIMIT", noCallsLeftMessage\((true|false)\), 402\);/, file);
  }
  const voice = read("src/lib/ai/peggy-voice.server.ts");
  assert.equal((voice.match(/await recordCall\(userId\);/g) ?? []).length, 2, "a call is counted once it starts");
  assert.match(voice, /inApp\s*\?\s*`\$\{used\} Chat with her instead/);
});

test("Peggy's notes to the team: a chat tool, kept with the call notes, listed in admin", () => {
  assert.match(read("src/lib/ai/peggy/pure.ts"), /note_to_team: \{\s*write: true,/);
  assert.match(read("src/lib/ai/peggy/tools.ts"), /savePeggyNote\(\{ userId: ctx\.userId, role: "seller", kind: "note", via: "chat"/);
  const page = read("src/app/admin/support/peggy-notes/page.tsx");
  assert.match(page, /requireRole\(\["admin"\]/);
  assert.match(page, /allPeggyNotes\(/);
  assert.match(read("src/app/admin/support/page.tsx"), /href="\/admin\/support\/peggy-notes"/);
});
