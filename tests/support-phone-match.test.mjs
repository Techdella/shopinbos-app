// Admin › Support customer panel: a ticket's phone finds the account however either side wrote the number
// ("+234…" on the ticket, "234…" from Supabase Auth or a WhatsApp wa_id, "0…" typed by hand).
import test from "node:test";
import assert from "node:assert/strict";

const wa = await import("../src/lib/support/whatsapp-pure.ts");

test("support phone match: every format of a Nigerian number shares its last ten digits", () => {
  for (const raw of ["+2348069394531", "2348069394531", "08069394531", "+234 806 939 4531", "002348069394531"]) {
    assert.equal(wa.phoneTail(raw), "8069394531", raw);
  }
  assert.equal(wa.phoneTail(null), null);
  assert.equal(wa.phoneTail(""), null);
  assert.equal(wa.phoneTail("12"), null);
});

test("support phone match: a phone-only account (no email) matches the ticket's phone", () => {
  const dike = { id: "u1", role: "logistics_partner", name: "DIKE", email: null, phone: "+2348069394531" };
  // SB-1004: the ticket carries the number with "+", the auth user without it, a WhatsApp wa_id has no "+".
  assert.equal(wa.pickPhoneMatch("+2348069394531", [dike]), dike);
  assert.equal(wa.pickPhoneMatch("2348069394531", [dike]), dike);
  assert.equal(wa.pickPhoneMatch("08069394531", [dike]), dike);
  assert.equal(wa.pickPhoneMatch("+2348069394531", [{ ...dike, phone: "2348069394531" }])?.id, "u1");
  assert.equal(wa.pickPhoneMatch("+2348069394531", [{ ...dike, phone: "08069394531" }])?.id, "u1");
});

test("support phone match: exact number wins; other numbers and no phone match nothing", () => {
  const ghana = { id: "gh", phone: "+2338069394531" };
  const nigeria = { id: "ng", phone: "+2348069394531" };
  assert.equal(wa.pickPhoneMatch("+2348069394531", [ghana, nigeria])?.id, "ng");
  assert.equal(wa.pickPhoneMatch("+2348069394531", [{ id: "x", phone: "+2348069394532" }]), null);
  assert.equal(wa.pickPhoneMatch("+2348069394531", [{ id: "x", phone: null }]), null);
  assert.equal(wa.pickPhoneMatch(null, [nigeria]), null);
  assert.equal(wa.pickPhoneMatch("+2348069394531", []), null);
});
