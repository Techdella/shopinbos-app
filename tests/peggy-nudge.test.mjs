// Peggy offers help when someone looks stuck (src/lib/struggle/detect.ts, src/components/peggy/PeggyNudge.tsx).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const d = await import("../src/lib/struggle/detect.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const click = (state, at, key = "b1", changedSince = false, x = 100, y = 100) => d.onClick(state, { at, x, y, key, changedSince });

test("rage clicks: four fast taps in one spot", () => {
  const s = d.newStruggleState();
  assert.equal(click(s, 0), null);
  assert.equal(click(s, 200), null);
  assert.equal(click(s, 400), null);
  assert.equal(click(s, 600), "rage");
});

test("taps that each do something (a + button, a stepper) are not frustration", () => {
  const s = d.newStruggleState();
  for (let i = 0; i < 10; i += 1) assert.equal(click(s, i * 200, "plus", i > 0), null);
});

test("a dead button: five taps in ten seconds with nothing changing", () => {
  const s = d.newStruggleState();
  const results = [0, 2000, 4000, 6000, 8000].map((at) => click(s, at, "save"));
  assert.deepEqual(results, [null, null, null, null, "dead"]);
});

test("doom scrolling: twelve screens in a minute without tapping, or up and down eight times", () => {
  const s = d.newStruggleState();
  let reason = null;
  for (let i = 0; i < 12 && !reason; i += 1) reason = d.onScroll(s, 800, 800, i * 3000);
  assert.equal(reason, "scroll");

  const t = d.newStruggleState();
  reason = null;
  for (let i = 0; i < 12 && !reason; i += 1) reason = d.onScroll(t, i % 2 ? -500 : 500, 800, i * 1000);
  assert.equal(reason, "scroll");

  // Reading slowly is fine, and a tap starts the count again.
  const u = d.newStruggleState();
  for (let i = 0; i < 30; i += 1) {
    assert.equal(d.onScroll(u, 400, 800, i * 5000), null);
    if (i % 5 === 4) click(u, i * 5000 + 1, `k${i}`);
  }
});

test("wheel jitter doesn't count as going up and down", () => {
  const s = d.newStruggleState();
  for (let i = 0; i < 40; i += 1) assert.equal(d.onScroll(s, i % 2 ? -20 : 20, 800, i * 300), null);
});

test("going back and forth between the same pages", () => {
  const s = d.newStruggleState();
  const pages = ["/supplier/dashboard", "/supplier/orders", "/supplier/dashboard", "/supplier/orders", "/supplier/dashboard", "/supplier/orders"];
  assert.deepEqual(pages.map((p, i) => d.onRoute(s, p, i * 5000)), [null, null, null, null, null, "wander"]);
  // Browsing many different pages is just using the app.
  const t = d.newStruggleState();
  for (let i = 0; i < 10; i += 1) assert.equal(d.onRoute(t, `/supplier/page-${i}`, i * 5000), null);
});

test("errors: something broken on our side at once, their own mistakes after three", () => {
  const s = d.newStruggleState();
  assert.equal(d.onError(s, true, 0), "error");
  const t = d.newStruggleState();
  assert.deepEqual([d.onError(t, false, 0), d.onError(t, false, 10_000), d.onError(t, false, 20_000)], [null, null, "error"]);
});

test("never nags: quiet for three minutes after a nudge, at most three a page load", () => {
  const s = d.newStruggleState();
  assert.equal(d.onError(s, true, 0), "error");
  assert.equal(d.onError(s, true, 60_000), null);
  assert.equal(d.onError(s, true, 181_000), "error");
  assert.equal(d.onError(s, true, 400_000), "error");
  assert.equal(d.onError(s, true, 700_000), null);
});

test("the nudge is in the shell for sellers, suppliers and delivery partners, and opens a chat with Peggy", () => {
  const sidebar = read("src/components/shell/Sidebar.tsx");
  assert.match(sidebar, /\(role === "seller" \|\| role === "supplier" \|\| role === "logistics_partner"\) && <PeggyNudge helpOpen=\{helpOpen\} \/>/);
  assert.match(sidebar, /peggyOpener=\{peggyOpener\}/);
  const modal = read("src/components/shell/SupportChatModal.tsx");
  assert.match(modal, /setPeggy\(\[\{ role: "agent", text: peggyOpener \}\]\);\s*setView\("peggy"\);/);
  const nudge = read("src/components/peggy/PeggyNudge.tsx");
  assert.match(nudge, /new CustomEvent\(OPEN_HELP_EVENT, \{ detail \}\)/);
  assert.match(nudge, /storageSet\("localStorage", OFF_KEY, "1"\)/);
  assert.match(read("src/lib/errors/report-client.ts"), /dispatchEvent\(new CustomEvent\(SHOWN_ERROR_EVENT/);
});
