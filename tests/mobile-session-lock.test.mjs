// The phone app's session safety (apps/mobile/src/components/SessionGuard.tsx): lock after a few minutes away with
// Face ID, fingerprint or PIN; sign out after an hour on a phone with no screen lock; the server ends Bearer sessions
// after AUTH_APP_SESSION_MAX_DAYS and the app signs out on SESSION_EXPIRED.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const { lockDecision, DEFAULT_LOCK_MS, DEFAULT_IDLE_MS } = await import("../apps/mobile/src/lib/session-lock-pure.ts");
const claims = await import("../src/lib/auth/session-claims.ts");
const idle = await import("../src/lib/auth/idle.ts");

test("lock after a few minutes away when the phone has a screen lock; else sign out after an hour", () => {
  const limits = { lockMs: DEFAULT_LOCK_MS, idleMs: DEFAULT_IDLE_MS };
  assert.equal(lockDecision({ awayMs: 60_000, ...limits, deviceSecure: true }), "open");
  assert.equal(lockDecision({ awayMs: 6 * 60_000, ...limits, deviceSecure: true }), "lock");
  assert.equal(lockDecision({ awayMs: 3 * 86_400_000, ...limits, deviceSecure: true }), "lock", "a locked phone never signs out on time alone");
  assert.equal(lockDecision({ awayMs: 30 * 60_000, ...limits, deviceSecure: false }), "open");
  assert.equal(lockDecision({ awayMs: 61 * 60_000, ...limits, deviceSecure: false }), "signout");
  assert.equal(lockDecision({ awayMs: 99 * 60_000, lockMs: 0, idleMs: 0, deviceSecure: true }), "open", "0 turns it off");
  assert.equal(lockDecision({ awayMs: -5, ...limits, deviceSecure: true }), "open", "a clock change never locks");
});

test("server: app session lifetime and lock time from env", () => {
  assert.equal(claims.appSessionMaxAgeMs({}), 30 * 86_400_000);
  assert.equal(claims.appSessionMaxAgeMs({ AUTH_APP_SESSION_MAX_DAYS: "0" }), 0);
  assert.equal(idle.appLockMs({}), 5 * 60_000);
  assert.equal(idle.appLockMs({ AUTH_APP_LOCK_MINUTES: "2" }), 2 * 60_000);
});

test("wiring: Bearer sessions end on the server, the app signs out on SESSION_EXPIRED, the guard is mounted", () => {
  const middleware = read("src/lib/auth/middleware.ts");
  assert.match(middleware, /bearerSessionExpired\(bearerToken, claims\.sub\)/);
  assert.match(middleware, /apiError\("SESSION_EXPIRED"/);
  assert.match(read("apps/mobile/src/lib/api.ts"), /error\?\.code === "SESSION_EXPIRED"\) void supabase\.auth\.signOut/);
  assert.match(read("apps/mobile/src/app/_layout.tsx"), /<SessionGuard \/>/);
  const guard = read("apps/mobile/src/components/SessionGuard.tsx");
  assert.match(guard, /LocalAuthentication\.authenticateAsync/);
  assert.match(guard, /lockDecision\(/);
  const plugins = JSON.parse(read("apps/mobile/app.json")).expo.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
  assert.ok(plugins.includes("expo-local-authentication"), "Face ID permission text");
});
