// App-wide languages (shared/i18n): catalog coverage in all five languages, placeholders, plurals, negotiation,
// formatting, the nav and learn bridges, and the saved preference. See shared/i18n/README.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const i18n = await import("../shared/i18n/index.ts");
const { CATALOGS, NAMESPACES, tFor, mergedMessages } = await import("../shared/i18n/catalog.ts");
const { navLabelKey, navLabel, navGroupLabel } = await import("../shared/i18n/nav.ts");
const { translateIntro, translateTerm } = await import("../shared/i18n/learn.ts");
const { NAV_BY_ROLE } = await import("../src/lib/nav.ts");
const { PreferencesPatchSchema } = await import("../src/lib/preferences-schema.ts");
const prefs = await import("../shared/preferences.ts");
const { glossaryMessages, introMessages } = await import("../scripts/i18n-learn-catalog.mjs");
const { GLOSSARY } = await import("../shared/glossary.ts");
const { FEATURE_INTROS } = await import("../shared/feature-intros.ts");
const { HELP_VIDEO_LANGUAGES } = await import("../shared/help-videos.ts");

const OTHERS = ["pcm", "yo", "ha", "ig"];

test("five languages, with native names", () => {
  assert.deepEqual(i18n.LOCALES, ["en", "pcm", "yo", "ha", "ig"]);
  assert.deepEqual(i18n.LANGUAGES.map((language) => language.nativeName), ["English", "Pidgin", "Yorùbá", "Hausa", "Igbo"]);
  assert.ok(i18n.isLocale("yo") && !i18n.isLocale("fr") && !i18n.isLocale(undefined));
  // Help videos use the same codes.
  assert.deepEqual(HELP_VIDEO_LANGUAGES.map((language) => language.code), i18n.LOCALES);
});

test("every English key is translated in Pidgin, Yorùbá, Hausa and Igbo", () => {
  const missing = [];
  for (const namespace of NAMESPACES) {
    const catalog = CATALOGS[namespace];
    for (const locale of OTHERS) {
      for (const key of Object.keys(catalog.en)) {
        if (typeof catalog[locale]?.[key] !== "string" || !catalog[locale][key].trim()) missing.push(`${namespace}/${locale}: ${key}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Missing translations:\n${missing.join("\n")}`);
});

test("no language has keys that English doesn't", () => {
  const extra = [];
  for (const namespace of NAMESPACES) {
    const catalog = CATALOGS[namespace];
    for (const locale of OTHERS) for (const key of Object.keys(catalog[locale] ?? {})) if (!(key in catalog.en)) extra.push(`${namespace}/${locale}: ${key}`);
  }
  assert.deepEqual(extra, []);
});

test("translations keep the same placeholders, and every plural has an `other`", () => {
  const problems = [];
  for (const namespace of NAMESPACES) {
    const catalog = CATALOGS[namespace];
    for (const [key, english] of Object.entries(catalog.en)) {
      const want = i18n.placeholdersOf(english);
      for (const locale of ["en", ...OTHERS]) {
        const text = locale === "en" ? english : catalog[locale]?.[key];
        if (typeof text !== "string") continue;
        const got = i18n.placeholdersOf(text);
        if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${namespace}/${locale}/${key}: ${got} vs ${want}`);
        for (const match of text.matchAll(/\{\s*\w+\s*,\s*plural\s*,/g)) {
          if (!/other\s*\{/.test(text.slice(match.index))) problems.push(`${namespace}/${locale}/${key}: plural without other`);
        }
        const opens = (text.match(/\{/g) ?? []).length;
        const closes = (text.match(/\}/g) ?? []).length;
        if (opens !== closes) problems.push(`${namespace}/${locale}/${key}: unbalanced braces`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("each translation file is marked for native-speaker review and the namespaces are registered", () => {
  for (const namespace of NAMESPACES) {
    for (const locale of OTHERS) {
      const source = read(`shared/i18n/messages/${namespace}/${locale}.ts`);
      assert.match(source, /^\/\/ Draft: needs native-speaker review/, `${namespace}/${locale}`);
      assert.match(source, /Partial<Record<keyof typeof en, string>>/, `${namespace}/${locale} is typed from English`);
    }
  }
  // The core namespaces, plus one folder per translated area (phase 2 adds more, e.g. the phone's partner apps).
  for (const core of ["common", "glossary", "intros", "learn", "nav", "settings"]) assert.ok(NAMESPACES.includes(core), core);
  for (const area of ["m_supplier", "m_partner", "m_rider"]) assert.ok(NAMESPACES.includes(area), area);
});

test("Yorùbá, Hausa and Igbo use their proper letters", () => {
  const all = (locale) => NAMESPACES.map((namespace) => Object.values(CATALOGS[namespace][locale] ?? {}).join(" ")).join(" ");
  const yo = all("yo");
  const ha = all("ha");
  const ig = all("ig");
  for (const letter of ["ẹ", "ọ", "ṣ"]) assert.ok(yo.includes(letter), `Yorùbá has ${letter}`);
  assert.match(yo.normalize("NFD"), /[̀́]/, "Yorùbá has tone marks");
  for (const letter of ["ɓ", "ɗ", "ƙ"]) assert.ok(ha.includes(letter), `Hausa has ${letter}`);
  for (const letter of ["ị", "ọ", "ụ"]) assert.ok(ig.includes(letter), `Igbo has ${letter}`);
  // The hooked letters are real characters, not look-alikes (b̀/d̀) and not plain Latin in every word.
  assert.doesNotMatch(ha, /[ƁƊƘ]{0}ɓ̀/);
});

test("createT: placeholders, plurals and English fallback per key", () => {
  const catalog = { en: { hi: "Hi {name}", orders: "{count, plural, =0 {No orders} one {# order} other {# orders}}", only: "English only" }, yo: { hi: "Báwo {name}", orders: "{count, plural, other {order #}}" } };
  const en = i18n.createT("en", catalog);
  assert.equal(en("hi", { name: "Ada" }), "Hi Ada");
  assert.equal(en("orders", { count: 0 }), "No orders");
  assert.equal(en("orders", { count: 1 }), "1 order");
  assert.equal(en("orders", { count: 1200 }), "1,200 orders");
  const yo = i18n.createT("yo", catalog);
  assert.equal(yo("hi", { name: "Ada" }), "Báwo Ada");
  assert.equal(yo("orders", { count: 1 }), "order 1", "Yorùbá has no singular form");
  assert.equal(yo("only"), "English only", "missing translation falls back to English");
  assert.equal(yo("nope"), "nope", "unknown key shows the key");
  assert.equal(yo.dynamic("nope", "Fallback {x}", { x: 1 }), "Fallback 1");
  assert.ok(yo.has("only") && !yo.has("nope"));
  assert.equal(yo.locale, "yo");
  assert.equal(i18n.formatMessage("Hi {name}", {}), "Hi {name}", "unfilled placeholders stay visible");
  const ha = i18n.createT("ha", { en: { n: "{count, plural, one {# kaya} other {# kayayyaki}}" } });
  assert.equal(ha("n", { count: 1 }), "1 kaya");
  assert.equal(ha("n", { count: 4 }), "4 kayayyaki");
  // Real catalogs.
  assert.equal(tFor("en", "common")("count.orders", { count: 3 }), "3 orders");
  assert.equal(tFor("pcm", "common")("time.daysAgo", { count: 2 }), "2 days don pass");
  assert.equal(tFor("ig", "nav", "common")("cancel"), "Kagbuo", "several namespaces at once");
});

test("negotiateLocale reads Accept-Language and device locale lists", () => {
  assert.equal(i18n.negotiateLocale("yo-NG,yo;q=0.9,en;q=0.8"), "yo");
  assert.equal(i18n.negotiateLocale("fr-FR, ha;q=0.5, en;q=0.4"), "ha");
  assert.equal(i18n.negotiateLocale("en-NG,ig;q=0.9"), "en", "English first stays English");
  assert.equal(i18n.negotiateLocale("en;q=0.5, ig;q=0.9"), "ig", "quality wins over order");
  assert.equal(i18n.negotiateLocale(["pcm-NG", "en-GB"]), "pcm");
  assert.equal(i18n.negotiateLocale(["de-DE", "fr"]), "en");
  assert.equal(i18n.negotiateLocale(""), "en");
  assert.equal(i18n.negotiateLocale(null), "en");
  assert.equal(i18n.negotiateLocale("*"), "en");
  assert.equal(i18n.localeFromName("Yorùbá"), "yo");
  assert.equal(i18n.localeFromName("Pidgin"), "pcm");
  assert.equal(i18n.localeFromName("Klingon"), null);
});

test("money, numbers and dates are Nigerian everywhere", () => {
  for (const locale of i18n.LOCALES) {
    assert.match(i18n.formatMoney(12500, locale), /₦\s?12,500$/, locale);
    assert.match(i18n.formatMoney(99.5, locale), /₦\s?99\.50$/, locale);
    assert.ok(i18n.formatDate("2026-10-13T23:30:00Z", locale).includes("14"), `${locale}: Lagos time (UTC+1)`);
    assert.ok(i18n.formatRelative(Date.now() - 86_400_000, locale).length > 0);
  }
  assert.equal(i18n.formatDate("2026-10-13T10:00:00Z", "pcm"), "13 Oct 2026", "Pidgin uses en-NG dates");
  assert.equal(i18n.formatRelative(new Date("2026-10-12T10:00:00Z"), "en", new Date("2026-10-13T10:00:00Z")), "yesterday");
  assert.equal(i18n.formatDate("not a date"), "");
});

test("every sidebar label in every role has a nav key, and the English stays in src/lib/nav.ts", () => {
  const navEn = CATALOGS.nav.en;
  const missing = [];
  for (const [role, groups] of Object.entries(NAV_BY_ROLE)) {
    for (const group of groups) {
      if (group.label && navEn[`group.${group.group}`] !== group.label) missing.push(`${role} group ${group.group}`);
      for (const item of [...group.items, ...group.items.flatMap((entry) => entry.children ?? [])]) {
        const key = navLabelKey(role, item.id, item.label);
        if (!key) missing.push(`${role}: ${item.id} "${item.label}"`);
      }
    }
  }
  assert.deepEqual(missing, []);
  const yo = tFor("yo", "nav");
  assert.equal(navLabel(yo, "seller", { id: "orders", label: "Orders" }), "Àwọn order");
  assert.equal(navLabel(yo, "supplier", { id: "payouts", label: "Earnings" }), CATALOGS.nav.yo["supplier.payouts"], "role-specific words");
  assert.equal(navLabel(yo, "seller", { id: "orders", label: "Orders (renamed)" }), "Orders (renamed)", "a changed label shows its English, not a stale translation");
  assert.equal(navGroupLabel(yo, { group: "people", label: "People" }), "Ènìyàn");
  // Mobile tab labels stay English in the layouts and are looked up as tab.* keys.
  for (const [file, prefix, names] of [
    ["apps/mobile/src/app/(tabs)/_layout.tsx", "tab.", ["home", "orders", "chats", "shop"]],
    ["apps/mobile/src/app/supplier/(tabs)/_layout.tsx", "tab.supplier.", ["home", "orders", "products", "money"]],
    ["apps/mobile/src/app/logistics/(tabs)/_layout.tsx", "tab.logistics.", ["home", "jobs", "riders", "earnings"]],
  ]) {
    const source = read(file);
    assert.match(source, /useT\("nav"\)/, file);
    for (const name of names) assert.ok(navEn[`${prefix}${name}`], `${prefix}${name}`);
  }
  assert.match(read("src/components/shell/Sidebar.tsx"), /navLabel\(t, role, item\)/);
});

test("glossary and intro catalogs match their sources, and the learn bridge translates sentences only", () => {
  assert.deepEqual({ ...CATALOGS.glossary.en }, glossaryMessages(), "run node scripts/i18n-learn-catalog.mjs");
  assert.deepEqual({ ...CATALOGS.intros.en }, introMessages(), "run node scripts/i18n-learn-catalog.mjs");
  const t = tFor("ha", "glossary");
  const segments = translateTerm(GLOSSARY.find((entry) => entry.key === "segments"), t);
  assert.equal(segments.term, "Segments", "the standard word stays");
  assert.equal(segments.short, CATALOGS.glossary.ha["segments.short"]);
  const intro = translateIntro(FEATURE_INTROS.find((item) => item.key === "dropship"), tFor("ig", "intros"));
  assert.equal(intro.scenes[0].caption, CATALOGS.intros.ig["dropship.1.caption"]);
  assert.equal(intro.cta.href, FEATURE_INTROS.find((item) => item.key === "dropship").cta.href, "links unchanged");
  assert.equal(intro.cta.label, CATALOGS.intros.ig["dropship.cta"]);
  assert.equal(intro.scenes[0].art, FEATURE_INTROS.find((item) => item.key === "dropship").scenes[0].art);
  // Components use the bridge.
  for (const file of ["src/components/learn/FeatureIntro.tsx", "apps/mobile/src/components/learn/FeatureIntroSheet.tsx"]) assert.match(read(file), /translateIntro\(/, file);
  for (const file of ["src/components/learn/Term.tsx", "apps/mobile/src/components/learn/TermHint.tsx", "src/components/shell/Sidebar.tsx"]) assert.match(read(file), /translateTerm\(/, file);
});

test("merged messages give the browser one language with English filling gaps", () => {
  const merged = mergedMessages("yo", ["common"]);
  assert.equal(merged.common.save, CATALOGS.common.yo.save);
  assert.equal(Object.keys(merged.common).length, Object.keys(CATALOGS.common.en).length);
  assert.equal(mergedMessages("en", ["nav"]).nav.orders, "Orders");
});

test("the language is saved in preferences (and the patch schema accepts it)", () => {
  assert.equal(PreferencesPatchSchema.safeParse({ language: "yo" }).success, true);
  assert.equal(PreferencesPatchSchema.safeParse({ language: "fr" }).success, false);
  assert.equal(prefs.parsePreferences({ language: "ha" }).language, "ha");
  assert.equal(prefs.parsePreferences({ language: "xx" }).language, undefined);
  assert.equal("language" in prefs.parsePreferences({}), false, "left out until chosen");
  const next = prefs.mergePreferences(prefs.DEFAULT_PREFERENCES, { language: "ig" }, new Set());
  assert.equal(next.language, "ig");
  assert.equal(prefs.mergePreferences(next, { tour: "done" }, new Set()).language, "ig", "other patches keep it");
  const route = read("src/app/api/app/preferences/route.ts");
  assert.match(route, /localeCookie\(parsed\.data\.language\)/, "the PATCH also sets the sib_lang cookie");
  assert.equal(i18n.LOCALE_COOKIE, "sib_lang");
  assert.equal(i18n.LOCALE_COOKIE_MAX_AGE, 31_536_000);
});

test("web and phone runtimes are mounted and the pickers are reachable", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /lang=\{locale\}/);
  assert.match(layout, /<I18nProvider locale=\{locale\} messages=\{messages\}>/);
  assert.match(read("apps/mobile/src/app/_layout.tsx"), /<I18nProvider>/);
  assert.match(read("src/components/shell/GlobalTopBar.tsx"), /<LanguagePicker variant="compact" \/>/);
  assert.match(read("src/components/auth/app/AppAuth.tsx"), /<LanguagePicker variant="globe" \/>/);
  for (const page of ["src/app/home/settings/page.tsx", "src/app/supplier/settings/page.tsx", "src/app/logistics/profile/page.tsx", "src/app/admin/settings/page.tsx"]) assert.match(read(page), /<LanguageSettingsCard/, page);
  assert.match(read("src/components/onboarding/seller/SellerOnboarding.tsx"), /setAppLocale\(locale\)/);
  assert.match(read("apps/mobile/src/app/welcome.tsx"), /<LanguageButton \/>/);
  assert.match(read("apps/mobile/src/components/AuthForm.tsx"), /<LanguageButton \/>/);
  for (const file of ["apps/mobile/src/app/(tabs)/shop.tsx", "apps/mobile/src/components/PartnerMore.tsx", "apps/mobile/src/components/LogisticsMenu.tsx", "apps/mobile/src/app/supplier/(tabs)/money.tsx"]) assert.match(read(file), /<LanguageRow/, file);
  assert.match(read("apps/mobile/src/app/onboarding/index.tsx"), /setAppLocale\(locale\)/);
  // The Riders app follows the app language.
  assert.match(read("apps/mobile/src/lib/rider-strings.ts"), /useLocale\(\)/);
});

// ─── Pages ship only their own words ───────────────────────────────────────────

test("the per-page namespace map and the lazy loaders are up to date (run node scripts/i18n-route-namespaces.mjs)", async () => {
  const { generate } = await import("../scripts/i18n-route-namespaces.mjs");
  const { routeFile, loaderFile } = generate();
  const { readFileSync } = await import("node:fs");
  assert.equal(readFileSync(new URL("../src/lib/i18n/route-namespaces.generated.ts", import.meta.url), "utf8"), routeFile);
  assert.equal(readFileSync(new URL("../src/components/i18n/loaders.generated.ts", import.meta.url), "utf8"), loaderFile);
  // A page that shows the error copy only when it fails must not carry it in every page.
  assert.doesNotMatch(routeFile, /\["\/home", \[[^\]]*"errors"/);
});

test("browser code never imports the full catalog (it holds every namespace in every language)", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|mjs)$/.test(name)) {
        const src = readFileSync(full, "utf8");
        if (!/^["']use client["']/m.test(src)) continue;
        for (const line of src.split("\n")) if (/from "@shared\/i18n\/catalog"/.test(line) && !/^import type /.test(line.trim())) offenders.push(`${full}: ${line.trim()}`);
      }
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
});
