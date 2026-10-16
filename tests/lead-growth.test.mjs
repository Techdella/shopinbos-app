// Lead growth (Admin › Lead campaigns) and admin analytics: audience rules, personalisation, opt-out links, UTM tags,
// SMS parts, retention grid and which pages the product trackers may run on.
import test from "node:test";
import assert from "node:assert/strict";

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
