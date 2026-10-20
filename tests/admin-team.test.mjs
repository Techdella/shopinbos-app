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
