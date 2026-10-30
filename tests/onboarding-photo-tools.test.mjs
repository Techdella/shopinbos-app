// Onboarding D1a "Clean white backgrounds" (opt-in, paid per photo, asked first, Undo per photo) and the crop
// screen's true Brighten preview (the server's own sharp steps on a small copy, not a white overlay).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const i18n = await import("../shared/i18n/index.ts");
const rexBuild = (await import("../shared/i18n/messages/m_rexBuild/index.ts")).default;

test("cleaning photos is a paid Rex job per photo on the seller's own products, with a free restore for Undo", () => {
  const route = read("src/app/api/mobile/onboarding/photos/route.ts");
  assert.match(route, /await rex\.charge\("image", 1, "bg_remove"\)/, "priced as one background removal");
  assert.match(route, /EDIT_PROMPTS\.white_background/);
  assert.match(route, /runRexJob\(\{ user, kind: "image", clientKey: input\.clientKey/);
  assert.match(route, /where: \{ id: productId, storeId: store\.id \}/, "only the seller's own products");
  assert.match(route, /if \(!isOwnImageUrl\(input\.url\)\) return apiError/, "restore takes only our own storage URLs");
  assert.match(route, /if \(!isOwnImageUrl\(source\)\)/);
  // The cost is shown before asking: GET /api/mobile/onboarding sends it.
  assert.match(read("src/app/api/mobile/onboarding/route.ts"), /bgRemove: prices\?\.costs\.bg_remove/);
});

test("the products step never cleans without a yes: the switch states the price, turning it on asks first", () => {
  const screen = read("apps/mobile/src/components/rex-build/products.tsx");
  const [hook] = screen.split("function CleanPanel")[0].split("function useCleanPhotos").slice(1);
  assert.match(hook, /const \[on, setOn\] = useState\(false\)/, "off until the seller says yes");
  assert.match(screen, /onPress=\{\(\) => \(clean\.on \? clean\.setOn\(false\) : setAsking\(true\)\)\}/, "turning it on opens the ask");
  assert.match(screen, /t\("clean\.askBody", \{ count: clean\.cost \}\)/);
  assert.match(screen, /t\("clean\.askNow", \{ count: waiting\.length, credits: total \}\)/);
  assert.match(screen, /if \(clean\.on\) \{/, "new photos are cleaned only while it's on");
  assert.match(screen, /clean\.undo\(product\.id\)/, "Undo per photo");
  // One at a time, stopping at the first refusal (out of credits): nothing more is charged.
  assert.match(hook, /for \(const id of todo\)/);
  assert.match(hook, /break;/);
  const words = (key, vars) => i18n.formatMessage(rexBuild.en[key], vars, "en");
  assert.equal(words("clean.switch", { count: 3 }), "Clean white backgrounds (3 credits a photo)");
  assert.equal(words("clean.askNow", { count: 4, credits: 12 }), "Photos to clean now: 4. Total: 12 credits.");
  assert.equal(words("clean.yesNow", { count: 12 }), "Yes, clean them (12 credits)");
});

test("Brighten on the crop screen shows the real result: a small preview from the server, per level, debounced", () => {
  const route = read("src/app/api/mobile/store-editor/photo/route.ts");
  assert.match(route, /action: z\.literal\("brightenPreview"\)/);
  assert.match(route, /const image = await brightened\(url, level, 640\);/, "the same steps as the real one, small");
  assert.match(route, /data:image\/jpeg;base64,/, "sent inline, never stored");
  // Both the preview and the real photo come from one function, so they can't drift apart.
  assert.equal((route.match(/\.modulate\(/g) ?? []).length, 1);
  const crop = read("apps/mobile/src/components/store-editor/photo.tsx");
  assert.match(crop, /brightenPreview\(picked\.url, bright\)/);
  assert.match(crop, /}, 350\);/, "asked a moment after the last tap");
  assert.match(crop, /source=\{\{ uri: shownUri \}\}/);
  assert.doesNotMatch(crop, /backgroundColor: "#FFFFFF", opacity: 0\.07 \* bright/, "the white overlay guess is gone");
});
