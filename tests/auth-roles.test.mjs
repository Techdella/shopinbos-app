// One account is one role: sign-ups never mix sellers, suppliers and delivery partners. The pure rules
// (src/lib/auth/role-rules.ts) are run for real; the wiring (sync-user, the Google callback, the proxy repair, the
// web and phone sign-up screens) is checked against the source.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const rules = await import("../src/lib/auth/role-rules.ts");
const en = (await import("../shared/i18n/messages/auth/en.ts")).default;
const mEn = (await import("../shared/i18n/messages/m_auth/en.ts")).default;

const SIGNUP = ["seller", "supplier", "logistics_partner"];

test("a brand-new account gets the role it signed up with (admin only for an approved invite)", () => {
  for (const role of SIGNUP) {
    assert.equal(rules.decideAccountRole({ existingRole: null, requestedRole: role, canUseAdminRole: false }), role);
  }
  assert.equal(rules.decideAccountRole({ existingRole: null, requestedRole: "admin", canUseAdminRole: false }), "seller");
  assert.equal(rules.decideAccountRole({ existingRole: null, requestedRole: "admin", canUseAdminRole: true }), "admin");
  assert.equal(rules.decideAccountRole({ existingRole: null, requestedRole: "hacker", canUseAdminRole: false }), "seller");
  assert.equal(rules.decideAccountRole({ existingRole: undefined, requestedRole: undefined, canUseAdminRole: false }), "seller");
});

test("an existing account keeps its role: a seller signing up as a supplier stays a seller, and every other mix", () => {
  for (const existing of SIGNUP) {
    for (const requested of SIGNUP) {
      assert.equal(
        rules.decideAccountRole({ existingRole: existing, requestedRole: requested, canUseAdminRole: false }),
        existing,
        `${existing} asked to become ${requested}`,
      );
    }
    // Asking for admin without an invite changes nothing.
    assert.equal(rules.decideAccountRole({ existingRole: existing, requestedRole: "admin", canUseAdminRole: false }), existing);
  }
  // An admin is never turned into anything else, and an approved invite is the one allowed change.
  assert.equal(rules.decideAccountRole({ existingRole: "admin", requestedRole: "seller", canUseAdminRole: true }), "admin");
  assert.equal(rules.decideAccountRole({ existingRole: "seller", requestedRole: "admin", canUseAdminRole: true }), "admin");
});

test("sync asks for the role picked on the sign-up screen, else the one saved on the login, else seller", () => {
  assert.equal(rules.requestedSignupRole("supplier", "supplier", true), "supplier");
  // Google sign-ups carry no role on the login: the sign-up page's pick counts.
  assert.equal(rules.requestedSignupRole(null, "logistics_partner", true), "logistics_partner");
  // Not a sign-up (a plain log-in or the phone app's launch check): the body is ignored.
  assert.equal(rules.requestedSignupRole(null, "supplier", false), "seller");
  assert.equal(rules.requestedSignupRole("supplier", "seller", false), "supplier");
  assert.equal(rules.requestedSignupRole(undefined, "nonsense", true), "seller");
});

test("the proxy repair only fills in a missing role, never flips a stored one, and never makes an admin", () => {
  for (const stored of [...SIGNUP, "admin"]) {
    for (const metadata of [...SIGNUP, "admin", null, "x"]) {
      assert.equal(rules.roleToRepair(stored, metadata), null, `${stored} with metadata ${metadata}`);
    }
  }
  assert.equal(rules.roleToRepair(null, "supplier"), "supplier");
  assert.equal(rules.roleToRepair(null, "logistics_partner"), "logistics_partner");
  assert.equal(rules.roleToRepair(null, "seller"), "seller");
  assert.equal(rules.roleToRepair(null, "admin"), null);
  assert.equal(rules.roleToRepair(undefined, undefined), null);

  assert.equal(rules.metadataNeedsAlign("seller", "supplier"), true);
  assert.equal(rules.metadataNeedsAlign("seller", undefined), true, "a missing metadata role is filled in");
  assert.equal(rules.metadataNeedsAlign("supplier", "supplier"), false);
});

test("sign-up clashes and the wrong-portal note", () => {
  assert.equal(rules.signupConflict("seller", "supplier"), "seller");
  assert.equal(rules.signupConflict("supplier", "supplier"), null);
  assert.equal(rules.signupConflict(null, "seller"), null);
  assert.equal(rules.withPortalNote("/home", "supplier"), "/home?portal_note=supplier");
  assert.equal(rules.withPortalNote("/supplier/dashboard?tab=1", "seller"), "/supplier/dashboard?tab=1&portal_note=seller");
  assert.equal(rules.PORTAL_NOTE_PARAM, "portal_note");
});

test("the clash message reads as the owner asked, in plain words", () => {
  const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);
  const message = fill(en["conflict.email"], { account: en["conflict.account.seller"], business: en["conflict.business.supplier"] });
  assert.equal(message, "This email already has a seller account. Log in, or use a different email for your supplier business.");
  assert.equal(
    fill(mEn["conflict.email"], { account: mEn["conflict.account.seller"], business: mEn["conflict.business.supplier"] }),
    message,
    "same words on the phone app",
  );
  assert.equal(en["card.seller.line"], "I sell to customers. Build my online store.");
  assert.equal(en["card.supplier.line"], "I supply products to sellers, wholesale or dropship.");
  assert.equal(en["card.logistics_partner.line"], "I deliver orders for sellers and suppliers.");
  assert.equal(en["as.signup.supplier"], "Sign up as a supplier");
  assert.equal(en["change.supplier"], "Not a supplier? Change");
});

test("server wiring: one decision for every sign-up path, metadata only fills a missing role", () => {
  const appUser = read("src/lib/auth/app-user.ts");
  assert.match(appUser, /decideAccountRole\(\{ existingRole: existingUser\?\.role, requestedRole, canUseAdminRole \}\)/);
  assert.doesNotMatch(appUser, /recentlyCreated|function resolveRole/, "no 10-minute window in which a new seller could be flipped");
  assert.match(appUser, /export async function alignRoleMetadata/);

  const sync = read("src/app/api/auth/sync-user/route.ts");
  assert.match(sync, /requestedSignupRole\(claims\.user_metadata\?\.rawRole, body\.role, body\.source === "signup"\)/);
  assert.match(sync, /alignRoleMetadata\(/);

  const proxy = read("src/proxy.ts");
  assert.doesNotMatch(proxy, /getMetadataPortalRole/);
  assert.match(proxy, /roleToRepair\(null, data\.user\.user_metadata\?\.role\)/);
  assert.match(proxy, /if \(!appUser\) \{/);

  const callback = read("src/app/auth/callback/route.ts");
  assert.match(callback, /conflict=\$\{appUser\.role\}/, "Google sign-up with an email that has another kind of account says so");
  assert.match(callback, /withPortalNote\(roleDestination\(appUser\.role\), role\)/, "Google log-in on the wrong page opens their own portal");

  const middleware = read("src/lib/auth/middleware.ts");
  assert.match(middleware, /!identity\.metadataRole && allowedRoles\?\.length === 1/, "a seller's first supplier API call can't make them a supplier");
});

test("web screens: one question per screen; the role is asked last, unless the link already says", () => {
  const auth = read("src/components/auth/app/AppAuth.tsx");
  assert.match(auth, /export function signupRoleKnown/);
  for (const key of ["intent", "productSlug", "role"]) assert.match(auth, new RegExp(`"${key}"`));
  assert.match(auth, /type Screen = "name" \| "details" \| "code" \| "role" \| "ready"/);
  assert.match(auth, /useState<Screen>\(mode === "signup" && !isAdmin \? "name" : "details"\)/, "sign up opens on the name");
  assert.match(auth, /if \(mode === "signup" && !roleKnown\) \{[\s\S]*?goTo\("role"\)/, "the role comes after the code");
  assert.match(auth, /role: roleKnown \? signupRole : undefined/, "the code carries the role only when it is known");
  assert.match(auth, /role: wanted,/, "sync-user gets the picked role");
  assert.match(auth, /t\(`change\.\$\{signupRole\}`\)/, "Not a supplier? Change");
  assert.match(auth, /conflictMessage\(syncedRole/);
  assert.match(auth, /withPortalNote\(roleDestination\(syncedRole\), role\)/);
  assert.match(auth, /signInWithGoogle\(role, nextUrl, mode\)/);
  assert.match(read("src/components/ClientLayout.tsx"), /<PortalNote \/>/);
  // sync-user: the role sent from the sign-up page wins for a brand-new account.
  assert.match(read("src/app/api/auth/sync-user/route.ts"), /requestedSignupRole\(claims\.user_metadata\?\.rawRole, body\.role, body\.source === "signup"\)/);
});

test("phone app: one question per screen; the role is asked after the code unless a link picked it", () => {
  const welcome = read("apps/mobile/src/app/welcome.tsx");
  assert.match(welcome, /router\.push\("\/signup"\)/, "Get started opens sign up (name first)");
  assert.match(welcome, /SIGNUP_ROLES\.map/, "older ?step=role links still show the cards");
  assert.match(welcome, /pathname: "\/signup", params: \{ method: email && !phone \? "email" : "phone", role, \.\.\.carried \}/);
  const signup = read("apps/mobile/src/app/signup.tsx");
  assert.doesNotMatch(signup, /<Redirect href="\/welcome" \/>/, "no role needed to start");
  assert.match(signup, /initialRole=\{picked\}/);
  const form = read("apps/mobile/src/components/AuthForm.tsx");
  assert.match(form, /useState<"name" \| "contact">\(mode === "signup" \? "name" : "contact"\)/, "sign up opens on the name");
  assert.match(form, /t\("q\.name"\)/);
  assert.match(form, /t\(`as\.\$\{role\}`\)/);
  assert.match(form, /t\(`change\.\$\{role\}`\)/);
  assert.doesNotMatch(form, /setRole\(/, "the role can't drift away from the card that was picked");
  const lib = read("apps/mobile/src/lib/auth.ts");
  assert.doesNotMatch(lib, /updateUser\(\{ data: \{ role/, "the phone never writes a role onto an existing login");
  assert.match(lib, /source: payload\.signup \? "signup" : undefined/);
  const verify = read("apps/mobile/src/app/verify.tsx");
  assert.match(verify, /if \(signup && !linkRole\) \{[\s\S]*?setAskRole\(true\)/, "What brings you to Shopinbos? comes after the code");
  assert.match(verify, /t\("q\.role"\)/);
  assert.match(verify, /explainSignupConflict\(actual, role, target\.kind\)/);
});
