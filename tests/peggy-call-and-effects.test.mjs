// Peggy on the dashboards: leaving a page never crashes on an effect's return value, a call that fails to start
// never sits on "Calling Peggy…", and Peggy shows as herself (her image), not a "P". Source checks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

function files(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return files(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

test("effects never return scrollIntoView's result (newer Chrome returns a Promise, React then calls it on unmount)", () => {
  const offenders = files("src").filter((path) => /use(Layout)?Effect\(\(\) => [\w.?]+\.scrollIntoView\(/.test(read(path)));
  assert.deepEqual(offenders, []);
});

test("a call that fails to start stops 'Calling Peggy…' and says why, with a time limit as a backstop", () => {
  const call = read("src/components/peggy/PeggyCall.tsx");
  assert.match(call, /onError: \(message: unknown\) => \{\s*stopWaiting\(\);/);
  assert.match(call, /window\.setTimeout\(\(\) => \{\s*conversation\.endSession\(\);/);
  assert.match(call, /track\.stop\(\)/);
});

test("Peggy shows her image, not a letter", () => {
  for (const path of [
    "src/components/peggy/PeggyCall.tsx",
    "src/components/peggy/SetupWithPeggy.tsx",
    "src/components/support/admin/PeggyAutoReply.tsx",
    "src/components/support/admin/TicketWorkspace.tsx",
    "src/app/call-peggy/page.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /aria-hidden>P<\//, path);
    assert.match(source, /<Mascot name="peggy"/, path);
  }
});
