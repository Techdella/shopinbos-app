// Admin team roles (Admin › Team) and WhatsApp in the admin inbox: which role opens which page, the 24-hour reply
// window, the team's templates and phone numbers.
import test from "node:test";
import assert from "node:assert/strict";

const team = await import("../src/lib/admin-team/pure.ts");
const wa = await import("../src/lib/support/whatsapp-pure.ts");
const nav = await import("../src/lib/nav.ts");

test("admin team: admins from before roles are owners; disabled opens nothing", () => {
  assert.equal(team.asAdminRole(null), "owner");
  assert.equal(team.asAdminRole("nonsense"), "owner");
  assert.equal(team.asAdminRole("support"), "support");
  assert.deepEqual(team.adminSections("disabled"), []);
  assert.equal(team.adminCanOpen("disabled", "/admin/dashboard"), false);
  assert.equal(team.adminCanOpen("disabled", "/admin/login"), true);
});

test("admin team: each role opens its own pages and API routes only", () => {
  assert.equal(team.adminCanOpen("support", "/admin/support/1042"), true);
  assert.equal(team.adminCanOpen("support", "/api/admin/support/tickets"), true);
  assert.equal(team.adminCanOpen("support", "/admin/leads"), true);
  assert.equal(team.adminCanOpen("support", "/admin/wallets"), false);
  assert.equal(team.adminCanOpen("support", "/admin/pricing/plans"), false);
  assert.equal(team.adminCanOpen("support", "/admin/team"), false);
  assert.equal(team.adminCanOpen("finance", "/admin/wallets"), true);
  assert.equal(team.adminCanOpen("finance", "/admin/support"), false);
  assert.equal(team.adminCanOpen("operations", "/api/admin/suppliers/abc"), true);
  assert.equal(team.adminCanOpen("growth", "/admin/lead-campaigns/whatsapp"), true);
  assert.equal(team.adminCanOpen("growth", "/admin/money-owed"), false);
  // Everyone has their own settings; only owners have the team.
  for (const role of team.ADMIN_ROLES) assert.equal(team.adminCanOpen(role, "/admin/settings"), true, role);
  assert.equal(team.adminCanOpen("admin", "/admin/team"), false);
  assert.equal(team.adminCanOpen("owner", "/admin/team"), true);
  // Pages nobody mapped yet are for owners and admins only.
  assert.equal(team.adminCanOpen("support", "/admin/something-new"), false);
  assert.equal(team.adminCanOpen("admin", "/admin/something-new"), true);
  // Not admin paths at all.
  assert.equal(team.sectionForPath("/home"), null);
  assert.equal(team.sectionForPath("/administrator"), null);
});

test("admin team: every role can open its home, so a refused page never loops", () => {
  for (const role of team.ADMIN_ROLES) assert.equal(team.adminCanOpen(role, team.adminHome(role)), true, role);
});

test("admin team: the sidebar shows a role only what it can open", () => {
  assert.equal(team.adminNavIds("owner"), null);
  const ids = new Set(nav.NAV_BY_ROLE.admin.flatMap((group) => group.items.map((item) => item.id)));
  for (const role of team.ADMIN_ROLES.filter((r) => r !== "owner")) {
    for (const id of team.adminNavIds(role)) {
      const item = nav.NAV_BY_ROLE.admin.flatMap((g) => g.items).find((i) => i.id === id);
      if (!item) continue;
      assert.equal(team.adminCanOpen(role, item.href), true, `${role} sees ${id} but can't open ${item.href}`);
    }
  }
  assert.ok(ids.has("team"));
  assert.ok(!team.adminNavIds("support").includes("wallets"));
  assert.ok(team.adminNavIds("support").includes("support"));
});

test("inbox whatsapp: the 24-hour window", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.equal(wa.whatsappWindowOpen(null, now), false);
  assert.equal(wa.whatsappWindowOpen("2026-11-01T12:30:00Z", now), true);
  assert.equal(wa.whatsappWindowOpen("2026-11-01T11:59:00Z", now), false);
  assert.equal(wa.whatsappWindowHoursLeft("2026-11-02T10:00:00Z", now), 22);
  assert.equal(wa.whatsappWindowHoursLeft("2026-10-30T10:00:00Z", now), 0);
});

test("inbox whatsapp: phone numbers become +<digits>", () => {
  assert.equal(wa.whatsappPhone("+234 803 412 7790"), "+2348034127790");
  assert.equal(wa.whatsappPhone("2348034127790"), "+2348034127790");
  assert.equal(wa.whatsappPhone("08034127790"), "+2348034127790");
  assert.equal(wa.whatsappPhone("+1 (711) 695-1381"), "+17116951381");
  assert.equal(wa.whatsappPhone("12"), null);
  assert.equal(wa.whatsappPhone(""), null);
});

test("inbox whatsapp: team templates fill in, stay on one line and pass Meta's rules", () => {
  const followup = wa.teamTemplate("shopinbos_team_followup");
  assert.ok(followup);
  const values = { name: "ada okafor", agent: "Tolu Bello", note: "Your account is approved.\n\nAdd products   now." };
  assert.deepEqual(wa.teamTemplateParams(followup, values), ["ada", "Tolu", "Your account is approved. Add products now."]);
  assert.match(wa.renderTeamTemplate(followup, values), /^Hi ada, it's Tolu from the Shopinbos team\. Your account is approved\. Add products now\./);
  assert.equal(wa.teamTemplateProblem(followup, { name: null, agent: "Tolu", note: "  " }), "Write the message to send.");
  assert.equal(wa.teamTemplateParams(followup, { name: null, agent: "", note: "x" })[0], "there");
  for (const template of wa.TEAM_TEMPLATES) {
    assert.match(template.name, /^[a-z0-9_]+$/);
    assert.ok(!/^\s*\{\{/.test(template.body) && !/\}\}\s*[.!]?\s*$/.test(template.body), `${template.name}: no variable at the start or end`);
    const count = (template.body.match(/\{\{\d+\}\}/g) ?? []).length;
    assert.equal(count, template.params.length, template.name);
    assert.equal(template.sample.length, template.params.length, template.name);
    const payload = wa.metaTeamTemplatePayload(template);
    assert.equal(payload.components[0].type, "BODY");
    assert.equal(payload.components[0].example.body_text[0].length, count);
    assert.ok(!/chip/i.test(template.body));
  }
});

test("inbox whatsapp: STOP replies", () => {
  assert.equal(wa.isStopMessage("STOP"), true);
  assert.equal(wa.isStopMessage(" stop. "), true);
  assert.equal(wa.isStopMessage("Stop promotions"), true);
  assert.equal(wa.isStopMessage("please don't stop"), false);
});

const peggy = await import("../src/lib/support/peggy-pure.ts");
const knowledge = await import("../src/lib/support/peggy-knowledge.ts");

test("peggy: replies go on the conversation's own channel, formatted for it", () => {
  assert.equal(peggy.peggyChannel("whatsapp", true), "whatsapp");
  assert.equal(peggy.peggyChannel("web", true), "email");
  assert.equal(peggy.peggyChannel("web", false), "app");
  assert.match(peggy.peggyFormat("email", "Adishi Emmanuel"), /Hi Adishi,/);
  assert.match(peggy.peggyFormat("whatsapp", ""), /greet there/);
});

test("peggy: answers by herself only when switched on, it's their turn and no person is on it", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const on = { autoReply: ["whatsapp", "web"] };
  const theirs = [{ authorType: "user", createdAt: "2026-10-20T11:59:00Z" }];
  assert.deepEqual(peggy.peggyMayAutoReply({ settings: on, source: "whatsapp", hasEmail: false, status: "open", messages: theirs, now }), { ok: true });
  assert.equal(peggy.peggyMayAutoReply({ settings: { autoReply: [] }, source: "whatsapp", hasEmail: false, status: "open", messages: theirs, now }).ok, false);
  assert.equal(peggy.peggyMayAutoReply({ settings: on, source: "email", hasEmail: true, status: "open", messages: theirs, now }).ok, false);
  assert.equal(peggy.peggyMayAutoReply({ settings: on, source: "web", hasEmail: false, status: "open", messages: theirs, now }).ok, false);
  const human = [...theirs, { authorType: "agent", createdAt: "2026-10-20T08:00:00Z" }];
  assert.deepEqual(peggy.peggyMayAutoReply({ settings: on, source: "whatsapp", hasEmail: false, status: "open", messages: human, now }), { ok: false, reason: "human" });
  const lastWasPeggy = [{ authorType: "ai", createdAt: "2026-10-20T11:59:00Z" }];
  assert.equal(peggy.peggyMayAutoReply({ settings: on, source: "whatsapp", hasEmail: false, status: "open", messages: lastWasPeggy, now }).ok, false);
  const busy = [...theirs, ...Array.from({ length: 4 }, () => ({ authorType: "ai", createdAt: "2026-10-20T10:00:00Z" }))];
  assert.deepEqual(peggy.peggyMayAutoReply({ settings: on, source: "whatsapp", hasEmail: false, status: "open", messages: busy, now }), { ok: false, reason: "limit" });
});

test("peggy: her fact sheet sticks to what the app does", () => {
  const facts = knowledge.PEGGY_FACTS;
  for (const phrase of ["yourshop.mybos.store", "1 November 2026", "22 October 2026", "https://app.shopinbos.com/supplier/signup", "https://app.shopinbos.com/logistics/signup", "+1 711-695-1381", "support@shopinbos.com"]) assert.ok(facts.includes(phrase), phrase);
  assert.ok(!/\bchip\b/i.test(facts));
  assert.ok(!/shopinbos-app\.vercel\.app/.test(facts));
  assert.match(facts, /OPay is not live/);
  assert.match(facts, /WooCommerce[^.]*coming soon/i);
});

const presets = await import("../src/lib/support/presets.ts");

test("decision messages: approval and 'not yet' read right, with or without a reason", () => {
  const ok = presets.decisionPreset("approved", { name: "Ada Obi", business: "Ada Logistics", role: "logistics_partner", agent: "Tolu Bello" });
  assert.match(presets.fillReason(ok.message, ""), /^Hi Ada,\n\nCongratulations: Ada Logistics is now verified on Shopinbos\. Sellers can now find you in the Shopinbos logistics marketplace/);
  assert.ok(!presets.fillReason(ok.message, "").includes("{{reason}}"));
  assert.ok(!/\n\n\n/.test(presets.fillReason(ok.message, "")));
  assert.equal(ok.template, "shopinbos_account_approved");
  const no = presets.decisionPreset("rejected", { name: "Ada", business: "Ada Supplies", role: "supplier", agent: "Tolu" });
  assert.equal(no.needsReason, true);
  assert.match(presets.fillReason(no.message, "the CAC certificate is unreadable"), /because the CAC certificate is unreadable\.\n\nOnce that's sorted/);
  assert.ok(wa.TEAM_TEMPLATES.some((t) => t.name === no.template));
});

test("whatsapp templates the team writes: placeholders, names and Meta's rules", () => {
  const made = wa.templateFromDraft({ name: "Supplier Welcome!", purpose: "Welcome", category: "UTILITY", body: "Hi {{first_name}}, welcome {{business}}. {{message}}\n\nThanks!" });
  assert.ok(made.ok);
  assert.equal(made.template.name, "shopinbos_supplier_welcome");
  assert.equal(made.template.body, "Hi {{1}}, welcome {{2}}. {{3}}\n\nThanks!");
  assert.deepEqual(made.template.params, ["first_name", "business", "note"]);
  assert.equal(wa.templateText(made.template), "Hi {{first_name}}, welcome {{business}}. {{message}}\n\nThanks!");
  assert.deepEqual(wa.teamTemplateParams(made.template, { name: "ada", agent: "T", note: "Go", business: "Ada Co" }), ["ada", "Ada Co", "Go"]);
  assert.equal(wa.templateFromDraft({ name: "x", purpose: "p", category: "UTILITY", body: "{{first_name}} hi" }).ok, false);
  assert.equal(wa.templateFromDraft({ name: "x", purpose: "p", category: "UTILITY", body: "hi {{first_name}}" }).ok, false);
  assert.equal(wa.templateFromDraft({ name: "x", purpose: "p", category: "UTILITY", body: "hi {{first_name}} {{agent}} ok" }).ok, false);
  assert.equal(wa.templateFromDraft({ name: "x", purpose: "p", category: "UTILITY", body: "hi {{phone}} ok" }).ok, false);
  assert.equal(wa.templateFromDraft({ name: "shopinbos_account_approved", purpose: "p", category: "UTILITY", body: "hi there" }).ok, false);
  assert.ok(wa.readCustomTemplate({ ...made.template, custom: undefined }).custom);
});

test("admin team: developers have their own page, kept off the others", () => {
  assert.equal(team.adminCanOpen("developer", "/admin/developers"), true);
  assert.equal(team.adminCanOpen("developer", "/admin/suppliers"), false);
  assert.equal(team.adminCanOpen("admin", "/admin/developers"), true);
  assert.equal(team.adminCanOpen("support", "/admin/developers"), false);
  assert.equal(team.adminCanOpen("operations", "/admin/developers"), false);
  assert.equal(team.adminCanOpen("support", "/api/admin/ai-check"), false);
});
