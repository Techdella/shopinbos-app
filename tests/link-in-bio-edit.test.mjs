// Link in bio, fully editable on the phone: the shop logo at the top (or another photo), every block kind added,
// edited (tap it), moved and removed, "My shop website" and "Add a new product"; the web has the same shortcuts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the server sends the shop's address and logo with the page", () => {
  const service = read("src/lib/bio/service.server.ts");
  assert.match(service, /storeUrl: buildStorefrontUrl\(store\),/);
  assert.match(service, /storeLogoUrl: store\.logoUrl \?\? "",/);
});

test("phone: logo, every block kind, edit by tapping", () => {
  const screen = read("apps/mobile/src/app/link-in-bio.tsx");
  assert.match(screen, /draft\.avatarUrl \|\| page\.data\.storeLogoUrl/);
  assert.match(screen, /t\("bio\.useLogo"\)/);
  assert.match(screen, /uploadPhoto\(picked\[0\], "brand"\)/);
  for (const kind of ["link", "whatsapp", "socials", "text", "shop", "arrivals", "track"]) assert.match(screen, new RegExp(`type: "${kind}"`), kind);
  assert.match(screen, /url: page\.data!\.storeUrl!/);
  assert.match(screen, /router\.push\("\/add-products" as never\)/);
  assert.match(screen, /setEditing\(\{ block, isNew: false \}\)/);
  assert.match(screen, /function BlockFields/);
});

test("web: My shop website and Add a new product", () => {
  const editor = read("src/app/home/social/link-in-bio/BioEditor.tsx");
  assert.match(editor, /url: initial\.storeUrl/);
  assert.match(editor, /href="\/products\/new"/);
});
