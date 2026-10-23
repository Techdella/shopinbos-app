// "i is not a function": an effect returning null crashes React 19 on unmount. The guard drops it and reports it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const g = await import("../src/lib/errors/effect-guard.ts");

test("effect guard: functions and undefined pass, anything else is dropped and reported", () => {
  const reports = [];
  const report = (error) => reports.push(error.message);
  const cleanup = () => {};
  assert.equal(g.safeCleanup(cleanup, () => cleanup, report), cleanup);
  assert.equal(g.safeCleanup(undefined, () => undefined, report), undefined);
  assert.equal(g.safeCleanup(null, () => null, report), undefined);
  assert.equal(g.safeCleanup(Promise.resolve(), async () => {}, report), undefined);
  assert.equal(reports.length, 2);
  assert.match(reports[0], /returned null instead of a cleanup function: \(\) => null/);
  assert.match(reports[1], /returned object/);
});

test("effect guard: wraps useEffect and useLayoutEffect once, keeping deps", () => {
  const calls = [];
  const target = {
    useEffect: (create, deps) => calls.push({ hook: "effect", result: create(), deps }),
    useLayoutEffect: (create, deps) => calls.push({ hook: "layout", result: create(), deps }),
  };
  const reports = [];
  g.guardEffects((error) => reports.push(error.message), target);
  const first = target.useEffect;
  g.guardEffects(() => {}, target);
  assert.equal(target.useEffect, first, "not wrapped twice");
  const deps = [1];
  target.useEffect(() => null, deps);
  target.useLayoutEffect(() => 5, []);
  const fn = () => {};
  target.useEffect(() => fn);
  assert.equal(calls[0].result, undefined);
  assert.equal(calls[0].deps, deps);
  assert.equal(calls[1].result, undefined);
  assert.equal(calls[2].result, fn);
  assert.equal(reports.length, 2);
});

test("effect guard: installed before the app loads, reporting to App errors", () => {
  const instrumentation = fs.readFileSync("src/instrumentation-client.ts", "utf8");
  assert.match(instrumentation, /guardEffects\(\(error\) => reportClientError\(error, \{ source: "unhandled" \}\)\)/);
  assert.ok(instrumentation.indexOf("guardEffects(") < instrumentation.indexOf("Sentry.init("), "before Sentry and the app");
});
