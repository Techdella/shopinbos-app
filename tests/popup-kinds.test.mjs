// Pop-up kinds and the finer templates: the template list, old saved looks reading exactly as before, the new
// settings with safe defaults, lead-magnet and button links, the countdown, the gift-box reveal, the server
// wiring (prizes and codes only from the server, the download link only after sign-up) and the words in all
// five languages. Node strips the types natively.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const forms = await import("../src/lib/marketing/forms.ts");
const kinds = await import("../src/lib/marketing/popup-kinds.ts");
const g = await import("../src/lib/gamification/logic.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The original eight looks as they were before the finer templates (their stored values must never change:
// older pop-ups saved only some fields and fill the rest from these).
const ORIGINAL = {
  classic: { layout: "modal", style: {} },
  split: { layout: "modal", style: { imagePosition: "left", size: "large", radius: "soft", closeStyle: "circle" } },
  takeover: { layout: "fullscreen", style: { imagePosition: "background", size: "large", radius: "square", overlay: 0 } },
  corner: { layout: "flyout", style: { imagePosition: "none", size: "small", radius: "soft", closeStyle: "circle" } },
  badge: { layout: "modal", style: { imagePosition: "none", radius: "soft", font: "modern", background: "#FFF8EC", text: "#1D1A16", button: "#E4572E", buttonText: "#FFFFFF" } },
  minimal: { layout: "modal", style: { imagePosition: "none", size: "small", radius: "square", background: "#FFFFFF", text: "#111111", button: "#111111", buttonText: "#FFFFFF", font: "clean", overlay: 30, closeStyle: "text" } },
  luxe: { layout: "modal", style: { imagePosition: "left", size: "large", radius: "square", font: "elegant", background: "#14110F", text: "#F3EBDD", button: "#C8A462", buttonText: "#14110F", overlay: 70, closeStyle: "circle" } },
  festive: { layout: "modal", style: { imagePosition: "top", radius: "round", font: "modern", background: "#FFF4E0", text: "#2B1608", button: "#0F7B4F", buttonText: "#FFFFFF", closeStyle: "circle" } },
};
const OLD_FIELDS = ["background", "text", "button", "buttonText", "radius", "font", "imagePosition", "size", "overlay", "closeStyle", "badgeText"];
const OLD_DEFAULT = { template: "classic", background: "", text: "", button: "", buttonText: "", radius: "round", font: "theme", imagePosition: "top", size: "medium", overlay: 50, closeStyle: "icon", badgeText: "" };

test("templates: at least 20 distinct looks across every kind, each complete and surviving a save and read", () => {
  const list = forms.POPUP_TEMPLATES;
  assert.ok(list.length >= 20, `${list.length} templates`);
  const ids = list.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  assert.deepEqual(ids, [...forms.POPUP_TEMPLATE_IDS], "the id list and the templates match");
  for (const kind of kinds.POPUP_KINDS) assert.ok(forms.templatesForKind(kind).length >= 2, `${kind} has a choice of templates`);
  assert.ok(forms.templatesForKind("signup").length >= 8);
  assert.ok(list.filter((t) => t.seasonal).length >= 4, "seasonal looks (Detty December, Sallah, Black Friday, Valentine's…)");
  const looks = new Set();
  for (const t of list) {
    assert.ok(["modal", "flyout", "bar", "fullscreen"].includes(t.layout), t.id);
    assert.ok(kinds.POPUP_KINDS.includes(t.kind), t.id);
    assert.equal(t.style.template, t.id);
    assert.equal(t.style.version, 2, `${t.id} is a finer look`);
    assert.deepEqual(forms.readPopupStyle(t.style), t.style, `${t.id} survives a save and read`);
    assert.ok(t.words.headline.trim() && t.words.body.trim(), `${t.id} has starter words`);
    assert.ok(forms.POPUP_ARTS.includes(t.style.art));
    if (t.style.imagePosition !== "none" && t.layout !== "bar") assert.ok(t.style.art, `${t.id} shows a built-in picture until the seller adds one`);
    if (t.kind === "game") assert.ok(["wheel", "scratch", "box"].includes(t.config?.game), `${t.id} names its game`);
    if (kinds.hasCta(t.kind)) assert.ok(t.words.ctaLabel, `${t.id} has button words`);
    if (/\{amount\}/.test(t.words.headline + t.words.body)) assert.equal(t.kind, "free_delivery", "{amount} is only filled in on free-delivery pop-ups");
    if (t.reward) assert.ok(["percentage", "fixed_amount", "free_shipping"].includes(t.reward.type));
    looks.add(JSON.stringify([t.layout, t.style.background, t.style.button, t.style.imagePosition, t.style.decor, t.style.art]));
  }
  assert.equal(looks.size, list.length, "no two templates look the same");
  const games = forms.templatesForKind("game").map((t) => t.config.game);
  for (const game of ["wheel", "scratch", "box"]) assert.ok(games.includes(game), `a ${game} template`);
  const rewards = forms.templatesForKind("signup").map((t) => t.reward);
  assert.ok(rewards.some((r) => r?.type === "percentage") && rewards.some((r) => r?.type === "fixed_amount") && rewards.some((r) => r?.type === "free_shipping") && rewards.some((r) => r?.mystery), "% off, ₦ off, free delivery and mystery gift");
  assert.ok(forms.POPUP_TEMPLATES.some((t) => t.config?.trigger === "exit_intent" && t.kind === "signup"), "a wait-don't-go template");
  assert.ok(forms.POPUP_TEMPLATES.some((t) => t.config?.onlyWithCart), "a cart reminder");
});

test("old looks: the original eight keep their values; old saved styles read exactly as before", () => {
  for (const [id, original] of Object.entries(ORIGINAL)) {
    const t = forms.popupTemplate(id);
    assert.equal(t.layout, original.layout, `${id} layout`);
    const expected = { ...OLD_DEFAULT, ...original.style };
    for (const key of OLD_FIELDS) assert.equal(t.style[key], expected[key], `${id}.${key} unchanged`);
  }
  // Saved before the finer looks (no version): every newer setting is "like before", whatever the look's new defaults.
  const luxe = forms.readPopupStyle({ template: "luxe" });
  assert.equal(luxe.version, 1);
  assert.equal(luxe.background, "#14110F");
  assert.equal(luxe.decor, "edge", "the gold line luxe always had");
  assert.equal(luxe.animation, "none", "old pop-ups don't start moving");
  assert.equal(luxe.art, "", "no built-in picture appears on an old pop-up");
  assert.equal(luxe.align, "left");
  assert.equal(forms.readPopupStyle({ template: "festive" }).decor, "strip", "festive keeps its stripes");
  assert.equal(forms.readPopupStyle({ template: "badge" }).bigBadge, true, "the badge look keeps its big badge");
  assert.equal(forms.readPopupStyle({ template: "classic" }).bigBadge, false);
  const saved = { template: "split", background: "#FFFFFF", text: "#111111", button: "#E4572E", buttonText: "#FFFFFF", radius: "soft", font: "theme", imagePosition: "left", size: "large", overlay: 50, closeStyle: "circle", badgeText: "" };
  const back = forms.readPopupStyle(saved);
  for (const key of Object.keys(saved)) assert.equal(back[key], saved[key], key);
  assert.equal(back.version, 1);
  assert.equal(back.focusX, 50);
  assert.equal(back.imageFit, "cover");
  // Forms saved before styles existed: the default, with the newer fields at their "like before" values.
  assert.deepEqual(forms.readDesign({ headline: "Hi" }).style, forms.DEFAULT_POPUP_STYLE);
  for (const [key, value] of Object.entries(OLD_DEFAULT)) assert.equal(forms.DEFAULT_POPUP_STYLE[key], value, key);
  assert.equal(forms.DEFAULT_POPUP_STYLE.version, 1);
});

test("new style fields: version 2 fills gaps from the look; bad values fall back; focus is clamped", () => {
  const v2 = forms.readPopupStyle({ template: "valentine", version: 2 });
  assert.equal(v2.decor, "hearts");
  assert.equal(v2.art, "hearts");
  assert.equal(v2.imagePosition, "right");
  const bad = forms.readPopupStyle({ template: "valentine", version: 2, decor: "skulls", animation: "explode", art: "https://evil.example/x.png", focusX: 400, focusY: -5, imageFit: "stretch", align: "justify", accent: "pink" });
  assert.equal(bad.decor, "hearts");
  assert.equal(bad.animation, forms.popupTemplate("valentine").style.animation);
  assert.equal(bad.art, "hearts", "only built-in pictures, never a link");
  assert.equal(bad.focusX, 100);
  assert.equal(bad.focusY, 0);
  assert.equal(bad.imageFit, "cover");
  assert.equal(bad.align, "left");
  assert.equal(bad.accent, "", "not a colour");
  assert.equal(forms.readPopupStyle({ version: "2" }).version, 2);
  assert.equal(forms.readPopupStyle({ version: 7 }).version, 2);
  assert.equal(forms.readPopupStyle({ template: "luxe", version: 2, decor: "none" }).decor, "none", "a seller can take the touch off");
});

test("design and config: new fields read with safe defaults (old forms are sign-up pop-ups)", () => {
  const design = forms.readDesign({ headline: "Hi" });
  assert.equal(design.eyebrow, "");
  assert.equal(design.imageAlt, "");
  assert.equal(design.ctaLabel, "Shop now");
  assert.equal(design.ctaTarget, "shop");
  assert.equal(forms.readDesign({ ctaTarget: "evil", eyebrow: "x".repeat(99) }).ctaTarget, "shop");
  assert.equal(forms.readDesign({ eyebrow: "x".repeat(99) }).eyebrow.length, 40);

  const old = forms.readPopupConfig({ layout: "flyout", timing: "exit_intent", reward: { type: "percentage", value: 10 } });
  assert.equal(old.kind, "signup");
  assert.equal(old.game, "wheel");
  assert.equal(old.collect, "either");
  assert.equal(old.playEveryDays, 7);
  assert.equal(old.onlyWithCart, false);
  assert.equal(old.leadMagnet, null);
  assert.equal(old.endsAt, null);
  assert.equal(old.freeDeliveryOver, 0);
  assert.equal(old.reward.type, "percentage");

  const c = forms.readPopupConfig({ kind: "game", game: "box", collect: "whatsapp", playEveryDays: 9999, onlyWithCart: "yes", endsAt: "not a date", freeDeliveryOver: -5 });
  assert.equal(c.kind, "game");
  assert.equal(c.game, "box");
  assert.equal(c.collect, "whatsapp");
  assert.equal(c.playEveryDays, 365);
  assert.equal(c.onlyWithCart, false, "only a real true");
  assert.equal(c.endsAt, null);
  assert.equal(c.freeDeliveryOver, 0);
  assert.equal(forms.readPopupConfig({ kind: "hack" }).kind, "signup");
  assert.equal(forms.readPopupConfig({ kind: "countdown", endsAt: "2026-10-31T18:00:00+01:00" }).endsAt, "2026-10-31T17:00:00.000Z");
});

test("rewards: free delivery and mystery gifts; old rewards unchanged; a mystery never shows before sign-up", () => {
  const legacy = forms.readReward({ type: "percentage", value: 10, days: 14 });
  assert.deepEqual(legacy, { source: "new", type: "percentage", value: 10, days: 14, minOrder: 0, unique: true, discountId: null, code: "", prefix: "WELCOME" });
  const free = forms.readReward({ source: "new", type: "free_shipping", value: 500 });
  assert.equal(free.type, "free_shipping");
  assert.equal(free.value, 0);
  assert.equal(forms.rewardLabel(free), "Free delivery");
  assert.equal(forms.readReward({ source: "new", type: "bogo", value: 1 }), null, "buy-one-get-one isn't made here");
  const mystery = forms.readReward({ source: "new", type: "percentage", value: 15, mystery: true });
  assert.equal(mystery.mystery, true);
  assert.equal("mystery" in forms.readReward({ source: "new", type: "percentage", value: 15, mystery: "yes" }), false);
  const summary = forms.mysterySummary(5000);
  assert.equal(summary.value, 0, "no value before sign-up");
  assert.doesNotMatch(summary.label, /\d/, "no amount in the label");
  assert.equal(summary.minOrder, 5000);
  assert.equal(forms.badgeText(forms.popupTemplate("mystery").style, summary), "MYSTERY GIFT");
  assert.equal(forms.badgeText(forms.popupTemplate("badge").style, { type: "free_shipping", value: 0 }), "FREE DELIVERY");
  const rewards = read("src/lib/marketing/popup-rewards.server.ts");
  assert.match(rewards, /if \(reward\.mystery\) return mysterySummary/, "the public summary hides a mystery");
});

test("showing: people on the list skip sign-up pop-ups only; cart reminders need a bag; ended sales never show", () => {
  const base = { devices: ["mobile", "desktop"], pages: "all", frequency: "always", frequencyDays: 7 };
  const visit = { path: "/s/ada", isMobile: false, lastShownAt: null, shownThisSession: false, subscribed: true, now: Date.parse("2026-10-20T10:00:00Z"), cartCount: 0 };
  assert.equal(forms.popupAllowed({ ...base, kind: "signup" }, visit), false);
  assert.equal(forms.popupAllowed({ ...base, kind: "lead_magnet" }, visit), false);
  assert.equal(forms.popupAllowed({ ...base, kind: "announcement" }, visit), true);
  assert.equal(forms.popupAllowed({ ...base, kind: "game" }, visit), true);
  assert.equal(forms.popupAllowed(base, visit), false, "old pop-ups are sign-up pop-ups");
  assert.equal(forms.popupAllowed({ ...base, kind: "announcement", onlyWithCart: true }, visit), false, "empty bag");
  assert.equal(forms.popupAllowed({ ...base, kind: "announcement", onlyWithCart: true }, { ...visit, cartCount: 2 }), true);
  const sale = { ...base, kind: "countdown", endsAt: "2026-10-20T12:00:00.000Z" };
  assert.equal(forms.popupAllowed(sale, visit), true);
  assert.equal(forms.popupAllowed(sale, { ...visit, now: Date.parse("2026-10-20T12:00:01Z") }), false);
  assert.equal(forms.popupAllowed({ ...base, kind: "countdown", endsAt: null }, visit), false, "a countdown with no end doesn't show");
});

test("lead magnet: only https download links, no credentials; a name from the file", () => {
  assert.equal(kinds.safeDownloadUrl("https://cdn.example.com/size-guide.pdf"), "https://cdn.example.com/size-guide.pdf");
  for (const bad of ["http://cdn.example.com/a.pdf", "javascript:alert(1)", "data:application/pdf;base64,AAAA", "//evil.example/a.pdf", "https://user:pw@evil.example/a.pdf", "https://a b.com/x", "", null, 42, `https://x.com/${"a".repeat(1200)}`]) {
    assert.equal(kinds.safeDownloadUrl(bad), null, String(bad).slice(0, 40));
  }
  assert.deepEqual(kinds.readLeadMagnet({ url: "https://cdn.example.com/g.pdf", name: "  Free size guide ", emailIt: false }), { url: "https://cdn.example.com/g.pdf", name: "Free size guide", emailIt: false });
  assert.deepEqual(kinds.readLeadMagnet({ url: "https://cdn.example.com/g.pdf" }), { url: "https://cdn.example.com/g.pdf", name: "Your free download", emailIt: true });
  assert.equal(kinds.readLeadMagnet({ url: "javascript:alert(1)", name: "x" }), null);
  assert.equal(kinds.readLeadMagnet(null), null);
  assert.equal(forms.readPopupConfig({ kind: "lead_magnet", leadMagnet: { url: "http://x.com/a.pdf" } }).leadMagnet, null);
  assert.equal(kinds.downloadNameFromFile("C:\\docs\\size_guide-2026.pdf"), "size guide 2026");
  assert.equal(kinds.collectsSignup("lead_magnet"), true);
  assert.equal(kinds.collectsSignup("game"), false);
});

test("buttons: store paths stay on the store, links must be https, bag and checkout follow the store's address", () => {
  assert.equal(kinds.ctaHref("shop", "/anything", "/s/ada"), null, "keep shopping closes the pop-up");
  assert.equal(kinds.ctaHref("cart", "", "/s/ada"), "/s/ada/cart");
  assert.equal(kinds.ctaHref("checkout", "", ""), "/checkout", "on the store's own domain");
  assert.equal(kinds.ctaHref("link", "/collections/new", "/s/ada/"), "/s/ada/collections/new");
  assert.equal(kinds.ctaHref("link", "https://wa.me/2348031234567", "/s/ada"), "https://wa.me/2348031234567");
  for (const bad of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "http://plain.example", "data:text/html,x", ""]) assert.equal(kinds.ctaHref("link", bad, "/s/ada"), null, bad);
});

test("countdown: whole days, hours, minutes and seconds; ended at zero; words fill {amount}", () => {
  const now = Date.parse("2026-10-20T10:00:00Z");
  assert.deepEqual(kinds.countdownParts("2026-10-22T15:30:05Z", now), { days: 2, hours: 5, minutes: 30, seconds: 5, ended: false });
  assert.deepEqual(kinds.countdownParts("2026-10-20T09:00:00Z", now), { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true });
  assert.equal(kinds.countdownParts(null, now).ended, true);
  assert.equal(kinds.countdownParts("2026-10-20T10:00:00.900Z", now).ended, true, "under a second left counts as ended");
  assert.equal(kinds.fillWords("Free delivery over {amount}. Spend {amount}!", { amount: "₦20,000" }), "Free delivery over ₦20,000. Spend ₦20,000!");
  assert.equal(kinds.toLocalInput("2026-10-31T17:00:00.000Z", -60), "2026-10-31T18:00", "Lagos is UTC+1");
  assert.equal(kinds.toLocalInput(null), "");
  assert.equal(kinds.readEndsAt("2026-02-30T99:00"), null);
});

test("gift boxes: the opened box shows the server's prize, the others show different prizes", () => {
  assert.equal(g.GIFT_BOXES, 3);
  for (let seed = 0; seed < 200; seed++) {
    for (let chosen = 0; chosen < 3; chosen++) {
      const prize = seed % 6;
      const boxes = g.boxReveal(prize, chosen, 3, 6, seed);
      assert.equal(boxes.length, 3);
      assert.equal(boxes[chosen], prize, "the chosen box holds the drawn prize");
      const others = boxes.filter((_, i) => i !== chosen);
      assert.ok(others.every((index) => index !== prize && index >= 0 && index < 6), "the others are other prizes");
      assert.equal(new Set(others).size, 2, "no repeats while there are enough prizes");
    }
  }
  assert.deepEqual(g.boxReveal(2, 1, 3, 6, 42), g.boxReveal(2, 1, 3, 6, 42), "same seed, same reveal");
  assert.deepEqual(g.boxReveal(0, 9, 3, 1, 1), [0, 0, 0], "one prize only: every box shows it; a bad pick is clamped");
  assert.equal(g.boxReveal(1, -4, 3, 4, 7)[0], 1);
  assert.match(g.gameCode(g.GAME_CODE_PREFIXES.box, [1, 2, 3, 4, 5, 6, 7, 8]), /^BOX-[2-9A-HJKMNP-Z]{8}$/);
  assert.equal(g.isGameCode("BOX-7KQ2MXAB"), true);
});

test("wiring: prizes and codes come from the server; the pop-up's settings are read from the database", () => {
  const route = read("src/app/api/public/store/[slug]/game/play/route.ts");
  assert.match(route, /game: z\.enum\(\["wheel", "scratch", "post_purchase", "box"\]\)/);
  assert.match(route, /db\.storeForm\.findFirst\(\{ where: \{ id: input\.formId, storeId: store\.id, active: true, isPopup: true \}/, "only this store's live pop-up");
  assert.match(route, /popup\.kind !== "game" \|\| popup\.game !== input\.game/, "the pop-up must be for this very game");
  assert.match(route, /input\.game === "box"\) \{\s*return withCors\(req, apiError/, "a gift box needs its pop-up");
  assert.match(route, /checkRateLimitShared/, "per-player limit still applies");
  const play = read("src/lib/gamification/play.server.ts");
  assert.match(play, /randomInt\(tickets\)/, "the server draws");
  assert.match(play, /maxUses: 1/);
  assert.match(play, /canPlayAgain\(await lastPlay\(store\.id, input\.game, key\), frequencyDays\)/, "one play per person per period");
  assert.match(play, /input\.game === "box" && !popup/);
  const client = read("src/components/storefront/marketing/PopupGame.tsx");
  assert.match(client, /\/game\/play/);
  assert.doesNotMatch(client, /pickWeighted|randomInt/, "the page never picks a real prize");
  assert.match(read("src/lib/gamification/stats.server.ts"), /GAME_CODE_PREFIXES\.box/);
  assert.match(read("src/app/home/marketing/forms/page.tsx"), /startsWith: "BOX-"/, "prize codes can't be handed out as a sign-up reward");
});

test("wiring: the download link only comes back after a real sign-up; saves are checked on the server", () => {
  const publicGet = read("src/app/api/public/store/[slug]/marketing/route.ts");
  assert.match(publicGet, /leadMagnet: leadMagnet \? \{ name: leadMagnet\.name \} : null/, "the storefront only gets the name");
  assert.match(publicGet, /event: z\.enum\(\["view", "click"\]\)/);
  const subscribe = read("src/app/api/public/store/[slug]/marketing/subscribe/route.ts");
  assert.match(subscribe, /download: download \? \{ url: download\.url, name: download\.name, emailed \} : null/);
  assert.match(subscribe, /sendLeadMagnetEmail\(/);
  const schemas = read("src/app/api/app/marketing/schemas.ts");
  assert.match(schemas, /kind: z\.enum\(POPUP_KINDS\)/);
  assert.match(schemas, /safeDownloadUrl\(value\) !== null/);
  assert.match(schemas, /safeCtaUrl\(value\) !== null/);
  assert.match(schemas, /template: z\.enum\(POPUP_TEMPLATE_IDS\)/);
  assert.match(schemas, /superRefine/);
  assert.match(read("src/app/api/app/marketing/forms/stored.ts"), /collectsSignup\(input\.popupConfig\.kind\)/, "only sign-up kinds make reward codes");
  const email = read("src/lib/email/store-emails.ts");
  assert.match(email, /export function leadMagnetEmail/);
});

test("renderer: version 1 looks keep their old drawing; motion respects reduced motion; images get alt text and focus", () => {
  const view = read("src/components/storefront/marketing/PopupView.tsx");
  assert.match(view, /prefers-reduced-motion: reduce/);
  assert.match(view, /const fine = style\.version >= 2/);
  assert.match(view, /alt=\{design\.imageAlt \|\| ""\}/);
  assert.match(view, /objectPosition: focus/);
  assert.match(view, /FESTIVE_STRIP/, "the old festive stripes");
  assert.match(view, /aria-label="Close"/);
  assert.match(view, /role="timer"/);
  assert.doesNotMatch(read("src/components/storefront/marketing/PopupArt.tsx"), /https?:\/\/(?!www\.w3\.org)/, "built-in pictures load nothing from outside");
});

test("words: every new editor word exists in all five languages", async () => {
  const langs = ["en", "pcm", "yo", "ha", "ig"];
  const sets = await Promise.all(langs.map(async (lang) => (await import(`../shared/i18n/messages/marketing/${lang}.ts`)).default));
  const needed = [
    ...forms.POPUP_TEMPLATE_IDS.map((id) => `forms.tpl.${id}`),
    ...kinds.POPUP_KINDS.flatMap((kind) => [`forms.kind.${kind}`, `forms.kind.${kind}.sub`]),
    ...forms.POPUP_DECORS.map((decor) => `forms.decor.${decor}`),
    ...forms.POPUP_ANIMATIONS.map((animation) => `forms.animation.${animation}`),
    ...forms.POPUP_ARTS.map((art) => `forms.art.${art || "none"}`),
    ...kinds.CTA_TARGETS.map((target) => `forms.cta.target.${target}`),
    ...kinds.POPUP_GAMES.map((game) => `forms.game.${game}`),
    ...["either", "email", "whatsapp"].map((c) => `forms.game.collect.${c}`),
    "forms.picture.right",
    "forms.imageFit.cover",
    "forms.imageFit.contain",
    "forms.align.left",
    "forms.align.center",
    "forms.gallery.all",
    "forms.gallery.seasonal",
  ];
  const en = sets[0];
  const newKeys = Object.keys(en).filter((key) => /^forms\.(kind|lead|cta|countdown|freeDelivery|game|gallery|decor|animation|art|focus|imageFit|imageAlt|align|eyebrow|preview\.(before|after)Play|reward\.mystery|onlyWithCart|clicksWord|playsWord|moreStyle|colour\.accent|bigBadge|pictureTitle|pictureHint|changeTemplate|hideTemplates|keepsWords|pickTemplate|back)/.test(key));
  for (const key of [...new Set([...needed, ...newKeys])]) {
    for (const [i, messages] of sets.entries()) assert.ok(typeof messages[key] === "string" && messages[key].trim(), `${langs[i]} has ${key}`);
  }
  for (const [i, messages] of sets.entries()) {
    assert.match(messages["forms.pickTemplate"], /\{kind\}/, `${langs[i]} keeps {kind}`);
    assert.match(messages["forms.game.prizesHint"], /\{days\}/, `${langs[i]} keeps {days}`);
    assert.match(messages["forms.freeDelivery.fromStore"], /\{amount\}/, `${langs[i]} keeps {amount}`);
    assert.match(messages["forms.freeDelivery.wordsHint"], /\{token\}/, `${langs[i]} keeps {token}`);
  }
});
