// Pilot testing (Admin › Leads › Pilot testing): reply links, the deadline, the reply form, picking testers by
// earliest reply and the messages each step sends.
import test from "node:test";
import assert from "node:assert/strict";

const pilot = await import("../src/lib/pilot/pure.ts");
const tokens = await import("../src/lib/pilot/tokens.ts");
const sections = await import("../src/lib/admin-team/pure.ts");

test("pilot: reply tokens verify and can't be moved to another applicant", () => {
  const secret = "s3cret";
  const token = tokens.pilotToken("app_1", secret);
  assert.equal(tokens.verifyPilotToken(token, secret), "app_1");
  assert.equal(tokens.verifyPilotToken(token.replace("app_1", "app_2"), secret), null);
  assert.equal(tokens.verifyPilotToken(token, "other"), null);
  assert.equal(tokens.verifyPilotToken(`${token}.x`, secret), null);
  assert.equal(tokens.verifyPilotToken("junk", secret), null);
  assert.equal(tokens.pilotReplyUrl("https://app.shopinbos.com/", "app_1", secret), `https://app.shopinbos.com/pilot/${token}`);
});

test("pilot: closed by hand or once the deadline passes", () => {
  const closesAt = new Date("2026-11-06T22:59:00Z");
  assert.equal(pilot.pilotIsClosed({ status: "open", closesAt }, new Date("2026-11-06T22:00:00Z")), false);
  assert.equal(pilot.pilotIsClosed({ status: "open", closesAt }, new Date("2026-11-06T22:59:00Z")), true);
  assert.equal(pilot.pilotIsClosed({ status: "closed", closesAt }, new Date("2026-11-01T00:00:00Z")), true);
});

test("pilot: the reply form needs an email, a city, a device and the time they can give", () => {
  const good = { name: "Ada", email: " Ada@Example.com ", city: "Lagos", devices: ["android"], availability: "1h" };
  const parsed = pilot.PilotReply.parse(good);
  assert.equal(parsed.email, "ada@example.com");
  assert.equal(parsed.phone, null);
  assert.equal(pilot.PilotReply.safeParse({ ...good, email: "nope" }).success, false);
  assert.equal(pilot.PilotReply.safeParse({ ...good, devices: [] }).success, false);
  assert.equal(pilot.PilotReply.safeParse({ ...good, devices: ["tablet"] }).success, false);
  assert.equal(pilot.PilotReply.safeParse({ ...good, availability: undefined }).success, false);
});

test("pilot: auto-pick fills each role up to its target with the earliest replies, counting those already selected", () => {
  const at = (h) => new Date(Date.UTC(2026, 10, 1, h));
  const applicants = [
    { id: "s1", role: "seller", status: "applied", appliedAt: at(5) },
    { id: "s2", role: "seller", status: "applied", appliedAt: at(1) },
    { id: "s3", role: "seller", status: "selected", appliedAt: at(9) },
    { id: "s4", role: "seller", status: "applied", appliedAt: at(3) },
    { id: "s5", role: "seller", status: "invited", appliedAt: null },
    { id: "u1", role: "supplier", status: "applied", appliedAt: at(2) },
    { id: "u2", role: "supplier", status: "declined", appliedAt: at(1) },
    { id: "d1", role: "delivery", status: "applied", appliedAt: at(1) },
  ];
  assert.deepEqual(pilot.autoPick(applicants, { seller: 3, supplier: 5, delivery: 0 }), ["s2", "s4", "u1"]);
  assert.deepEqual(pilot.autoPick(applicants, { seller: 1, supplier: 0, delivery: 0 }), []);
});

test("pilot: invitations carry the link and the deadline; SMS stays short", () => {
  const closesAt = new Date("2026-11-06T22:59:00Z");
  const link = "https://app.shopinbos.com/pilot/abc.def";
  const email = pilot.inviteMessage({ role: "supplier", firstName: "Ada", closesAt, link, channel: "email" });
  assert.match(email.body, /^Hi Ada,/);
  assert.match(email.body, /supplier/);
  assert.match(email.body, /6 November/);
  assert.ok(!email.body.includes(link), "email puts the link on the button");
  const sms = pilot.inviteMessage({ role: "seller", firstName: "", closesAt, link, channel: "sms" });
  assert.match(sms.body, /^Hi there,/);
  assert.ok(sms.body.endsWith(link));
  assert.ok(sms.body.length <= 306, `SMS is ${sms.body.length} characters`);
  assert.ok(pilot.inviteMessage({ role: "delivery", firstName: "Bo", closesAt, link, channel: "whatsapp" }).body.includes(link));
  assert.ok(pilot.reminderMessage({ firstName: "Bo", closesAt, link, channel: "sms" }).body.includes(link));
});

test("pilot: testers get their role's checklist; the admin page is in the leads section", () => {
  const message = pilot.selectedMessage({ role: "delivery", firstName: "Bo", hasAccount: true });
  assert.equal(message.ctaLabel, "Sign in to Shopinbos");
  assert.deepEqual(message.checklist, pilot.PILOT_CHECKLIST.delivery);
  assert.equal(pilot.selectedMessage({ role: "seller", firstName: "", hasAccount: false }).ctaLabel, "Create your account");
  assert.equal(sections.sectionForPath("/admin/pilot/abc"), "leads");
  assert.equal(sections.sectionForPath("/api/admin/pilot/export"), "leads");
  assert.equal(sections.adminCanOpen("growth", "/admin/pilot"), true);
  assert.equal(sections.adminCanOpen("finance", "/admin/pilot"), false);
});
