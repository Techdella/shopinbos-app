import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Gaps from the "Shopinbos Onboarding Screens" design canvas, closed on the phone: the seller sign-up's free link,
// Rex's logo note, the picked count, the product tip and "Add another one", Rex's vibes, "Continue with free link"
// and the next steps on "Your store is live!"; the supplier's pitch and the review checklist (S11); the delivery
// partner's way into the app from "You're in review" (L11); and the + sheet's video, ad, sale and pre-orders rows.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { supplierReviewItems } = await import("../apps/mobile/src/lib/supplier-pure.ts");

const base = {
  verificationStatus: "pending",
  idDocument: { status: "pending" },
  selfie: { status: "pending" },
  catalogueRequested: false,
  cac: null,
  tiers: { verifiedIndividual: false, registeredBusiness: false },
};

test("supplier review checklist: ID and selfie, the WhatsApp catalogue, CAC", () => {
  assert.deepEqual(supplierReviewItems(base), [
    { key: "id", state: "checking" },
    { key: "cac", state: "optional" },
  ]);
  assert.deepEqual(supplierReviewItems({ ...base, idDocument: null }).map((item) => item.state), ["needed", "optional"]);
  assert.equal(supplierReviewItems({ ...base, selfie: { status: "rejected" } })[0].state, "needed");
  assert.equal(supplierReviewItems({ ...base, tiers: { verifiedIndividual: true, registeredBusiness: false } })[0].state, "done");
  assert.deepEqual(supplierReviewItems({ ...base, catalogueRequested: true })[1], { key: "catalogue", state: "progress" });
  assert.equal(supplierReviewItems({ ...base, cac: { status: "pending" } }).at(-1).state, "checking");
  assert.equal(supplierReviewItems({ ...base, cac: { status: "rejected" } }).at(-1).state, "optional");
  assert.equal(supplierReviewItems({ ...base, tiers: { verifiedIndividual: true, registeredBusiness: true } }).at(-1).state, "done");
});

test("seller sign-up on the phone follows the canvas boards 05-15", () => {
  const phone = read("apps/mobile/src/app/onboarding/index.tsx");
  // 05: the free link under the name, checked with the same address route as the address step.
  assert.match(phone, /checkAddress\(wanted\)[\s\S]*setNameAddress/);
  assert.match(phone, /t\("name\.free", \{ host: nameAddress\.host \}\)/);
  assert.match(phone, /t\("name\.welcome", \{ name \}\)/);
  // 06 / 07: the sub line and Rex's note over the logo ideas.
  assert.match(phone, /t\("logo\.sub", \{ name: displayName \}\)/);
  assert.match(phone, /t\("logo\.rexSaid", \{ name: displayName \}\)/);
  // 08 / 09 / 10.
  assert.match(phone, /t\("sell\.picked", \{ count: chosen\.length \}\)/);
  assert.match(phone, /t\("ready\.title"\), t\("ready\.sub"\)/);
  assert.match(phone, /t\("product\.title"\), t\("product\.tip"\)/);
  // 11: Add product, or save and snap another one.
  assert.match(phone, /async function saveProduct\(another = false\)/);
  assert.match(phone, /void saveProduct\(true\)/);
  assert.match(phone, /if \(!another\) return forward\(\);/);
  // 12 / 13: Rex's vibes fill the "describe the vibe" box sent with the build.
  assert.match(phone, /const VIBES = \["bold", "soft", "gold", "clean"\] as const/);
  assert.match(phone, /tweak: vibe\.trim\(\) \|\| undefined/);
  // 14: no domain purchase on the phone, a free link to go on with.
  assert.match(phone, /t\("address\.continueFree"\)/);
  assert.doesNotMatch(phone, /searchDomains|\/api\/domains/);
  // 15: next steps finish onboarding, then open their screen over Home.
  for (const path of ["/wallet", "/delivery", "/add-products"]) assert.match(phone, new RegExp(`finish\\("${path}"\\)`));
  assert.match(phone, /router\.replace\("\/home"\);\n\s+if \(next\) router\.push\(next\);/);
});

test("supplier and delivery partner review screens, and the + sheet", () => {
  const supplier = read("apps/mobile/src/components/supplier/SupplierJoinFlow.tsx");
  assert.match(supplier, /t\("name\.pitch"\)/);
  assert.match(supplier, /supplierReviewItems\(current\)/);
  assert.match(supplier, /t\("review\.lookAround"\)/);
  const kyc = read("apps/mobile/src/components/kyc/CheckScreens.tsx");
  assert.match(kyc, /testID="kyc-look-around"[^\n]*router\.replace\("\/logistics\/jobs"\)/);
  const sheet = read("apps/mobile/src/components/CreateSheet.tsx");
  for (const path of ["/video", "/ads/new", "/campaigns/new", "/preorders"]) assert.match(sheet, new RegExp(`go\\("${path}"\\)`));
  assert.ok(sheet.indexOf('go("/create")') < sheet.indexOf('go("/video")'), "Make a post stays first");
});

test("every new word is in all five languages", () => {
  const keys = {
    sellerStart: ["name.welcome", "name.hintKnown", "name.free", "logo.sub", "logo.rexSaid", "sell.picked", "ready.sub", "product.tip", "product.titleNext", "details.later", "details.add", "details.another", "details.addedNext", "look.askRex", "look.vibe.bold", "look.vibe.soft", "look.vibe.gold", "look.vibe.clean", "address.noRush", "address.continueFree", "live.subPhone", "live.next", "live.next.bank", "live.next.bankSub", "live.next.delivery", "live.next.deliverySub", "live.next.products", "live.next.productsSub"],
    supplierJoin: ["name.pitch", "review.once", "review.lookAround", ...["id", "catalogue", "cac"].flatMap((item) => [`review.item.${item}`, `review.item.${item}.sub`, `review.item.${item}.done`]), ...["done", "checking", "progress", "optional", "needed"].map((state) => `review.state.${state}`)],
    m_kyc: ["q.done.lookAround", "q.done.open"],
    m_home: ["create.video", "create.videoSub", "create.more", "create.ad", "create.adSub", "create.sale", "create.saleSub", "create.preorders", "create.preordersSub", "create.web"],
  };
  for (const [ns, list] of Object.entries(keys)) {
    for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
      const source = read(`shared/i18n/messages/${ns}/${lang}.ts`);
      for (const key of list) assert.ok(source.includes(`"${key}":`), `${ns}/${lang} ${key}`);
    }
  }
});
