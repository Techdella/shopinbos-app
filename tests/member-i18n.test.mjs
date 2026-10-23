// Member emails, WhatsApp tips and templates in each person's app language (English, Pidgin, Yorùbá, Hausa, Igbo).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { TIPS } = await import("../src/lib/member-messaging/tips-library.ts");
const i18n = await import("../src/lib/member-messaging/i18n/index.ts");
const wa = await import("../src/lib/member-messaging/whatsapp-templates.ts");
const tipsEmail = await import("../src/lib/member-messaging/tips-email.ts");
const journeys = await import("../src/lib/member-messaging/journeys.ts");
const words = await import("../src/lib/referrals/words.ts");
const referrals = await import("../shared/referrals.ts");
const { PROVERBS } = await import("../shared/proverbs.ts");
const { seasonFor } = await import("../shared/seasons.ts");
const { LOYALTY_TIERS } = await import("../shared/loyalty.ts");
const { platformEmail } = await import("../src/lib/email/shell.ts");
const mailEn = (await import("../shared/i18n/messages/mail/en.ts")).default;
const read = (path) => fs.readFileSync(path, "utf8");
const OTHERS = ["pcm", "yo", "ha", "ig"];
const vars = (body) => [...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))].sort();

test("every tip is translated in every language, with the same shape and within the limits", () => {
  for (const locale of OTHERS) {
    const { tips } = i18n.MEMBER_TRANSLATIONS[locale];
    assert.deepEqual(Object.keys(tips).sort(), TIPS.map((tip) => tip.id).sort(), `${locale}: every tip, nothing extra`);
    for (const tip of TIPS) {
      const text = tips[tip.id];
      const where = `${locale}/${tip.id}`;
      assert.equal(text.points.length, tip.points.length, `${where}: same number of points`);
      assert.equal(Boolean(text.example), Boolean(tip.example), `${where}: example only when English has one`);
      assert.ok(text.subject.length <= 70 && text.preheader.length <= 100 && text.title.length <= 80, `${where}: heading lengths`);
      assert.ok(text.cta.length > 0 && text.cta.length <= 25, `${where}: button label`);
      for (const point of text.points) assert.ok(point.length > 0 && point.length <= 220, `${where}: point length`);
      assert.ok(text.whatsapp.length <= 300 && !/\n|https?:\/\//.test(text.whatsapp), `${where}: WhatsApp line`);
      for (const value of [text.subject, text.title, text.intro, text.whatsapp, ...text.points]) assert.notEqual(value.trim(), "", where);
      const shown = i18n.localizedTip(tip, locale);
      assert.equal(shown.id, tip.id);
      assert.equal(shown.cta.path, tip.cta.path, `${where}: same page`);
    }
  }
});

test("WhatsApp templates: each language keeps Meta's rules and the English variables", () => {
  const english = wa.MEMBER_TEMPLATES.filter((t) => t.locale === "en");
  assert.equal(english.length, 11);
  for (const locale of OTHERS) {
    for (const base of english) {
      const text = i18n.templateText(base.name, locale);
      assert.ok(text, `${locale}/${base.name} translated`);
      const translated = wa.memberTemplate(`${base.name}_${locale}`);
      assert.ok(translated, `${base.name}_${locale} is in the list`);
      assert.equal(translated.language, locale === "ha" ? "ha" : "en");
      assert.deepEqual(vars(translated.body), vars(base.body), `${base.name}_${locale}: same variables`);
      assert.equal(translated.examples.length, wa.templateVariableCount(translated.body), `${base.name}_${locale}: a sample per variable`);
      assert.ok(!/^\s*\{\{\d+\}\}|\{\{\d+\}\}[\s.!?🎉🤝🛍️🚚🎁👋💡]*$/u.test(translated.body), `${base.name}_${locale}: no variable at the start or end`);
      assert.ok(!/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(translated.body), `${base.name}_${locale}: no two variables side by side`);
      assert.ok(translated.button.text.length <= 25, `${base.name}_${locale}: button`);
      assert.equal(translated.button.url, base.button.url);
      if (/STOP/.test(base.body)) assert.match(translated.body, /STOP/, `${base.name}_${locale}: STOP still works`);
    }
  }
});

test("the template sent: their language once approved, else English (and the words follow it)", () => {
  assert.deepEqual(wa.memberTemplateFor("shopinbos_tip_seller", "yo", new Set(["shopinbos_tip_seller"])).locale, "en");
  const picked = wa.memberTemplateFor("shopinbos_tip_seller", "yo", new Set(["shopinbos_tip_seller", "shopinbos_tip_seller_yo"]));
  assert.equal(picked.locale, "yo");
  assert.equal(picked.template.name, "shopinbos_tip_seller_yo");
  assert.equal(wa.memberTemplateFor("shopinbos_tip_seller", "en", new Set()).template.name, "shopinbos_tip_seller");
  assert.equal(i18n.memberLocale({ language: "ig" }), "ig");
  assert.equal(i18n.memberLocale({ language: "fr" }), "en");
  assert.equal(i18n.memberLocale(null), "en");
});

test("the tip email and journeys come out in the reader's language", () => {
  const tip = TIPS[0];
  for (const locale of OTHERS) {
    const email = tipsEmail.renderTipEmail(tip, { firstName: "Ada", ctaUrl: "https://app.shopinbos.com/tip/x", products: [{ name: "Ankara", price: 5000, image: null, url: "https://x", shops: 3 }], locale });
    const text = i18n.MEMBER_TRANSLATIONS[locale].tips[tip.id];
    assert.equal(email.subject, text.subject);
    assert.equal(email.cta.label, text.cta);
    assert.ok(!email.bodyHtml.includes("How's business this week?"), `${locale}: wrapper translated`);
    assert.ok(!/\{[a-z]+\}/.test(email.bodyHtml + email.eyebrow), `${locale}: no unfilled placeholders`);
    for (const [key, stage, role] of [["setup_help", "d3", "supplier"], ["winback", "d7", "seller"], ["winback", "d14", "seller"], ["winback", "d30", "logistics_partner"], ["first_win", "once", "supplier"], ["credits_low", "month", "seller"]]) {
      const en = journeys.journeyMessage(key, stage, role, { firstName: "Ada", nextStep: { id: "pickup", label: "Pickup address", hint: "Where riders collect", href: "/supplier/delivery" }, done: 2, total: 6, giftCredits: 50, creditsLeft: 4 });
      const msg = journeys.journeyMessage(key, stage, role, { firstName: "Ada", nextStep: { id: "pickup", label: "Pickup address", hint: "Where riders collect", href: "/supplier/delivery" }, done: 2, total: 6, giftCredits: 50, creditsLeft: 4 }, locale);
      assert.notEqual(msg.subject, en.subject, `${locale}/${key}/${stage}: subject translated`);
      assert.equal(msg.cta.path, en.cta.path);
      assert.ok(!/\{[a-z]+[,}]/.test(JSON.stringify(msg)), `${locale}/${key}/${stage}: no unfilled placeholders`);
    }
  }
  // English stays as it was.
  const en = journeys.journeyMessage("winback", "d14", "seller", { firstName: "Ada", giftCredits: 50 });
  assert.equal(en.subject, "A gift to welcome you back: 50 AI credits");
  assert.equal(journeys.journeyLook("winback", "d14", en, "Ada", { giftCredits: 50 }).stats[0].value, "50");
  assert.equal(journeys.setupStepText("supplier", { id: "pickup", label: "Pickup address", hint: "x" }).label, "adding your pickup address");
  assert.equal(journeys.setupStepText("supplier", { id: "unknown", label: "Something New", hint: "x" }).label, "something new");
});

test("the email frame speaks the reader's language; English is unchanged", () => {
  const base = { appUrl: "https://app.shopinbos.com", kind: "marketing", heading: "Hi", bodyHtml: "<p>x</p>", reason: "you have a Shopinbos seller account", legal: { name: "Shopinbos", address: "Lagos" }, unsubscribeUrl: "https://x/u", preferencesUrl: "https://x/p", persona: "peggy", proverb: "p" };
  const english = platformEmail(base);
  assert.match(english, />Unsubscribe</);
  assert.match(english, /Proverb of the week/);
  assert.match(english, /You're receiving this because you have a Shopinbos seller account\./);
  for (const locale of OTHERS) {
    const t = i18n.mailT(locale);
    const html = platformEmail({ ...base, locale, reason: t("reason.seller") });
    assert.ok(html.includes(`>${t("foot.unsubscribe")}<`), `${locale}: unsubscribe`);
    assert.ok(!html.includes("Proverb of the week"), `${locale}: proverb title`);
    assert.ok(!html.includes("You're receiving this because"), `${locale}: reason line`);
  }
});

test("mail catalog: proverbs, seasons, tiers and setup steps all have words; Refer & earn English matches", () => {
  PROVERBS.forEach((proverb, index) => assert.equal(mailEn[`proverb.${index}`], proverb));
  assert.equal(mailEn[`proverb.${PROVERBS.length}`], undefined);
  for (let day = 0; day < 366; day += 3) {
    const season = seasonFor(new Date(Date.UTC(2026, 0, 1) + day * 86_400_000));
    if (season.greeting) assert.equal(mailEn[`season.${season.key}`], season.greeting);
  }
  for (const tier of LOYALTY_TIERS) assert.equal(mailEn[`tier.${tier.key}`], tier.name);
  const steps = read("src/lib/onboarding/setup-status.server.ts");
  for (const role of ["supplier", "logistics_partner"]) {
    const block = steps.split(role === "supplier" ? /supplier\.findUnique|s\.businessName/ : /p\.companyName/)[1] ?? "";
    for (const id of [...block.matchAll(/\{ id: "(\w+)"/g)].map((m) => m[1]).slice(0, 7)) {
      assert.ok(mailEn[`step.${role}.${id}`] || role === "supplier", `step.${role}.${id}`);
    }
  }
  for (const role of ["seller", "supplier", "logistics_partner"]) {
    assert.equal(words.welcomeTextIn("en", role), referrals.welcomeText(role));
    assert.equal(words.ruleIn("en", role), referrals.REFERRAL_OFFERS[role].rule.charAt(0).toLowerCase() + referrals.REFERRAL_OFFERS[role].rule.slice(1));
  }
  assert.equal(words.rewardTextIn("en", { months: 3, credits: 0 }), referrals.rewardText({ months: 3, credits: 0 }));
  assert.equal(words.rewardTextIn("en", { months: 1, credits: 500 }), referrals.rewardText({ months: 1, credits: 500 }));
  assert.equal(words.referrerRewardIn("en", "supplier"), "3 months free or 500 AI credits");
});

test("every member sender reads the person's language and passes it on", () => {
  const tips = read("src/lib/member-messaging/tips.server.ts");
  assert.match(tips, /const locale = memberLocale\(person\.preferences\)/);
  assert.match(tips, /u\."preferences"/);
  assert.match(tips, /memberTemplateFor\(WA_TEMPLATE\[role\], locale/);
  const journeysServer = read("src/lib/member-messaging/journeys.server.ts");
  assert.match(journeysServer, /preferences: true/);
  assert.match(journeysServer, /journeyMessage\(key, stage, role, vars, locale\)/);
  assert.match(journeysServer, /params: whatsapp\.params\(picked\.locale\)/);
  assert.match(read("src/lib/member-messaging/announce.server.ts"), /emailFor\(role, firstName, link, locale\)/);
  assert.match(read("src/lib/member-messaging/loyalty.server.ts"), /mailT\(memberLocale\(/);
  const service = read("src/lib/referrals/service.server.ts");
  assert.equal((service.match(/locale(: \w+Locale)?,\n/g) ?? []).length >= 4, true, "referral notices pass their locale");
  assert.match(read("src/lib/notifications/notify.server.ts"), /locale: input\.locale/);
});
