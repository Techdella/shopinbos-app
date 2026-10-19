// App 404 / error pages: Peggy and Rex on stage, storefronts kept free of them, and the one-shot reload
// after a new deployment.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const reload = await import("../src/components/errors/chunk-reload.ts");
const copy = await import("../src/components/errors/copy.ts");

test("stale-build errors are recognised from every browser's wording and from server actions", () => {
  const chunk = new Error("Loading chunk 4512 failed.\n(error: https://app.shopinbos.com/_next/static/chunks/4512.js)");
  chunk.name = "ChunkLoadError";
  assert.equal(reload.isStaleBuildError(chunk), true);
  assert.equal(reload.isStaleBuildError({ name: "ChunkLoadError", message: "" }), true);
  // Next.js 16: a page from before a deploy calls a server action the new build renamed.
  const stale = Object.assign(new Error('Server Action "40f5378593cc0e761e085ecfc727811bba15a739c8" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'), { name: "UnrecognizedActionError" });
  assert.equal(reload.isStaleBuildError(stale), true);
  assert.equal(reload.isStaleBuildError(new Error('Server Action "abc123" was not found on the server.')), true);
  for (const message of [
    "Loading CSS chunk app-layout failed",
    "Failed to fetch dynamically imported module: https://app.shopinbos.com/_next/static/chunks/a.js",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    'Failed to find Server Action "7f3a". This request might be from an older or newer deployment.',
  ]) {
    assert.equal(reload.isStaleBuildError(new Error(message)), true, message);
  }
  for (const other of [new Error("Cannot read properties of undefined"), new TypeError("Failed to fetch"), null, undefined, "Loading chunk 1 failed", {}]) {
    assert.equal(reload.isStaleBuildError(other), false, String(other));
  }
});

test("a stale build reloads once; a repeat inside the cooldown shows the error instead of looping", () => {
  const error = new Error("Loading chunk 9 failed.");
  const now = 1_800_000_000_000;
  assert.equal(reload.shouldAutoReload(error, null, now), true);
  assert.equal(reload.shouldAutoReload(error, "", now), true);
  assert.equal(reload.shouldAutoReload(error, "garbage", now), true);
  assert.equal(reload.shouldAutoReload(error, String(now - 5_000), now), false, "just reloaded");
  assert.equal(reload.shouldAutoReload(error, String(now - reload.CHUNK_RELOAD_COOLDOWN_MS - 1), now), true, "a later deploy in the same tab");
  assert.equal(reload.shouldAutoReload(error, String(now + 60_000), now), true, "clock moved backwards");
  assert.equal(reload.shouldAutoReload(new Error("boom"), null, now), false, "ordinary errors never reload");
});

test("the deploy recovery hook guards with sessionStorage and the app, portal and global boundaries use it", () => {
  const hook = readFileSync("src/components/errors/useDeployRecovery.ts", "utf8");
  assert.match(hook, /sessionStorage\.getItem\(CHUNK_RELOAD_KEY\)/);
  assert.match(hook, /sessionStorage\.setItem\(CHUNK_RELOAD_KEY/);
  const pages = readFileSync("src/components/errors/AppErrorPages.tsx", "utf8");
  assert.match(pages, /useDeployRecovery\(error\)/);
  assert.match(pages, /title=\{t\("update\.title"\)\}/);
  assert.match(readFileSync("shared/i18n/messages/errors/en.ts", "utf8"), /"update\.title": "Shopinbos just got an update — reloading…"/);
  assert.match(readFileSync("src/components/errors/PortalErrorPages.tsx", "utf8"), /ErrorSceneFor/);
  assert.match(readFileSync("src/app/global-error.tsx", "utf8"), /GlobalAppError/);
});

test("app pages show the real mascots; storefront pages never do", () => {
  const scenes = readFileSync("src/components/errors/MascotScenes.tsx", "utf8");
  for (const src of [...scenes.matchAll(/src: "(\/brand\/[^"]+)"/g)].map((m) => m[1])) {
    assert.ok(existsSync(`public${src}`), `${src} exists`);
  }
  const pages = readFileSync("src/components/errors/AppErrorPages.tsx", "utf8");
  assert.match(pages, /<PeggySearchingScene \/>/);
  assert.match(pages, /<RexFixingScene \/>/);
  assert.match(pages, /<RexAndPeggyScene \/>/);
  for (const file of ["src/components/errors/StorefrontErrorPages.tsx", "src/components/errors/Illustrations.tsx", "src/components/storefront/shopper/StoreClosedPage.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from "[^"]*MascotScenes"|\/brand\/mascots|\/brand\/app|<Mascot\b/, `${file} stays on the store's own brand`);
  }
});

test("the new copy pools talk about Peggy and Rex and never repeat themselves", () => {
  for (const pool of [copy.APP_GLOBAL_ERROR_LINES, copy.APP_NOT_FOUND_LINES, copy.APP_ERROR_LINES]) {
    assert.ok(pool.length >= 3);
    assert.equal(new Set(pool).size, pool.length);
  }
  assert.equal(copy.APP_UPDATE_LINES.length, 1);
  assert.ok(copy.APP_NOT_FOUND_LINES.some((line) => line.includes("Peggy")));
  assert.ok(copy.APP_ERROR_LINES.some((line) => line.startsWith("It's not you, it's Rex")));
  assert.ok(copy.APP_GLOBAL_ERROR_LINES.some((line) => /Rex is fixing, Peggy is looking/.test(line)));
});
