// The app asks with its own dialogs (src/components/ui/dialogs.tsx), never the browser's confirm/alert/prompt boxes.
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

test("no browser-native confirm, alert or prompt boxes in the app", () => {
  const native = /window\.(confirm|alert|prompt)\s*\(|(?<![\w.$])(confirm|alert|prompt)\s*\(/;
  // A file that names its own confirm/prompt (a helper, a destructured field) is calling that, not the browser's.
  const local = /\b(function|const|let)\s+(confirm|prompt)\b|\b(confirm|prompt)\s*[:?]\s*[(:A-Z]/;
  const offenders = [];
  for (const file of sources("src")) {
    if (file.endsWith(join("components", "ui", "dialogs.tsx"))) continue; // the no-host fallback lives here
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, "");
      const match = code.match(native);
      if (!match) return;
      if (!code.includes("window.") && local.test(text)) return;
      offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], "use confirmDialog / alertDialog / promptDialog from @/components/ui/dialogs");
});

test("the dialog host is mounted for every page", () => {
  assert.match(readFileSync("src/components/ClientLayout.tsx", "utf8"), /<DialogHost \/>/);
});
