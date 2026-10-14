// Website leads: the signature the WordPress site sends, input checks and the CSV export cells.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const leads = await import("../src/lib/website-leads/pure.ts");

test("website leads: signature matches the WordPress side (hex HMAC-SHA256 of timestamp.body)", () => {
  const body = JSON.stringify({ id: "wp-1", kind: "sunday", phone: "08034127790" });
  const ts = "1792000000";
  const sig = createHmac("sha256", "s3cret").update(`${ts}.${body}`).digest("hex");
  const now = 1792000000 * 1000;
  assert.equal(leads.checkLeadSignature("s3cret", ts, sig, body, now), "ok");
  assert.equal(leads.checkLeadSignature("s3cret", ts, sig, body + " ", now), "denied");
  assert.equal(leads.checkLeadSignature("other", ts, sig, body, now), "denied");
  assert.equal(leads.checkLeadSignature("s3cret", ts, sig, body, now + 11 * 60_000), "stale");
  assert.equal(leads.checkLeadSignature("", ts, sig, body, now), "unconfigured");
  assert.equal(leads.checkLeadSignature("s3cret", null, sig, body, now), "denied");
});

test("website leads: input needs a way to reach the person, phones are normalised", () => {
  assert.equal(leads.WebsiteLeadInput.safeParse({ id: "wp-123456", kind: "newsletter" }).success, false);
  const ok = leads.WebsiteLeadInput.safeParse({ id: "wp-123456", kind: "sunday", phone: "0803 412 7790", email: "" });
  assert.equal(ok.success, true);
  assert.equal(ok.data.email, null);
  assert.equal(leads.normalisePhone("0803 412 7790"), "+2348034127790");
  assert.equal(leads.normalisePhone("+234 803 412 7790"), "+2348034127790");
  assert.equal(leads.WebsiteLeadInput.safeParse({ id: "wp-123456", kind: "made-up", email: "a@b.co" }).success, false);
});

test("website leads: CSV cells are quoted and formulas neutralised", () => {
  assert.equal(leads.csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(leads.csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assert.equal(leads.csvCell(null), '""');
});
