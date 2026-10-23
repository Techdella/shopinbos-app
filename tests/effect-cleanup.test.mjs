// React calls whatever an effect returns as its cleanup when the component unmounts. Newer Chrome makes
// scrollIntoView/scrollTo/scrollBy return a Promise, so `useEffect(() => el.scrollIntoView())` hands React a
// Promise and the page crashes on the way out ("TypeError: i is not a function"). Effects that only run a call
// use a block body, so nothing comes back by accident.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });
}

test("effects never return a call's result by accident", () => {
  // An expression-bodied effect: `useEffect(() => something...`. Fine when it returns a cleanup (`() => () => …`),
  // a cleanup function by name (`() => cancelClose`), or a state setter (always undefined).
  const expression = /use(Layout|Insertion)?Effect\(\s*\(\)\s*=>\s*(?![\s{])([^,]*)/g;
  const allowed = /^(\(\)\s*=>|set[A-Z]\w*\(|[A-Za-z_$][\w$]*\s*$)/;
  const offenders = [];
  for (const file of [...sources("src"), ...sources("shared")]) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(expression)) {
      if (allowed.test(match[2].trim())) continue;
      const line = text.slice(0, match.index).split("\n").length;
      offenders.push(`${file}:${line}: ${match[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, [], "Use a block body: useEffect(() => { … }, deps)");
});
