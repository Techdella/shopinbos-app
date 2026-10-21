// Rex in the CMS: the content plan's ideas (src/lib/cms/content-plan.ts), Rex writing inside the post editor, the
// set-up shown after a collection's first item (style + menu), and store links that use the store's own address.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plan = await import("../src/lib/cms/content-plan.ts");

test("the plan window runs whole weeks from the start day", () => {
  assert.deepEqual(plan.planWindow(new Date("2026-10-21T15:00:00Z"), 4), { from: "2026-10-21", to: "2026-11-17" });
  assert.deepEqual(plan.planWindow(new Date("2026-10-21T00:00:00Z"), 1), { from: "2026-10-21", to: "2026-10-27" });
});

test("plan ideas keep only real collections and picked channels, with dates clamped and sorted", () => {
  const ideas = plan.cleanPlan(
    {
      ideas: [
        { date: "2026-11-30", kind: "cms", collectionId: "blog1", title: "Late one", brief: "b" },
        { date: "2026-10-01", kind: "social", channel: "instagram", title: "Early post", caption: "Hi #lamps" },
        { date: "2026-10-25", kind: "cms", collectionId: "someone-elses", title: "Not ours" },
        { date: "2026-10-25", kind: "social", channel: "x", title: "Channel not picked" },
        { date: "2026-10-26", kind: "cms", collectionId: "blog1", title: "" },
        "junk",
      ],
    },
    { collectionIds: ["blog1"], channels: ["instagram"], from: "2026-10-21", to: "2026-11-17" },
  );
  assert.deepEqual(ideas.map((idea) => [idea.date, idea.kind, idea.title]), [["2026-10-21", "social", "Early post"], ["2026-11-17", "cms", "Late one"]]);
  assert.equal(ideas[0].caption, "Hi #lamps");
  assert.equal(ideas[1].brief, "b");
  assert.equal(new Set(ideas.map((idea) => idea.id)).size, 2);
});

test("a bare array of ideas is read too, and an idea's brief falls back to its title", () => {
  const ideas = plan.cleanPlan([{ date: "2026-10-22", kind: "cms", collectionId: "c", title: "Guide" }], { collectionIds: ["c"], channels: [], from: "2026-10-21", to: "2026-10-27" });
  assert.equal(ideas[0].brief, "Guide");
});

test("Rex writes inside the editor: a full draft for the item and Ask Rex in the rich text toolbar", () => {
  const editor = read("src/app/home/cms/[collectionId]/[itemId]/ItemEditor.tsx");
  assert.match(editor, /\/api\/app\/cms\/collections\/\$\{props\.collection\.id\}\/write/);
  const rte = read("src/components/cms/RichTextEditor.tsx");
  assert.match(rte, /\/api\/app\/cms\/assist/);
  assert.match(read("src/app/api/app/cms/collections/[id]/write/route.ts"), /meterAi\(user\.id, "text"\)/);
  assert.match(read("src/app/api/app/cms/plan/route.ts"), /meterAi\(user\.id, "text", 2\)/);
});

test("the first item in a collection that isn't set up or in a menu opens the set-up", () => {
  const editor = read("src/app/home/cms/[collectionId]/[itemId]/ItemEditor.tsx");
  assert.match(editor, /!props\.collection\.setupDone && !props\.menu\.header && !props\.menu\.footer/);
  assert.match(editor, /\?setup=1/);
  const setup = read("src/app/home/cms/CollectionSetup.tsx");
  assert.match(setup, /setupDone: true/);
  assert.match(setup, /\/menu`/);
  assert.match(read("src/lib/cms/menu.server.ts"), /saveStoreNavigation\(/);
});

test("store links in the CMS screens use the store's own address, not /s/<slug> on the app", () => {
  for (const path of ["src/app/home/cms/page.tsx", "src/app/home/cms/[collectionId]/page.tsx", "src/app/home/cms/[collectionId]/[itemId]/ItemEditor.tsx"]) {
    assert.doesNotMatch(read(path), /`\/s\/\$\{/, path);
  }
});
