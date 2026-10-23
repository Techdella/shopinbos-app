// "SecurityError: The request was denied.": browsers that block site storage refuse navigator.locks, which Supabase
// uses to guard the session. The auth lock falls back to Supabase's in-tab lock instead of failing in the background.
import test from "node:test";
import assert from "node:assert/strict";

const { lockWithFallback } = await import("../src/lib/supabase/auth-lock.ts");

const denied = () => Object.assign(new Error("The request was denied."), { name: "SecurityError" });

test("auth lock: uses the browser lock when it works", async () => {
  const calls = [];
  const primary = async (name, _timeout, fn) => (calls.push(`primary:${name}`), fn());
  const fallback = async (name, _timeout, fn) => (calls.push(`fallback:${name}`), fn());
  const lock = lockWithFallback(primary, fallback);
  assert.equal(await lock("lock:sb", 10, async () => "ok"), "ok");
  assert.deepEqual(calls, ["primary:lock:sb"]);
});

test("auth lock: a refused browser lock falls back, once and for the rest of the visit", async () => {
  let primaryCalls = 0;
  let runs = 0;
  const primary = async () => {
    primaryCalls += 1;
    throw denied();
  };
  const fallback = async (_name, _timeout, fn) => fn();
  const lock = lockWithFallback(primary, fallback);
  assert.equal(await lock("lock:sb", 10, async () => (runs += 1, "first")), "first");
  assert.equal(await lock("lock:sb", 10, async () => (runs += 1, "second")), "second");
  assert.equal(primaryCalls, 1);
  assert.equal(runs, 2);
});

test("auth lock: errors from the work itself are not retried", async () => {
  let runs = 0;
  const primary = async (_name, _timeout, fn) => fn();
  const fallback = async () => assert.fail("fallback must not run");
  const lock = lockWithFallback(primary, fallback);
  await assert.rejects(lock("lock:sb", 10, async () => {
    runs += 1;
    throw denied();
  }), /denied/);
  assert.equal(runs, 1);
});

test("auth lock: other lock errors (timeouts) still surface", async () => {
  const primary = async () => {
    throw Object.assign(new Error("timed out"), { name: "NavigatorLockAcquireTimeoutError" });
  };
  const lock = lockWithFallback(primary, async () => assert.fail("fallback must not run"));
  await assert.rejects(lock("lock:sb", 10, async () => "never"), /timed out/);
});
