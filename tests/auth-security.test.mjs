// Auth hardening: route protection, safe redirects, CSRF, rate limits/lockouts, session age, sign-out
// confirmation and password-reset protections. Pure helpers are imported (Node strips the types natively);
// wiring is checked against the source.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const access = await import("../src/lib/auth/route-access.ts");
const { csrfRejection } = await import("../src/lib/auth/csrf.ts");
const policy = await import("../src/lib/auth/throttle-policy.ts");
const claims = await import("../src/lib/auth/session-claims.ts");

/** Every page route under src/app, with route groups removed: [{ route, file }]. */
function discoverPages(dir = path.join(ROOT, "src/app"), segments = []) {
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (entry.name === "page.tsx") pages.push({ route: `/${segments.join("/")}`, file: path.join(dir, entry.name) });
      continue;
    }
    if (entry.name === "api") continue;
    const group = entry.name.startsWith("(") && entry.name.endsWith(")");
    pages.push(...discoverPages(path.join(dir, entry.name), group ? segments : [...segments, entry.name]));
  }
  return pages;
}

// Pages anyone may open. Anything else must need a signed-in account with the right role.
const PUBLIC_PAGES = [
  /^\/$/, // redirects to /login
  /^\/(login|signup|forgot-password|reset-password)$/,
  /^\/(supplier|logistics)\/(login|signup)$/,
  /^\/admin\/login$/,
  /^\/auth\/handoff$/, // mobile app → web handoff, sets its own session
  /^\/s\//, // storefronts on shopinbos subdomains
  /^\/_domain\//, // storefronts on custom domains
  /^\/store\/\[storeSlug\]/, // legacy storefront routes
  /^\/suppliers\/\[slug\]$/, // public supplier profile
  /^\/logistics\/partners\//, // public logistics partner profile
  /^\/email\/unsubscribe\//,
  /^\/email\/preferences\//, // email preference center: the signed token is the credential
  /^\/email\/preferences\//, // email preference center, the signed token is the credential
  /^\/rider\/\[token\]$/, // rider job link, the token is the credential
];

test("every portal page needs a session and the right role (proxy table or requireRole)", () => {
  const pages = discoverPages();
  assert.ok(pages.length > 100, "found the app's pages");
  const unprotected = [];
  for (const { route, file } of pages) {
    if (PUBLIC_PAGES.some((pattern) => pattern.test(route))) {
      assert.equal(access.rolesForPath(route.replace(/\[[^\]]+\]/g, "x")), null, `${route} is public but the proxy guards it`);
      continue;
    }
    const roles = access.rolesForPath(route.replace(/\[[^\]]+\]/g, "x"));
    const source = fs.readFileSync(file, "utf8");
    const pageChecks = /requireRole\(|requireUser\(|getCurrentAppUser\(/.test(source);
    if (!roles && !pageChecks) unprotected.push(route);
    // The proxy must cover every non-public page, so a page that forgets requireRole is still protected.
    if (!roles) unprotected.push(`${route} (not in PROTECTED_AREAS)`);
  }
  assert.deepEqual(unprotected, []);
});

test("route table: most specific prefix wins and public pages stay open", () => {
  assert.deepEqual(access.rolesForPath("/home"), ["seller"]);
  assert.deepEqual(access.rolesForPath("/home/orders/abc"), ["seller"]);
  assert.equal(access.rolesForPath("/home/notifications").length, 4, "every role has a notification centre");
  assert.deepEqual(access.rolesForPath("/marketplace/product/1"), ["seller"]);
  assert.deepEqual(access.rolesForPath("/studio"), ["seller"]);
  assert.deepEqual(access.rolesForPath("/supplier/products"), ["supplier"]);
  assert.deepEqual(access.rolesForPath("/logistics/bookings"), ["logistics_partner"]);
  assert.deepEqual(access.rolesForPath("/admin/users"), ["admin"]);
  assert.equal(access.rolesForPath("/suppliers/acme"), null, "/suppliers is not the /supplier portal");
  assert.equal(access.rolesForPath("/logistics/partners/swift"), null);
  assert.equal(access.rolesForPath("/supplier/signup"), null);
  assert.equal(access.rolesForPath("/homepage"), null, "segment-aware matching");
});

test("?next= only ever points back into the app (no open redirects)", () => {
  assert.equal(access.safeNextPath("/home/orders?tab=open#x"), "/home/orders?tab=open#x");
  assert.equal(access.safeNextPath("/products"), "/products");
  for (const bad of ["//evil.com", "/\\evil.com", "/\\/evil.com", "https://evil.com", "http:evil.com", "javascript:alert(1)", "evil.com", "", null, undefined, "/home\r\nSet-Cookie: x", "/%0d%0a", "/a\u0000b", `/${"a".repeat(3000)}`]) {
    const result = access.safeNextPath(bad);
    assert.ok(result === null || (result.startsWith("/") && !result.startsWith("//")), String(bad));
    if (typeof bad === "string" && /evil|javascript|\r|\u0000/.test(bad)) assert.equal(result, null, String(bad));
  }
  assert.equal(access.loginRedirectPath("/login", "/home/orders", "?status=new"), "/login?next=%2Fhome%2Forders%3Fstatus%3Dnew");
  assert.equal(access.loginRedirectPath("/supplier/login", "/supplier/dashboard"), "/supplier/login?next=%2Fsupplier%2Fdashboard");
  assert.equal(access.loginRedirectPath("/login", "/"), "/login");
  assert.equal(access.loginRedirectPath("/login", "//evil.com"), "/login");
});

test("proxy sends guests to the right login with next, other roles to their portal, and never caches portal pages", () => {
  const proxy = read("src/proxy.ts");
  assert.match(proxy, /const AUTH_ROUTES = PROTECTED_PREFIXES/);
  const literal = proxy.match(/const PUBLIC_ROUTES = (\[[^\]]*\])/);
  assert.ok(literal, "PUBLIC_ROUTES literal");
  assert.deepEqual(JSON.parse(literal[1]), access.PUBLIC_PORTAL_PAGES, "proxy and route table agree on public portal pages");
  assert.match(proxy, /loginRedirectPath\(getLoginPath\(pathname\), pathname, search\)/);
  assert.match(proxy, /rolesForPath\(pathname\)/);
  assert.match(proxy, /getRoleHome\(appUser\.role\)/);
  assert.match(proxy, /csrfRejection\(/);
  assert.match(proxy, /"Cache-Control", NO_STORE/);
  assert.match(proxy, /private, no-store/);
  assert.match(proxy, /sessionTooOld\(/);
  assert.match(proxy, /REQUEST_PATH_HEADER/);

  const serverAuth = read("src/lib/server-auth.ts");
  assert.match(serverAuth, /redirect\(portalDashboardPath\(user\.role\)\)/, "wrong role → own portal, not a login form");
  assert.match(serverAuth, /loginRedirectPath\(/);
  assert.match(serverAuth, /export async function requireUser/);

  const callback = read("src/app/auth/callback/route.ts");
  assert.match(callback, /safeNextPath\(/);
  assert.doesNotMatch(callback, /sanitizeNextPath/);
  assert.doesNotMatch(read("src/components/auth/app/AppAuth.tsx"), /sanitizeNextPath\(/);
});

test("CSRF: cookie-authenticated writes to portal APIs must come from our own origin", () => {
  const headers = (values) => ({ get: (name) => values[name.toLowerCase()] ?? null });
  const base = { method: "POST", pathname: "/api/app/store" };
  assert.equal(csrfRejection({ ...base, headers: headers({ host: "app.shopinbos.com", origin: "https://app.shopinbos.com" }) }), null);
  assert.equal(csrfRejection({ ...base, headers: headers({ host: "localhost:3000", origin: "http://localhost:3000" }) }), null);
  assert.ok(csrfRejection({ ...base, headers: headers({ host: "app.shopinbos.com", origin: "https://evil.example" }) }));
  assert.ok(csrfRejection({ ...base, headers: headers({ host: "app.shopinbos.com", origin: "null" }) }));
  assert.ok(csrfRejection({ ...base, headers: headers({ host: "app.shopinbos.com", "sec-fetch-site": "cross-site" }) }));
  assert.ok(csrfRejection({ ...base, pathname: "/api/admin/suppliers/1/status", method: "PATCH", headers: headers({ host: "app.shopinbos.com", origin: "https://app.shopinbos.com.evil.example" }) }));
  // Behind a proxy the browser's host is in x-forwarded-host; trusted origins can be configured.
  assert.equal(csrfRejection({ ...base, headers: headers({ host: "internal:3000", "x-forwarded-host": "app.shopinbos.com", origin: "https://app.shopinbos.com" }) }), null);
  assert.equal(csrfRejection({ ...base, trustedOrigins: ["https://shopinbos.com"], headers: headers({ host: "app.shopinbos.com", origin: "https://shopinbos.com" }) }), null);
  // Exempt: reads, Bearer (mobile app), webhooks, non-portal APIs, server-to-server without Origin.
  assert.equal(csrfRejection({ ...base, method: "GET", headers: headers({ origin: "https://evil.example" }) }), null);
  assert.equal(csrfRejection({ ...base, headers: headers({ authorization: "Bearer abc.def.ghi", origin: "https://evil.example" }) }), null);
  assert.equal(csrfRejection({ ...base, pathname: "/api/app/webhooks/paystack", headers: headers({ origin: "https://evil.example" }) }), null);
  assert.equal(csrfRejection({ ...base, pathname: "/api/public/store/x/checkout", headers: headers({ origin: "https://evil.example" }) }), null);
  assert.equal(csrfRejection({ ...base, headers: headers({ host: "app.shopinbos.com" }) }), null);
  for (const prefix of ["/api/app", "/api/supplier", "/api/logistics", "/api/admin", "/api/auth"]) {
    assert.ok(csrfRejection({ method: "DELETE", pathname: `${prefix}/x`, headers: headers({ host: "a.test", origin: "https://b.test" }) }), prefix);
  }
});

test("lockouts back off and messages say how long to wait", () => {
  assert.equal(policy.lockoutMs(policy.FAILURES_BEFORE_LOCK - 1), 0);
  assert.equal(policy.lockoutMs(5), 5 * 60_000);
  assert.equal(policy.lockoutMs(8), 15 * 60_000);
  assert.equal(policy.lockoutMs(12), 60 * 60_000);
  assert.equal(policy.tryAgainMessage(61), "Too many attempts. Try again in 2 minutes.");
  assert.equal(policy.tryAgainMessage(30, "wrong codes"), "Too many wrong codes. Try again in 1 minute.");
  assert.equal(policy.retryAfterSeconds(10_500, 0), 11);
  assert.equal(policy.normaliseIdentifier(" Ada@Shop.COM "), "ada@shop.com");
  assert.equal(policy.normaliseIdentifier("+234 803-123-4567"), "+2348031234567");
  for (const action of ["login", "otpSend", "otpVerify", "passwordReset", "passwordChange"]) {
    const limits = policy.AUTH_LIMITS[action];
    assert.ok(limits.ip.limit > 0 && limits.identifier.limit > 0 && limits.identifier.limit <= limits.ip.limit, action);
  }
});

test("session claims: auth time, recovery sessions and absolute lifetime", () => {
  const now = Date.UTC(2026, 9, 12);
  const token = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;
  const fresh = claims.decodeAccessToken(token({ sub: "u1", session_id: "s1", amr: [{ method: "otp", timestamp: now / 1000 - 60 }] }));
  assert.equal(fresh.session_id, "s1");
  assert.equal(claims.authenticatedAt(fresh), now - 60_000);
  assert.ok(claims.authenticatedWithin(fresh, 10 * 60_000, now));
  assert.equal(claims.isRecentRecovery(fresh, 3_600_000, now), false);
  const recovery = { amr: [{ method: "recovery", timestamp: now / 1000 - 120 }] };
  assert.ok(claims.isRecentRecovery(recovery, 3_600_000, now));
  assert.equal(claims.isRecentRecovery({ amr: [{ method: "recovery", timestamp: now / 1000 - 7200 }] }, 3_600_000, now), false);
  assert.equal(claims.decodeAccessToken("not-a-token"), null);
  assert.equal(claims.decodeAccessToken(null), null);

  assert.equal(claims.sessionMaxAgeMs("seller", {}), 30 * 86_400_000);
  assert.equal(claims.sessionMaxAgeMs("admin", {}), 12 * 3_600_000);
  assert.equal(claims.sessionMaxAgeMs("seller", { AUTH_SESSION_MAX_DAYS: "0" }), 0);
  const old = { amr: [{ method: "password", timestamp: now / 1000 - 31 * 86_400 }] };
  assert.ok(claims.sessionTooOld(old, claims.sessionMaxAgeMs("seller", {}), now));
  assert.equal(claims.sessionTooOld(old, 0, now), false, "0 turns the limit off");
  assert.equal(claims.sessionTooOld({}, 1000, now), false, "no amr → unknown, don't sign out");
});

test("login, codes and resets are rate-limited, locked after failures, generic and logged", () => {
  const otp = read("src/app/api/auth/otp/route.ts");
  assert.match(otp, /consumeAuthLimit\("otpSend"/);
  assert.match(otp, /consumeAuthLimit\("otpVerify"/);
  assert.match(otp, /lockedForSeconds\(identifier\)/);
  assert.match(otp, /recordAuthFailure\(identifier\)/);
  assert.match(otp, /recordSignIn\(/);
  assert.doesNotMatch(otp, /couldn't find an account/, "never reveals whether an account exists");
  assert.match(otp, /Signing in with an email or phone that has no account looks exactly like a sent code/);

  const login = read("src/app/api/auth/login/route.ts");
  assert.match(login, /consumeAuthLimit\("login"/);
  assert.match(login, /lockedForSeconds\(email\)/);
  assert.match(login, /recordAuthFailure\(email\)/);
  assert.match(login, /clearAuthFailures\(email\)/);
  assert.match(login, /type: lockedNow \? "login_locked" : "login_failure"/);

  const forgot = read("src/app/api/auth/password/forgot/route.ts");
  assert.match(forgot, /consumeAuthLimit\("passwordReset"/);
  assert.match(forgot, /return authJson\(\{ sent: true \}\)/);

  const authApi = read("src/components/auth/app/auth-api.ts");
  assert.match(authApi, /"\/api\/auth\/login"/, "password sign-in goes through the rate-limited route");
  assert.match(authApi, /"\/api\/auth\/password\/forgot"/);
  assert.doesNotMatch(authApi, /auth\.signInWithPassword\(/);

  const events = read("src/lib/auth/events.ts");
  assert.match(events, /New sign-in to your Shopinbos account/);
  assert.match(events, /Your Shopinbos password was changed/);
  assert.match(events, /sendEmail\(/);
  const throttle = read("src/lib/auth/throttle.ts");
  assert.match(throttle, /INSERT INTO "AuthThrottle"/);
  assert.match(throttle, /checkRateLimitShared\(`auth:\$\{key\}`, \{[^}]*failClosed: true/, "request windows use the shared limiter, failing closed");

  const sql = read("docs/migrations/2026-10-12-auth-security.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "AuthEvent"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "AuthThrottle"/);
  assert.match(sql, /ALTER TABLE "AuthEvent" ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE "AuthThrottle" ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /DROP|ALTER TABLE "User"/);
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model AuthEvent \{/);
  assert.match(schema, /model AuthThrottle \{/);
});

test("password reset needs the link's session, can't be reused, and signs out other devices", () => {
  const route = read("src/app/api/auth/password/route.ts");
  assert.match(route, /isRecoverySession\(claims\)/);
  assert.match(route, /signOut\(\{ scope: "global" \}\)/, "reset ends every session, including the link's");
  assert.match(route, /signOut\(\{ scope: "others" \}\)/, "settings change logs out other devices");
  assert.match(route, /currentPassword/);
  assert.match(route, /getDetachedAuthClient\(\)/, "current password is checked without touching the session");
  assert.match(route, /recordAuthFailure\(identifier\)/);
  assert.match(route, /sendPasswordChangedEmail\(/);
  assert.match(route, /RECOVERY_COOKIE, "", \{ path: "\/", maxAge: 0 \}/);

  const callback = read("src/app/auth/callback/route.ts");
  assert.match(callback, /recoveryMarker\(claims\.session_id\)/);
  assert.match(callback, /link_expired/);
  const session = read("src/lib/auth/session.server.ts");
  assert.match(session, /timingSafeEqual/);
  assert.match(session, /id !== sessionId/, "marker is tied to one session");

  const page = read("src/app/reset-password/page.tsx");
  assert.match(page, /isRecoverySession\(session\.claims\)/);
  const screens = read("src/components/auth/app/PasswordScreens.tsx");
  // Copy lives in the auth catalog (shared/i18n/messages/auth/en.ts); the screens show it through t().
  const authCopy = read("shared/i18n/messages/auth/en.ts");
  assert.match(screens, /t\("reset\.signedOut"\)/);
  assert.match(authCopy, /"reset\.signedOut": "You've been signed out on other devices\."/);
  assert.match(screens, /t\("reset\.expired"\)/);
  assert.match(authCopy, /"reset\.expired": "This link has expired"/);
  assert.doesNotMatch(screens, /hasSession\(\)/, "the server decides whether the link is usable");
});

test("every log out asks first, in an accessible dialog", () => {
  const dialog = read("src/components/auth/SignOutDialog.tsx");
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /aria-describedby=\{bodyId\}/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/, "focus is trapped");
  assert.match(dialog, /cancelButton\.current\?\.focus\(\)/, "focus starts on Cancel");
  assert.match(dialog, /previous\?\.focus\?\.\(\)/, "focus returns to the opener");
  const dialogCopy = read("shared/i18n/messages/auth/en.ts");
  const commonCopy = read("shared/i18n/messages/common/en.ts");
  assert.match(dialog, /t\("signout\.title"\)/);
  assert.match(dialogCopy, /"signout\.title": "Log out of Shopinbos\?"/);
  assert.match(dialogCopy, /"signout\.body": "You'll need your code or password to get back in\."/);
  assert.match(dialog, />\s*\{t\("cancel"\)\}\s*</);
  assert.match(commonCopy, /cancel: "Cancel"/);
  assert.match(dialog, /t\("logOut"\)/);
  assert.match(commonCopy, /logOut: "Log out"/);

  const button = read("src/components/shell/SignOutButton.tsx");
  assert.match(button, /<SignOutDialog/);
  assert.doesNotMatch(button, /auth\.signOut\(/, "the button never signs out directly");
  assert.match(button, /pageshow/, "Back after logout doesn't restore the dashboard from cache");

  const signOut = read("src/components/auth/sign-out.ts");
  assert.match(signOut, /"\/api\/auth\/sign-out"/);
  assert.match(signOut, /window\.location\.replace\(/);

  // No other web page or component signs out without the dialog (API route handlers are the server side).
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "api") walk(full);
      }
      else if (/\.(tsx?|jsx?)$/.test(entry.name) && /auth\.signOut\(/.test(fs.readFileSync(full, "utf8"))) offenders.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT, "src/components"));
  walk(path.join(ROOT, "src/app"));
  assert.deepEqual(offenders.filter((file) => file !== path.join("src", "components", "auth", "sign-out.ts")), []);

  // Settings > Security in every portal, with "Log out of all devices".
  const security = read("src/components/auth/SecuritySettings.tsx");
  assert.match(security, /t\("security\.logoutAll"\)/);
  assert.match(read("shared/i18n/messages/auth/en.ts"), /"security\.logoutAll": "Log out of all devices"/);
  assert.match(security, /scope="global"/);
  assert.match(security, /autoComplete="current-password"/);
  for (const file of ["src/app/home/settings/page.tsx", "src/app/supplier/settings/page.tsx", "src/app/logistics/profile/page.tsx", "src/app/admin/settings/page.tsx"]) {
    assert.match(read(file), /<SecuritySettings/, file);
  }
  const signOutRoute = read("src/app/api/auth/sign-out/route.ts");
  assert.match(signOutRoute, /scope === "global" \? "logout_all" : "logout"/);

  // Mobile: the Log out button confirms; a session that ends on its own is reported and sent to login.
  const mobileAuth = read("apps/mobile/src/lib/auth.ts");
  assert.match(mobileAuth, /Alert\.alert\(/);
  assert.match(mobileAuth, /t\("logout\.title"\)/);
  assert.match(read("shared/i18n/messages/m_auth/en.ts"), /"logout\.title": "Log out of Shopinbos\?"/);
  assert.match(mobileAuth, /style: "cancel"/);
  assert.match(mobileAuth, /export function signOut\(/);
  const mobileSession = read("apps/mobile/src/lib/session.tsx");
  assert.match(mobileSession, /signOutWasRequested\(\)/);
  assert.match(mobileSession, /"session\.endedBody"/);
  assert.match(read("shared/i18n/messages/m_auth/en.ts"), /Your session has ended/);
  assert.match(mobileSession, /router\.replace\("\/login"\)/);
});
