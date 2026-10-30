// Batch 4 fixes: supplier stock on the phone, voice messages that send, the notifications bell and tabs, riders'
// plate and log out, statuses as the shop, "your money" wording.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { appRouteFor } = await import("../shared/notifications.ts");
const status = await import("../shared/status.ts");

test("supplier stock: the edit screen sends it, an empty box isn't 0, a pending +/- is saved on leaving", () => {
  const edit = read("apps/mobile/src/app/supplier/product/edit.tsx");
  assert.match(edit, /stockQuantity: parseCount\(stock\)!,/);
  assert.match(edit, /if \(!stock\.trim\(\) \|\| parseCount\(stock\) === null\) return setError\(t\("new\.needStock"\)\);/);
  assert.match(read("apps/mobile/src/app/supplier/product/new.tsx"), /if \(!stock\.trim\(\) \|\| parseCount\(stock\) === null\)/);
  assert.match(read("apps/mobile/src/app/supplier/product/[id].tsx"), /if \(pendingStock\.current\) void quickEditProduct\(pendingStock\.current\.id/);
});

test("voice messages send once written down, on the phone and the web", () => {
  assert.match(read("apps/mobile/src/components/VoiceInput.tsx"), /if \(onSpoken\) onSpoken\(merged\);/);
  assert.match(read("apps/mobile/src/components/ChatScreen.tsx"), /onSpoken=\{\(text\) => onSend\(text\)\}/);
  for (const file of ["apps/mobile/src/app/rex.tsx", "apps/mobile/src/app/ask-peggy.tsx", "apps/mobile/src/app/partners/[id].tsx", "apps/mobile/src/app/help/[number].tsx"]) assert.match(read(file), /onSend=\{\(text\) => void (ask|send)\(text\)\}/, file);
  assert.match(read("src/components/voice/VoiceInputButton.tsx"), /if \(onSpoken\) onSpoken\(merged\);/);
  assert.match(read("src/components/conversations/Thread.tsx"), /onSpoken=\{\(spoken\) => send\(spoken\)\}/);
  assert.match(read("src/components/builder/rex/RexChat.tsx"), /onSpoken=\{\(spoken\) => void submit\(undefined, spoken\)\}/);
});

test("notifications: the phone's bell counts what it shows; tabs keep one size; more links open app screens", () => {
  const route = read("src/app/api/notifications/route.ts");
  assert.match(route, /rows\.filter\(\(row\) => !sellsDigitalGoods\(row\)\)\.length/);
  assert.equal((route.match(/unreadFor\(user\.id, req\)/g) ?? []).length, 2);
  assert.match(read("apps/mobile/src/app/notifications/index.tsx"), /<Segmented fitContent/);
  const cases = { "/home/start": "/start", "/refer": "/rewards", "/supplier/level": "/supplier/level", "/logistics/level": "/logistics/level", "/home/logistics/exceptions": "/delivery", "/supplier/products/bulk": "/supplier/products" };
  for (const [link, screen] of Object.entries(cases)) assert.equal(appRouteFor(link)?.pathname, screen, link);
  assert.deepEqual(appRouteFor("/suppliers/ada-wholesale"), { pathname: "/suppliers/[slug]", params: { slug: "ada-wholesale" } });
  assert.match(read("src/lib/notifications/notify.server.ts"), /input\.appRoute \? \{ appRoute: input\.appRoute \} : \{\}/);
});

test("riders: Bike saves the plate; Log out forgets the link and leaves", () => {
  const me = read("apps/mobile/src/app/rider/(tabs)/me.tsx");
  assert.match(me, /riderAction\(\{ action: "plate", plate \}\)/);
  assert.match(me, /await unregisterPushDevice\(\)[\s\S]*forgetRiderToken\(\);[\s\S]*router\.replace\("\/welcome"\)/);
  assert.match(read("src/app/api/mobile/logistics/rider/route.ts"), /z\.object\(\{ action: z\.literal\("plate"\), plate: z\.string\(\)\.max\(30\) \}\)/);
});

test("statuses: the shop's logo on Your status; suppliers see sellers and delivery partners", () => {
  assert.match(read("apps/mobile/src/app/(tabs)/home.tsx"), /latestPicture\(changedPictures, "logoUrl", data\?\.store\.logoUrl\) \?\? myPicture/);
  const me = { userId: "a", role: "supplier" };
  assert.equal(status.canSee(me, { userId: "b", role: "seller" }, false), true);
  assert.equal(status.canSee(me, { userId: "c", role: "logistics_partner" }, false), true);
  assert.equal(status.canSee(me, { userId: "d", role: "supplier" }, true), false);
});

test("\"your money\", not \"your share\", in English and Pidgin", () => {
  for (const ns of ["m_supplier", "m_money", "wallet", "intros", "tips", "m_find", "m_products", "supplier", "mail", "glossary"]) {
    for (const lang of ["en", "pcm"]) assert.doesNotMatch(read(`shared/i18n/messages/${ns}/${lang}.ts`), /\b[Yy]our share\b/, `${ns}/${lang}`);
  }
});
