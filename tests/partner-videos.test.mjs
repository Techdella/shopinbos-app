// Delivery partners make videos with Rex, like sellers. No migration: VideoProject.storeId holds the OWNER id,
// Store.id for a seller and LogisticsPartner.id for a delivery partner (shared/video-owner.ts). The video routes and
// the AI endpoints the studio calls accept both roles; partners get no product videos, product pages or ads.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const owner = await import("../shared/video-owner.ts");
const pure = await import("../apps/mobile/src/lib/video-pure.ts");
const partnerPure = await import("../apps/mobile/src/lib/partner-pure.ts");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("owner id rule: store id for sellers, LogisticsPartner id for delivery partners, nobody else", () => {
  const ids = { storeId: "store_1", partnerId: "lp_1" };
  assert.equal(owner.videoOwnerId("seller", ids), "store_1");
  assert.equal(owner.videoOwnerId("logistics_partner", ids), "lp_1");
  assert.equal(owner.videoOwnerId("supplier", ids), null);
  assert.equal(owner.videoOwnerId("admin", ids), null);
  assert.equal(owner.videoOwnerId("seller", { partnerId: "lp_1" }), null, "a seller without a store has no videos");
  assert.equal(owner.videoOwnerId("logistics_partner", { storeId: "store_1" }), null, "a partner never borrows a store id");
  assert.deepEqual([...owner.VIDEO_ROLES], ["seller", "logistics_partner"]);
  assert.equal(owner.isVideoRole("logistics_partner"), true);
  assert.equal(owner.isVideoRole("supplier"), false);
});

test("partners: ad and social videos, only 'posted', and the partner web studio", () => {
  assert.deepEqual([...owner.videoPurposesFor("seller")], ["ad", "product", "social"]);
  assert.deepEqual([...owner.videoPurposesFor("logistics_partner")], ["ad", "social"]);
  assert.deepEqual([...owner.videoPlacesFor("seller")], ["product", "ad", "social"]);
  assert.deepEqual([...owner.videoPlacesFor("logistics_partner")], ["social"]);
  assert.equal(owner.webVideoStudioPath("seller", "v 1"), "/home/video/studio?id=v%201");
  assert.equal(owner.webVideoStudioPath("logistics_partner", "v1"), "/logistics/video/studio?id=v1");
  // The phone's "Finish on the web" uses the same rule.
  assert.equal(pure.webStudioPath("v1"), "/home/video/studio?id=v1");
  assert.equal(pure.webStudioPath("v1", "logistics_partner"), "/logistics/video/studio?id=v1");
});

test("the video routes and the studio's AI endpoints accept sellers and delivery partners", () => {
  for (const file of ["src/app/api/app/videos/route.ts", "src/app/api/app/videos/[id]/route.ts", "src/app/api/ai/reel/route.ts", "src/app/api/ai/reel-shots/route.ts", "src/app/api/ai/voiceover/route.ts", "src/app/api/ai/video-script/route.ts"]) {
    const src = read(file);
    assert.doesNotMatch(src, /withSeller\(/, `${file} is not seller-only`);
    assert.match(src, /withVideoMaker\(/, file);
  }
  const helper = read("src/lib/video/owner.server.ts");
  assert.match(helper, /withAuth\(handler, \[\.\.\.VIDEO_ROLES\]\)/);
  assert.match(helper, /logisticsPartner\.findUnique/);
  assert.match(helper, /videoOwnerId\(user\.role, \{ partnerId/);
  assert.match(helper, /videoOwnerId\(user\.role, \{ storeId/);

  // Every project read and write is scoped to the owner id, never to a store looked up again.
  const list = read("src/app/api/app/videos/route.ts");
  assert.match(list, /storeId: owner\.id/);
  assert.match(list, /LogisticsPartner\.id/, "the owner id rule is written in the route header");
  assert.match(list, /videoPurposesFor\(owner\.role\)/);
  const one = read("src/app/api/app/videos/[id]/route.ts");
  assert.match(one, /where: \{ id, storeId: owner\.id \}/);
  assert.match(one, /videoPlacesFor\(found\.owner\.role\)/, "partners can't publish to a product page or an ad");
  assert.doesNotMatch(one, /db\.store\.findUnique/);

  // Rex's shots use the partner's brand (name and logo from LogisticsPartner).
  assert.match(read("src/app/api/ai/reel-shots/route.ts"), /videoBrandContext\(owner\)/);
  assert.match(read("src/app/api/ai/video-script/route.ts"), /delivery business/);
});

test("phone: Rex Studio shows partners videos, and partners may open the video screens", () => {
  const studio = read("apps/mobile/src/app/studio.tsx");
  const partnerItems = studio.slice(studio.indexOf("const PARTNER_ITEMS"), studio.indexOf("export default"));
  assert.match(partnerItems, /id: "videos".*router\.push\("\/video"\).*partnerSub: "studio\.videosSubPartner"/);
  assert.match(read("apps/mobile/src/app/logistics/studio.tsx"), /export \{ default \} from "@\/app\/studio"/);

  for (const path of ["/video", "/video/studio", "/video/v1"]) {
    assert.equal(partnerPure.canVisit("logistics_partner", path), true, path);
    assert.equal(partnerPure.canVisit("seller", path), true, path);
    assert.equal(partnerPure.canVisit("supplier", path), false, `suppliers have no video API: ${path}`);
  }
  assert.equal(partnerPure.canVisit("logistics_partner", "/packaging"), false, "other seller screens stay closed");
  assert.equal(partnerPure.canVisit("logistics_partner", "/videos"), false);
});

test("phone: partner photos upload through the media library, and shop-only actions are hidden", () => {
  const studio = read("apps/mobile/src/app/video/studio.tsx");
  assert.match(studio, /partner \? await uploadMediaPhoto\(photo\) : await uploadProductPhoto\(photo\)/);
  assert.match(read("apps/mobile/src/lib/supplier.ts"), /uploadOnePhoto<\{ url: string \}>\("\/api\/app\/media"/);
  // /api/app/media takes every signed-in role; /api/upload is seller-only.
  assert.match(read("src/app/api/app/media/route.ts"), /export const POST = withAuth\(/);
  assert.match(read("src/app/api/upload/route.ts"), /withSeller\(/);
  assert.match(studio, /partner \? Promise\.resolve\(\[\] as StudioProduct\[\]\) : fetchStudioProducts\(\)/, "partners have no products to fetch");
  assert.match(studio, /webStudioPath\(id, role\)/);

  const hub = read("apps/mobile/src/app/video/index.tsx");
  assert.match(hub, /videoPurposesFor\(role\)\.map/);
  const watch = read("apps/mobile/src/app/video/[id].tsx");
  assert.equal((watch.match(/shop && row\.productId/g) ?? []).length, 2, "product page and boost are shop-only");
});

test("web: partner video pages reuse the studio without products or ads", () => {
  for (const page of ["src/app/logistics/video/page.tsx", "src/app/logistics/video/studio/page.tsx"]) {
    assert.ok(existsSync(new URL(`../${page}`, import.meta.url)), page);
    const src = read(page);
    assert.match(src, /requireRole\(\["logistics_partner"\]/);
    assert.match(src, /videoOwnerId\(user\.role, \{ partnerId: partner\.id \}\)/);
    assert.match(src, /\n\s+partner\n/);
  }
  const studioPage = read("src/app/logistics/video/studio/page.tsx");
  assert.match(studioPage, /reelBrand\(null, partner\.logoUrl/);
  assert.match(studioPage, /products=\{\[\]\}/);
  const studio = read("src/app/home/video/VideoStudio.tsx");
  assert.match(studio, /\{partner \? null : <PillButton[^\n]*useInAd/);
  assert.match(studio, /if \(!partner\) await fetch\("\/api\/ai\/rex\/actions"/);
  assert.match(read("src/app/home/video/VideoHub.tsx"), /video\.videoUrl && !partner/);
});

test("i18n: the partner words are in all five languages", () => {
  for (const lang of ["en", "pcm", "yo", "ha", "ig"]) {
    const video = read(`shared/i18n/messages/video/${lang}.ts`);
    for (const key of ["partner.about", "partner.aboutPh", "partner.hubSub", "partner.adHint", "partner.emptyPublished"]) assert.match(video, new RegExp(`"${key.replace(".", "\\.")}": "`), `${lang} ${key}`);
    assert.match(read(`shared/i18n/messages/m_grow/${lang}.ts`), /"studio\.videosSubPartner": "/, lang);
  }
});
