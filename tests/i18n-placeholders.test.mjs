// Placeholder parity across all five languages, for EVERY namespace (shared/i18n/messages/*): each translation uses
// exactly the placeholders English does ({name}, {count}…), the same ones as plurals, keeps product names (Rex,
// Peggy, Shopinbos) and ₦ amounts as written. A missing or misspelt placeholder shows "{name}" to a seller, so
// this fails the build rather than waiting for a native speaker to notice. See docs/translations/README.md.
import test from "node:test";
import assert from "node:assert/strict";

const i18n = await import("../shared/i18n/index.ts");
const { CATALOGS, NAMESPACES } = await import("../shared/i18n/catalog.ts");

const LOCALES = ["en", "pcm", "yo", "ha", "ig"];
const OTHERS = LOCALES.slice(1);

/** The placeholders of a message, split into plain ones ("{name}") and plurals ("{count, plural, …}"), branches too. */
function parse(text) {
  const simple = new Set();
  const plural = new Set();
  const close = (from) => {
    let depth = 0;
    for (let i = from; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}" && --depth === 0) return i;
    }
    return -1;
  };
  const walk = (start, end) => {
    for (let i = start; i < end; i += 1) {
      if (text[i] !== "{") continue;
      const stop = close(i);
      if (stop < 0) return;
      const inner = text.slice(i + 1, stop);
      const head = /^\s*(\w+)\s*,\s*plural\s*,/.exec(inner);
      if (head) {
        plural.add(head[1]);
        // Branches: "one {…} other {…}"; each body can hold placeholders of its own.
        let j = i + 1 + head[0].length;
        while (j < stop) {
          const open = text.indexOf("{", j);
          if (open < 0 || open >= stop) break;
          const bodyEnd = close(open);
          walk(open + 1, bodyEnd);
          j = bodyEnd + 1;
        }
      } else simple.add(inner.trim());
      i = stop;
    }
  };
  walk(0, text.length);
  return { simple: [...simple].sort(), plural: [...plural].sort() };
}

// Sentences split over several keys, where a language moves the product name into the next piece ("…agree to the
// Shopinbos Business" | "terms"): the name is in the sentence, just in another key.
const SPLIT_SENTENCES = new Set(["auth/terms.before"]);
const BRANDS = ["Rex", "Peggy", "Shopinbos"];

const each = function* () {
  for (const namespace of NAMESPACES) {
    const catalog = CATALOGS[namespace];
    for (const [key, english] of Object.entries(catalog.en)) {
      for (const locale of OTHERS) {
        const text = catalog[locale]?.[key];
        if (typeof text === "string") yield { namespace, key, english, locale, text };
      }
    }
  }
};

test("every namespace is checked in all five languages", () => {
  assert.ok(NAMESPACES.length >= 100, `namespaces: ${NAMESPACES.length}`);
  for (const namespace of NAMESPACES) for (const locale of LOCALES) assert.equal(typeof CATALOGS[namespace][locale], "object", `${namespace}/${locale}`);
});

test("placeholders match English exactly in pcm, yo, ha and ig (names, plurals, nothing extra)", () => {
  const problems = [];
  for (const { namespace, key, english, locale, text } of each()) {
    const where = `${namespace}/${locale}/${key}`;
    if (JSON.stringify(i18n.placeholdersOf(text)) !== JSON.stringify(i18n.placeholdersOf(english))) problems.push(`${where}: {${i18n.placeholdersOf(text)}} vs English {${i18n.placeholdersOf(english)}}`);
    const got = parse(text);
    const want = parse(english);
    // Every name English uses, and no other: a plural may be shown as a plain number in a language without plural
    // forms (Yorùbá, Igbo: "{count}"), but the name must be there.
    const names = (parsed) => [...new Set([...parsed.simple, ...parsed.plural])].sort();
    if (JSON.stringify(names(got)) !== JSON.stringify(names(want))) problems.push(`${where}: {${names(got)}} vs English {${names(want)}}`);
    // A placeholder English uses inside a plural ("{count, plural, one {# order for {shop}} …}") is still there.
    for (const name of want.simple) if (!got.simple.includes(name)) problems.push(`${where}: {${name}} is missing`);
  }
  assert.deepEqual(problems, [], `\n${problems.join("\n")}`);
});

test("product names and ₦ amounts stay as written", () => {
  const problems = [];
  for (const { namespace, key, english, locale, text } of each()) {
    const where = `${namespace}/${locale}/${key}`;
    for (const brand of BRANDS) {
      if (new RegExp(`\\b${brand}\\b`).test(english) && !text.includes(brand) && !SPLIT_SENTENCES.has(`${namespace}/${key}`)) problems.push(`${where}: ${brand} is missing`);
    }
    for (const match of english.matchAll(/₦\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?[kKmM]?/g)) {
      const amount = match[0].replace(/\s/g, "");
      if (!text.replace(/\s/g, "").includes(amount)) problems.push(`${where}: ${amount} is missing`);
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join("\n")}`);
});

test("the checks catch what they should", () => {
  assert.deepEqual(parse("Hi {name}, {count, plural, one {# order for {shop}} other {# orders}}"), { simple: ["name", "shop"], plural: ["count"] });
  assert.deepEqual(parse("{count, plural, one {the shop} other {the # shops}}"), { simple: [], plural: ["count"] }, "a branch is not a placeholder");
  assert.deepEqual(parse("{nam}"), { simple: ["nam"], plural: [] });
});
