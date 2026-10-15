// The store builder never loses work: leaving with unsaved edits asks first, edits that didn't reach the server
// come back from this browser's copy, the page and section the seller was on come back, and "Preview store"
// shows the store as shoppers see it. Source checks (the builder is a client component).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const builder = read("src/components/builder/editor/Builder.tsx");
const hook = read("src/components/builder/editor/useBuilder.ts");
const topBar = read("src/components/builder/editor/TopBar.tsx");
const { tFor, LOCALES } = await import("../shared/i18n/catalog.ts");

test("leaving with unsaved edits asks: save and leave, leave without saving, keep editing", () => {
  assert.match(builder, /if \(b\.dirty\) \{\s*setLeaving\(destination\);\s*return;/);
  assert.match(builder, /role="alertdialog"/);
  for (const words of ["Save and leave", "Leave without saving", "Keep editing"]) assert.match(builder, new RegExp(`tx\\("${words}"\\)`));
  // Save and leave only goes once the save worked; leaving without saving drops the browser copy.
  assert.match(builder, /const ok = await b\.save\(\{ quiet: true \}\);\s*setLeaveSaving\(false\);\s*if \(ok\) router\.push\(leaving\);/);
  assert.match(builder, /b\.forgetUnsaved\(\);\s*router\.push\(leaving\);/);
  // Closing the tab still warns.
  assert.match(hook, /addEventListener\("beforeunload"/);
});

test("autosave, plus a browser copy of unsaved edits that comes back next time", () => {
  assert.match(hook, /const AUTOSAVE_MS = 5000;/);
  assert.match(hook, /writeBackup\(store\.slug, draftRef\.current\)/);
  assert.match(hook, /if \(!dirty\) \{\s*writeBackup\(store\.slug, null\);/, "dropped once the server has them");
  assert.match(hook, /Date\.parse\(backup\.at\) >= serverAt/, "a newer save from another device wins");
  assert.match(hook, /We brought back edits that hadn't saved yet\./);
});

test("the page and section come back where the seller stopped", () => {
  assert.match(builder, /shopinbos:editor-place:/);
  assert.match(builder, /setEntryId\(target\.pageType\)/);
});

test("Preview store: shoppers' view, no editing tools, Esc or Back to editing returns", () => {
  assert.match(builder, /const editing = !preview && !storePreview;/);
  assert.match(builder, /event\.key === "Escape" && storePreview/);
  assert.match(topBar, /tx\(props\.previewingStore \? "Back to editing" : "Preview store"\)/);
});

test("words: the new builder words in all five languages", () => {
  const keys = ["Preview store", "Back to editing", "Save your changes?", "Save and leave", "Leave without saving", "Keep editing", "We brought back edits that hadn't saved yet."];
  for (const locale of LOCALES) {
    const t = tFor(locale, "builder");
    for (const key of keys) assert.notEqual(t(`ed.${key}`), `ed.${key}`, `${locale} ${key}`);
  }
});
