// Pop-up looks and sign-up rewards: templates and stored styles (old forms unchanged), one code per email per
// form, shared vs unique codes, and the checkout rules (end date, minimum order, one use, tied to the email).
// Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const forms = await import("../src/lib/marketing/forms.ts");
const rewards = await import("../src/lib/marketing/popup-rewards.ts");
const { redemptionError } = await import("../src/lib/discounts.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("design JSON: forms saved before styles existed read exactly as before", () => {
  const old = forms.readDesign({ headline: "Hi", body: "Join", buttonText: "Go", imageUrl: "https://x.test/a.jpg" }, "Welcome");
  assert.deepEqual(old.style, forms.DEFAULT_POPUP_STYLE);
  assert.equal(old.style.radius, "round", "the old 24px corners");
  assert.equal(old.style.imagePosition, "top", "the old picture on top");
  assert.equal(old.style.overlay, 50, "the old black/50 backdrop");
  assert.equal(old.style.background, "", "empty colour = the store's own colours");
  assert.deepEqual(forms.readDesign({}, "X").style, forms.DEFAULT_POPUP_STYLE);
  assert.deepEqual(forms.readDesign(null).style, forms.DEFAULT_POPUP_STYLE);
  // Old pop-up config still reads (layout, timing, reward).
  const config = forms.readPopupConfig({ layout: "flyout", timing: "exit_intent" });
  assert.equal(config.layout, "flyout");
  assert.equal(config.trigger, "exit_intent");
  assert.equal(config.reward, null);
});

test("styles: a template fills the gaps, bad values fall back, colours must be #RRGGBB", () => {
  const luxe = forms.readPopupStyle({ template: "luxe" });
  assert.equal(luxe.background, "#14110F");
  assert.equal(luxe.font, "elegant");
  const custom = forms.readPopupStyle({ template: "luxe", background: "", button: "#abcdef", radius: "blob", overlay: 400, text: "red" });
  assert.equal(custom.background, "", "the seller chose the store colour");
  assert.equal(custom.button, "#ABCDEF");
  assert.equal(custom.radius, "square", "unknown radius: the template's");
  assert.equal(custom.overlay, 90, "overlay capped");
  assert.equal(custom.text, "", "not a hex colour");
  assert.equal(forms.readPopupStyle({ template: "nope" }).template, "classic");
  assert.equal(forms.readPopupConfig({ layout: "fullscreen" }).layout, "fullscreen");
});

test("templates: 8 distinct looks, each with a layout the storefront knows", () => {
  const ids = forms.POPUP_TEMPLATES.map((t) => t.id);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids).size, 8);
  for (const t of forms.POPUP_TEMPLATES) {
    assert.ok(["modal", "flyout", "bar", "fullscreen"].includes(t.layout));
    assert.equal(t.style.template, t.id);
    assert.deepEqual(forms.readPopupStyle(t.style), t.style, `${t.id} survives a save and read`);
  }
  assert.equal(forms.popupTemplate("takeover").layout, "fullscreen");
  assert.equal(forms.badgeText(forms.popupTemplate("badge").style, { type: "percentage", value: 10 }), "10% OFF");
  assert.equal(forms.badgeText({ ...forms.popupTemplate("badge").style, badgeText: "SALE" }, null), "SALE");
});

test("reward JSON: old { type, value, days } is a unique code per person; new shapes read safely", () => {
  const legacy = forms.readPopupConfig({ reward: { type: "percentage", value: 10, days: 14 } }).reward;
  assert.deepEqual(legacy, { source: "new", type: "percentage", value: 10, days: 14, minOrder: 0, unique: true, discountId: null, code: "", prefix: "WELCOME" });
  assert.equal(forms.readReward({ type: "percentage", value: 10 }).days, 14, "old rewards always ended");
  assert.equal(forms.readReward({ source: "new", type: "fixed_amount", value: 2000, days: 0, unique: false, code: "welcome 2k!" }).code, "WELCOME2K");
  assert.equal(forms.readReward({ source: "new", type: "fixed_amount", value: 2000 }).days, 0, "new rewards may never end");
  assert.equal(forms.readReward({ source: "existing" }), null, "an existing code needs a discount");
  assert.equal(forms.readReward({ source: "new", type: "percentage", value: 0 }), null);
  assert.equal(forms.readReward({ source: "new", type: "percentage", value: 250 }).value, 100);
  assert.equal(forms.readReward({}), null);
  assert.equal(forms.rewardLabel({ type: "percentage", value: 10 }), "10% off");
  assert.equal(forms.rewardLabel({ type: "fixed_amount", value: 2000 }), "₦2,000 off");
});

const unique = forms.readReward({ source: "new", type: "percentage", value: 10, days: 7, minOrder: 5000, unique: true, prefix: "welcome" });
const shared = forms.readReward({ source: "new", type: "percentage", value: 10, unique: false, discountId: "d1", code: "WELCOME10" });
const existing = forms.readReward({ source: "existing", discountId: "d9", code: "SALE20", type: "percentage", value: 20 });

test("issuing: one unique code per email per form; a second sign-up gets the same code back", () => {
  // A pretend Discount table keyed by form + email, like the server's lookup.
  const table = new Map();
  const issue = (formId, email) => {
    const key = `${formId}|${email.trim().toLowerCase()}`;
    const decision = rewards.decideIssue(unique, table.get(key) ?? null);
    if (decision.action === "create") {
      const code = rewards.formRewardCode(unique.prefix, randomBytes(8));
      const input = rewards.uniqueDiscountInput(unique, "Welcome", code);
      table.set(key, { code, status: input.status, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, maxUses: input.maxUses, usedCount: 0 });
      return code;
    }
    return decision.action === "reuse" ? decision.code : null;
  };
  const first = issue("f1", "Ada@Example.com");
  assert.match(first, /^WELCOME-[A-Z2-9]{6}$/);
  assert.equal(issue("f1", "ada@example.com "), first, "same email, same form: same code, no second one");
  assert.equal(table.size, 1);
  assert.notEqual(issue("f2", "ada@example.com"), first, "a different form is a different offer");
  assert.notEqual(issue("f1", "bola@example.com"), first);
  assert.equal(table.size, 3);

  // Used or ended: nothing new is made.
  table.get("f1|ada@example.com").usedCount = 1;
  assert.deepEqual(rewards.decideIssue(unique, table.get("f1|ada@example.com")), { action: "spent" });
  assert.deepEqual(rewards.decideIssue(unique, { code: "X", status: "active", expiresAt: new Date(Date.now() - 1000), maxUses: 1, usedCount: 0 }), { action: "spent" });
  assert.deepEqual(rewards.decideIssue(unique, { code: "X", status: "disabled", expiresAt: null, maxUses: 1, usedCount: 0 }), { action: "spent" });
});

test("issuing: shared and existing codes go to everyone; no reward, no code", () => {
  assert.deepEqual(rewards.decideIssue(shared, null), { action: "shared", discountId: "d1" });
  assert.deepEqual(rewards.decideIssue(shared, { code: "WELCOME10", status: "active", expiresAt: null, maxUses: 0, usedCount: 9 }), { action: "shared", discountId: "d1" });
  assert.deepEqual(rewards.decideIssue(existing, null), { action: "shared", discountId: "d9" });
  assert.deepEqual(rewards.decideIssue(null, null), { action: "none" });
  assert.deepEqual(rewards.decideIssue({ ...shared, discountId: null }, null), { action: "none" });
  assert.equal(rewards.sharedCodeFor({ ...shared, code: "" }), "WELCOME10");
  assert.equal(rewards.sharedCodeFor(shared), "WELCOME10");
});

test("codes: easy to read out (no 0/O/1/I/L), prefix cleaned, the right Discount fields", () => {
  for (let i = 0; i < 200; i++) assert.match(rewards.formRewardCode("Welcome!", randomBytes(8)), /^WELCOME-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.match(rewards.formRewardCode("", randomBytes(8)), /^WELCOME-/);
  const now = Date.parse("2026-10-14T10:00:00Z");
  const input = rewards.uniqueDiscountInput(unique, "Welcome pop-up", "WELCOME-ABCDEF", now);
  assert.equal(input.maxUses, 1, "one use");
  assert.equal(input.minOrder, 5000);
  assert.equal(input.status, "active");
  assert.equal(input.expiresAt, new Date(now + 7 * 86_400_000).toISOString());
  assert.equal(rewards.uniqueDiscountInput({ ...unique, days: 0 }, "W", "C").expiresAt, null, "no end date");
  assert.deepEqual(rewards.uniqueCodeMarker("f1", " Ada@Example.com "), { form: { formId: "f1", email: "ada@example.com" } });
});

test("checkout: unique codes end, need the minimum order, work once and only for the email that signed up", () => {
  const now = new Date("2026-10-14T10:00:00Z");
  const input = rewards.uniqueDiscountInput(unique, "Welcome", "WELCOME-ABCDEF", now.getTime());
  const code = { status: input.status, startsAt: null, expiresAt: new Date(input.expiresAt), maxUses: input.maxUses, usedCount: 0, minOrder: input.minOrder };
  assert.equal(redemptionError(code, 8000, now), null);
  assert.match(redemptionError(code, 3000, now), /Minimum order of 5,000/);
  assert.match(redemptionError(code, 8000, new Date(now.getTime() + 8 * 86_400_000)), /expired/);
  assert.match(redemptionError({ ...code, usedCount: 1 }, 8000, now), /already been used/);

  const config = { automatic: false, oncePerCustomer: true, ...rewards.uniqueCodeMarker("f1", "ada@example.com") };
  assert.equal(rewards.lockedEmailError(config, "ADA@example.com "), null);
  assert.match(rewards.lockedEmailError(config, "bola@example.com"), /different email/);
  assert.match(rewards.lockedEmailError(config, ""), /email you signed up with/);
  assert.equal(rewards.lockedEmailError({ form: { formId: "f1", shared: true } }, "anyone@x.com"), null, "a shared code isn't tied to anyone");
  assert.equal(rewards.lockedEmailError({ automatic: false }, null), null);
});

test("wiring: checkout checks the email lock, sign-up issues through the shared lib, saving keeps markers", () => {
  const pricing = read("src/lib/commerce/pricing.server.ts");
  assert.match(pricing, /lockedEmailError\(discount\.config, buyerEmail\)/);
  const subscribe = read("src/app/api/public/store/[slug]/marketing/subscribe/route.ts");
  assert.match(subscribe, /issueFormReward\(store\.id, form, email\)/);
  assert.match(subscribe, /checkRateLimitShared\(rateLimitKey\("mkt-signup", ip\)/, "same limit as the form submit");
  assert.doesNotMatch(subscribe, /db\.coupon\.create/);
  assert.match(subscribe, /discountCode: code/, "the welcome automation gets {{discount_code}}");
  const server = read("src/lib/marketing/popup-rewards.server.ts");
  assert.match(server, /saveDiscount\(/, "codes are made with the same lib as /home/discounts");
  assert.match(server, /path: \["form", "email"\], equals: key/);
  const discounts = read("src/lib/marketing/discounts.ts");
  assert.match(discounts, /OWNED_CONFIG_KEYS = \["game", "form"\]/, "editing a code in Discounts keeps its form/game marker");
  const publicGet = read("src/app/api/public/store/[slug]/marketing/route.ts");
  assert.match(publicGet, /publicRewardSummary/);
  assert.doesNotMatch(read("src/lib/marketing/popup-rewards.server.ts").slice(read("src/lib/marketing/popup-rewards.server.ts").indexOf("export async function publicRewardSummary")), /code:/, "the public summary never includes the code");
});

test("storefront renderer: one renderer for store and editor, accessible", () => {
  const view = read("src/components/storefront/marketing/PopupView.tsx");
  assert.match(view, /event\.key === "Escape"/);
  assert.match(view, /event\.key !== "Tab"/, "focus stays inside a centre or full-screen pop-up");
  assert.match(view, /"aria-labelledby": titleId/);
  assert.match(view, /aria-label="Close"/);
  assert.match(read("src/components/storefront/marketing/MarketingMount.tsx"), /<PopupView/);
  assert.match(read("src/app/home/marketing/forms/PopupDesigner.tsx"), /<PopupView/);
  const form = read("src/components/storefront/marketing/SignupForm.tsx");
  assert.match(form, /rememberWonCode\(storeSlug/, "the code is kept for checkout");
  assert.match(form, /Copy code/);
  assert.match(form, /Use it at checkout/);
  assert.match(form, /Shop now/);
});

test("words: every new editor word exists in all five languages", async () => {
  const langs = ["en", "pcm", "yo", "ha", "ig"];
  const sets = await Promise.all(langs.map(async (lang) => (await import(`../shared/i18n/messages/marketing/${lang}.ts`)).default));
  const needed = ["forms.look", "forms.tpl.festive", "forms.colour.useStore", "forms.overlay", "forms.rewardTitle", "forms.reward.uniqueEach", "forms.reward.emailNote", "forms.gives", "forms.codesUsedWord", "forms.layout.fullscreen", "forms.preview.phone"];
  for (const [i, messages] of sets.entries()) for (const key of needed) assert.ok(messages[key], `${langs[i]} has ${key}`);
  assert.match(sets[0]["forms.reward.emailNote"], /\{token\}/);
});
