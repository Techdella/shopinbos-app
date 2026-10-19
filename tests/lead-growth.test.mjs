// Lead growth (Admin › Lead campaigns) and admin analytics: audience rules, personalisation, opt-out links, UTM tags,
// SMS parts, retention grid and which pages the product trackers may run on.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const growth = await import("../src/lib/lead-growth/pure.ts");
const tokens = await import("../src/lib/lead-growth/tokens.ts");
const analytics = await import("../src/lib/platform-analytics/pure.ts");
const config = await import("../src/lib/platform-analytics/config.ts");

test("lead growth: personalise fills names and the sign-up link, never 'Hi ,'", () => {
  const link = "https://app.shopinbos.com/signup";
  assert.equal(growth.personalise("Hi {{first_name}}, go: {{signup_link}}", { name: "ada okafor", signupLink: link }), `Hi Ada, go: ${link}`);
  assert.equal(growth.personalise("Hi {{ first_name }}", { name: null, signupLink: link }), "Hi there");
  assert.equal(growth.personalise("Hi {{name}} {{unknown}}", { name: "Ada Okafor", signupLink: link }), "Hi Ada Okafor {{unknown}}");
});

test("lead growth: an address per channel, never for an opted-out channel", () => {
  const lead = { email: "a@b.co", phone: "+2348034127790", optedOut: ["sms"] };
  assert.equal(growth.leadAddress(lead, "email"), "a@b.co");
  assert.equal(growth.leadAddress(lead, "sms"), null);
  assert.equal(growth.leadAddress(lead, "whatsapp"), "+2348034127790");
  assert.equal(growth.leadAddress({ email: null, phone: "123", optedOut: [] }, "whatsapp"), null);
});

test("lead growth: opt-out tokens verify, and can't be moved to another lead or channel", () => {
  const secret = "s3cret";
  const token = tokens.leadOptOutToken("lead_1", "email", secret);
  assert.deepEqual(tokens.verifyLeadOptOutToken(token, secret), { leadId: "lead_1", channel: "email" });
  assert.equal(tokens.verifyLeadOptOutToken(token.replace("lead_1", "lead_2"), secret), null);
  assert.equal(tokens.verifyLeadOptOutToken(token.replace(".email.", ".sms."), secret), null);
  assert.equal(tokens.verifyLeadOptOutToken(token, "other"), null);
  assert.equal(tokens.verifyLeadOptOutToken("junk", secret), null);
});

test("lead growth: UTM tags are added without overwriting, sign-up link is tagged", () => {
  const url = new URL(growth.withUtm("https://shopinbos.com/pricing?utm_source=x", { source: "shopinbos_leads", medium: "email", campaign: "c" }));
  assert.equal(url.searchParams.get("utm_source"), "x");
  assert.equal(url.searchParams.get("utm_medium"), "email");
  assert.equal(growth.withUtm("mailto:a@b.co", { source: "s", medium: "m", campaign: "c" }), "mailto:a@b.co");
  const signup = new URL(growth.signupLink("https://app.shopinbos.com/", { channel: "sms", campaign: "Lagos Sellers – June!" }));
  assert.equal(signup.pathname, "/signup");
  assert.equal(signup.searchParams.get("utm_campaign"), "lagos-sellers-june");
});

test("lead growth: SMS parts and message checks", () => {
  assert.equal(growth.smsParts("a".repeat(160)), 1);
  assert.equal(growth.smsParts("a".repeat(161)), 2);
  assert.equal(growth.smsParts("👋".repeat(40)), 2);
  assert.equal(growth.LeadMessageContent.safeParse({ channel: "email", body: "Hi" }).success, false);
  assert.equal(growth.LeadMessageContent.safeParse({ channel: "sms", body: "Hi" }).success, true);
  assert.equal(growth.LeadStep.safeParse({ channel: "whatsapp", body: "Hi", waTemplate: "Bad Name", delayHours: 0 }).success, false);
  assert.deepEqual(growth.readAudience(null).statuses, ["new", "contacted"]);
  assert.equal(growth.readAudience(null).consentOnly, true);
});

test("analytics: retention grid is a triangle of shares", () => {
  const grid = analytics.retentionGrid(
    [{ week: "2026-10-05", size: 10 }, { week: "2026-09-28", size: 4 }],
    [{ week: "2026-09-28", k: 0, n: 4 }, { week: "2026-09-28", k: 1, n: 2 }, { week: "2026-10-05", k: 0, n: 5 }],
    3,
    "2026-10-08",
  );
  assert.equal(grid[0].week, "2026-09-28");
  assert.deepEqual(grid[0].weeks, [1, 0.5, null]);
  assert.deepEqual(grid[1].weeks, [0.5, null, null]);
  assert.deepEqual(analytics.fillDays([{ date: "2026-10-02", value: 3 }], "2026-10-01", "2026-10-03").map((p) => p.value), [0, 3, 0]);
  assert.equal(analytics.weekStart(new Date("2026-10-08T12:00:00Z")), "2026-10-05");
  assert.equal(analytics.change(15, 10), 50);
  assert.equal(analytics.change(5, 0), null);
});

test("analytics: product trackers never run on storefronts or other hosts", () => {
  assert.equal(config.isTrackedPath("/home/orders"), true);
  assert.equal(config.isTrackedPath("/signup"), true);
  assert.equal(config.isTrackedPath("/store/ada"), false);
  assert.equal(config.isTrackedPath("/s/ada"), false);
  assert.equal(config.isTrackedPath("/admin/leads"), false);
  assert.equal(config.isAppHost("app.shopinbos.com", "https://app.shopinbos.com"), true);
  assert.equal(config.isAppHost("adas-shop.com", "https://app.shopinbos.com"), false);
  const status = config.providerStatuses({ NEXT_PUBLIC_POSTHOG_KEY: "phc_x" }).find((s) => s.provider === "posthog");
  assert.equal(status.tracking, true);
  assert.equal(status.reporting, false);
  assert.deepEqual(status.missing, ["POSTHOG_PROJECT_ID", "POSTHOG_PERSONAL_API_KEY"]);
});

test("lead growth: dated steps go out on their date and are skipped once stale", () => {
  const dated = growth.LeadStep.parse({ channel: "email", subject: "Hi", body: "x", at: "2026-10-22T09:00:00+01:00" });
  assert.equal(dated.delayHours, 0);
  const from = new Date("2026-10-30T10:00:00Z");
  assert.equal(growth.stepDueAt(dated, from).toISOString(), "2026-10-22T08:00:00.000Z");
  assert.equal(growth.stepIsStale(dated, new Date("2026-10-23T08:00:00Z")), false);
  assert.equal(growth.stepIsStale(dated, new Date("2026-10-23T21:00:00Z")), true);
  const catchUp = growth.LeadStep.parse({ ...dated, skipAfter: "2026-11-30T00:00:00Z" });
  assert.equal(growth.stepIsStale(catchUp, new Date("2026-10-30T10:00:00Z")), false);
  const wait = growth.LeadStep.parse({ channel: "email", subject: "Hi", body: "x", delayHours: 48 });
  assert.equal(growth.stepDueAt(wait, from).toISOString(), "2026-11-01T10:00:00.000Z");
  assert.equal(growth.stepIsStale(wait, new Date("2030-01-01")), false);
  const welcome = growth.LeadStep.parse({ channel: "email", subject: "Hi", body: "x", skipAfter: "2026-10-22T09:00:00+01:00" });
  assert.equal(growth.stepIsStale(welcome, new Date("2026-10-22T09:00:00Z")), true);
  assert.equal(growth.LeadStep.safeParse({ channel: "email", subject: "Hi", body: "x", at: "next tuesday" }).success, false);
});

test("lead growth: roles come from the waitlist's 'as', everything else is a seller", () => {
  assert.equal(growth.leadRoleFrom("supplier"), "supplier");
  assert.equal(growth.leadRoleFrom("delivery"), "delivery");
  assert.equal(growth.leadRoleFrom(undefined), "seller");
  assert.equal(growth.leadRoleFrom("admin"), "seller");
  assert.deepEqual(growth.readAudience({ roles: ["supplier"] }).roles, ["supplier"]);
  assert.deepEqual(growth.readAudience({}).roles, []);
});

// Walks a sequence the way runDueSteps does (cron every 10 minutes) and returns what a lead would get.
function walk(steps, joinedAt, until = new Date("2027-01-31T00:00:00Z")) {
  const got = [];
  let index = 0;
  let nextAt = growth.stepDueAt(steps[0], joinedAt);
  for (let t = joinedAt.getTime(); t < until.getTime() && index < steps.length; t += 10 * 60_000) {
    const now = new Date(t);
    if (nextAt > now) continue;
    const step = steps[index];
    index += 1;
    if (steps[index]) nextAt = growth.stepDueAt(steps[index], now);
    if (!growth.stepIsStale(step, now)) got.push({ subject: step.subject, at: now.toISOString().slice(0, 16) });
  }
  return got;
}

test("launch sequences: every step is valid and late joiners only get what's still true", async () => {
  const { LAUNCH_AUTOMATIONS, WIN_CAMPAIGNS } = await import("../src/lib/lead-growth/launch-sequences.ts");
  for (const automation of LAUNCH_AUTOMATIONS) {
    assert.equal(automation.audience.roles.length, 1, automation.name);
    for (const step of automation.steps) assert.equal(growth.LeadStep.safeParse(step).success, true, `${automation.name}: ${step.subject}`);
  }
  for (const campaign of WIN_CAMPAIGNS) assert.equal(growth.LeadMessageContent.safeParse(campaign.content).success, true, campaign.name);

  const [sellers, suppliers, delivery] = LAUNCH_AUTOMATIONS.map((a) => a.steps);
  // A seller who joins today gets the whole countdown, then launch day, then one nudge.
  const early = walk(sellers, new Date("2026-10-16T15:00:00Z"));
  assert.equal(early.length, 7);
  assert.equal(early[5].at, "2026-11-01T08:00");
  // A seller who joins on 30 October skips the old updates; one who joins after launch gets "we're live" first.
  assert.deepEqual(walk(sellers, new Date("2026-10-30T10:00:00Z")).map((m) => m.subject.slice(0, 20)), ["You're in, {{first_n", "Tomorrow we open the", "Shopinbos is live. C", "{{first_name}}, your"]);
  const late = walk(sellers, new Date("2026-11-10T10:00:00Z"));
  assert.equal(late[0].subject, "Shopinbos is live. Create your store now");
  assert.equal(late.length, 2);
  // Suppliers and delivery partners get the sign-up link on 22 October, or straight away if they join later.
  for (const steps of [suppliers, delivery]) {
    const open = steps.find((s) => s.at === "2026-10-22T09:00:00+01:00");
    assert.match(open.ctaUrl, /\/(supplier|logistics)\/signup$/);
    const before = walk(steps, new Date("2026-10-16T15:00:00Z"));
    assert.ok(before.some((m) => m.subject === open.subject && m.at === "2026-10-22T08:00"));
    const after = walk(steps, new Date("2026-10-27T15:00:00Z"));
    assert.equal(after[0].subject, open.subject);
    assert.ok(!after.some((m) => /opens on 22 October/.test(m.subject)));
  }
  // Nothing tells sellers to sign up before launch.
  for (const step of sellers) if (step.at && Date.parse(step.at) < Date.parse("2026-11-01T08:00:00Z")) assert.ok(!/signup/.test(step.ctaUrl), step.subject);
  assert.ok(!/signup/.test(sellers[0].ctaUrl));
});

test("whatsapp: launch templates follow Meta's rules and every sequence step uses one", async () => {
  const wa = await import("../src/lib/lead-growth/whatsapp-content.ts");
  const names = new Set();
  for (const t of wa.WHATSAPP_TEMPLATES) {
    assert.match(t.name, /^[a-z0-9_]{1,512}$/, t.name);
    assert.ok(!names.has(t.name), `duplicate ${t.name}`);
    names.add(t.name);
    assert.ok(t.body.length <= 1024, `${t.name} body too long`);
    assert.ok(t.body.includes("{{1}}") && t.body.includes("{{2}}"), `${t.name} needs {{1}} and {{2}}`);
    assert.ok(!/^\s*\{\{/.test(t.body) && !/\}\}\s*[.!?]?\s*$/.test(t.body), `${t.name}: a variable can't start or end the text`);
    assert.ok(t.button.text.length <= 25, `${t.name} button text over 25 characters`);
    assert.match(t.button.url, /^https:\/\//);
    const payload = wa.metaTemplatePayload(t);
    assert.equal(payload.components[0].example.body_text[0].length, 2);
  }
  for (const automation of wa.WHATSAPP_AUTOMATIONS) {
    assert.equal(automation.audience.roles.length, 1);
    for (const step of automation.steps) {
      assert.equal(growth.LeadStep.safeParse(step).success, true, `${automation.name}: ${step.waTemplate}`);
      const template = wa.whatsappTemplate(step.waTemplate);
      assert.ok(template, `${step.waTemplate} isn't a launch template`);
      assert.equal(template.role, automation.audience.roles[0], `${step.waTemplate} is for another role`);
    }
  }
  // A supplier who joins after registration opened gets "registration is open" first, never the stale welcome.
  const suppliers = wa.WHATSAPP_AUTOMATIONS.find((a) => a.audience.roles[0] === "supplier").steps;
  // walk() reports subjects; WhatsApp steps have none, so walk them by template name.
  const byTemplate = suppliers.map((s) => ({ ...s, subject: s.waTemplate }));
  assert.deepEqual(walk(byTemplate, new Date("2026-10-27T15:00:00Z")).map((m) => m.subject), ["sib_supplier_registration_open", "sib_supplier_finish", "sib_supplier_live"]);
  assert.deepEqual(walk(byTemplate, new Date("2026-10-17T15:00:00Z")).map((m) => m.subject), ["sib_supplier_welcome", "sib_supplier_registration_open", "sib_supplier_finish", "sib_supplier_live"]);
  assert.equal(wa.templatesUsed(suppliers).length, 4);
});

test("seller value moments reach Shopinbos's analytics from the server, after the response, against the seller's id", () => {
  const src = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const events = src("src/lib/platform-analytics/seller-events.server.ts");
  assert.match(events, /after\(job\)/, "never slows the seller down");
  assert.match(events, /select: \{ supabaseId: true \}/, "the same id the browser identifies people with");
  assert.match(events, /event: "store_published"/);
  assert.match(events, /event: "product_added"/);
  assert.match(events, /event: "first_order_received",\s*insertId: `fo-\$\{order\.storeId\}`/, "counted once per store");
  assert.doesNotMatch(events, /email|phone|buyerName/, "no personal data in events");
  assert.match(src("src/lib/store-publishing.ts"), /trackStorePublished\(store\.id, store\.onboardingState !== "LIVE"\);/);
  assert.match(src("src/lib/commerce/order-paid.server.ts"), /trackFirstOrderIfFirst\(orderId\);/);
  assert.match(src("src/app/api/public/store/[slug]/checkout/route.ts"), /if \(paymentMethod === "pay_on_delivery"\) trackFirstOrderIfFirst\(order\.id\);/);
  for (const file of ["src/app/actions/workspace.ts", "src/app/actions/sourcing.ts", "src/app/api/app/store-products/route.ts", "src/app/api/app/store-products/add-from-supplier/route.ts", "src/app/api/app/dropship/start/route.ts", "src/app/api/store/products/route.ts", "src/app/api/mobile/marketplace/route.ts"]) {
    assert.match(src(file), /trackProductAdded\(\{ userId: user\.id, source: /, file);
  }
  assert.match(src("src/app/api/products/import/route.ts"), /if \(imported\) trackProductAdded\(\{ userId: user\.id, source: "csv_import", count: imported \}\);/, "one event per import, not per row");
  assert.match(src("src/lib/lead-growth/service.server.ts"), /event: "sign_up_completed"/);
});
